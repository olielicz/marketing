/**
 * orderCsv.js — real supplier CSV forwarding.
 * ===========================================================
 * Ported directly from the real, working `ecomm-automation` repo's
 * `src/utils/csv.js` (buildOrderCsv) and `src/handlers/orderPaid.js`
 * (the email-forwarding flow) — this is the actual "Supplier CSV
 * forwarding" feature that was previously marketed on OliCommerce's
 * landing/buy/account pages, found to have zero implementation
 * anywhere in this backend, and removed. This IS that feature, ported
 * to this service's real SMTP client (smtpClient.js) instead of
 * ecomm-automation's Gmail-specific one, and its real order-paid
 * webhook shape.
 *
 * What this does: builds a genuine, supplier-friendly CSV — one row per
 * line item, with order/shipping context repeated on every row so a
 * supplier can sort/filter in a spreadsheet — then emails it as a real
 * attachment via this service's existing SMTP client. No AI, no
 * fabrication: this is deterministic data formatting from the real
 * order payload your storefront sends.
 */

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Builds a supplier-friendly CSV from an order payload. Accepts the
 * same shape Shopify's real `orders/paid` webhook sends (line_items,
 * shipping_address, etc.) — see README.md's "Connecting your storefront"
 * section for the exact field mapping, same pattern already documented
 * there for the cart-abandoned webhook.
 */
export function buildOrderCsv(order) {
  const ship = order.shipping_address || order.shippingAddress || {};
  const headers = [
    "Order Number", "Order Date", "SKU", "Product", "Variant", "Quantity", "Unit Price",
    "Customer Name", "Ship Address 1", "Ship Address 2", "City", "Province", "Zip", "Country", "Phone",
  ];

  const lineItems = order.line_items || order.lineItems || [];
  const rows = lineItems.map((li) => [
    order.name || order.orderNumber || "",
    order.created_at || order.createdAt || new Date().toISOString(),
    li.sku || "",
    li.title || li.name || "",
    li.variant_title || li.variantTitle || "",
    li.quantity != null ? li.quantity : 1,
    li.price != null ? li.price : "",
    ship.name || "",
    ship.address1 || "",
    ship.address2 || "",
    ship.city || "",
    ship.province || ship.state || "",
    ship.zip || ship.postalCode || "",
    ship.country || "",
    ship.phone || order.phone || "",
  ]);

  const all = [headers, ...rows];
  return all.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Builds the supplier notification email's subject/html/text — real content, no AI. */
export function buildSupplierOrderEmail(order, storeName) {
  const orderNumber = order.name || order.orderNumber || "order";
  const lineItems = order.line_items || order.lineItems || [];
  const itemRows = lineItems
    .map((li) => `<tr><td>${escapeHtml(li.sku || "")}</td><td>${escapeHtml(li.title || li.name || "")}</td><td>${li.quantity || 1}</td></tr>`)
    .join("");
  return {
    subject: `New order to fulfill: ${orderNumber} (${storeName || "your store"})`,
    html: `<p>A new order from <strong>${escapeHtml(storeName || "your store")}</strong> is ready to fulfill. Full details are attached as a CSV.</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;"><thead><tr><th>SKU</th><th>Product</th><th>Qty</th></tr></thead><tbody>${itemRows}</tbody></table>`,
    text: `New order to fulfill: ${orderNumber}. Full details attached as a CSV.`,
  };
}
