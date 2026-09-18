import crypto from "node:crypto";
import bcrypt from "bcryptjs";

export const hashPassword = (password) => bcrypt.hash(password, 12);
export const verifyPassword = (password, hash) =>
  bcrypt.compare(password, hash);
export const randomToken = () => crypto.randomBytes(32).toString("base64url");
export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
export const safeEqual = (left, right) => {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
