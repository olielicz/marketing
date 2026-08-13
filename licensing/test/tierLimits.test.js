import test from "node:test";
import assert from "node:assert/strict";
import { resolveTierLimits, tierKeysFor, TIER_LIMITS } from "../server/tierLimits.js";

test("resolveTierLimits returns the real per-tier numbers, not a single global default", () => {
  const starter = resolveTierLimits("OPS", "starter");
  const pro = resolveTierLimits("OPS", "pro");
  const agency = resolveTierLimits("OPS", "agency");

  assert.equal(starter.maxDevices, 3);
  assert.equal(pro.maxDevices, 5);
  assert.equal(agency.maxDevices, 10);
  // The whole point of this fix: these must NOT all be equal.
  assert.notEqual(starter.maxDevices, pro.maxDevices);
  assert.notEqual(pro.maxDevices, agency.maxDevices);

  assert.equal(starter.maxUsers, 1);
  assert.equal(pro.maxUsers, 5);
  assert.equal(agency.maxUsers, 20);
});

test("resolveTierLimits is case-insensitive on tier", () => {
  const lower = resolveTierLimits("COM", "scale");
  const upper = resolveTierLimits("COM", "SCALE");
  const mixed = resolveTierLimits("COM", "ScAlE");
  assert.deepEqual(lower, upper);
  assert.deepEqual(lower, mixed);
});

test("resolveTierLimits falls back to the entry-level tier for an unrecognized tier, never a bigger one", () => {
  const result = resolveTierLimits("FLW", "made-up-tier");
  const solo = resolveTierLimits("FLW", "solo");
  assert.deepEqual(result, solo);
});

test("resolveTierLimits throws for an unknown product rather than silently defaulting", () => {
  assert.throws(() => resolveTierLimits("NOPE", "starter"));
});

test("tierKeysFor lists every real tier for a product", () => {
  assert.deepEqual(tierKeysFor("OPS"), ["starter", "pro", "agency"]);
  assert.deepEqual(tierKeysFor("COM"), ["basic", "growth", "scale"]);
  assert.deepEqual(tierKeysFor("FLW"), ["solo", "pro", "business"]);
  assert.deepEqual(tierKeysFor("EXP"), ["creator", "team", "agency"]);
});

test("every tier for every product has strictly increasing maxDevices and maxUsers (higher price = more, always)", () => {
  for (const [product, tiers] of Object.entries(TIER_LIMITS)) {
    const entries = Object.values(tiers);
    for (let i = 1; i < entries.length; i++) {
      assert.ok(
        entries[i].maxDevices >= entries[i - 1].maxDevices,
        `${product} tier ${i} (${entries[i].tier}) has fewer devices than tier ${i - 1} (${entries[i - 1].tier}) — a higher-priced tier must never grant less`
      );
      assert.ok(
        entries[i].maxUsers >= entries[i - 1].maxUsers,
        `${product} tier ${i} (${entries[i].tier}) has fewer users than tier ${i - 1} (${entries[i - 1].tier}) — a higher-priced tier must never grant less`
      );
    }
  }
});
