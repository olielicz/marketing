import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStripeEvent,
  normalizeShopifyEvent,
  normalizePaypalEvent,
  normalizeWooCommerceEvent,
  normalizeAmazonOrder,
  normalizeAmazonRefund,
} from "../server/normalize.js";

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

// ── Payment-method extraction (Klarna / Apple Pay / Google Pay) ──────────

test("normalizeStripeEvent tags a plain card charge as paymentMethod 'card'", () => {
  const [record] = normalizeStripeEvent({
    id: "evt_card",
    type: "checkout.session.completed",
    created: 1700000000,
    data: { object: { id: "cs_1", amount_total: 1000, currency: "usd", payment_method_types: ["card"] } },
  });
  assert.equal(record.paymentMethod, "card");
});

test("normalizeStripeEvent tags a Klarna charge as paymentMethod 'klarna'", () => {
  const [record] = normalizeStripeEvent({
    id: "evt_klarna",
    type: "checkout.session.completed",
    created: 1700000000,
    data: { object: { id: "cs_2", amount_total: 1000, currency: "usd", payment_method_types: ["klarna"] } },
  });
  assert.equal(record.paymentMethod, "klarna");
});

test("normalizeStripeEvent tags an Apple Pay wallet charge as paymentMethod 'apple_pay'", () => {
  const [record] = normalizeStripeEvent({
    id: "evt_ap",
    type: "charge.succeeded",
    created: 1700000000,
    data: {
      object: {
        id: "ch_1", amount: 1000, currency: "usd",
        payment_method_details: { type: "card", card: { wallet: { type: "apple_pay" } } },
      },
    },
  });
  assert.equal(record.paymentMethod, "apple_pay");
});

test("normalizeStripeEvent tags a Google Pay wallet charge as paymentMethod 'google_pay'", () => {
  const [record] = normalizeStripeEvent({
    id: "evt_gp",
    type: "charge.succeeded",
    created: 1700000000,
    data: {
      object: {
        id: "ch_2", amount: 1000, currency: "usd",
        payment_method_details: { type: "card", card: { wallet: { type: "google_pay" } } },
      },
    },
  });
  assert.equal(record.paymentMethod, "google_pay");
});

test("normalizeStripeEvent falls back to 'unknown' when no payment method field is present", () => {
  const [record] = normalizeStripeEvent({
    id: "evt_unk",
    type: "checkout.session.completed",
    created: 1700000000,
    data: { object: { id: "cs_3", amount_total: 1000, currency: "usd" } },
  });
  assert.equal(record.paymentMethod, "unknown");
});

test("normalizePaypalEvent tags a card payment_source as paymentMethod 'card'", () => {
  const [record] = normalizePaypalEvent({
    id: "WH-3",
    event_type: "CHECKOUT.ORDER.APPROVED",
    create_time: "2026-01-01T00:00:00Z",
    resource: { id: "order_1", amount: { total: "19.99", currency: "USD" }, payment_source: { card: {} } },
  });
  assert.equal(record.paymentMethod, "card");
});

test("normalizePaypalEvent tags an apple_pay payment_source as paymentMethod 'apple_pay'", () => {
  const [record] = normalizePaypalEvent({
    id: "WH-4",
    event_type: "CHECKOUT.ORDER.APPROVED",
    create_time: "2026-01-01T00:00:00Z",
    resource: { id: "order_2", amount: { total: "9.99", currency: "USD" }, payment_source: { apple_pay: {} } },
  });
  assert.equal(record.paymentMethod, "apple_pay");
});

test("normalizePaypalEvent defaults to 'paypal_balance' for legacy v1 events with no payment_source", () => {
  const [record] = normalizePaypalEvent({
    id: "WH-5",
    event_type: "PAYMENT.SALE.COMPLETED",
    create_time: "2026-01-01T00:00:00Z",
    resource: { id: "sale_2", amount: { total: "9.99", currency: "USD" } },
  });
  assert.equal(record.paymentMethod, "paypal_balance");
});

// ── WooCommerce ────────────────────────────────────────────────────────────

test("normalizeWooCommerceEvent maps a processing/completed order to a sale record", () => {
  const [record] = normalizeWooCommerceEvent("order.updated", {
    id: 501, number: "501", status: "processing", total: "42.50", currency: "USD",
    date_paid: "2026-02-01T00:00:00Z", payment_method: "stripe",
  });
  assert.equal(record.provider, "woocommerce");
  assert.equal(record.type, "sale");
  assert.equal(record.amountCents, 4250);
  assert.equal(record.paymentMethod, "card");
});

test("normalizeWooCommerceEvent ignores non-paid order statuses", () => {
  const records = normalizeWooCommerceEvent("order.updated", {
    id: 502, status: "pending", total: "10.00", currency: "USD",
  });
  assert.deepEqual(records, []);
});

test("normalizeWooCommerceEvent maps refunds to a refund record", () => {
  const [record] = normalizeWooCommerceEvent("order.refunded", {
    id: 503, number: "503", currency: "USD", payment_method: "ppcp",
    refunds: [{ total: "-5.00" }, { total: "-2.50" }],
  });
  assert.equal(record.type, "refund");
  assert.equal(record.amountCents, 750);
  assert.equal(record.paymentMethod, "paypal_balance");
});

test("normalizeWooCommerceEvent maps a klarna payment_method slug to paymentMethod 'klarna'", () => {
  const [record] = normalizeWooCommerceEvent("order.updated", {
    id: 504, status: "completed", total: "15.00", currency: "USD", payment_method: "klarna_payments",
  });
  assert.equal(record.paymentMethod, "klarna");
});

// ── Amazon ─────────────────────────────────────────────────────────────────

test("normalizeAmazonOrder maps a Shipped order to a sale record with paymentMethod 'amazon_pay'", () => {
  const [record] = normalizeAmazonOrder({
    AmazonOrderId: "111-2223334-5556667",
    OrderStatus: "Shipped",
    OrderTotal: { Amount: "29.99", CurrencyCode: "USD" },
    PurchaseDate: "2026-03-01T00:00:00Z",
  });
  assert.equal(record.provider, "amazon");
  assert.equal(record.type, "sale");
  assert.equal(record.amountCents, 2999);
  assert.equal(record.paymentMethod, "amazon_pay");
});

test("normalizeAmazonOrder ignores unshipped/pending orders", () => {
  const records = normalizeAmazonOrder({
    AmazonOrderId: "111-2223334-5556668",
    OrderStatus: "Pending",
    OrderTotal: { Amount: "29.99", CurrencyCode: "USD" },
  });
  assert.deepEqual(records, []);
});

test("normalizeAmazonRefund maps a refund event to a refund record", () => {
  const [record] = normalizeAmazonRefund({
    AmazonOrderId: "111-2223334-5556667",
    PostedDate: "2026-03-05T00:00:00Z",
    ShipmentItemAdjustmentList: [
      { ItemChargeAdjustmentList: [{ ItemChargeAmount: { CurrencyAmount: "10.00", CurrencyCode: "USD" } }] },
    ],
  });
  assert.equal(record.type, "refund");
  assert.equal(record.amountCents, 1000);
  assert.equal(record.paymentMethod, "amazon_pay");
});
