import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStripeEvent, normalizeShopifyEvent, normalizePaypalEvent } from "../server/normalize.js";

test("normalizeStripeEvent maps checkout.session.completed to a sale record", () => {
  const [record] = normalizeStripeEvent({
    id: "evt_123",
    type: "checkout.session.completed",
    created: 1700000000,
    data: { object: { id: "cs_123", amount_total: 2400, currency: "usd", description: "Test sale" } },
  });
  assert.equal(record.provider, "stripe");
  assert.equal(record.type, "sale");
  assert.equal(record.amountCents, 2400);
  assert.equal(record.currency, "usd");
  assert.equal(record.id, "stripe:evt_123");
});

test("normalizeStripeEvent maps charge.refunded to a refund record", () => {
  const [record] = normalizeStripeEvent({
    id: "evt_456",
    type: "charge.refunded",
    created: 1700000000,
    data: { object: { id: "ch_456", amount_refunded: 500, currency: "usd" } },
  });
  assert.equal(record.type, "refund");
  assert.equal(record.amountCents, 500);
});

test("normalizeStripeEvent ignores unrelated event types", () => {
  const records = normalizeStripeEvent({ id: "evt_789", type: "customer.updated", data: { object: {} } });
  assert.deepEqual(records, []);
});

test("normalizeStripeEvent handles missing/malformed input gracefully", () => {
  assert.deepEqual(normalizeStripeEvent(null), []);
  assert.deepEqual(normalizeStripeEvent({}), []);
});

test("normalizeShopifyEvent maps orders/paid to a sale record", () => {
  const [record] = normalizeShopifyEvent("orders/paid", {
    id: 111,
    order_number: 1001,
    total_price: "59.99",
    currency: "USD",
    created_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(record.provider, "shopify");
  assert.equal(record.type, "sale");
  assert.equal(record.amountCents, 5999);
  assert.equal(record.currency, "usd");
});

test("normalizeShopifyEvent maps refunds/create to a refund record summed across transactions", () => {
  const [record] = normalizeShopifyEvent("refunds/create", {
    id: 222,
    order_id: 111,
    transactions: [{ amount: "10.00", currency: "USD" }, { amount: "5.00", currency: "USD" }],
    created_at: "2026-01-02T00:00:00Z",
  });
  assert.equal(record.type, "refund");
  assert.equal(record.amountCents, 1500);
});

test("normalizeShopifyEvent ignores unrelated topics", () => {
  assert.deepEqual(normalizeShopifyEvent("products/update", { id: 1 }), []);
});

test("normalizePaypalEvent maps PAYMENT.SALE.COMPLETED to a sale record", () => {
  const [record] = normalizePaypalEvent({
    id: "WH-1",
    event_type: "PAYMENT.SALE.COMPLETED",
    create_time: "2026-01-01T00:00:00Z",
    resource: { id: "sale_1", amount: { total: "19.99", currency: "USD" } },
  });
  assert.equal(record.provider, "paypal");
  assert.equal(record.type, "sale");
  assert.equal(record.amountCents, 1999);
});

test("normalizePaypalEvent maps PAYMENT.SALE.REFUNDED to a refund record", () => {
  const [record] = normalizePaypalEvent({
    id: "WH-2",
    event_type: "PAYMENT.SALE.REFUNDED",
    create_time: "2026-01-01T00:00:00Z",
    resource: { id: "refund_1", amount: { total: "5.00", currency: "USD" } },
  });
  assert.equal(record.type, "refund");
  assert.equal(record.amountCents, 500);
});

test("normalizePaypalEvent ignores unrelated event types", () => {
  assert.deepEqual(normalizePaypalEvent({ event_type: "BILLING.SUBSCRIPTION.CREATED", resource: {} }), []);
});
