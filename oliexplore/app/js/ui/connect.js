/* =====================================================================
   connect.js — "Log in & connect account" flow.

   Two paths, chosen automatically per platform:

     LIVE MODE   — if you've configured a proxy URL + Client ID for this
                   platform in Settings, "Log in & Connect" opens the
                   platform's *real* OAuth consent screen in a popup
                   (services/oauth.js) and stores a real access token
                   (services/config.js). Collect/publish then hit the
                   real APIs through your proxy.

     DEMO MODE   — otherwise, falls back to the original simulated
                   flow below: enter an identifier, review the (fake)
                   permission list, and get "connected" locally. No
                   credentials are transmitted or stored anywhere; the
                   password field is read and immediately discarded.

   See LIVE_SETUP.md for how to register each platform's developer app
   and turn Live Mode on.
   ===================================================================== */

import { store } from "../store.js";
import { platformById, usesAtHandle } from "../services/platforms.js";
import { isPlatformConfigured } from "../services/config.js";
import { supportsLiveOAuth, startLiveLogin } from "../services/oauth.js";
import { esc } from "./util.js";
import { toast } from "./toast.js";

const modal = () => document.getElementById("connectModal");

let currentId = null;

export function initConnect() {
  modal().addEventListener("click", (e) => {
    if (e.target.closest("[data-close-connect]")) closeConnect();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal().getAttribute("aria-hidden") === "false") closeConnect();
  });
}

export function openConnect(platformId) {
  const p = platformById(platformId);
  if (!p) return;
  currentId = platformId;
  document.getElementById("connectTitle").textContent = `Connect ${p.name}`;

  const live = supportsLiveOAuth(platformId) && isPlatformConfigured(platformId);
  if (live) {
    renderLiveIntro(p);
  } else {
    renderLogin(p);
  }
  modal().setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

/* ---------- Live path: real OAuth via popup ---------- */

function renderLiveIntro(p) {
  const body = document.getElementById("connectBody");
  body.innerHTML = `
    <div class="auth">
      <div class="auth-brand">
        <div class="auth-brand__icon">${esc(p.glyph)}</div>
        <div>
          <div class="auth-brand__title">Connect ${esc(p.name)} — Live</div>
          <div class="auth-brand__sub">You'll be redirected to ${esc(p.name)}'s real sign-in page.</div>
        </div>
      </div>
      <ul class="scopes">
        <li class="scopes__head">OliExplore will request:</li>
        ${p.auth.scopes.map((s) => `<li><span class="check">✓</span> ${esc(s)}</li>`).join("")}
      </ul>
      <p class="auth-note">
        <strong>Live mode.</strong> A popup will open ${esc(p.name)}'s official consent screen.
        Your login is handled entirely by ${esc(p.name)} — OliExplore never sees your password,
        only the access token ${esc(p.name)} issues after you approve it.
      </p>
      <div class="modal__foot" style="margin:18px -22px -22px;">
        <button type="button" class="btn btn--soft btn--block" data-close-connect>Cancel</button>
        <button type="button" class="btn btn--primary btn--block" id="liveAuthBtn">Continue to ${esc(p.name)}</button>
      </div>
    </div>
  `;

  document.getElementById("liveAuthBtn").addEventListener("click", () => runLiveLogin(p));
}

async function runLiveLogin(p) {
  const body = document.getElementById("connectBody");
  body.innerHTML = `
    <div class="auth-center">
      <div class="spinner"></div>
      <div class="auth-brand__title">Waiting for ${esc(p.name)}…</div>
      <p class="auth-brand__sub">Complete sign-in in the popup window.</p>
    </div>
  `;

  try {
    const { handle, displayName } = await startLiveLogin(p.id);
    renderSuccess(p, displayName || handle || p.sampleHandle, true);
    toast(`${p.name} connected live ✓`, "success");
  } catch (err) {
    toast(err.message || `Could not connect ${p.name}.`, "error");
    renderLiveIntro(p);
  }
}

export function closeConnect() {
  modal().setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  currentId = null;
}

/* ---------- Step 1: login + consent ---------- */

function renderLogin(p) {
  const body = document.getElementById("connectBody");
  body.innerHTML = `
    <div class="auth">
      <div class="auth-brand">
        <div class="auth-brand__icon">${esc(p.glyph)}</div>
        <div>
          <div class="auth-brand__title">Continue to ${esc(p.name)}</div>
          <div class="auth-brand__sub">OliExplore wants to access your ${esc(p.name)} account</div>
        </div>
      </div>

      <form id="authForm" novalidate>
        <div class="field">
          <label class="field__label" for="authUser">${esc(p.auth.loginLabel)}</label>
          <input id="authUser" class="input" type="text"
                 placeholder="${esc(p.auth.loginPlaceholder)}" autocomplete="off" required />
        </div>
        <div class="field">
          <label class="field__label" for="authPass">Password</label>
          <input id="authPass" class="input" type="password" placeholder="••••••••" autocomplete="off" />
        </div>

        <ul class="scopes">
          <li class="scopes__head">OliExplore will be able to:</li>
          ${p.auth.scopes.map((s) => `<li><span class="check">✓</span> ${esc(s)}</li>`).join("")}
        </ul>

        <p class="auth-note">
          Demo authorization — your credentials are not sent anywhere or stored.
          This simulates the real OAuth consent screen.
        </p>

        <div class="modal__foot" style="margin:18px -22px -22px;">
          <button type="button" class="btn btn--soft btn--block" data-close-connect>Cancel</button>
          <button type="submit" class="btn btn--primary btn--block" id="authSubmit">Authorize &amp; Connect</button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById("authForm");
  const userInput = document.getElementById("authUser");
  userInput.focus();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = userInput.value.trim();
    if (!raw) {
      userInput.focus();
      toast("Enter your account to continue.", "error");
      return;
    }
    // Read and immediately discard the password — never stored.
    document.getElementById("authPass").value = "";
    startHandshake(p, raw);
  });
}

/* ---------- Step 2: simulated OAuth handshake ---------- */

function startHandshake(p, raw) {
  const body = document.getElementById("connectBody");
  body.innerHTML = `
    <div class="auth-center">
      <div class="spinner"></div>
      <div class="auth-brand__title">Connecting to ${esc(p.name)}…</div>
      <p class="auth-brand__sub">Authorizing OliExplore and exchanging access tokens.</p>
    </div>
  `;

  setTimeout(() => {
    const handle = formatHandle(p.id, raw);
    store.connectAccount(p.id, { handle, displayName: handle });
    renderSuccess(p, handle, false);
    toast(`${p.name} connected ✓`, "success");
  }, 1200);
}

/* ---------- Step 3: success (shared by live + demo paths) ---------- */

function renderSuccess(p, handle, live) {
  // startLiveLogin() already saved the real token in config.js; mirror
  // the "connected" state into the app store too so the rest of the UI
  // (connections list, publish picker) treats it the same either way.
  if (live) {
    store.connectAccount(p.id, { handle, displayName: handle });
  }
  const body = document.getElementById("connectBody");
  body.innerHTML = `
    <div class="auth-center">
      <div class="auth-check">✓</div>
      <div class="auth-brand__title">${esc(p.name)} connected${live ? " — Live" : ""}</div>
      <p class="auth-brand__sub">Signed in as ${esc(handle)}. You can now collect and publish${live ? " for real" : ""}.</p>
      <div class="modal__foot" style="margin:20px -22px -22px;">
        <button class="btn btn--primary btn--block" data-close-connect>Done</button>
      </div>
    </div>
  `;
}

/* Normalize the typed identifier into a display handle. */
function formatHandle(platformId, raw) {
  let h = raw.replace(/^@+/, "").trim();
  // For email-style inputs, keep just the local part for a cleaner handle.
  if (h.includes("@") && h.includes(".")) h = h.split("@")[0];
  return usesAtHandle(platformId) ? `@${h}` : raw;
}
