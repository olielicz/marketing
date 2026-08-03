import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeYoutubeItem, normalizeYoutubeResponse, fetchYoutubeTrending } from "../server/sources/youtube.js";

// Fixture shape matches the real YouTube Data API v3 videos.list response
// (chart=mostPopular), per https://developers.google.com/youtube/v3/docs/videos
// (trimmed to relevant fields).
const REAL_SHAPE_VIDEO = {
  kind: "youtube#video",
  id: "dQw4w9WgXcQ",
  snippet: {
    title: "A genuinely trending video",
    channelTitle: "Some Channel",
    publishedAt: "2026-07-30T12:00:00Z",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg" },
      medium: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
      high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
    },
  },
  statistics: { viewCount: "2450000", likeCount: "98000", commentCount: "1200" },
};

test("normalizeYoutubeItem maps a real-shaped video to the canonical trend-item shape", () => {
  const item = normalizeYoutubeItem(REAL_SHAPE_VIDEO);
  assert.equal(item.id, "youtube:dQw4w9WgXcQ");
  assert.equal(item.source, "youtube");
  assert.equal(item.type, "video");
  assert.equal(item.title, "A genuinely trending video");
  assert.equal(item.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(item.thumbnailUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(item.creator, "Some Channel");
  assert.equal(item.metricLabel, "2.5M views");
  assert.equal(item.metricValue, 2450000);
});

test("normalizeYoutubeItem formats view counts in the thousands correctly", () => {
  const video = { ...REAL_SHAPE_VIDEO, statistics: { viewCount: "8400" } };
  const item = normalizeYoutubeItem(video);
  assert.equal(item.metricLabel, "8.4K views");
});

test("normalizeYoutubeItem falls back to a generic label when statistics are missing", () => {
  const video = { ...REAL_SHAPE_VIDEO, statistics: {} };
  const item = normalizeYoutubeItem(video);
  assert.equal(item.metricLabel, "trending on YouTube");
  assert.equal(item.metricValue, null);
});

test("normalizeYoutubeItem falls back through thumbnail sizes when high-res is missing", () => {
  const video = { ...REAL_SHAPE_VIDEO, snippet: { ...REAL_SHAPE_VIDEO.snippet, thumbnails: { default: REAL_SHAPE_VIDEO.snippet.thumbnails.default } } };
  const item = normalizeYoutubeItem(video);
  assert.equal(item.thumbnailUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg");
});

test("normalizeYoutubeItem returns null for malformed entries instead of throwing", () => {
  assert.equal(normalizeYoutubeItem(null), null);
  assert.equal(normalizeYoutubeItem({}), null);
  assert.equal(normalizeYoutubeItem({ id: "x" /* no snippet.title */ }), null);
});

test("normalizeYoutubeResponse maps a full response and skips malformed entries", () => {
  const response = { items: [REAL_SHAPE_VIDEO, { id: "bad" }, null] };
  const items = normalizeYoutubeResponse(response);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "youtube:dQw4w9WgXcQ");
});

test("normalizeYoutubeResponse handles a missing/malformed top-level response", () => {
  assert.deepEqual(normalizeYoutubeResponse(null), []);
  assert.deepEqual(normalizeYoutubeResponse({}), []);
});

test("fetchYoutubeTrending throws a clear error when no API key is configured", async () => {
  await assert.rejects(() => fetchYoutubeTrending({ apiKey: "" }), /YOUTUBE_API_KEY is not set/);
});

test("fetchYoutubeTrending normalizes a successful fetch response with the right query params", async () => {
  const fakeFetch = async (url) => {
    assert.ok(url.includes("googleapis.com/youtube/v3/videos"));
    assert.ok(url.includes("chart=mostPopular"));
    assert.ok(url.includes("regionCode=PH"));
    assert.ok(url.includes("key=test-key"));
    return { ok: true, json: async () => ({ items: [REAL_SHAPE_VIDEO] }) };
  };
  const items = await fetchYoutubeTrending({ apiKey: "test-key", regionCode: "PH", fetchImpl: fakeFetch });
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "youtube");
});

test("fetchYoutubeTrending throws when the API returns a non-OK HTTP status", async () => {
  const fakeFetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(() => fetchYoutubeTrending({ apiKey: "test-key", fetchImpl: fakeFetch }), /HTTP 403/);
});
