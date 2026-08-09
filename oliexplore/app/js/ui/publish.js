/* =====================================================================
   publish.js — The "Publish to all platforms" modal.

   Shows the connected, publish-capable platforms as toggles (all ON by
   default — that's the one-click promise), validates per-platform
   character limits, then fires publishToAll() and animates a live
   per-platform progress list.
   ===================================================================== */

import { store } from "../store.js";
import { PLATFORMS, platformById, publishablePlatforms } from "../services/platforms.js";
import { publishToAll, composeText, validateForPlatform } from "../services/publisher.js";
import { esc } from "./util.js";
import { toast } from "./toast.js";

const modal = () => document.getElementById("publishModal");

let target = null;       // post being published (or null = batch hint)
let selected = new Set();

export function initPublish() {
  modal().addEventListener("click", (e) => {
    if (e.target.closest("[data-close-publish]")) closePublish();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal().getAttribute("aria-hidden") === "false") closePublish();
  });
}

export function openPublish(postId) {
  const post = store.getPost(postId);
  if (!post) return;
  target = post;

  // Default selection: every connected, publish-capable platform.
  const connected = new Set(store.connectedPlatformIds());
  selected = new Set(
    publishablePlatforms().filter((p) => connected.has(p.id)).map((p) => p.id)
  );

  renderPicker();
  modal().setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

export function closePublish() {
  modal().setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  target = null;
}

function fullText() {
  return composeText({ caption: target.caption, hashtags: target.hashtags });
}

function renderPicker() {
  const body = document.getElementById("publishBody");
  const connected = new Set(store.connectedPlatformIds());
  const text = fullText();

  const rows = publishablePlatforms()
    .map((p) => {
      const isConnected = connected.has(p.id);
      const valid = validateForPlatform(p.id, text);
      const on = selected.has(p.id) && isConnected;
      const sub = !isConnected
        ? "Not connected"
        : valid.ok
        ? `${text.length.toLocaleString()} / ${p.charLimit.toLocaleString()} chars`
        : valid.reason;
      return `
      <label class="platform-opt ${on ? "is-on" : ""}" data-row="${p.id}">
        <span class="platform-opt__icon">${esc(p.glyph)}</span>
        <span class="platform-opt__txt">
          <span class="platform-opt__name">${esc(p.name)}</span>
          <span class="platform-opt__sub">${esc(sub)}</span>
        </span>
        <span class="switch">
          <input type="checkbox" data-toggle="${p.id}" ${on ? "checked" : ""} ${isConnected && valid.ok ? "" : "disabled"} />
          <span class="switch__track"></span>
        </span>
      </label>`;
    })
    .join("");

  const captionHtml = esc(target.caption).replace(/\n/g, "<br>");
  const tagsHtml = (target.hashtags || [])
    .map((t) => `<span class="post-suggestion__tag">#${esc(t)}</span>`)
    .join("");

  body.innerHTML = `
    <div class="summary">
      <span class="summary__icon">⇪</span>
      <span class="summary__text">
        Publishing your ${target.recycled ? "recycled" : ""} post to every selected platform in one shot.
        Toggle any platform off to skip it.
      </span>
    </div>
    <div class="field__label" style="margin-bottom:8px;">What will be posted</div>
    <div class="post-suggestion" style="margin-bottom:18px;">
      <div class="post-suggestion__head">
        <span class="post-suggestion__author">@${esc(target.author)}</span>
      </div>
      <div class="post-suggestion__body">${captionHtml}</div>
      ${tagsHtml ? `<div class="post-suggestion__tags">${tagsHtml}</div>` : ""}
    </div>
    <div class="platform-picker" id="picker">${rows}</div>
    <div class="modal__foot" style="margin:18px -22px -22px;">
      <button class="btn btn--soft btn--block" data-close-publish>Cancel</button>
      <button class="btn btn--primary btn--block" id="confirmPublish">Publish now</button>
    </div>
  `;

  document.getElementById("picker").addEventListener("change", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (!t) return;
    const id = t.dataset.toggle;
    if (t.checked) selected.add(id);
    else selected.delete(id);
    e.target.closest(".platform-opt").classList.toggle("is-on", t.checked);
  });

  document.getElementById("confirmPublish").addEventListener("click", runPublish);
}

async function runPublish() {
  const ids = [...selected];
  if (!ids.length) {
    toast("Select at least one platform.", "error");
    return;
  }

  const body = document.getElementById("publishBody");
  body.innerHTML = `
    <div class="summary">
      <span class="summary__icon">⇪</span>
      <span class="summary__text">Publishing to ${ids.length} platform${ids.length > 1 ? "s" : ""}…</span>
    </div>
    <div class="progress-list" id="progressList">
      ${ids
        .map(
          (id) => {
            const p = platformById(id);
            return `
          <div class="progress-row" data-prog="${id}">
            <span class="progress-row__icon">${esc(p.glyph)}</span>
            <span class="progress-row__name">${esc(p.name)}</span>
            <span class="progress-row__state"><span class="spinner"></span> queued</span>
          </div>`;
          }
        )
        .join("")}
    </div>
  `;

  const payload = { caption: target.caption, hashtags: target.hashtags };

  const results = await publishToAll(payload, ids, (id, status) => {
    const row = document.querySelector(`[data-prog="${id}"]`);
    if (!row) return;
    const state = row.querySelector(".progress-row__state");
    if (status === "start") state.innerHTML = `<span class="spinner"></span> publishing…`;
    if (status === "done") {
      row.classList.add("is-done");
      state.innerHTML = `✓ published`;
    }
    if (status === "error") state.innerHTML = `✕ failed`;
  });

  const okIds = results.filter((r) => r.ok).map((r) => r.platform);
  const merged = [...new Set([...(target.publishedTo || []), ...okIds])];
  store.updatePost(target.id, { published: okIds.length > 0, publishedTo: merged });

  toast(`Published to ${okIds.length} platform${okIds.length === 1 ? "" : "s"} 🎉`, "success");

  setTimeout(() => {
    const foot = document.createElement("div");
    foot.className = "modal__foot";
    foot.style.margin = "18px -22px -22px";
    foot.innerHTML = `<button class="btn btn--primary btn--block" data-close-publish>Done</button>`;
    body.appendChild(foot);
  }, 400);
}
