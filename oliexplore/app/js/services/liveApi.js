/* =====================================================================
   liveApi.js — Talks to YOUR proxy to collect/publish for real.

   Every call here hits `${proxyUrl}/api/{platform}/{action}` on the
   worker you deploy from /server (see LIVE_SETUP.md). The proxy is the
   only thing that ever sees your client secret; this file only ever
   sends the *access token* OliExplore already stored for you after a
   successful login (services/oauth.js).

   Both collector.js and publisher.js check hasLiveToken(platformId)
   before calling into this file — if you haven't connected a real
   account for a platform, the app keeps using the offline mock
   adapters, so nothing here is required to use OliExplore in demo mode.
   ===================================================================== */

import { getProxyUrl, getToken, saveToken, clearToken } from "./config.js";

class LiveApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "LiveApiError";
    this.status = status;
  }
}

async function call(platformId, action, body) {
  const proxyUrl = getProxyUrl();
  const token = getToken(platformId);
  if (!proxyUrl || !token?.accessToken) {
    throw new LiveApiError(`${platformId} is not connected live.`, 0);
  }

  const res = await fetch(`${proxyUrl}/api/${platformId}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify({ ...body, meta: token.meta || {} }),
  });

  if (res.status === 401) {
    // Access token expired/revoked — drop it so the UI shows
    // "Not connected" instead of silently failing forever.
    clearToken(platformId);
    throw new LiveApiError(
      `${platformId} session expired. Reconnect it from the Connections tab.`,
      401
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LiveApiError(text || `${platformId} request failed (${res.status})`, res.status);
  }

  return res.json();
}

/**
 * Fetch the connected account's recent posts for real.
 * Expected proxy response: { posts: [{ caption, hashtags, likes,
 * comments, shares, mediaEmoji?, permalink, createdAt }] }
 */
export async function fetchRealPosts(platformId) {
  const data = await call(platformId, "posts", {});
  return Array.isArray(data.posts) ? data.posts : [];
}

/**
 * Publish real content to the connected account.
 * Expected proxy response: { ok: true, url } or { ok:false, reason }
 */
export async function publishReal(platformId, { caption, hashtags }) {
  const data = await call(platformId, "publish", { caption, hashtags });
  return data;
}

/**
 * Ask the proxy for the current profile (handle/displayName) — used
 * right after token exchange if the OAuth response didn't already
 * include it, and to refresh the "Connected as @x" label.
 */
export async function fetchProfile(platformId) {
  return call(platformId, "profile", {});
}

export { LiveApiError };
