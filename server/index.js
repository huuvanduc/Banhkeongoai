import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { pool } from "./db.js";
import { errorHandler } from "./lib/http.js";
import { loadSession } from "./middleware/auth.js";
import { verifyMutationOrigin } from "./middleware/origin.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import storeRoutes from "./routes/store.js";
import adminRoutes from "./routes/admin.js";
import webhookRoutes from "./routes/webhooks.js";

const app = express();
if (config.trustProxy) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"], "script-src": ["'self'"], "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "https:", "data:"], "connect-src": ["'self'"], "frame-ancestors": ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use("/api/webhooks", webhookRoutes);
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(loadSession);
app.use(verifyMutationOrigin);
app.get("/api/health", async (_request, response) => {
  await pool.query("SELECT 1");
  response.json({ status: "ok" });
});
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/admin", adminRoutes);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheAge = config.env === "production" ? "1h" : 0;
app.use("/assets", express.static(path.join(root, "assets"), { maxAge: cacheAge, index: false }));
for (const file of ["app.js", "style.css", "favicon.svg"]) {
  app.get(`/${file}`, (_request, response) => response.sendFile(path.join(root, file)));
}
app.get("/", (_request, response) => response.sendFile(path.join(root, "index.html")));
app.use(errorHandler);

const server = app.listen(config.port, () => console.log(`banhkeongoai listening on ${config.publicOrigin}`));
const shutdown = async () => {
  server.close(async () => { await pool.end(); process.exit(0); });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
