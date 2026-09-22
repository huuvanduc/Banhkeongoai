import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { config, isProduction } from "../config.js";
import { HttpError, asyncRoute } from "../lib/http.js";
import {
  hashPassword,
  hashToken,
  randomToken,
  verifyPassword,
} from "../lib/security.js";
import { requireAuth } from "../middleware/auth.js";
import { createAccountToken, queueEmail } from "../services/email.js";

const router = Router();
const credentials = z.object({
  email: z.email().max(100),
  password: z.string().min(10).max(100),
});
const registerBody = credentials.extend({
  name: z.string().trim().min(1).max(80),
});
const tokenBody = z.object({ token: z.string().min(32).max(200) });
const emailBody = z.object({ email: z.email().max(100) });
const resetBody = tokenBody.extend({ password: z.string().min(10).max(100) });
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
  emailVerified: Boolean(user.email_verified_at),
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
    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        "INSERT INTO users (name,email,password_hash,role) VALUES ($1,lower($2),$3,'customer') RETURNING id,name,email,role,email_verified_at",
        [parsed.data.name, parsed.data.email, passwordHash],
      );
      await createAccountToken(client, rows[0], "verify_email");
      return rows[0];
    });
    response.status(201).json({
      user: publicUser(user),
      verificationRequired: true,
      message: "Hãy kiểm tra email để xác minh tài khoản.",
    });
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
      "SELECT id,name,email,role,password_hash,email_verified_at FROM users WHERE lower(email) = lower($1) AND disabled_at IS NULL",
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
    if (user.role === "customer" && !user.email_verified_at) {
      throw new HttpError(
        403,
        "email_not_verified",
        "Hãy xác minh email trước khi đăng nhập.",
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

router.post(
  "/verify-email",
  authLimiter,
  asyncRoute(async (request, response) => {
    const parsed = tokenBody.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_token",
        "Liên kết xác minh không hợp lệ.",
      );
    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT t.id,u.id AS user_id,u.name,u.email,u.role,u.email_verified_at
           FROM account_tokens t JOIN users u ON u.id=t.user_id
          WHERE t.token_hash=$1 AND t.purpose='verify_email' AND t.consumed_at IS NULL AND t.expires_at>now()
          FOR UPDATE OF t`,
        [hashToken(parsed.data.token)],
      );
      if (!rows[0])
        throw new HttpError(
          400,
          "invalid_token",
          "Liên kết xác minh đã hết hạn hoặc đã được sử dụng.",
        );
      await client.query(
        "UPDATE account_tokens SET consumed_at=now() WHERE id=$1",
        [rows[0].id],
      );
      await client.query(
        "UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$1",
        [rows[0].user_id],
      );
      return { ...rows[0], id: rows[0].user_id, email_verified_at: new Date() };
    });
    await startSession(response, user.id);
    response.json({ user: publicUser(user) });
  }),
);

router.post(
  "/resend-verification",
  authLimiter,
  asyncRoute(async (request, response) => {
    const parsed = emailBody.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(400, "invalid_input", "Email không hợp lệ.");
    const { rows } = await pool.query(
      "SELECT id,name,email,email_verified_at FROM users WHERE lower(email)=lower($1) AND disabled_at IS NULL",
      [parsed.data.email],
    );
    if (rows[0] && !rows[0].email_verified_at) {
      await withTransaction((client) =>
        createAccountToken(client, rows[0], "verify_email"),
      );
    }
    response
      .status(202)
      .json({ message: "Nếu tài khoản cần xác minh, email mới sẽ được gửi." });
  }),
);

router.post(
  "/forgot-password",
  authLimiter,
  asyncRoute(async (request, response) => {
    const parsed = emailBody.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(400, "invalid_input", "Email không hợp lệ.");
    const { rows } = await pool.query(
      "SELECT id,name,email,email_verified_at FROM users WHERE lower(email)=lower($1) AND disabled_at IS NULL",
      [parsed.data.email],
    );
    if (rows[0]?.email_verified_at) {
      await withTransaction((client) =>
        createAccountToken(client, rows[0], "reset_password"),
      );
    }
    response
      .status(202)
      .json({
        message: "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi.",
      });
  }),
);

router.post(
  "/reset-password",
  authLimiter,
  asyncRoute(async (request, response) => {
    const parsed = resetBody.safeParse(request.body);
    if (!parsed.success)
      throw new HttpError(
        400,
        "invalid_input",
        "Thông tin đặt lại mật khẩu không hợp lệ.",
      );
    const passwordHash = await hashPassword(parsed.data.password);
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT t.id,u.id AS user_id,u.name,u.email
           FROM account_tokens t JOIN users u ON u.id=t.user_id
          WHERE t.token_hash=$1 AND t.purpose='reset_password' AND t.consumed_at IS NULL AND t.expires_at>now()
          FOR UPDATE OF t`,
        [hashToken(parsed.data.token)],
      );
      if (!rows[0])
        throw new HttpError(
          400,
          "invalid_token",
          "Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được sử dụng.",
        );
      await client.query(
        "UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2",
        [passwordHash, rows[0].user_id],
      );
      await client.query(
        "UPDATE account_tokens SET consumed_at=now() WHERE id=$1",
        [rows[0].id],
      );
      await client.query("DELETE FROM sessions WHERE user_id=$1", [
        rows[0].user_id,
      ]);
      await queueEmail(client, {
        recipient: rows[0].email,
        template: "password_changed",
        payload: { name: rows[0].name },
        dedupeKey: `password_changed:${rows[0].id}`,
      });
    });
    response.status(204).end();
  }),
);

export default router;
