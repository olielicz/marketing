import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFeeds } from "../server/merge.js";

const meme1 = { id: "giphy:1", source: "giphy", type: "meme", title: "meme1", publishedAt: "2026-08-01T10:00:00Z" };
const meme2 = { id: "giphy:2", source: "giphy", type: "meme", title: "meme2", publishedAt: "2026-08-01T12:00:00Z" };
const video1 = { id: "youtube:1", source: "youtube", type: "video", title: "video1", publishedAt: "2026-08-01T11:00:00Z" };
const video2 = { id: "youtube:2", source: "youtube", type: "video", title: "video2", publishedAt: null };

test("mergeFeeds combines multiple source arrays into one list", () => {
  const merged = mergeFeeds([[meme1, meme2], [video1]]);
  assert.equal(merged.length, 3);
});

test("mergeFeeds sorts newest-first by publishedAt across sources", () => {
  const merged = mergeFeeds([[meme1, meme2], [video1]]);
  assert.deepEqual(merged.map((i) => i.id), ["giphy:2", "youtube:1", "giphy:1"]);
});

test("mergeFeeds keeps items with no publishedAt but doesn't crash, placing them after timestamped items", () => {
  const merged = mergeFeeds([[meme1], [video2]]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "giphy:1");
  assert.equal(merged[1].id, "youtube:2");
});

test("mergeFeeds filters by category when requested", () => {
  const merged = mergeFeeds([[meme1, meme2], [video1]], { category: "video" });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "youtube:1");
});

test("mergeFeeds category=all returns everything unfiltered", () => {
  const merged = mergeFeeds([[meme1], [video1]], { category: "all" });
  assert.equal(merged.length, 2);
});

test("mergeFeeds respects the limit option", () => {
  const merged = mergeFeeds([[meme1, meme2], [video1]], { limit: 2 });
  assert.equal(merged.length, 2);
});

test("mergeFeeds ignores non-array entries in sourceResults instead of throwing", () => {
  const merged = mergeFeeds([[meme1], null, undefined, "not-an-array"]);
  assert.equal(merged.length, 1);
});

test("mergeFeeds handles an entirely empty input", () => {
  assert.deepEqual(mergeFeeds([]), []);
  assert.deepEqual(mergeFeeds([[], []]), []);
});
