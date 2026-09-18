const requiredTextFields = [
  "legal_name",
  "public_phone",
  "public_email",
  "address",
  "privacy_policy",
  "shipping_policy",
  "returns_policy",
  "supplement_disclaimer",
  "skincare_disclaimer",
];

export function evaluateLaunchGate({
  settings,
  activeProductCount,
  paymentConfigured,
  shippingConfigured,
}) {
  const blockers = [];
  for (const field of requiredTextFields) {
    if (!settings?.[field]?.trim()) blockers.push(`settings.${field}`);
  }
  if (!activeProductCount) blockers.push("products.verified_active");
  if (!settings?.payment_enabled || !paymentConfigured)
    blockers.push("integration.payment");
  if (!settings?.shipping_enabled || !shippingConfigured)
    blockers.push("integration.shipping");
  if (!settings?.accepting_orders) blockers.push("settings.accepting_orders");
  return { ready: blockers.length === 0, blockers };
}
