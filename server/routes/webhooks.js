import { Router, raw } from "express";
import { z } from "zod";
import { withTransaction } from "../db.js";
import { config } from "../config.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { verifyWebhookSignature } from "../services/integrations.js";
import { releaseOrderInventory } from "../services/order-lifecycle.js";
import { queueEmail } from "../services/email.js";

const router = Router();
const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum([
    "payment.paid",
    "payment.failed",
    "payment.cancelled",
    "payment.refunded",
  ]),
  paymentReference: z.string().min(1).max(300),
  amountVnd: z.int().nonnegative(),
});

router.post(
  "/payment",
  raw({ type: "application/json", limit: "256kb" }),
  asyncRoute(async (request, response) => {
    const rawBody = request.body;
    if (
      !Buffer.isBuffer(rawBody) ||
      !verifyWebhookSignature(rawBody, request.get("x-payment-signature"))
    ) {
      throw new HttpError(
        401,
        "invalid_signature",
        "Chữ ký webhook không hợp lệ.",
      );
    }
    let parsedJson;
    try {
      parsedJson = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Webhook không phải JSON hợp lệ.",
      );
    }
    const parsed = eventSchema.safeParse(parsedJson);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_event",
        "Sự kiện thanh toán không hợp lệ.",
      );
    const event = parsed.data;

    await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO payment_events (provider,provider_event_id,event_type,payload)
       VALUES ($1,$2,$3,$4) ON CONFLICT (provider,provider_event_id) DO NOTHING RETURNING id`,
        [config.payment.provider, event.id, event.type, event],
      );
      if (!inserted.rowCount) return;
      const orderResult = await client.query(
        "SELECT * FROM orders WHERE payment_reference=$1 FOR UPDATE",
        [event.paymentReference],
      );
      const order = orderResult.rows[0];
      if (!order || order.total_vnd !== event.amountVnd)
        throw new HttpError(
          409,
          "payment_mismatch",
          "Không thể đối chiếu thanh toán với đơn hàng.",
        );
      if (
        event.type === "payment.paid" &&
        !["paid", "refunded"].includes(order.payment_status)
      ) {
        if (["cancelled", "payment_failed"].includes(order.status)) {
          await client.query(
            "UPDATE orders SET payment_status='paid',requires_review=true,version=version+1,updated_at=now() WHERE id=$1",
            [order.id],
          );
          await client.query(
            "INSERT INTO audit_logs (action,entity_type,entity_id,metadata) VALUES ('payment.late','order',$1,$2)",
            [
              order.id,
              {
                paymentReference: event.paymentReference,
                providerEventId: event.id,
              },
            ],
          );
        } else {
          await client.query(
            "UPDATE orders SET payment_status='paid',status='paid',version=version+1,updated_at=now() WHERE id=$1",
            [order.id],
          );
          if (order.customer_email) {
            await queueEmail(client, {
              recipient: order.customer_email,
              template: "order_status",
              payload: {
                name: order.customer_name,
                orderNumber: order.order_number,
                status: "paid",
                trackingNumber: null,
              },
              dedupeKey: `order_paid:${order.id}`,
            });
          }
        }
      } else if (
        ["payment.failed", "payment.cancelled"].includes(event.type) &&
        order.payment_status === "pending"
      ) {
        const nextPayment =
          event.type === "payment.failed" ? "failed" : "cancelled";
        const nextStatus =
          event.type === "payment.failed" ? "payment_failed" : "cancelled";
        await client.query(
          "UPDATE orders SET payment_status=$1,status=$2,version=version+1,updated_at=now() WHERE id=$3",
          [nextPayment, nextStatus, order.id],
        );
        await releaseOrderInventory(client, order.id);
      } else if (
        event.type === "payment.refunded" &&
        order.payment_status === "paid"
      ) {
        await client.query(
          "UPDATE orders SET payment_status='refunded',version=version+1,updated_at=now() WHERE id=$1",
          [order.id],
        );
      }
      await client.query(
        "UPDATE payment_events SET processed_at=now() WHERE id=$1",
        [inserted.rows[0].id],
      );
    });
    response.status(204).end();
  }),
);

export default router;
