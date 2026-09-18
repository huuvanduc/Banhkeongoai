import crypto from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

export const paymentConfigured = () =>
  config.payment.provider !== "disabled" &&
  Boolean(
    config.payment.checkoutUrl &&
      config.payment.apiKey &&
      config.payment.webhookSecret,
  );

export const shippingConfigured = () =>
  config.shipping.provider !== "disabled" &&
  Boolean(config.shipping.quoteUrl && config.shipping.apiKey);

async function fetchJson(url, options, serviceName) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok)
    throw new HttpError(
      502,
      `${serviceName}_unavailable`,
      `${serviceName} tạm thời không khả dụng.`,
    );
  return response.json();
}

export async function getShippingQuote({
  province,
  ward,
  address,
  weightGrams,
  subtotalVnd,
}) {
  if (!shippingConfigured())
    throw new HttpError(
      503,
      "shipping_not_configured",
      "Cửa hàng chưa hoàn tất kết nối vận chuyển.",
    );
  const data = await fetchJson(
    config.shipping.quoteUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.shipping.apiKey}`,
      },
      body: JSON.stringify({
        province,
        ward,
        address,
        weightGrams,
        subtotalVnd,
        currency: "VND",
      }),
    },
    "Đơn vị vận chuyển",
  );
  if (
    !Number.isSafeInteger(data.amountVnd) ||
    data.amountVnd < 0 ||
    !data.reference ||
    !data.service
  ) {
    throw new HttpError(
      502,
      "invalid_shipping_quote",
      "Phản hồi phí vận chuyển không hợp lệ.",
    );
  }
  return {
    amountVnd: data.amountVnd,
    reference: data.reference,
    service: data.service,
  };
}

export async function createHostedPayment({
  orderNumber,
  amountVnd,
  method,
  returnUrl,
}) {
  if (!paymentConfigured())
    throw new HttpError(
      503,
      "payment_not_configured",
      "Cửa hàng chưa hoàn tất kết nối thanh toán.",
    );
  const data = await fetchJson(
    config.payment.checkoutUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.payment.apiKey}`,
      },
      body: JSON.stringify({
        orderNumber,
        amountVnd,
        method,
        currency: "VND",
        returnUrl,
      }),
    },
    "Cổng thanh toán",
  );
  if (!data.checkoutUrl || !data.reference) {
    throw new HttpError(
      502,
      "invalid_payment_session",
      "Phản hồi cổng thanh toán không hợp lệ.",
    );
  }
  return { checkoutUrl: data.checkoutUrl, reference: data.reference };
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!paymentConfigured() || !signature) return false;
  const expected = crypto
    .createHmac("sha256", config.payment.webhookSecret)
    .update(rawBody)
    .digest("hex");
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return (
    actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted)
  );
}
