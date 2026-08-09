import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderCsv, buildSupplierOrderEmail } from "../server/orderCsv.js";

const sampleOrder = {
  name: "#1042",
  created_at: "2026-05-01T12:00:00Z",
  phone: "+15551234567",
  shipping_address: {
    name: "Jane Doe",
    address1: "123 Main St",
    address2: "Apt 4",
    city: "Springfield",
    province: "IL",
    zip: "62704",
    country: "US",
    phone: "+15559876543",
  },
  line_items: [
    { sku: "SKU-1", title: "Blue T-Shirt", variant_title: "Large", quantity: 2, price: "24.99" },
    { sku: "SKU-2", title: "Red Hat", variant_title: "", quantity: 1, price: "14.50" },
  ],
};

test("buildOrderCsv produces one row per line item with real order/shipping data", () => {
  const csv = buildOrderCsv(sampleOrder);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3); // header + 2 line items
  assert.match(lines[0], /Order Number,Order Date,SKU,Product/);
  assert.match(lines[1], /#1042/);
  assert.match(lines[1], /SKU-1/);
  assert.match(lines[1], /Blue T-Shirt/);
  assert.match(lines[1], /Large/);
  assert.match(lines[1], /Springfield/);
  assert.match(lines[2], /SKU-2/);
  assert.match(lines[2], /Red Hat/);
});

test("buildOrderCsv correctly escapes commas and quotes in real data", () => {
  const order = {
    name: "#2001",
    line_items: [{ sku: "SKU-X", title: 'Widget, "Deluxe" Edition', quantity: 1, price: "9.99" }],
    shipping_address: { name: "O'Brien, Sean", address1: "1 Test Rd", city: "Testville", country: "US" },
  };
  const csv = buildOrderCsv(order);
  // A field containing a comma or quote must be wrapped in quotes, with internal quotes doubled.
  assert.match(csv, /"Widget, ""Deluxe"" Edition"/);
  assert.match(csv, /"O'Brien, Sean"/);
});

test("buildOrderCsv handles an order with no line items gracefully (header-only CSV)", () => {
  const csv = buildOrderCsv({ name: "#0", line_items: [] });
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 1); // header row only, no crash
});

test("buildSupplierOrderEmail produces a real subject/html/text referencing the real order", () => {
  const email = buildSupplierOrderEmail(sampleOrder, "My Test Shop");
  assert.match(email.subject, /#1042/);
  assert.match(email.subject, /My Test Shop/);
  assert.match(email.html, /SKU-1/);
  assert.match(email.html, /Blue T-Shirt/);
  assert.match(email.text, /#1042/);
});
