/**
 * OliExplore Trend Radar server — aggregates trending memes/GIFs (GIPHY)
 * and trending video (YouTube "most popular" chart) into one feed, kept
 * fresh by a background auto-refresh timer, and exposes it over a small
 * HTTP API for the oliexplore/trends/ frontend page to poll.
 *
 * Zero external dependencies (built-in `http`/`fetch` only), same pattern
 * as ../licensing/server/index.js and ../olisalestrack-sync/server/index.js
 * elsewhere in this repo.
 *
 * Start with:  node server/index.js
 * See README.md in this directory for full setup + API documentation.
 */
import { createServer } from "node:http";
import { RefreshingCache } from "./cache.js";
import { fetchGiphyTrending } from "./sources/giphy.js";
import { fetchYoutubeTrending } from "./sources/youtube.js";
import { mergeFeeds } from "./merge.js";

const PORT = Number(process.env.PORT) || 4300;
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || "";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const YOUTUBE_REGION = process.env.YOUTUBE_REGION_CODE || "US";
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS) || 5 * 60 * 1000; // 5 min default
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

if (!GIPHY_API_KEY) {
  console.warn("⚠️  GIPHY_API_KEY not set — meme/GIF trends will be unavailable until it's configured.");
}
if (!YOUTUBE_API_KEY) {
  console.warn("⚠️  YOUTUBE_API_KEY not set — trending video will be unavailable until it's configured.");
}

const giphyCache = new RefreshingCache({
  intervalMs: REFRESH_INTERVAL_MS,
  fetcher: () => (GIPHY_API_KEY ? fetchGiphyTrending({ apiKey: GIPHY_API_KEY }) : Promise.resolve([])),
});

const youtubeCache = new RefreshingCache({
  intervalMs: REFRESH_INTERVAL_MS,
  fetcher: () =>
    YOUTUBE_API_KEY
      ? fetchYoutubeTrending({ apiKey: YOUTUBE_API_KEY, regionCode: YOUTUBE_REGION })
      : Promise.resolve([]),
});

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      });
      return res.end();
    }

    // GET /api/health — no auth, used by hosting platforms' health checks
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true });
    }

    // GET /api/trends?category=all|meme|video&limit=40
    // -> { updatedAt, version, items: [...], sources: { giphy: {...}, youtube: {...} } }
    // This is what the frontend polls for auto-update — "version" only
    // changes when a background refresh actually completed, so the client
    // can cheaply detect "nothing new" without re-rendering.
    if (req.method === "GET" && url.pathname === "/api/trends") {
      const category = url.searchParams.get("category") || "all";
      const limit = Math.min(Number(url.searchParams.get("limit")) || 40, 100);

      const giphySnap = giphyCache.snapshot();
      const youtubeSnap = youtubeCache.snapshot();

      const items = mergeFeeds([giphySnap.value, youtubeSnap.value], { category, limit });
      const updatedAt = [giphySnap.lastUpdatedAt, youtubeSnap.lastUpdatedAt]
        .filter(Boolean)
        .sort()
        .pop() || null;

      return send(res, 200, {
        updatedAt,
        version: giphySnap.version + youtubeSnap.version,
        refreshIntervalMs: REFRESH_INTERVAL_MS,
        items,
        sources: {
          giphy: { configured: Boolean(GIPHY_API_KEY), updatedAt: giphySnap.lastUpdatedAt, error: giphySnap.lastError, count: giphySnap.value.length },
          youtube: { configured: Boolean(YOUTUBE_API_KEY), updatedAt: youtubeSnap.lastUpdatedAt, error: youtubeSnap.lastError, count: youtubeSnap.value.length },
        },
      });
    }

    // POST /api/trends/refresh — force an immediate refresh of both sources,
    // bypassing the wait for the next scheduled interval. Useful for a
    // manual "Refresh now" button on the frontend, or for testing.
    if (req.method === "POST" && url.pathname === "/api/trends/refresh") {
      await Promise.all([giphyCache.refreshNow(), youtubeCache.refreshNow()]);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

// Kick off an immediate first fetch so the cache isn't empty on startup,
// then let the background timers take over for ongoing auto-refresh.
Promise.all([giphyCache.refreshNow(), youtubeCache.refreshNow()]).then(() => {
  giphyCache.start();
  youtubeCache.start();
});

server.listen(PORT, () => {
  console.log(`OliExplore Trend Radar server listening on http://localhost:${PORT}`);
  console.log(`Auto-refreshing every ${Math.round(REFRESH_INTERVAL_MS / 1000)}s`);
});
