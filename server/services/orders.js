import crypto from "node:crypto";
import { withTransaction } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { evaluateLaunchGate } from "./launch-gate.js";
import { emailConfigured, queueEmail } from "./email.js";
import { releaseOrderInventory } from "./order-lifecycle.js";
import {
  createHostedPayment,
  getShippingQuote,
  paymentConfigured,
  shippingConfigured,
} from "./integrations.js";

const orderNumber = () =>
  `BKN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

export async function getLaunchStatus(client) {
  const [settingsResult, productsResult] = await Promise.all([
    client.query("SELECT * FROM business_settings WHERE id = true"),
    client.query(
      "SELECT count(*)::int AS count FROM products WHERE status = 'active' AND record_verified AND photo_authorized",
    ),
  ]);
  return evaluateLaunchGate({
    settings: settingsResult.rows[0],
    activeProductCount: productsResult.rows[0].count,
    paymentConfigured: paymentConfigured(),
    shippingConfigured: shippingConfigured(),
    emailConfigured: emailConfigured(),
  });
}

export async function createOrder({ user, idempotencyKey, input }) {
  const prepared = await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [idempotencyKey],
    );
    const existing = await client.query(
      "SELECT order_number,payment_checkout_url,status FROM orders WHERE idempotency_key=$1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      if (!existing.rows[0].payment_checkout_url)
        throw new HttpError(
          409,
          "idempotency_incomplete",
          "Lần đặt hàng trước chưa tạo được thanh toán. Vui lòng thử lại để tạo yêu cầu mới.",
        );
      return { existing: true, ...existing.rows[0] };
    }

    const gate = await getLaunchStatus(client);
    if (!gate.ready)
      throw new HttpError(
        503,
        "store_not_ready",
        "Cửa hàng chưa nhận đơn.",
        gate.blockers,
      );

    const ids = input.items.map((item) => item.productId);
    const { rows: products } = await client.query(
      `SELECT id, name, size, price_vnd, stock, weight_grams
         FROM products
        WHERE id = ANY($1::uuid[]) AND status = 'active' AND record_verified AND photo_authorized
        FOR UPDATE`,
      [ids],
    );
    if (products.length !== new Set(ids).size)
      throw new HttpError(
        409,
        "product_unavailable",
        "Một sản phẩm không còn được bán.",
      );
    const byId = new Map(products.map((product) => [product.id, product]));
    let subtotalVnd = 0;
    let weightGrams = 0;
    for (const item of input.items) {
      const product = byId.get(item.productId);
      if (product.stock < item.quantity)
        throw new HttpError(
          409,
          "insufficient_stock",
          `${product.name} không đủ tồn kho.`,
        );
      subtotalVnd += product.price_vnd * item.quantity;
      weightGrams += product.weight_grams * item.quantity;
    }
    const quote = await getShippingQuote({
      ...input.shipping,
      weightGrams,
      subtotalVnd,
    });
    const number = orderNumber();
    const totalVnd = subtotalVnd + quote.amountVnd;
    const order = await client.query(
      `INSERT INTO orders (
        order_number, user_id, idempotency_key, payment_method, payment_provider,
        shipping_provider, shipping_service, shipping_quote_reference,
        customer_name, customer_email, customer_phone, province, ward, address, note,
        subtotal_vnd, shipping_vnd, total_vnd, reservation_expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now()+($19*interval '1 minute'))
      RETURNING id, order_number`,
      [
        number,
        user?.id || null,
        idempotencyKey,
        input.paymentMethod,
        config.payment.provider,
        config.shipping.provider,
        quote.service,
        quote.reference,
        input.customer.name,
        input.customer.email || null,
        input.customer.phone,
        input.shipping.province,
        input.shipping.ward,
        input.shipping.address,
        input.note || null,
        subtotalVnd,
        quote.amountVnd,
        totalVnd,
        config.orderReservationMinutes,
      ],
    );
    for (const item of input.items) {
      const product = byId.get(item.productId);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_size, unit_price_vnd, quantity, line_total_vnd)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          order.rows[0].id,
          product.id,
          product.name,
          product.size,
          product.price_vnd,
          item.quantity,
          product.price_vnd * item.quantity,
        ],
      );
      await client.query(
        "UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2",
        [item.quantity, product.id],
      );
      await client.query(
        "INSERT INTO inventory_movements (product_id, order_id, quantity_delta, reason, actor_user_id) VALUES ($1,$2,$3,'order_reserved',$4)",
        [product.id, order.rows[0].id, -item.quantity, user?.id || null],
      );
    }
    return { existing: false, ...order.rows[0], totalVnd };
  });

  if (prepared.existing)
    return {
      order_number: prepared.order_number,
      payment_checkout_url: prepared.payment_checkout_url,
    };

  try {
    const payment = await createHostedPayment({
      orderNumber: prepared.order_number,
      amountVnd: prepared.totalVnd,
      method: input.paymentMethod,
      returnUrl: `${config.publicOrigin}/?order=${encodeURIComponent(prepared.order_number)}`,
    });
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        "UPDATE orders SET payment_reference = $1, payment_checkout_url = $2, updated_at = now() WHERE id = $3 RETURNING id,order_number,customer_name,customer_email,total_vnd,payment_checkout_url",
        [payment.reference, payment.checkoutUrl, prepared.id],
      );
      if (rows[0].customer_email) {
        await queueEmail(client, {
          recipient: rows[0].customer_email,
          template: "order_received",
          payload: {
            name: rows[0].customer_name,
            orderNumber: rows[0].order_number,
            totalVnd: rows[0].total_vnd,
          },
          dedupeKey: `order_received:${rows[0].id}`,
        });
      }
      return {
        order_number: rows[0].order_number,
        payment_checkout_url: rows[0].payment_checkout_url,
      };
    });
  } catch (error) {
    await withTransaction(async (client) => {
      await releaseOrderInventory(client, prepared.id, user?.id || null);
      await client.query(
        "UPDATE orders SET status = 'payment_failed', payment_status = 'failed', updated_at = now() WHERE id = $1",
        [prepared.id],
      );
    });
    throw error;
  }
}
