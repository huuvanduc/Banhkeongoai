import { Router } from "express";
import { pool } from "../db.js";
import { asyncRoute } from "../lib/http.js";
import { getLaunchStatus } from "../services/orders.js";

const router = Router();

router.get(
  "/",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(
      `SELECT legal_name, public_phone, public_email, address, facebook_url,
            privacy_policy, shipping_policy, returns_policy,
            supplement_disclaimer, skincare_disclaimer
       FROM business_settings WHERE id = true`,
    );
    const launch = await getLaunchStatus(pool);
    response.json({ store: rows[0], acceptingOrders: launch.ready });
  }),
);

export default router;
