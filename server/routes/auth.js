import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db.js";
import { config, isProduction } from "../config.js";
import { HttpError, asyncRoute } from "../lib/http.js";
import {
  hashPassword,
  hashToken,
  randomToken,
  verifyPassword,
} from "../lib/security.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const credentials = z.object({
  email: z.email().max(100),
  password: z.string().min(10).max(100),
});
const registerBody = credentials.extend({
  name: z.string().trim().min(1).max(80),
});
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: config.sessionDays * 86_400_000,
};

async function startSession(response, userId) {
  const token = randomToken();
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,now() + ($3 * interval '1 day'))",
    [userId, hashToken(token), config.sessionDays],
  );
  response.cookie("session", token, cookieOptions);
}

router.post(
  "/register",
  authLimiter,
  asyncRoute(async (request, response) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_input",
        "Thông tin đăng ký không hợp lệ.",
      );
    const passwordHash = await hashPassword(parsed.data.password);
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1,lower($2),$3,'customer') RETURNING id,name,email,role",
      [parsed.data.name, parsed.data.email, passwordHash],
    );
    await startSession(response, rows[0].id);
    response.status(201).json({ user: publicUser(rows[0]) });
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncRoute(async (request, response) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_input",
        "Email hoặc mật khẩu không hợp lệ.",
      );
    const { rows } = await pool.query(
      "SELECT id,name,email,role,password_hash FROM users WHERE lower(email) = lower($1) AND disabled_at IS NULL",
      [parsed.data.email],
    );
    const user = rows[0];
    if (
      !user ||
      !(await verifyPassword(parsed.data.password, user.password_hash))
    ) {
      throw new HttpError(
        401,
        "invalid_credentials",
        "Email hoặc mật khẩu không đúng.",
      );
    }
    await startSession(response, user.id);
    response.json({ user: publicUser(user) });
  }),
);

router.post(
  "/logout",
  requireAuth,
  asyncRoute(async (request, response) => {
    await pool.query("DELETE FROM sessions WHERE id = $1", [
      request.user.session_id,
    ]);
    response.clearCookie("session", { ...cookieOptions, maxAge: undefined });
    response.status(204).end();
  }),
);

router.get("/me", (request, response) =>
  response.json({ user: request.user ? publicUser(request.user) : null }),
);

export default router;
