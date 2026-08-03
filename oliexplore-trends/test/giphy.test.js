import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGiphyItem, normalizeGiphyResponse, fetchGiphyTrending } from "../server/sources/giphy.js";

// Fixture shape matches GIPHY's real /v1/gifs/trending response format,
// per https://developers.giphy.com/docs/api/schema (trimmed to relevant fields).
const REAL_SHAPE_GIF = {
  id: "abc123XYZ",
  title: "excited cat GIF",
  url: "https://giphy.com/gifs/excited-cat-abc123XYZ",
  trending_datetime: "2026-08-01 14:32:10",
  images: {
    original: { url: "https://media.giphy.com/media/abc123XYZ/giphy.gif", width: "480", height: "270" },
    fixed_height: { url: "https://media.giphy.com/media/abc123XYZ/200.gif", width: "356", height: "200" },
  },
  user: { display_name: "Some Studio", username: "somestudio" },
};

test("normalizeGiphyItem maps a real-shaped GIF to the canonical trend-item shape", () => {
  const item = normalizeGiphyItem(REAL_SHAPE_GIF);
  assert.equal(item.id, "giphy:abc123XYZ");
  assert.equal(item.source, "giphy");
  assert.equal(item.type, "meme");
  assert.equal(item.title, "excited cat GIF");
  assert.equal(item.thumbnailUrl, "https://media.giphy.com/media/abc123XYZ/200.gif");
  assert.equal(item.creator, "Some Studio");
  assert.equal(item.publishedAt, "2026-08-01T14:32:10.000Z");
});

test("normalizeGiphyItem falls back to username when display_name is missing", () => {
  const gif = { ...REAL_SHAPE_GIF, user: { username: "onlyusername" } };
  const item = normalizeGiphyItem(gif);
  assert.equal(item.creator, "onlyusername");
});

test("normalizeGiphyItem falls back to the original image when fixed_height is missing", () => {
  const gif = { ...REAL_SHAPE_GIF, images: { original: REAL_SHAPE_GIF.images.original } };
  const item = normalizeGiphyItem(gif);
  assert.equal(item.thumbnailUrl, "https://media.giphy.com/media/abc123XYZ/giphy.gif");
});

test("normalizeGiphyItem treats GIPHY's all-zero placeholder timestamp as no timestamp", () => {
  const gif = { ...REAL_SHAPE_GIF, trending_datetime: "0000-00-00 00:00:00" };
  const item = normalizeGiphyItem(gif);
  assert.equal(item.publishedAt, null);
});

test("normalizeGiphyItem returns null for malformed entries instead of throwing", () => {
  assert.equal(normalizeGiphyItem(null), null);
  assert.equal(normalizeGiphyItem({}), null);
  assert.equal(normalizeGiphyItem({ id: "x" /* no images */ }), null);
});

test("normalizeGiphyResponse maps a full response and skips malformed entries", () => {
  const response = { data: [REAL_SHAPE_GIF, { id: "bad" }, null], pagination: {}, meta: { status: 200 } };
  const items = normalizeGiphyResponse(response);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "giphy:abc123XYZ");
});

test("normalizeGiphyResponse handles a missing/malformed top-level response", () => {
  assert.deepEqual(normalizeGiphyResponse(null), []);
  assert.deepEqual(normalizeGiphyResponse({}), []);
});

test("fetchGiphyTrending throws a clear error when no API key is configured", async () => {
  await assert.rejects(() => fetchGiphyTrending({ apiKey: "" }), /GIPHY_API_KEY is not set/);
});

test("fetchGiphyTrending normalizes a successful fetch response", async () => {
  const fakeFetch = async (url) => {
    assert.ok(url.includes("api.giphy.com/v1/gifs/trending"));
    assert.ok(url.includes("api_key=test-key"));
    return {
      ok: true,
      json: async () => ({ data: [REAL_SHAPE_GIF] }),
    };
  };
  const items = await fetchGiphyTrending({ apiKey: "test-key", fetchImpl: fakeFetch });
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "giphy");
});

test("fetchGiphyTrending throws when the API returns a non-OK HTTP status", async () => {
  const fakeFetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(() => fetchGiphyTrending({ apiKey: "test-key", fetchImpl: fakeFetch }), /HTTP 429/);
});
