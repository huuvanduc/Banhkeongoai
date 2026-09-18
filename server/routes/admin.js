import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAdmin } from "../middleware/auth.js";
import { getLaunchStatus } from "../services/orders.js";

const router = Router();
router.use(requireAdmin);

const productSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(80),
  category: z.enum(["snacks", "chocolate", "skincare", "supplements"]),
  size: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  price: z.int().min(1000).max(100000000),
  stock: z.int().min(0).max(100000),
  weightGrams: z.int().min(1).max(100000),
  status: z.enum(["draft", "active", "archived"]),
  featured: z.boolean().default(false),
  image: z
    .string()
    .max(1000)
    .refine(
      (value) => value.startsWith("/assets/") || /^https:\/\//.test(value),
      "Ảnh phải dùng /assets/... hoặc HTTPS.",
    )
    .nullable(),
  photoSource: z.string().trim().max(1000).nullable(),
  photoAuthorized: z.boolean(),
  recordVerified: z.boolean(),
  originCountry: z.string().trim().max(80).nullable(),
  ingredients: z.string().trim().max(4000).nullable(),
  allergens: z.string().trim().max(2000).nullable(),
  directions: z.string().trim().max(2000).nullable(),
  warnings: z.string().trim().max(2000).nullable(),
  storage: z.string().trim().max(1000).nullable(),
  batchNumber: z.string().trim().max(100).nullable(),
  expiresAt: z.iso.date().nullable(),
});

const settingsSchema = z.object({
  legalName: z.string().trim().max(200).nullable(),
  publicPhone: z.string().trim().max(30).nullable(),
  publicEmail: z.union([z.email().max(100), z.literal(""), z.null()]),
  address: z.string().trim().max(500).nullable(),
  facebookUrl: z.union([z.url().max(1000), z.literal(""), z.null()]),
  privacyPolicy: z.string().trim().max(20000).nullable(),
  shippingPolicy: z.string().trim().max(20000).nullable(),
  returnsPolicy: z.string().trim().max(20000).nullable(),
  supplementDisclaimer: z.string().trim().max(5000).nullable(),
  skincareDisclaimer: z.string().trim().max(5000).nullable(),
  shippingEnabled: z.boolean(),
  paymentEnabled: z.boolean(),
  acceptingOrders: z.boolean(),
});

router.get(
  "/products",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(
      "SELECT * FROM products ORDER BY created_at DESC",
    );
    response.json({ products: rows });
  }),
);

router.post(
  "/products",
  asyncRoute(async (request, response) => {
    const parsed = productSchema.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_input",
        "Dữ liệu sản phẩm không hợp lệ.",
        parsed.error.flatten(),
      );
    const p = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO products (slug,name,brand,category,size,description,price_vnd,stock,weight_grams,status,featured,image_url,photo_source,photo_authorized,record_verified,origin_country,ingredients,allergens,directions,warnings,storage,batch_number,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [
        p.slug,
        p.name,
        p.brand,
        p.category,
        p.size,
        p.description,
        p.price,
        p.stock,
        p.weightGrams,
        p.status,
        p.featured,
        p.image,
        p.photoSource,
        p.photoAuthorized,
        p.recordVerified,
        p.originCountry,
        p.ingredients,
        p.allergens,
        p.directions,
        p.warnings,
        p.storage,
        p.batchNumber,
        p.expiresAt,
      ],
    );
    await pool.query(
      "INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,'product.create','product',$2)",
      [request.user.id, rows[0].id],
    );
    response.status(201).json({ product: rows[0] });
  }),
);

router.put(
  "/products/:id",
  asyncRoute(async (request, response) => {
    const parsed = productSchema.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_input",
        "Dữ liệu sản phẩm không hợp lệ.",
        parsed.error.flatten(),
      );
    const p = parsed.data;
    const result = await withTransaction(async (client) => {
      const before = await client.query(
        "SELECT stock FROM products WHERE id = $1 FOR UPDATE",
        [request.params.id],
      );
      if (!before.rows[0])
        throw new HttpError(404, "not_found", "Không tìm thấy sản phẩm.");
      const { rows } = await client.query(
        `UPDATE products SET slug=$2,name=$3,brand=$4,category=$5,size=$6,description=$7,price_vnd=$8,stock=$9,weight_grams=$10,status=$11,featured=$12,image_url=$13,photo_source=$14,photo_authorized=$15,record_verified=$16,origin_country=$17,ingredients=$18,allergens=$19,directions=$20,warnings=$21,storage=$22,batch_number=$23,expires_at=$24,updated_at=now()
       WHERE id=$1 RETURNING *`,
        [
          request.params.id,
          p.slug,
          p.name,
          p.brand,
          p.category,
          p.size,
          p.description,
          p.price,
          p.stock,
          p.weightGrams,
          p.status,
          p.featured,
          p.image,
          p.photoSource,
          p.photoAuthorized,
          p.recordVerified,
          p.originCountry,
          p.ingredients,
          p.allergens,
          p.directions,
          p.warnings,
          p.storage,
          p.batchNumber,
          p.expiresAt,
        ],
      );
      const delta = p.stock - before.rows[0].stock;
      if (delta)
        await client.query(
          "INSERT INTO inventory_movements (product_id,quantity_delta,reason,actor_user_id) VALUES ($1,$2,'manual_adjustment',$3)",
          [request.params.id, delta, request.user.id],
        );
      await client.query(
        "INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,'product.update','product',$2)",
        [request.user.id, request.params.id],
      );
      return rows[0];
    });
    response.json({ product: result });
  }),
);

router.get(
  "/orders",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC LIMIT 200",
    );
    response.json({ orders: rows });
  }),
);

router.get(
  "/settings",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(
      "SELECT * FROM business_settings WHERE id=true",
    );
    response.json({ settings: rows[0], launch: await getLaunchStatus(pool) });
  }),
);

router.put(
  "/settings",
  asyncRoute(async (request, response) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_input",
        "Thông tin cửa hàng không hợp lệ.",
        parsed.error.flatten(),
      );
    const s = parsed.data;
    const { rows } = await pool.query(
      `UPDATE business_settings SET legal_name=$1,public_phone=$2,public_email=$3,address=$4,facebook_url=$5,privacy_policy=$6,shipping_policy=$7,returns_policy=$8,supplement_disclaimer=$9,skincare_disclaimer=$10,shipping_enabled=$11,payment_enabled=$12,accepting_orders=$13,updated_at=now() WHERE id=true RETURNING *`,
      [
        s.legalName,
        s.publicPhone || null,
        s.publicEmail || null,
        s.address,
        s.facebookUrl || null,
        s.privacyPolicy,
        s.shippingPolicy,
        s.returnsPolicy,
        s.supplementDisclaimer,
        s.skincareDisclaimer,
        s.shippingEnabled,
        s.paymentEnabled,
        s.acceptingOrders,
      ],
    );
    await pool.query(
      "INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,'settings.update','business_settings','true')",
      [request.user.id],
    );
    response.json({ settings: rows[0], launch: await getLaunchStatus(pool) });
  }),
);

export default router;
