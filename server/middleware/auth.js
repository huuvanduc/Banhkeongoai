import { pool } from "../db.js";
import { hashToken } from "../lib/security.js";
import { HttpError, asyncRoute } from "../lib/http.js";

export const loadSession = asyncRoute(async (request, _response, next) => {
  const token = request.cookies?.session;
  if (!token) return next();
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, s.id AS session_id
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`,
    [hashToken(token)],
  );
  request.user = rows[0] || null;
  return next();
});

export const requireAuth = (request, _response, next) => {
  if (!request.user)
    return next(
      new HttpError(401, "authentication_required", "Vui lòng đăng nhập."),
    );
  return next();
};

export const requireAdmin = (request, _response, next) => {
  if (!request.user)
    return next(
      new HttpError(401, "authentication_required", "Vui lòng đăng nhập."),
    );
  if (request.user.role !== "admin")
    return next(
      new HttpError(
        403,
        "forbidden",
        "Bạn không có quyền thực hiện thao tác này.",
      ),
    );
  return next();
};
