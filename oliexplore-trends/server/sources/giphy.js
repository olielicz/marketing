/**
 * GIPHY Trending source — official, free-tier API (developers.giphy.com).
 * Docs: https://developers.giphy.com/docs/api/endpoint/#trending
 *
 * normalizeGiphyResponse() is a pure function so it can be unit-tested with
 * realistic fixtures, without needing a live network call — mirrors the
 * pattern used in ../../olisalestrack-sync/server/normalize.js elsewhere in
 * this repo.
 */

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs/trending";

/**
 * Turns one raw GIPHY GIF object into this service's canonical trend-item
 * shape. Returns null (not thrown) for a malformed entry, so one bad item
 * from the API can't take down an entire refresh cycle.
 */
export function normalizeGiphyItem(gif) {
  if (!gif || typeof gif !== "object") return null;
  const images = gif.images || {};
  const preview = images.fixed_height || images.original || {};
  if (!gif.id || !preview.url) return null;

  return {
    id: `giphy:${gif.id}`,
    source: "giphy",
    type: "meme",
    title: gif.title || "Untitled GIF",
    url: gif.url || `https://giphy.com/gifs/${gif.id}`,
    thumbnailUrl: preview.url,
    creator: (gif.user && (gif.user.display_name || gif.user.username)) || null,
    metricLabel: "trending on GIPHY",
    metricValue: null,
    publishedAt: gif.trending_datetime && gif.trending_datetime !== "0000-00-00 00:00:00"
      ? new Date(gif.trending_datetime.replace(" ", "T") + "Z").toISOString()
      : null,
  };
}

/** Normalizes a full GIPHY trending API response into an array of trend items. */
export function normalizeGiphyResponse(response) {
  if (!response || !Array.isArray(response.data)) return [];
  return response.data.map(normalizeGiphyItem).filter(Boolean);
}

/**
 * Fetches the current GIPHY trending list. Throws on network/HTTP failure —
 * the caller (cache.js) is responsible for catching this and falling back
 * to the last-good cached result rather than crashing the server.
 */
export async function fetchGiphyTrending({ apiKey, limit = 20, rating = "pg-13", fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("GIPHY_API_KEY is not set");
  const url = `${GIPHY_API_BASE}?api_key=${encodeURIComponent(apiKey)}&limit=${encodeURIComponent(limit)}&rating=${encodeURIComponent(rating)}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`GIPHY API returned HTTP ${res.status}`);
  }
  const json = await res.json();
  return normalizeGiphyResponse(json);
}
