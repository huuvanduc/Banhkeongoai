import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";

const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);
await pool.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
);
const applied = new Set(
  (await pool.query("SELECT name FROM schema_migrations")).rows.map(
    (row) => row.name,
  ),
);

for (const name of (await readdir(directory))
  .filter((entry) => entry.endsWith(".sql"))
  .sort()) {
  if (applied.has(name)) continue;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(path.join(directory, name), "utf8"));
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      name,
    ]);
    await client.query("COMMIT");
    console.log(`Applied ${name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
await pool.end();
