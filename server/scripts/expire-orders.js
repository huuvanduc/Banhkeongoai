import { pool, withTransaction } from "../db.js";
import { expirePendingOrders } from "../services/order-lifecycle.js";

let total = 0;
while (true) {
  const count = await withTransaction((client) => expirePendingOrders(client));
  total += count;
  if (count < 100) break;
}
console.log(`Expired ${total} unpaid order(s).`);
await pool.end();
