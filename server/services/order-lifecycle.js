import { HttpError } from "../lib/http.js";

export const ORDER_TRANSITIONS = Object.freeze({
  pending_payment: ["cancelled"],
  paid: ["processing"],
  processing: ["shipped"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
  payment_failed: [],
});

export function assertOrderTransition(current, next, trackingNumber) {
  if (!ORDER_TRANSITIONS[current]?.includes(next)) {
    throw new HttpError(
      409,
      "invalid_order_transition",
      `Không thể chuyển đơn từ ${current} sang ${next}.`,
    );
  }
  if (next === "shipped" && !trackingNumber?.trim()) {
    throw new HttpError(
      400,
      "tracking_required",
      "Cần nhập mã vận đơn trước khi đánh dấu đang giao.",
    );
  }
}

export async function releaseOrderInventory(
  client,
  orderId,
  actorUserId = null,
) {
  const { rows: items } = await client.query(
    "SELECT product_id,quantity FROM order_items WHERE order_id=$1",
    [orderId],
  );
  for (const item of items) {
    const movement = await client.query(
      `INSERT INTO inventory_movements (product_id,order_id,quantity_delta,reason,actor_user_id)
       VALUES ($1,$2,$3,'order_released',$4)
       ON CONFLICT DO NOTHING RETURNING id`,
      [item.product_id, orderId, item.quantity, actorUserId],
    );
    if (movement.rowCount) {
      await client.query(
        "UPDATE products SET stock=stock+$1,updated_at=now() WHERE id=$2",
        [item.quantity, item.product_id],
      );
    }
  }
}

export async function expirePendingOrders(client, limit = 100) {
  const { rows } = await client.query(
    `SELECT id,order_number,customer_name,customer_email FROM orders
      WHERE status='pending_payment' AND reservation_expires_at <= now()
      ORDER BY reservation_expires_at FOR UPDATE SKIP LOCKED LIMIT $1`,
    [limit],
  );
  for (const order of rows) {
    await releaseOrderInventory(client, order.id);
    await client.query(
      `UPDATE orders SET status='cancelled',payment_status='cancelled',
       cancellation_reason='payment_timeout',version=version+1,updated_at=now() WHERE id=$1`,
      [order.id],
    );
    if (order.customer_email) {
      const { queueEmail } = await import("./email.js");
      await queueEmail(client, {
        recipient: order.customer_email,
        template: "order_status",
        payload: {
          name: order.customer_name,
          orderNumber: order.order_number,
          status: "đã hủy do quá thời gian thanh toán",
          trackingNumber: null,
        },
        dedupeKey: `order_expired:${order.id}`,
      });
    }
  }
  return rows.length;
}
