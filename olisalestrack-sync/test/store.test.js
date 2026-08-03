import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the store at a fresh temp directory before importing it, since the
// data directory path is read from the environment at module-load time.
const tmpDir = mkdtempSync(path.join(tmpdir(), "olisalestrack-sync-test-"));
process.env.OLI_SYNC_DATA_DIR = tmpDir;
const { appendEvents, listEvents } = await import("../server/store.js");

test("appendEvents inserts new records and reports how many were new", async () => {
  const inserted = await appendEvents([
    { id: "a", provider: "stripe", type: "sale", amountCents: 100, currency: "usd", occurredAt: "2026-01-01T00:00:00Z", description: "x" },
  ]);
  assert.equal(inserted.length, 1);
});

test("appendEvents de-duplicates by id (webhook redelivery safe)", async () => {
  const record = { id: "dup-1", provider: "stripe", type: "sale", amountCents: 100, currency: "usd", occurredAt: "2026-01-02T00:00:00Z", description: "x" };
  const first = await appendEvents([record]);
  const second = await appendEvents([record]);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
});

test("listEvents returns events filtered by since date", async () => {
  await appendEvents([
    { id: "old-1", provider: "shopify", type: "sale", amountCents: 100, currency: "usd", occurredAt: "2020-01-01T00:00:00Z", description: "old" },
    { id: "new-1", provider: "shopify", type: "sale", amountCents: 200, currency: "usd", occurredAt: "2030-01-01T00:00:00Z", description: "new" },
  ]);
  const events = await listEvents({ since: "2025-01-01T00:00:00Z" });
  const ids = events.map((e) => e.id);
  assert.ok(ids.includes("new-1"));
  assert.ok(!ids.includes("old-1"));
});

test("listEvents returns events filtered by provider", async () => {
  await appendEvents([
    { id: "prov-stripe-1", provider: "stripe", type: "sale", amountCents: 100, currency: "usd", occurredAt: "2026-02-01T00:00:00Z", description: "s" },
    { id: "prov-paypal-1", provider: "paypal", type: "sale", amountCents: 100, currency: "usd", occurredAt: "2026-02-01T00:00:00Z", description: "p" },
  ]);
  const events = await listEvents({ provider: "paypal" });
  assert.ok(events.every((e) => e.provider === "paypal"));
  assert.ok(events.some((e) => e.id === "prov-paypal-1"));
});

test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
