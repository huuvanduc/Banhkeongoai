import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLaunchGate } from "../server/services/launch-gate.js";

const completeSettings = {
  legal_name: "Cửa hàng thử nghiệm",
  public_phone: "0900000000",
  public_email: "owner@example.com",
  address: "Địa chỉ đã xác minh",
  privacy_policy: "Chính sách quyền riêng tư",
  shipping_policy: "Chính sách giao hàng",
  returns_policy: "Chính sách đổi trả",
  supplement_disclaimer: "Thông tin thực phẩm bổ sung",
  skincare_disclaimer: "Thông tin chăm sóc da",
  shipping_enabled: true,
  payment_enabled: true,
  email_enabled: true,
  accepting_orders: true,
};

test("launch gate opens only when every business and integration requirement is ready", () => {
  assert.deepEqual(
    evaluateLaunchGate({
      settings: completeSettings,
      activeProductCount: 1,
      paymentConfigured: true,
      shippingConfigured: true,
      emailConfigured: true,
    }),
    { ready: true, blockers: [] },
  );
});

test("launch gate reports missing requirements and keeps orders closed", () => {
  const result = evaluateLaunchGate({
    settings: {
      ...completeSettings,
      legal_name: null,
      accepting_orders: false,
    },
    activeProductCount: 0,
    paymentConfigured: false,
    shippingConfigured: false,
    emailConfigured: false,
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    "settings.legal_name",
    "products.verified_active",
    "integration.payment",
    "integration.shipping",
    "integration.email",
    "settings.accepting_orders",
  ]);
});
