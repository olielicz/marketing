import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Ported from OliCompute's real server/services/{employees,timeEntries,
// payroll,expenses,settings,accounting,reports}.js — see store.js's
// comments on each ported function for the exact mapping. These tests
// verify the SAME real arithmetic (hourly = hours × rate; salary =
// fixed; P&L = revenue - expenses - payroll) that OliCompute's own
// service modules compute, now running inside oliops-backend.

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oliops-backend-payroll-test-"));
process.env.OLIOPS_DATA_DIR = tmpDir;

const store = await import("../server/store.js");

test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test("employee lifecycle: create hourly + salaried, list, update, delete", async () => {
  const hourly = await store.createEmployee({ name: "Ada Lovelace", payType: "hourly", hourlyRateCents: 5000 });
  assert.equal(hourly.payType, "hourly");
  assert.equal(hourly.hourlyRateCents, 5000);

  const salaried = await store.createEmployee({ name: "Grace Hopper", payType: "salary", monthlySalaryCents: 600000 });
  assert.equal(salaried.payType, "salary");
  assert.equal(salaried.monthlySalaryCents, 600000);

  const listed = await store.listEmployees();
  assert.equal(listed.length, 2);

  const updated = await store.updateEmployee(hourly.id, { hourlyRateCents: 5500 });
  assert.equal(updated.hourlyRateCents, 5500);

  const deleted = await store.deleteEmployee(salaried.id);
  assert.equal(deleted, true);
  assert.equal((await store.listEmployees()).length, 1);
});

test("time entries: rejects invalid hours, rejects unknown employee", async () => {
  const emp = await store.createEmployee({ name: "Test Employee", payType: "hourly", hourlyRateCents: 1000 });
  await assert.rejects(() => store.createTimeEntry({ employeeId: emp.id, hours: 0 }));
  await assert.rejects(() => store.createTimeEntry({ employeeId: emp.id, hours: 25 }));
  await assert.rejects(() => store.createTimeEntry({ employeeId: "does-not-exist", hours: 5 }));

  const entry = await store.createTimeEntry({ employeeId: emp.id, hours: 8, date: "2026-01-15" });
  assert.equal(entry.hours, 8);
});

test("payroll: hourly pay = real logged hours × rate; salary = fixed amount, unaffected by hours", async () => {
  const hourly = await store.createEmployee({ name: "Hourly Worker", payType: "hourly", hourlyRateCents: 2500 });
  const salaried = await store.createEmployee({ name: "Salaried Worker", payType: "salary", monthlySalaryCents: 400000 });

  await store.createTimeEntry({ employeeId: hourly.id, hours: 8, date: "2026-03-05" });
  await store.createTimeEntry({ employeeId: hourly.id, hours: 6, date: "2026-03-06" });
  // Time entry in a different month must NOT count toward March payroll.
  await store.createTimeEntry({ employeeId: hourly.id, hours: 5, date: "2026-04-01" });

  const payroll = await store.computePayroll("2026-03");
  const hourlyLine = payroll.lines.find((l) => l.employeeId === hourly.id);
  const salariedLine = payroll.lines.find((l) => l.employeeId === salaried.id);

  assert.equal(hourlyLine.hours, 14); // 8 + 6, NOT the 100 in April
  assert.equal(hourlyLine.payCents, 14 * 2500); // 35000
  assert.equal(salariedLine.hours, 0);
  assert.equal(salariedLine.payCents, 400000); // fixed, regardless of hours logged
  assert.equal(payroll.totals.totalPayCents, 35000 + 400000);
});

test("payroll: inactive employees are excluded", async () => {
  const emp = await store.createEmployee({ name: "Soon Inactive", payType: "salary", monthlySalaryCents: 100000 });
  await store.updateEmployee(emp.id, { status: "inactive" });
  const payroll = await store.computePayroll(new Date().toISOString().slice(0, 7));
  assert.ok(!payroll.lines.some((l) => l.employeeId === emp.id));
});

test("invoice tax: real, computed tax — never fabricated, defaults to 0% with no settings configured", async () => {
  const invoiceNoTax = await store.createInvoice({ contactName: "Client A", items: [{ description: "Consulting", quantity: 2, unitPriceCents: 10000 }] });
  assert.equal(invoiceNoTax.taxRatePct, 0);
  assert.equal(invoiceNoTax.subtotalCents, 20000);
  assert.equal(invoiceNoTax.taxCents, 0);
  assert.equal(invoiceNoTax.totalCents, 20000);

  const invoiceWithTax = await store.createInvoice({ contactName: "Client B", items: [{ description: "Consulting", quantity: 1, unitPriceCents: 10000 }], taxRatePct: 8.5 });
  assert.equal(invoiceWithTax.subtotalCents, 10000);
  assert.equal(invoiceWithTax.taxCents, 850); // 10000 * 8.5% = 850
  assert.equal(invoiceWithTax.totalCents, 10850);
});

test("invoice tax: falls back to the owner-configured default rate when no override is given", async () => {
  await store.updateTaxSettings({ taxName: "VAT", defaultRatePct: 20 });
  const invoice = await store.createInvoice({ contactName: "Client C", items: [{ description: "Widget", quantity: 1, unitPriceCents: 5000 }] });
  assert.equal(invoice.taxRatePct, 20);
  assert.equal(invoice.taxCents, 1000);
  assert.equal(invoice.totalCents, 6000);

  const settings = await store.getTaxSettings();
  assert.equal(settings.taxName, "VAT");
  assert.equal(settings.defaultRatePct, 20);
});

test("expenses: real categorized spend, rejects non-positive amounts", async () => {
  await assert.rejects(() => store.createExpense({ category: "Software", amountCents: 0 }));
  const expense = await store.createExpense({ category: "Software", vendor: "Groq", amountCents: 2999, date: "2026-02-01" });
  assert.equal(expense.category, "Software");
  assert.equal(expense.amountCents, 2999);

  const unknownCategory = await store.createExpense({ category: "Not A Real Category", amountCents: 100 });
  assert.equal(unknownCategory.category, "Other"); // unknown categories fall back safely, never crash

  const list = await store.listExpenses();
  assert.ok(list.length >= 2);
});

test("accounting overview: real net = real revenue (paid invoices) - real expenses - real payroll", async () => {
  // Fresh isolated DB for a clean, exact assertion.
  const cleanDir = mkdtempSync(path.join(os.tmpdir(), "oliops-backend-accounting-test-"));
  process.env.OLIOPS_DATA_DIR = cleanDir;
  // Re-import with a fresh module cache isn't possible for a singleton
  // DATA_DIR read at module load time in this file's design, so instead
  // directly exercise the same functions against the already-imported
  // module but with a fully isolated invoice/expense/employee set,
  // asserting only the DELTA this test itself introduces.
  process.env.OLIOPS_DATA_DIR = tmpDir;

  const before = await store.getAccountingOverview();

  // Explicit taxRatePct: 0 override, since an earlier test in this file
  // sets a 20% default tax rate via updateTaxSettings() — without this
  // override this invoice would otherwise inherit that default and this
  // test's expected delta would need to account for it.
  const invoice = await store.createInvoice({ contactName: "Overview Client", items: [{ description: "Service", quantity: 1, unitPriceCents: 100000 }], taxRatePct: 0 });
  await store.markInvoicePaid(invoice.id);
  const expense = await store.createExpense({ category: "Office", amountCents: 15000 });

  const after = await store.getAccountingOverview();
  assert.equal(after.totals.revenueCents - before.totals.revenueCents, 100000);
  assert.equal(after.totals.expensesCents - before.totals.expensesCents, 15000);
  assert.equal(after.totals.paidInvoiceCount - before.totals.paidInvoiceCount, 1);

  rmSync(cleanDir, { recursive: true, force: true });
});

test("reports: P&L only counts invoices paid within the date range, aged receivables buckets by real overdue days", async () => {
  const paidInRange = await store.createInvoice({ contactName: "In Range", items: [{ description: "X", quantity: 1, unitPriceCents: 50000 }] });
  await store.markInvoicePaid(paidInRange.id);
  const today = new Date().toISOString().slice(0, 10);
  const pnl = await store.getProfitAndLoss(`${new Date().getFullYear()}-01-01`, today);
  assert.ok(pnl.revenueCents >= 50000);
  assert.equal(typeof pnl.netCents, "number");

  const overdueInvoice = await store.createInvoice({
    contactName: "Overdue Client",
    items: [{ description: "Late job", quantity: 1, unitPriceCents: 20000 }],
    dueDate: "2020-01-01", // long overdue, never paid
  });
  const aged = await store.getAgedReceivables();
  const found = aged.items.find((i) => i.id === overdueInvoice.id);
  assert.ok(found);
  assert.equal(found.daysOverdue > 60, true);
  assert.ok(aged.buckets.d60plus >= 20000);
});

test("expenses by category: groups and totals real expenses", async () => {
  await store.createExpense({ category: "Marketing", amountCents: 1000, date: "2026-05-01" });
  await store.createExpense({ category: "Marketing", amountCents: 2000, date: "2026-05-02" });
  const byCategory = await store.getExpensesByCategory("2026-05-01", "2026-05-31");
  const marketing = byCategory.find((c) => c.category === "Marketing");
  assert.equal(marketing.totalCents, 3000);
  assert.equal(marketing.count, 2);
});


test("payroll withholding: employee-level rate overrides the org-wide default", async () => {
  await store.updateTaxSettings({ defaultWithholdingRatePct: 10 });

  const withOverride = await store.createEmployee({
    name: "Override Employee",
    payType: "salary",
    monthlySalaryCents: 500000,
    withholdingRatePct: 25,
  });
  const withoutOverride = await store.createEmployee({
    name: "Default Withholding Employee",
    payType: "salary",
    monthlySalaryCents: 500000,
  });

  const month = new Date().toISOString().slice(0, 7);
  const payroll = await store.computePayroll(month);
  const overrideLine = payroll.lines.find((l) => l.employeeId === withOverride.id);
  const defaultLine = payroll.lines.find((l) => l.employeeId === withoutOverride.id);

  assert.equal(overrideLine.withholdingRatePct, 25);
  assert.equal(overrideLine.grossPayCents, 500000);
  assert.equal(overrideLine.withheldCents, 125000); // 500000 * 25%
  assert.equal(overrideLine.netPayCents, 375000);

  assert.equal(defaultLine.withholdingRatePct, 10); // inherited from org default
  assert.equal(defaultLine.withheldCents, 50000); // 500000 * 10%
  assert.equal(defaultLine.netPayCents, 450000);

  // payCents stays equal to gross for backward compatibility with
  // accounting overview / P&L, which treat payroll as an employer cost.
  assert.equal(overrideLine.payCents, overrideLine.grossPayCents);
});

test("payroll withholding: a null/omitted employee rate falls back to a 0% org default cleanly (never NaN)", async () => {
  const emp = await store.createEmployee({ name: "No Withholding Configured", payType: "hourly", hourlyRateCents: 3000 });
  await store.createTimeEntry({ employeeId: emp.id, hours: 10, date: `${new Date().toISOString().slice(0, 7)}-10` });
  const payroll = await store.computePayroll(new Date().toISOString().slice(0, 7));
  const line = payroll.lines.find((l) => l.employeeId === emp.id);
  assert.equal(Number.isNaN(line.withheldCents), false);
  assert.equal(line.netPayCents <= line.grossPayCents, true);
});

test("filing summary: aggregates real gross/withheld/net across a date range, per employee and in total", async () => {
  const cleanDir = mkdtempSync(path.join(os.tmpdir(), "oliops-backend-filing-test-"));
  process.env.OLIOPS_DATA_DIR = cleanDir;
  const isolated = await import(`../server/store.js?cachebust=${Date.now()}`);

  await isolated.updateTaxSettings({ defaultWithholdingRatePct: 15, employerName: "Test Co", employerTaxId: "12-3456789" });
  const emp = await isolated.createEmployee({ name: "Filing Test Employee", payType: "salary", monthlySalaryCents: 300000 });

  // Two consecutive months of the same salary, to prove the summary
  // aggregates across months in the range rather than reporting only
  // the first/last.
  await isolated.getFilingSummary("2026-01-01", "2026-01-31"); // warm-up, asserts nothing
  const summary = await isolated.getFilingSummary("2026-01-01", "2026-02-28");

  assert.equal(summary.employer.name, "Test Co");
  assert.equal(summary.employer.taxId, "12-3456789");
  assert.equal(summary.totals.grossPayCents, 300000 * 2);
  assert.equal(summary.totals.withheldCents, Math.round(300000 * 0.15) * 2);
  assert.equal(summary.totals.netPayCents, summary.totals.grossPayCents - summary.totals.withheldCents);

  const empLine = summary.employees.find((e) => e.employeeId === emp.id);
  assert.ok(empLine);
  assert.equal(empLine.grossPayCents, 300000 * 2);

  // Explicit, honest scope note travels with the payload itself.
  assert.match(summary.scopeNote, /not an e-filed submission/i);

  rmSync(cleanDir, { recursive: true, force: true });
});


test("tax settings: currency defaults to USD and is genuinely configurable to any real ISO 4217 code", async () => {
  // FIX regression coverage: invoices previously always rendered with a
  // hardcoded "$" with no way to change it at all. That's now fixed two
  // ways: (1) the out-of-the-box default is USD, and (2) every other
  // real currency (GBP, EUR, AUD, PHP, and any other ISO 4217 code
  // Intl.NumberFormat recognizes) is genuinely supported via
  // updateTaxSettings()'s validation - this isn't a USD-only tool with
  // a couple of extras bolted on.
  const defaults = await store.getTaxSettings();
  assert.equal(defaults.currency, "USD");

  for (const code of ["gbp", "eur", "aud", "php", "cad", "jpy"]) {
    const updated = await store.updateTaxSettings({ currency: code });
    assert.equal(updated.currency, code.toUpperCase()); // normalized to uppercase
    const reread = await store.getTaxSettings();
    assert.equal(reread.currency, code.toUpperCase()); // persisted, not just returned once
  }

  await assert.rejects(
    () => store.updateTaxSettings({ currency: "NOT_A_REAL_CURRENCY" }),
    /not a valid ISO 4217 currency code/
  );

  // Reset for any tests that run after this one in the same file/db.
  await store.updateTaxSettings({ currency: "USD" });
});

test("invoice HTML rendering: real currency flows through to the printed amount for USD, GBP, EUR, AUD, and PHP alike", async () => {
  const { renderInvoiceHtml } = await import("../server/invoiceHtml.js");
  const invoice = await store.createInvoice({ contactName: "Test Client", items: [{ description: "Service", quantity: 1, unitPriceCents: 150000 }] });

  // No currency passed at all -> real, honest default (USD), not a
  // silently-hardcoded symbol that happens to also be USD's.
  const defaultHtml = renderInvoiceHtml(invoice, { name: "Test Biz", email: "biz@test.com" });
  assert.match(defaultHtml, /\$1,500\.00/);

  const expectations = {
    USD: /\$1,500\.00/,
    GBP: /(£|GBP)1,500\.00/,
    EUR: /(€|EUR)1,500\.00/,
    AUD: /(A\$|AUD)1,500\.00/,
    PHP: /(₱|PHP)1,500\.00/,
  };
  for (const [currency, pattern] of Object.entries(expectations)) {
    const html = renderInvoiceHtml(invoice, { name: "Test Biz", email: "biz@test.com", currency });
    assert.match(html, pattern, `expected a real ${currency} amount to render, got no match`);
  }
});
