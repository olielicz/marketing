/* =====================================================================
   config.js — Live API configuration & credential storage.

   This is deliberately kept separate from store.js (app content state):
   wiping your posts/library should never wipe your API credentials,
   and vice versa. Everything here lives in localStorage on *your*
   browser only — nothing is sent anywhere except directly to the proxy
   URL you configure yourself (see LIVE_SETUP.md).

   Shape:
   {
     proxyUrl: "https://your-worker.example.workers.dev",
     clientIds: { facebook: "...", x: "...", tiktok: "...", threads: "..." },
     tokens: {
       [platformId]: {
         accessToken, refreshToken, expiresAt,
         handle, displayName,
         meta: { pageId, igUserId, openId, ... }  // platform-specific extras
       }
     }
   }
   ===================================================================== */

const CONFIG_KEY = "oliexplore.config.v1";

function load() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { proxyUrl: "", clientIds: {}, tokens: {} };
    const parsed = JSON.parse(raw);
    return {
      proxyUrl: parsed.proxyUrl || "",
      clientIds: parsed.clientIds || {},
      tokens: parsed.tokens || {},
    };
  } catch {
    return { proxyUrl: "", clientIds: {}, tokens: {} };
  }
}

function save(cfg) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.warn("OliExplore: failed to save live API config.", err);
  }
}

let cfg = load();

export function getConfig() {
  return cfg;
}

export function getProxyUrl() {
  return (cfg.proxyUrl || "").replace(/\/+$/, "");
}

export function setProxyUrl(url) {
  cfg.proxyUrl = (url || "").trim();
  save(cfg);
}

export function getClientId(platformId) {
  return cfg.clientIds[platformId] || "";
}

export function setClientId(platformId, value) {
  cfg.clientIds = { ...cfg.clientIds, [platformId]: (value || "").trim() };
  save(cfg);
}

/** A platform is "ready for live login" once a proxy + client id are set. */
export function isPlatformConfigured(platformId) {
  return Boolean(getProxyUrl() && getClientId(platformId));
}

export function getToken(platformId) {
  return cfg.tokens[platformId] || null;
}

export function hasLiveToken(platformId) {
  const t = getToken(platformId);
  return Boolean(t && t.accessToken);
}

export function saveToken(platformId, tokenData) {
  cfg.tokens = { ...cfg.tokens, [platformId]: tokenData };
  save(cfg);
}

export function clearToken(platformId) {
  const next = { ...cfg.tokens };
  delete next[platformId];
  cfg.tokens = next;
  save(cfg);
}

/** Wipe every stored credential (proxy URL + client ids are kept). */
export function clearAllTokens() {
  cfg.tokens = {};
  save(cfg);
}
