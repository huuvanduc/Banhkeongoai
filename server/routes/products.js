import { Router } from "express";
import { pool } from "../db.js";
import { asyncRoute } from "../lib/http.js";

const router = Router();

router.get(
  "/",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(
      `SELECT id, slug, name, brand, category, size, description, price_vnd AS price,
            stock, weight_grams, featured, image_url AS image, origin_country,
            ingredients, allergens, directions, warnings, storage, batch_number, expires_at
       FROM products
      WHERE status = 'active' AND record_verified AND photo_authorized
      ORDER BY featured DESC, created_at DESC`,
    );
    response.json({ products: rows });
  }),
);

export default router;
