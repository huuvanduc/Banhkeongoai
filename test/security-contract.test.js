import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("browser code does not store authentication, products, or orders in localStorage", async () => {
  const client = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.equal(client.includes("localStorage"), false);
  assert.equal(client.includes("passwordHash"), false);
});

test("admin API is protected by the server-side admin middleware", async () => {
  const route = await readFile(
    new URL("../server/routes/admin.js", import.meta.url),
    "utf8",
  );
  assert.match(route, /router\.use\(requireAdmin\)/);
});

test("database rejects publishing unverified products or unlicensed photos", async () => {
  const migration = await readFile(
    new URL("../server/migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  assert.match(
    migration,
    /record_verified AND photo_authorized AND image_url IS NOT NULL AND origin_country IS NOT NULL/,
  );
  assert.match(migration, /NOT photo_authorized OR photo_source IS NOT NULL/);
});

test("the web server does not expose backend source files as static assets", async () => {
  const server = await readFile(
    new URL("../server/index.js", import.meta.url),
    "utf8",
  );
  assert.equal(server.includes("express.static(root"), false);
  assert.match(server, /app\.use\("\/assets"/);
});

test("payment callbacks have a unique provider event identifier", async () => {
  const migration = await readFile(
    new URL("../server/migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /UNIQUE\(provider, provider_event_id\)/);
});
