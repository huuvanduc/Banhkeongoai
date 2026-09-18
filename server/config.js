import "dotenv/config";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric environment variable: ${name}`);
  return value;
};

export const config = Object.freeze({
  env: process.env.NODE_ENV || "development",
  port: numberFromEnv("PORT", 3000),
  databaseUrl: required("DATABASE_URL"),
  databaseSsl: process.env.DATABASE_SSL === "true",
  publicOrigin: required("PUBLIC_ORIGIN").replace(/\/$/, ""),
  sessionDays: numberFromEnv("SESSION_DAYS", 7),
  trustProxy: process.env.TRUST_PROXY === "true",
  payment: {
    provider: process.env.PAYMENT_PROVIDER || "disabled",
    checkoutUrl: process.env.PAYMENT_CHECKOUT_URL || "",
    apiKey: process.env.PAYMENT_API_KEY || "",
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || ""
  },
  shipping: {
    provider: process.env.SHIPPING_PROVIDER || "disabled",
    quoteUrl: process.env.SHIPPING_QUOTE_URL || "",
    apiKey: process.env.SHIPPING_API_KEY || ""
  }
});

export const isProduction = config.env === "production";
