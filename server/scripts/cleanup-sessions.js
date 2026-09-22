import { pool } from "../db.js";

const sessions = await pool.query(
  "DELETE FROM sessions WHERE expires_at <= now()",
);
const tokens = await pool.query(
  "DELETE FROM account_tokens WHERE expires_at <= now() OR consumed_at < now()-interval '7 days'",
);
console.log(
  `Removed ${sessions.rowCount} expired session(s) and ${tokens.rowCount} expired token(s).`,
);
await pool.end();
