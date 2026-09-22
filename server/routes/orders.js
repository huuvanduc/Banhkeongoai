import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { createOrder } from "../services/orders.js";

const router = Router();
const bodySchema = z
  .object({
    items: z
      .array(
        z.object({ productId: z.uuid(), quantity: z.int().min(1).max(100) }),
      )
      .min(1)
      .max(50),
    customer: z.object({
      name: z.string().trim().min(1).max(80),
      email: z.email().max(100),
      phone: z.string().regex(/^(?:0\d{9}|\+84\d{9})$/),
    }),
    shipping: z.object({
      province: z.string().trim().min(1).max(80),
      ward: z.string().trim().min(1).max(80),
      address: z.string().trim().min(1).max(200),
    }),
    note: z.string().trim().max(300).optional(),
    paymentMethod: z.enum(["qr", "card"]),
  })
  .superRefine((body, context) => {
    const ids = body.items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Mỗi sản phẩm chỉ được xuất hiện một lần.",
      });
  });

router.post(
  "/",
  asyncRoute(async (request, response) => {
    const idempotencyKey = request.get("idempotency-key");
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
      throw new HttpError(
        400,
        "invalid_idempotency_key",
        "Yêu cầu đặt hàng thiếu mã chống trùng hợp lệ.",
      );
    }
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_input",
        "Thông tin đơn hàng không hợp lệ.",
      );
    const order = await createOrder({
      user: request.user,
      idempotencyKey,
      input: parsed.data,
    });
    response.status(201).json({ order });
  }),
);

router.get(
  "/mine",
  requireAuth,
  asyncRoute(async (request, response) => {
    const { rows } = await pool.query(
      `SELECT order_number, status, payment_status, total_vnd, tracking_number, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [request.user.id],
    );
    response.json({ orders: rows });
  }),
);

export default router;
