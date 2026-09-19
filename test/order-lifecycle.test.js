import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOrderTransition,
  ORDER_TRANSITIONS,
} from "../server/services/order-lifecycle.js";

test("order lifecycle permits only the defined forward transitions", () => {
  assert.deepEqual(ORDER_TRANSITIONS.paid, ["processing"]);
  assert.doesNotThrow(() => assertOrderTransition("paid", "processing", null));
  assert.throws(
    () => assertOrderTransition("paid", "completed", null),
    (error) =>
      error.status === 409 && error.code === "invalid_order_transition",
  );
});

test("shipping an order requires a tracking number", () => {
  assert.throws(
    () => assertOrderTransition("processing", "shipped", ""),
    (error) => error.status === 400 && error.code === "tracking_required",
  );
  assert.doesNotThrow(() =>
    assertOrderTransition("processing", "shipped", "VN123456"),
  );
});
