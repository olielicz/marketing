/* =====================================================================
   settings.js — "Live API Setup" panel.

   This is where you turn OliExplore from demo mode into a real,
   working publisher for your own accounts, without editing any code:

     1. Deploy the reference proxy in /server (one click on Cloudflare
        Workers, free tier — see LIVE_SETUP.md).
     2. Register a developer app on each platform you want live and
        paste its Client ID / Key here.
     3. Save. The Connections tab automatically switches that platform
        from "Demo login" to "Continue to <Platform> — Live" the next
        time you open it.

   Nothing typed here ever leaves your browser except straight to the
   proxy URL you provide (services/config.js persists it locally).
   ===================================================================== */

import { PLATFORMS } from "../services/platforms.js";
import { supportsLiveOAuth } from "../services/oauth.js";
import {
  getProxyUrl,
  setProxyUrl,
  getClientId,
  setClientId,
  isPlatformConfigured,
  hasLiveToken,
  clearAllTokens,
} from "../services/config.js";
import { esc } from "./util.js";
import { toast } from "./toast.js";

const modal = () => document.getElementById("settingsModal");

export function initSettings() {
  modal().addEventListener("click", (e) => {
    if (e.target.closest("[data-close-settings]")) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal().getAttribute("aria-hidden") === "false") closeSettings();
  });
}

export function openSettings() {
  render();
  modal().setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

export function closeSettings() {
  modal().setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function render() {
  const body = document.getElementById("settingsBody");
  const proxy = getProxyUrl();
  const liveCandidates = PLATFORMS.filter((p) => supportsLiveOAuth(p.id));

  body.innerHTML = `
    <p class="auth-note" style="margin-bottom:16px;">
      Connect OliExplore to your real accounts. Full step-by-step (registering each
      developer app + deploying the free proxy) is in <code>LIVE_SETUP.md</code> in the repo.
      Everything below is stored only in this browser.
    </p>

    <div class="field">
      <label class="field__label" for="proxyUrlInput">Your proxy URL</label>
      <input id="proxyUrlInput" class="input" type="url"
             placeholder="https://your-worker.example.workers.dev"
             value="${esc(proxy)}" />
      <p class="field__hint">
        The base URL of the worker you deployed from <code>/server</code>. Required for every live platform below.
      </p>
    </div>

    <div class="field">
      <span class="field__label">Platform credentials</span>
      <div class="settings-list" id="settingsPlatformList">
        ${groupByClientField(liveCandidates).map(fieldRow).join("")}
      </div>
    </div>

    <div class="modal__foot" style="margin:18px -22px -22px;">
      <button type="button" class="btn btn--soft" id="resetLiveBtn">Disconnect all live accounts</button>
      <button type="button" class="btn btn--primary btn--block" id="saveSettingsBtn">Save settings</button>
    </div>
  `;

  document.getElementById("saveSettingsBtn").addEventListener("click", save);
  document.getElementById("resetLiveBtn").addEventListener("click", () => {
    clearAllTokens();
    toast("Disconnected all live accounts. Proxy URL and Client IDs were kept.", "info");
    render();
  });
}

/* Facebook + Instagram share one Meta app / Client ID, so group
   platforms by their oauth.clientIdField and render one input per
   distinct field instead of one per platform. */
function groupByClientField(platforms) {
  const groups = new Map();
  for (const p of platforms) {
    const key = p.oauth.clientIdField;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.values()];
}

function fieldRow(platforms) {
  const [first] = platforms;
  const fieldId = first.oauth.clientIdField;
  const paramLabel = first.oauth.clientIdParam === "client_key" ? "Client Key" : "Client ID";
  const names = platforms.map((p) => p.name).join(" + ");
  const glyphs = platforms.map((p) => esc(p.glyph)).join(" ");

  const statuses = platforms.map((p) => {
    const live = hasLiveToken(p.id);
    return `<span class="settings-row__chip ${live ? "is-live" : ""}">${esc(p.name)}: ${live ? "● Live" : "Not connected"}</span>`;
  });

  return `
    <div class="settings-row">
      <div class="settings-row__head">
        <span class="settings-row__icon">${glyphs}</span>
        <span class="settings-row__name">${esc(names)}</span>
      </div>
      <div class="settings-row__chips">${statuses.join("")}</div>
      <label class="field__label" for="clientId-${fieldId}" style="margin-top:8px;">${esc(paramLabel)}</label>
      <input id="clientId-${fieldId}" class="input" data-client-field="${esc(fieldId)}"
             placeholder="Paste your ${esc(names)} ${esc(paramLabel)}"
             value="${esc(getClientId(fieldId))}" />
    </div>`;
}

function save() {
  const proxyUrl = document.getElementById("proxyUrlInput").value.trim();
  setProxyUrl(proxyUrl);

  document.querySelectorAll("[data-client-field]").forEach((input) => {
    setClientId(input.dataset.clientField, input.value.trim());
  });

  toast("Live API settings saved ✓", "success");
  render();
}
