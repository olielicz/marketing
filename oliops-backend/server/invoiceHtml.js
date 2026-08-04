/**
 * Renders a real, printable HTML invoice from an invoice record (see
 * store.js's createInvoice() for its shape). No PDF library involved —
 * this ships a clean HTML page that any browser can print-to-PDF
 * natively (Ctrl/Cmd+P → Save as PDF), which is a genuinely sufficient
 * "print your invoice" experience for a small business without pulling
 * in a PDF-rendering dependency (none of which are available as
 * zero-install Node built-ins).
 */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function renderInvoiceHtml(invoice, businessInfo) {
  const rows = invoice.items
    .map(
      (item) => `
    <tr>
      <td>${escapeHtml(item.description)}</td>
      <td style="text-align:center;">${item.quantity}</td>
      <td style="text-align:right;">${formatMoney(item.unitPriceCents)}</td>
      <td style="text-align:right;">${formatMoney(item.quantity * item.unitPriceCents)}</td>
    </tr>`
    )
    .join("");

  const statusBadge =
    invoice.status === "paid"
      ? `<span style="background:#dcfce7;color:#166534;padding:4px 12px;border-radius:6px;font-weight:700;font-size:13px;">PAID</span>`
      : `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:6px;font-weight:700;font-size:13px;">UNPAID</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #14161a; max-width: 720px; margin: 40px auto; padding: 0 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .header h1 { font-size: 24px; margin: 0 0 4px; }
  .biz-info { text-align: right; font-size: 13px; color: #55606e; line-height: 1.5; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 14px; }
  .meta-row div { line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; color: #55606e; border-bottom: 2px solid #e7e9ee; padding: 8px 4px; }
  td { padding: 10px 4px; border-bottom: 1px solid #f0f0f4; font-size: 14px; }
  .totals { text-align: right; font-size: 15px; }
  .totals .grand { font-size: 20px; font-weight: 800; margin-top: 8px; }
  .notes { margin-top: 32px; font-size: 13px; color: #55606e; border-top: 1px solid #e7e9ee; padding-top: 16px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Invoice ${escapeHtml(invoice.invoiceNumber)}</h1>
      ${statusBadge}
    </div>
    <div class="biz-info">
      <strong>${escapeHtml(businessInfo?.name || "Your Business")}</strong><br>
      ${escapeHtml(businessInfo?.email || "")}
    </div>
  </div>
  <div class="meta-row">
    <div>
      <strong>Billed to:</strong><br>
      ${escapeHtml(invoice.contactName || "—")}
    </div>
    <div style="text-align:right;">
      <strong>Date issued:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}<br>
      <strong>Due date:</strong> ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="grand">Total: ${formatMoney(invoice.totalCents)}</div>
  </div>
  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</div>` : ""}
</body>
</html>`;
}
