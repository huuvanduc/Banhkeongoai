import { config } from "../config.js";
import { pool, withTransaction } from "../db.js";
import { hashToken, randomToken } from "../lib/security.js";

export const emailConfigured = () =>
  config.email.provider !== "disabled" &&
  Boolean(config.email.apiUrl && config.email.apiKey && config.email.from);

const orderStatusLabels = {
  paid: "đã thanh toán",
  processing: "đang chuẩn bị",
  shipped: "đang giao",
  completed: "hoàn tất",
  cancelled: "đã hủy",
};

const templates = {
  verify_email: ({ name, actionUrl }) => ({
    subject: "Xác minh email banhkeongoai",
    text: `Xin chào ${name},\n\nXác minh email của bạn tại: ${actionUrl}\n\nLiên kết hết hạn sau 24 giờ. Nếu bạn không tạo tài khoản, hãy bỏ qua email này.`,
  }),
  reset_password: ({ name, actionUrl }) => ({
    subject: "Đặt lại mật khẩu banhkeongoai",
    text: `Xin chào ${name},\n\nĐặt lại mật khẩu tại: ${actionUrl}\n\nLiên kết hết hạn sau 60 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
  }),
  password_changed: ({ name }) => ({
    subject: "Mật khẩu banhkeongoai đã được thay đổi",
    text: `Xin chào ${name},\n\nMật khẩu tài khoản của bạn vừa được thay đổi. Nếu không phải bạn, hãy liên hệ cửa hàng ngay.`,
  }),
  order_received: ({ name, orderNumber, totalVnd }) => ({
    subject: `Đã nhận đơn ${orderNumber}`,
    text: `Xin chào ${name},\n\nCửa hàng đã nhận đơn ${orderNumber}, tổng cộng ${Number(totalVnd).toLocaleString("vi-VN")} ₫. Đơn chỉ được xác nhận sau khi thanh toán thành công.`,
  }),
  order_status: ({ name, orderNumber, status, trackingNumber }) => ({
    subject: `Cập nhật đơn ${orderNumber}`,
    text: `Xin chào ${name},\n\nĐơn ${orderNumber} đã chuyển sang trạng thái: ${orderStatusLabels[status] || status}.${trackingNumber ? ` Mã vận đơn: ${trackingNumber}.` : ""}`,
  }),
};

export async function createAccountToken(client, user, purpose) {
  const token = randomToken();
  const minutes = purpose === "verify_email" ? 24 * 60 : 60;
  await client.query(
    "UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL",
    [user.id, purpose],
  );
  await client.query(
    "INSERT INTO account_tokens (user_id,purpose,token_hash,expires_at) VALUES ($1,$2,$3,now()+($4*interval '1 minute'))",
    [user.id, purpose, hashToken(token), minutes],
  );
  const route = purpose === "verify_email" ? "verify-email" : "reset-password";
  await queueEmail(client, {
    recipient: user.email,
    template: purpose,
    payload: {
      name: user.name,
      actionUrl: `${config.publicOrigin}/?${route}=${encodeURIComponent(token)}`,
    },
    dedupeKey: `${purpose}:${user.id}:${hashToken(token)}`,
  });
  return token;
}

export async function queueEmail(
  client,
  { recipient, template, payload, dedupeKey },
) {
  if (!templates[template])
    throw new Error(`Unknown email template: ${template}`);
  await client.query(
    `INSERT INTO email_outbox (recipient,template,payload,dedupe_key)
     VALUES ($1,$2,$3,$4) ON CONFLICT (dedupe_key) DO NOTHING`,
    [recipient.toLowerCase(), template, payload, dedupeKey],
  );
}

async function deliverEmail(row) {
  const rendered = templates[row.template](row.payload);
  const response = await fetch(config.email.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.email.apiKey}`,
    },
    body: JSON.stringify({
      from: config.email.from,
      to: row.recipient,
      ...rendered,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Email provider returned ${response.status}`);
}

export async function sendPendingEmails(limit = 25) {
  if (!emailConfigured()) throw new Error("Email provider is not configured.");
  await pool.query(
    "UPDATE email_outbox SET status='failed',last_error='Delivery worker interrupted' WHERE status='sending' AND next_attempt_at < now()-interval '10 minutes'",
  );
  let sent = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM email_outbox
          WHERE status IN ('pending','failed') AND next_attempt_at <= now()
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      if (!rows[0]) return null;
      await client.query(
        "UPDATE email_outbox SET status='sending',attempts=attempts+1 WHERE id=$1",
        [rows[0].id],
      );
      return rows[0];
    });
    if (!row) break;
    try {
      await deliverEmail(row);
      await pool.query(
        "UPDATE email_outbox SET status='sent',sent_at=now(),payload='{}'::jsonb,last_error=NULL WHERE id=$1",
        [row.id],
      );
      sent += 1;
    } catch (error) {
      const delayMinutes = Math.min(60, 2 ** Math.min(row.attempts + 1, 6));
      await pool.query(
        `UPDATE email_outbox SET status='failed',last_error=$2,next_attempt_at=now()+($3*interval '1 minute') WHERE id=$1`,
        [row.id, String(error.message).slice(0, 500), delayMinutes],
      );
    }
  }
  return sent;
}
