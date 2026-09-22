import { pool } from "../db.js";
import { sendPendingEmails } from "../services/email.js";

const sent = await sendPendingEmails(100);
console.log(`Sent ${sent} queued email(s).`);
await pool.end();
