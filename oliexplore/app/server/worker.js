/* =====================================================================
   OliExplore Live Proxy — Cloudflare Worker (reference implementation)

   WHY THIS EXISTS
   -----------------
   OliExplore's front end is a static site (GitHub Pages) with no
   backend. OAuth token exchange requires a client SECRET, and secrets
   can never be shipped in browser JS — anyone could open devtools and
   steal it. This worker is the one small piece of server-side code
   that holds your secrets safely (as Worker environment variables,
   never in git) and does two things on the front end's behalf:

     1. POST /oauth/:platform/token
        Exchanges an OAuth authorization code for a real access token.
     2. POST /api/:platform/(posts|publish|profile)
        Forwards an authenticated request to the real platform API
        using the access token OliExplore's browser code already has
        (sent as `Authorization: Bearer <token>`), and normalizes the
        response into the shape OliExplore expects.

   This file intentionally keeps every platform's logic in one place
   and dependency-free so it deploys as a single Cloudflare Worker on
   the free tier with zero build step. See LIVE_SETUP.md at the repo
   root for exact deployment steps and where to get each platform's
   Client ID/Secret.

   SECURITY NOTES
   --------------
   - Client secrets live ONLY in Worker environment variables
     (`wrangler secret put ...`), never in this file or in git.
   - CORS is restricted to ALLOWED_ORIGIN (set it to your GitHub Pages
     URL) so random sites can't use your worker as an open proxy.
   - This reference implementation stores nothing server-side — tokens
     flow straight back to the browser, which is why OliExplore keeps
     them in localStorage. For a multi-user production app you would
     add a real datastore + user sessions instead.
   ===================================================================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin);
    }

    try {
      const parts = url.pathname.split("/").filter(Boolean); // e.g. ["oauth","x","token"]

      if (parts[0] === "oauth" && parts[2] === "token" && request.method === "POST") {
        const platform = parts[1];
        const body = await request.json();
        const result = await exchangeToken(platform, body, env);
        return withCors(json(result), origin);
      }

      if (parts[0] === "api" && parts.length === 3 && request.method === "POST") {
        const [, platform, action] = parts;
        const auth = request.headers.get("Authorization") || "";
        const accessToken = auth.replace(/^Bearer\s+/i, "");
        if (!accessToken) return withCors(json({ error: "Missing access token" }, 401), origin);

        const body = await request.json().catch(() => ({}));
        const result = await handleApi(platform, action, accessToken, body, env);
        return withCors(json(result), origin);
      }

      return withCors(json({ error: "Not found" }, 404), origin);
    } catch (err) {
      return withCors(json({ error: err.message || "Internal error" }, 500), origin);
    }
  },
};

/* ---------- helpers ---------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withCors(res, origin) {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

/* =====================================================================
   OAuth token exchange — one function per platform.
   Each receives { code, redirectUri, codeVerifier, clientId } from the
   browser and returns { accessToken, refreshToken, expiresAt, handle,
   displayName, meta }.
   ===================================================================== */

async function exchangeToken(platform, { code, redirectUri, codeVerifier, clientId }, env) {
  switch (platform) {
    case "facebook":
    case "instagram":
      return exchangeMeta(code, redirectUri, clientId, env);
    case "x":
      return exchangeX(code, redirectUri, codeVerifier, clientId, env);
    case "tiktok":
      return exchangeTikTok(code, redirectUri, codeVerifier, clientId, env);
    case "threads":
      return exchangeThreads(code, redirectUri, clientId, env);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// --- Meta (Facebook + Instagram share one App ID/Secret) ---
// Docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
async function exchangeMeta(code, redirectUri, clientId, env) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: env.META_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Meta token exchange failed");

  // Exchange the short-lived user token for a long-lived one (~60 days).
  const longLived = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: env.META_CLIENT_SECRET,
      fb_exchange_token: data.access_token,
    })}`
  ).then((r) => r.json());

  const accessToken = longLived.access_token || data.access_token;
  const me = await fetch(
    `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`
  ).then((r) => r.json());

  return {
    accessToken,
    refreshToken: null,
    expiresAt: Date.now() + (longLived.expires_in || 5_184_000) * 1000,
    handle: me.name,
    displayName: me.name,
    meta: { userId: me.id },
  };
}

// --- X (Twitter) API v2, OAuth 2.0 PKCE ---
// Docs: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
async function exchangeX(code, redirectUri, codeVerifier, clientId, env) {
  const basic = btoa(`${clientId}:${env.X_CLIENT_SECRET}`);
  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "X token exchange failed");

  const me = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  }).then((r) => r.json());

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
    handle: `@${me.data?.username}`,
    displayName: me.data?.name,
    meta: { userId: me.data?.id },
  };
}

// --- TikTok Content Posting API, OAuth 2.0 PKCE ---
// Docs: https://developers.tiktok.com/doc/oauth-user-access-token-management
async function exchangeTikTok(code, redirectUri, codeVerifier, clientId, env) {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientId,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error_description || "TikTok token exchange failed");

  const info = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,open_id", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  }).then((r) => r.json());

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
    handle: info.data?.user?.display_name,
    displayName: info.data?.user?.display_name,
    meta: { openId: data.open_id || info.data?.user?.open_id },
  };
}

// --- Threads (separate app product under the Meta dashboard) ---
// Docs: https://developers.facebook.com/docs/threads/get-started
async function exchangeThreads(code, redirectUri, clientId, env) {
  const res = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: env.THREADS_CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message || "Threads token exchange failed");

  // Short-lived -> long-lived token (~60 days).
  const longLived = await fetch(
    `https://graph.threads.net/access_token?${new URLSearchParams({
      grant_type: "th_exchange_token",
      client_secret: env.THREADS_CLIENT_SECRET,
      access_token: data.access_token,
    })}`
  ).then((r) => r.json());

  const accessToken = longLived.access_token || data.access_token;
  const me = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`
  ).then((r) => r.json());

  return {
    accessToken,
    refreshToken: null,
    expiresAt: Date.now() + (longLived.expires_in || 5_184_000) * 1000,
    handle: `@${me.username}`,
    displayName: `@${me.username}`,
    meta: { userId: data.user_id || me.id },
  };
}

/* =====================================================================
   API passthrough — posts / publish / profile, per platform.
   ===================================================================== */

async function handleApi(platform, action, accessToken, body, env) {
  const handlers = { facebook, instagram, x, tiktok, threads };
  const handler = handlers[platform];
  if (!handler) throw new Error(`Unsupported platform: ${platform}`);
  const fn = handler[action];
  if (!fn) throw new Error(`Unsupported action for ${platform}: ${action}`);
  return fn(accessToken, body, env);
}

/* ---------- Facebook (Page posts) ---------- */
const facebook = {
  async posts(token, { meta }) {
    const pageId = meta?.pageId || meta?.userId;
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/posts?fields=message,created_time,permalink_url,likes.summary(true),comments.summary(true),shares&access_token=${token}`
    ).then((r) => r.json());
    const posts = (res.data || []).map((p) => ({
      id: p.id,
      caption: p.message || "",
      hashtags: [],
      likes: p.likes?.summary?.total_count || 0,
      comments: p.comments?.summary?.total_count || 0,
      shares: p.shares?.count || 0,
      permalink: p.permalink_url,
      createdAt: p.created_time,
    }));
    return { posts };
  },
  async publish(token, { caption, meta }) {
    const pageId = meta?.pageId || meta?.userId;
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: caption, access_token: token }),
    }).then((r) => r.json());
    if (res.error) return { ok: false, reason: res.error.message };
    return { ok: true, url: `https://facebook.com/${res.id}` };
  },
  async profile(token, { meta }) {
    const pageId = meta?.pageId || meta?.userId;
    return fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=name&access_token=${token}`).then((r) =>
      r.json()
    );
  },
};

/* ---------- Instagram Graph API ---------- */
const instagram = {
  async posts(token, { meta }) {
    const igUserId = meta?.igUserId;
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media?fields=caption,permalink,like_count,comments_count,timestamp&access_token=${token}`
    ).then((r) => r.json());
    const posts = (res.data || []).map((p) => ({
      id: p.id,
      caption: p.caption || "",
      hashtags: [],
      likes: p.like_count || 0,
      comments: p.comments_count || 0,
      shares: 0,
      permalink: p.permalink,
      createdAt: p.timestamp,
    }));
    return { posts };
  },
  async publish(token, { caption, meta }) {
    // NOTE: Instagram publishing requires a mediaUrl (image/video) —
    // it has no pure text post type. `meta.mediaUrl` must be a public
    // image/video URL your app hosts; wire that into the publish UI
    // before enabling this in production.
    const igUserId = meta?.igUserId;
    if (!meta?.mediaUrl) return { ok: false, reason: "Instagram requires an image/video URL to publish." };
    const container = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: meta.mediaUrl, caption, access_token: token }),
    }).then((r) => r.json());
    if (container.error) return { ok: false, reason: container.error.message };

    const publish = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    }).then((r) => r.json());
    if (publish.error) return { ok: false, reason: publish.error.message };
    return { ok: true, url: `https://instagram.com/p/${publish.id}` };
  },
  async profile(token, { meta }) {
    const igUserId = meta?.igUserId;
    return fetch(
      `https://graph.facebook.com/v21.0/${igUserId}?fields=username&access_token=${token}`
    ).then((r) => r.json());
  },
};

/* ---------- X API v2 ---------- */
const x = {
  async posts(token, { meta }) {
    const userId = meta?.userId;
    const res = await fetch(
      `https://api.x.com/2/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json());
    const posts = (res.data || []).map((t) => ({
      id: t.id,
      caption: t.text,
      hashtags: [],
      likes: t.public_metrics?.like_count || 0,
      comments: t.public_metrics?.reply_count || 0,
      shares: t.public_metrics?.retweet_count || 0,
      permalink: `https://x.com/i/web/status/${t.id}`,
      createdAt: t.created_at,
    }));
    return { posts };
  },
  async publish(token, { caption, hashtags = [] }) {
    const text = hashtags.length ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(" ")}` : caption;
    const res = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    }).then((r) => r.json());
    if (res.errors) return { ok: false, reason: res.errors[0]?.message || "X publish failed" };
    return { ok: true, url: `https://x.com/i/web/status/${res.data.id}` };
  },
  async profile(token) {
    return fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
  },
};

/* ---------- TikTok ---------- */
const tiktok = {
  async posts(token) {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,like_count,comment_count,share_count,create_time,share_url",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }
    ).then((r) => r.json());
    const posts = (res.data?.videos || []).map((v) => ({
      id: v.id,
      caption: v.title || "",
      hashtags: [],
      likes: v.like_count || 0,
      comments: v.comment_count || 0,
      shares: v.share_count || 0,
      permalink: v.share_url,
      createdAt: v.create_time,
    }));
    return { posts };
  },
  async publish(token, { caption, meta }) {
    // NOTE: TikTok's Content Posting API publishes VIDEOS, not text.
    // `meta.videoUrl` must point at a video your app hosts, and until
    // your client passes TikTok's audit, posts land in PRIVATE mode
    // only (TikTok platform policy) — see LIVE_SETUP.md.
    if (!meta?.videoUrl) return { ok: false, reason: "TikTok requires a video URL to publish." };
    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: { title: caption, privacy_level: "SELF_ONLY" },
        source_info: { source: "PULL_FROM_URL", video_url: meta.videoUrl },
      }),
    }).then((r) => r.json());
    if (res.error?.code && res.error.code !== "ok") return { ok: false, reason: res.error.message };
    return { ok: true, url: null };
  },
  async profile(token) {
    return fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,open_id", {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
  },
};

/* ---------- Threads ---------- */
const threads = {
  async posts(token, { meta }) {
    const userId = meta?.userId;
    const res = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads?fields=text,permalink,timestamp&access_token=${token}`
    ).then((r) => r.json());
    const posts = (res.data || []).map((t) => ({
      id: t.id,
      caption: t.text || "",
      hashtags: [],
      likes: 0,
      comments: 0,
      shares: 0,
      permalink: t.permalink,
      createdAt: t.timestamp,
    }));
    return { posts };
  },
  async publish(token, { caption, hashtags = [], meta }) {
    const userId = meta?.userId;
    const text = hashtags.length ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(" ")}` : caption;
    const container = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: "TEXT", text, access_token: token }),
    }).then((r) => r.json());
    if (container.error) return { ok: false, reason: container.error.message };

    const publish = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    }).then((r) => r.json());
    if (publish.error) return { ok: false, reason: publish.error.message };
    return { ok: true, url: null };
  },
  async profile(token, { meta }) {
    const userId = meta?.userId;
    return fetch(
      `https://graph.threads.net/v1.0/${userId}?fields=username&access_token=${token}`
    ).then((r) => r.json());
  },
};
