import { test } from "node:test";
import assert from "node:assert/strict";
import { RefreshingCache } from "../server/cache.js";

test("RefreshingCache serves the initialValue before any refresh completes", () => {
  const cache = new RefreshingCache({ fetcher: async () => [1, 2, 3], intervalMs: 999999, initialValue: [] });
  const snap = cache.snapshot();
  assert.deepEqual(snap.value, []);
  assert.equal(snap.version, 0);
  assert.equal(snap.lastUpdatedAt, null);
});

test("refreshNow() updates the value, bumps the version, and records lastUpdatedAt", async () => {
  const cache = new RefreshingCache({ fetcher: async () => ["a", "b"], intervalMs: 999999 });
  await cache.refreshNow();
  const snap = cache.snapshot();
  assert.deepEqual(snap.value, ["a", "b"]);
  assert.equal(snap.version, 1);
  assert.ok(snap.lastUpdatedAt);
  assert.equal(snap.lastError, null);
});

test("refreshNow() keeps serving the last-good value when the fetcher throws (auto-update resilience)", async () => {
  let callCount = 0;
  const cache = new RefreshingCache({
    fetcher: async () => {
      callCount += 1;
      if (callCount === 1) return ["good", "data"];
      throw new Error("simulated network failure");
    },
    intervalMs: 999999,
  });
  await cache.refreshNow(); // succeeds
  await cache.refreshNow(); // fails
  const snap = cache.snapshot();
  assert.deepEqual(snap.value, ["good", "data"], "stale-but-good value must still be served after a failed refresh");
  assert.equal(snap.version, 1, "version should not bump on a failed refresh");
  assert.equal(snap.lastError, "simulated network failure");
});

test("refreshNow() does not run overlapping refreshes concurrently", async () => {
  let concurrentCalls = 0;
  let maxConcurrent = 0;
  const cache = new RefreshingCache({
    fetcher: async () => {
      concurrentCalls += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((r) => setTimeout(r, 20));
      concurrentCalls -= 1;
      return ["x"];
    },
    intervalMs: 999999,
  });
  await Promise.all([cache.refreshNow(), cache.refreshNow(), cache.refreshNow()]);
  assert.equal(maxConcurrent, 1, "overlapping refreshNow() calls should not run the fetcher concurrently");
});

test("start()/stop() actually trigger background auto-refresh on the configured interval", async () => {
  let calls = 0;
  const cache = new RefreshingCache({ fetcher: async () => { calls += 1; return [calls]; }, intervalMs: 15 });
  cache.start();
  await new Promise((r) => setTimeout(r, 60));
  cache.stop();
  assert.ok(calls >= 2, `expected at least 2 auto-refreshes in ~60ms at a 15ms interval, got ${calls}`);
  const snap = cache.snapshot();
  assert.equal(snap.version, calls);
});

test("stop() actually halts further auto-refreshes", async () => {
  let calls = 0;
  const cache = new RefreshingCache({ fetcher: async () => { calls += 1; return [calls]; }, intervalMs: 10 });
  cache.start();
  await new Promise((r) => setTimeout(r, 30));
  cache.stop();
  const callsAtStop = calls;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, callsAtStop, "no further refreshes should occur after stop()");
});
