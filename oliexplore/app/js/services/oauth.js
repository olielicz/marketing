/* =====================================================================
   oauth.js — Real OAuth 2.0 (Authorization Code + PKCE) for the browser.

   HOW THIS WORKS
   --------------
   Browser-only apps can safely run the *authorization* half of OAuth
   (redirecting the user to log in and consent) but never the *token
   exchange* half, because that step requires a client secret which
   must never ship in front-end JS. So the flow here is split:

     1. (this file) Build the platform's authorize URL, open it in a
        popup, and capture the "code" that comes back to our redirect
        page (oauth-callback.html) via postMessage.
     2. (this file) Hand that code + PKCE verifier to YOUR proxy
        (see /server/worker.js) which holds the client secret server
        side, exchanges the code for real tokens, and returns them.
     3. (config.js) The resulting access token is stored locally and
        used for real collect/publish calls (services/liveApi.js).

   If no proxy URL / client ID is configured for a platform yet, the
   caller should fall back to the existing simulated login in
   connect.js — nothing here is required to demo the app.
   ===================================================================== */

import { platformById } from "./platforms.js";
import { getProxyUrl, getClientId, saveToken } from "./config.js";

const REDIRECT_PATH = "/oauth-callback.html";

function redirectUri() {
  return new URL(REDIRECT_PATH, window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "/")).toString();
}

/* ---------- PKCE helpers (required by X and TikTok) ---------- */

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function makePkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  return { verifier, challenge };
}

function randomState() {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

/* ---------- Public API ---------- */

/**
 * Whether a platform has a real OAuth definition wired up at all
 * (vs. LinkedIn, which is demo-only in this build).
 */
export function supportsLiveOAuth(platformId) {
  return Boolean(platformById(platformId)?.oauth);
}

/**
 * Kick off the real OAuth flow for a platform: opens the platform's
 * consent screen in a popup and resolves once the user authorizes
 * (or rejects if they cancel / it fails).
 *
 * @returns {Promise<{handle:string, displayName:string}>}
 */
export async function startLiveLogin(platformId) {
  const p = platformById(platformId);
  if (!p?.oauth) throw new Error(`No OAuth configuration for ${platformId}`);

  const proxyUrl = getProxyUrl();
  const clientId = getClientId(p.oauth.clientIdField);
  if (!proxyUrl || !clientId) {
    throw new Error("Live API is not configured yet. Open Settings to add your proxy URL and Client ID.");
  }

  const state = randomState();
  let verifier = null;
  const params = new URLSearchParams({
    [p.oauth.clientIdParam]: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: p.oauth.scope,
    state,
  });

  if (p.oauth.pkce) {
    const pair = await makePkcePair();
    verifier = pair.verifier;
    params.set("code_challenge", pair.challenge);
    params.set("code_challenge_method", "S256");
  }

  const authorizeUrl = `${p.oauth.authorizeUrl}?${params.toString()}`;

  const code = await openPopupAndAwaitCode(authorizeUrl, state);

  // Hand the code to the user's own proxy for the actual token exchange
  // (this is the one hop that needs a client secret, so it can't
  // happen in this browser code — see server/worker.js).
  const res = await fetch(`${proxyUrl}/oauth/${platformId}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      redirectUri: redirectUri(),
      codeVerifier: verifier,
      clientId,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${text || "check your proxy logs"}`);
  }

  const data = await res.json();
  // Expected shape from the reference worker: { accessToken, refreshToken,
  // expiresAt, handle, displayName, meta }
  saveToken(platformId, {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || null,
    expiresAt: data.expiresAt || null,
    handle: data.handle || null,
    displayName: data.displayName || data.handle || null,
    meta: data.meta || {},
  });

  return { handle: data.handle, displayName: data.displayName || data.handle };
}

/* Open a centered popup pointed at the authorize URL, listen for the
   redirect page's postMessage, and resolve with the "code" param. */
function openPopupAndAwaitCode(authorizeUrl, expectedState) {
  return new Promise((resolve, reject) => {
    const w = 520, h = 680;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      authorizeUrl,
      "oliexplore-oauth",
      `width=${w},height=${h},left=${left},top=${top}`
    );

    if (!popup) {
      reject(new Error("Popup blocked. Allow popups for this site and try again."));
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(poll);
    };

    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.source !== "oliexplore-oauth") return;
      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {}
      if (data.error) {
        reject(new Error(data.error_description || data.error));
      } else if (data.state !== expectedState) {
        reject(new Error("OAuth state mismatch — please try connecting again."));
      } else {
        resolve(data.code);
      }
    }

    window.addEventListener("message", onMessage);

    // Detect the user closing the popup manually.
    const poll = setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error("Login window closed before completing."));
      }
    }, 500);
  });
}
