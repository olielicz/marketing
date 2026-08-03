/**
 * YouTube Data API v3 "most popular" chart — official, free-tier API
 * (console.cloud.google.com, enable "YouTube Data API v3").
 * Docs: https://developers.google.com/youtube/v3/docs/videos/list
 *
 * normalizeYoutubeResponse() is a pure function so it can be unit-tested
 * with realistic fixtures, without needing a live network call.
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3/videos";

function formatCount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

/** Turns one raw YouTube video resource into this service's canonical trend-item shape. */
export function normalizeYoutubeItem(video) {
  if (!video || typeof video !== "object") return null;
  const snippet = video.snippet || {};
  const stats = video.statistics || {};
  const thumb = (snippet.thumbnails && (snippet.thumbnails.high || snippet.thumbnails.medium || snippet.thumbnails.default)) || {};
  if (!video.id || !snippet.title) return null;

  return {
    id: `youtube:${video.id}`,
    source: "youtube",
    type: "video",
    title: snippet.title,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    thumbnailUrl: thumb.url || null,
    creator: snippet.channelTitle || null,
    metricLabel: formatCount(stats.viewCount) || "trending on YouTube",
    metricValue: stats.viewCount ? Number(stats.viewCount) : null,
    publishedAt: snippet.publishedAt || null,
  };
}

/** Normalizes a full YouTube videos.list response into an array of trend items. */
export function normalizeYoutubeResponse(response) {
  if (!response || !Array.isArray(response.items)) return [];
  return response.items.map(normalizeYoutubeItem).filter(Boolean);
}

/**
 * Fetches the current YouTube "most popular" chart for a region. Throws on
 * network/HTTP failure — the caller (cache.js) falls back to the last-good
 * cached result rather than crashing the server.
 */
export async function fetchYoutubeTrending({ apiKey, regionCode = "US", maxResults = 15, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");
  const params = new URLSearchParams({
    part: "snippet,statistics",
    chart: "mostPopular",
    regionCode,
    maxResults: String(maxResults),
    key: apiKey,
  });
  const res = await fetchImpl(`${YOUTUBE_API_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`YouTube API returned HTTP ${res.status}`);
  }
  const json = await res.json();
  return normalizeYoutubeResponse(json);
}
