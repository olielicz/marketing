/* =====================================================================
   publisher.js — Publishes a post to one or many platforms at once.

   LIVE vs. MOCK (mirrors collector.js)
   -------------------------------------
   For each selected platform, this checks for a real live access token
   (services/config.js). If present, it publishes for real through your
   proxy — e.g. Facebook POST /{page-id}/feed, Instagram's two-step
   /media + /media_publish, X POST /2/tweets, TikTok's Content Posting
   API POST /v2/post/publish/video/init/, Threads POST
   /{threads-user-id}/threads + /threads_publish. Otherwise it uses the
   mock adapter below, which simulates latency and returns a fake
   permalink so the app works fully offline.

   `publishToAll` runs every selected platform concurrently and reports
   progress per-platform via an optional callback, so the UI can show a
   live status list.
   ===================================================================== */

import { platformById } from "./platforms.js";
import { hasLiveToken } from "./config.js";
import { publishReal, LiveApiError } from "./liveApi.js";

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

function fakePermalink(platformId) {
  const slug = Math.random().toString(36).slice(2, 9);
  return `https://${platformId}.example/p/${slug}`;
}

/* Per-platform mock publish adapters — used whenever a platform isn't
   connected with a real live token. Kept exactly as before so demo
   mode behaves identically to earlier releases. */
const mockAdapters = {
  async facebook(p) { await wait(700); return { ok: true, url: fakePermalink("facebook") }; },
  async instagram(p) { await wait(900); return { ok: true, url: fakePermalink("instagram") }; },
  async x(p) { await wait(550); return { ok: true, url: fakePermalink("x") }; },
  async linkedin(p) { await wait(800); return { ok: true, url: fakePermalink("linkedin") }; },
  async tiktok(p) { await wait(1000); return { ok: true, url: fakePermalink("tiktok") }; },
  async threads(p) { await wait(600); return { ok: true, url: fakePermalink("threads") }; },
};

/* Real publish adapter — routes through the user's proxy and their
   stored access token. Shared across every live-capable platform
   since liveApi.js already namespaces the request by platform id. */
async function liveAdapter(platformId, payload) {
  try {
    const res = await publishReal(platformId, payload);
    if (res.ok) return { ok: true, url: res.url || null };
    return { ok: false, reason: res.reason || "Publish failed" };
  } catch (err) {
    const reason = err instanceof LiveApiError ? err.message : "Live publish failed";
    return { ok: false, reason };
  }
}

/**
 * Validate a caption against a platform's character limit.
 */
export function validateForPlatform(platformId, caption) {
  const p = platformById(platformId);
  if (!p) return { ok: false, reason: "Unknown platform" };
  if (caption.length > p.charLimit) {
    return { ok: false, reason: `Over ${p.name} limit by ${caption.length - p.charLimit} chars` };
  }
  return { ok: true };
}

/**
 * Publish a payload to many platforms concurrently.
 * @param {{caption:string, hashtags:string[]}} payload
 * @param {string[]} platformIds
 * @param {(id:string, status:'start'|'done'|'error', data?:any)=>void} onProgress
 * @returns {Promise<{platform:string, ok:boolean, url?:string, reason?:string}[]>}
 */
export async function publishToAll(payload, platformIds, onProgress = () => {}) {
  const fullText = composeText(payload);

  const tasks = platformIds.map(async (id) => {
    onProgress(id, "start");

    const valid = validateForPlatform(id, fullText);
    if (!valid.ok) {
      onProgress(id, "error", valid);
      return { platform: id, ok: false, reason: valid.reason };
    }

    try {
      let res;
      if (hasLiveToken(id)) {
        res = await liveAdapter(id, payload);
      } else {
        const adapter = mockAdapters[id];
        res = adapter ? await adapter(payload) : { ok: false, reason: "No adapter for platform" };
      }
      onProgress(id, res.ok ? "done" : "error", res);
      return { platform: id, ...res };
    } catch (err) {
      onProgress(id, "error", { reason: err.message });
      return { platform: id, ok: false, reason: err.message };
    }
  });

  return Promise.all(tasks);
}

/* Combine caption + hashtags into the final outbound text. */
export function composeText({ caption, hashtags = [] }) {
  const tags = hashtags.length ? "\n\n" + hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${caption}${tags}`;
}
