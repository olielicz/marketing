/* =====================================================================
   collector.js — Pulls posts from connected platforms.

   LIVE vs. MOCK
   --------------
   For each connected platform, this checks whether you've completed
   real OAuth login (services/oauth.js + a proxy from /server) and
   stored a live access token (services/config.js):

     - If yes  -> fetchRealPosts() in liveApi.js calls your proxy,
                  which calls the platform's real API
                  (Facebook Graph GET /{page-id}/posts, Instagram Graph
                  GET /{ig-user-id}/media, X GET /2/users/:id/tweets,
                  TikTok GET /v2/video/list/, Threads
                  GET /{threads-user-id}/threads).
     - If no   -> falls back to the mock adapters below, which return
                  data from a local pool so the app works fully offline
                  with zero setup.

   The rest of the app neither knows nor cares whether the data is real
   or mocked, which keeps integration risk isolated to this file.
   ===================================================================== */

import { COLLECT_POOL } from "../data/seed.js";
import { collectablePlatforms } from "./platforms.js";
import { hasLiveToken } from "./config.js";
import { fetchRealPosts, LiveApiError } from "./liveApi.js";

const uid = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/* Normalize a raw platform payload (mock OR real, they share a shape)
   into the app's internal post shape. Real posts arrive with an
   `authorHandle`, actual engagement numbers, and no random jitter. */
function normalize(raw, { live = false } = {}) {
  return {
    id: raw.id ? `${raw.platform}-${raw.id}` : uid(raw.platform),
    platform: raw.platform,
    author: raw.author,
    caption: raw.caption,
    hashtags: raw.hashtags || [],
    mediaEmoji: raw.mediaEmoji || "🖼️",
    mediaTone: raw.mediaTone || "#232427",
    likes: live ? raw.likes || 0 : Math.floor(200 + Math.random() * 4000),
    comments: live ? raw.comments || 0 : Math.floor(5 + Math.random() * 300),
    shares: live ? raw.shares || 0 : Math.floor(2 + Math.random() * 150),
    permalink: raw.permalink || null,
    live,
    collectedAt: Date.now(),
    recycled: false,
    published: false,
    publishedTo: [],
  };
}

/* Per-platform collection adapters (mocked).
   Each platform shares the same lightweight lookup against the local
   pool — this keeps the adapter set easy to extend (just add platform
   posts to COLLECT_POOL) and avoids duplicating the same four lines
   per platform. Simulated latency varies slightly per platform so the
   "Collect New Posts" progress feels realistic. */
function poolAdapter(platformId, latencyMs) {
  return async function collect() {
    await wait(latencyMs);
    return COLLECT_POOL.filter((p) => p.platform === platformId);
  };
}

const adapters = {
  facebook: poolAdapter("facebook", 400),
  instagram: poolAdapter("instagram", 450),
  tiktok: poolAdapter("tiktok", 500),
  x: poolAdapter("x", 350),
  threads: poolAdapter("threads", 380),
};

/**
 * Collect fresh posts from every connected, collectable platform.
 * If a platform has a real live token (connected via Settings + real
 * OAuth), pull its actual recent posts through the proxy. Otherwise
 * fall back to the offline mock pool so the app stays fully usable
 * without any credentials configured.
 * @param {string[]} connectedIds - platform ids currently connected
 * @param {(id:string, message:string)=>void} [onWarning] - non-fatal per-platform issues
 * @returns {Promise<object[]>} normalized posts
 */
export async function collectPosts(connectedIds, onWarning = () => {}) {
  const targets = collectablePlatforms().filter((p) =>
    connectedIds.includes(p.id)
  );

  const live = [];
  const mockTargets = [];

  for (const p of targets) {
    if (hasLiveToken(p.id)) live.push(p);
    else mockTargets.push(p);
  }

  const livePosts = [];
  await Promise.all(
    live.map(async (p) => {
      try {
        const raw = await fetchRealPosts(p.id);
        raw.forEach((post) =>
          livePosts.push(normalize({ ...post, platform: p.id }, { live: true }))
        );
      } catch (err) {
        const msg = err instanceof LiveApiError ? err.message : `Failed to collect from ${p.name}.`;
        onWarning(p.id, msg);
      }
    })
  );

  const mockBatches = await Promise.all(
    mockTargets.map((p) => (adapters[p.id] ? adapters[p.id]() : Promise.resolve([])))
  );
  const flatMock = mockBatches.flat();
  // Return a random 2–3 of the available mock pool so each "collect" feels fresh.
  const shuffled = flatMock.sort(() => Math.random() - 0.5);
  const count = Math.min(shuffled.length, 2 + Math.floor(Math.random() * 2));
  const mockPosts = shuffled.slice(0, count).map((p) => normalize(p));

  return [...livePosts, ...mockPosts];
}
