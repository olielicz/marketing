/* =====================================================================
   render.js — Renders stats, filter chips, and the post grid for the
   active view. Pure read of store state; emits no mutations itself.
   ===================================================================== */

import { store } from "../store.js";
import { PLATFORMS, platformById } from "../services/platforms.js";
import { hasLiveToken, isPlatformConfigured } from "../services/config.js";
import { supportsLiveOAuth } from "../services/oauth.js";
import { esc, fmtNum, timeAgo } from "./util.js";

/* ---------- Selection / filtering ---------- */

function baseSetForView(view, posts) {
  switch (view) {
    case "recycled":  return posts.filter((p) => p.recycled);
    case "published": return posts.filter((p) => p.published);
    default:          return posts; // library
  }
}

export function visiblePosts() {
  const { posts, ui } = store.state;
  let list = baseSetForView(ui.view, posts);

  if (ui.platformFilter !== "all") {
    list = list.filter((p) => p.platform === ui.platformFilter);
  }

  // Strip a leading "#" or "@" so searching "#travel" or "@handle"
  // matches the same way as searching "travel" or "handle" would.
  const q = ui.query.trim().toLowerCase().replace(/^[#@]/, "");
  if (q) {
    list = list.filter((p) => {
      const hay = [
        p.caption,
        p.author,
        p.platform,
        platformById(p.platform)?.name || "",
        ...(p.hashtags || []),
        ...(p.hashtags || []).map((t) => `#${t}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  switch (ui.sort) {
    case "engagement":
      list = [...list].sort((a, b) => engagement(b) - engagement(a));
      break;
    case "recycled":
      list = [...list].sort((a, b) => Number(b.recycled) - Number(a.recycled));
      break;
    default:
      list = [...list].sort((a, b) => (b.updatedAt || b.collectedAt) - (a.updatedAt || a.collectedAt));
  }
  return list;
}

const engagement = (p) => (p.likes || 0) + (p.comments || 0) * 2 + (p.shares || 0) * 3;

/* ---------- Stats ---------- */

export function renderStats() {
  const { posts } = store.state;
  const el = document.getElementById("stats");
  const total = posts.length;
  const recycled = posts.filter((p) => p.recycled).length;
  const published = posts.filter((p) => p.published).length;
  const reach = posts.reduce((s, p) => s + engagement(p), 0);

  const cards = [
    { label: "Collected", value: total, meta: "in library" },
    { label: "Recycled", value: recycled, meta: "ready to repost" },
    { label: "Published", value: published, meta: "live posts" },
    { label: "Est. Reach", value: fmtNum(reach), meta: "weighted score" },
  ];

  el.innerHTML = cards
    .map(
      (c) => `
      <div class="stat">
        <div class="stat__label">${c.label}</div>
        <div class="stat__value">${c.value}</div>
        <div class="stat__meta">${c.meta}</div>
      </div>`
    )
    .join("");
}

/* ---------- Platform filter chips ---------- */

export function renderChips() {
  const { posts, ui } = store.state;
  const el = document.getElementById("platformChips");
  const scoped = baseSetForView(ui.view, posts);

  const counts = scoped.reduce((acc, p) => {
    acc[p.platform] = (acc[p.platform] || 0) + 1;
    return acc;
  }, {});

  const chips = [
    { id: "all", name: "All", count: scoped.length },
    ...PLATFORMS.map((p) => ({ id: p.id, name: p.name, count: counts[p.id] || 0 })),
  ];

  el.innerHTML = chips
    .map(
      (c) => `
      <button class="chip ${ui.platformFilter === c.id ? "is-active" : ""}" data-platform="${c.id}">
        <span class="chip__dot"></span>${esc(c.name)}
        <span class="chip__count">${c.count}</span>
      </button>`
    )
    .join("");
}

/* ---------- Post cards ---------- */

function statusBadges(p) {
  const out = [];
  if (p.recycled) out.push(`<span class="badge badge--recycled"><span class="badge__status-dot"></span>Recycled</span>`);
  if (p.published) out.push(`<span class="badge badge--published"><span class="badge__status-dot"></span>Published</span>`);
  return out.join("");
}

function card(p) {
  const plat = platformById(p.platform);
  const tags = (p.hashtags || []).slice(0, 3).map((t) => `<span class="tag">#${esc(t)}</span>`).join("");
  return `
    <article class="card" data-id="${p.id}">
      <div class="card__media" style="background:${esc(p.mediaTone || "#232427")}">
        <div class="card__media-art">${esc(p.mediaEmoji || "🖼️")}</div>
        <div class="card__badges">
          <span class="badge">${esc(plat?.glyph || "?")} ${esc(plat?.name || p.platform)}</span>
          ${statusBadges(p)}
        </div>
      </div>
      <div class="card__body">
        <div class="card__meta">
          <span class="card__platform">@${esc(p.author)}</span>
          <span class="card__dot"></span>
          <span>${timeAgo(p.collectedAt)}</span>
        </div>
        <p class="card__text">${esc(p.caption)}</p>
        <div class="card__tags">${tags}</div>
      </div>
      <div class="card__stats">
        <span>❤ ${fmtNum(p.likes || 0)}</span>
        <span>💬 ${fmtNum(p.comments || 0)}</span>
        <span>↪ ${fmtNum(p.shares || 0)}</span>
      </div>
      <div class="card__foot">
        <button class="btn btn--soft btn--sm" data-action="edit">↻ Recycle &amp; Edit</button>
        <button class="btn btn--primary btn--sm" data-action="publish">⇪ Publish</button>
      </div>
    </article>`;
}

export function renderGrid() {
  const grid = document.getElementById("postGrid");
  const empty = document.getElementById("emptyState");
  const emptyText = document.getElementById("emptyText");
  const list = visiblePosts();

  if (!list.length) {
    grid.innerHTML = "";
    empty.hidden = false;
    const q = store.state.ui.query.trim();
    emptyText.textContent = q
      ? `Nothing matches “${q}”. Try another keyword.`
      : "No posts here yet. Collect new posts to get started.";
    return;
  }

  empty.hidden = true;
  grid.innerHTML = list.map(card).join("");
}

/* ---------- Connections view (replaces grid area) ---------- */

export function renderConnectionsView() {
  const content = document.querySelector(".content");
  const { connections } = store.state;
  const connectedCount = PLATFORMS.filter((p) => connections[p.id]?.connected).length;

  content.innerHTML = `
    <div class="section-head">
      <h1 class="section-head__title">Connections</h1>
      <p class="section-head__sub">
        Log in to link your social accounts. ${connectedCount} of ${PLATFORMS.length} connected —
        only connected accounts can be collected from or published to.
      </p>
    </div>
    <div class="connections">
      ${PLATFORMS.map((p) => {
        const c = connections[p.id] || {};
        const on = c.connected;
        const live = hasLiveToken(p.id);
        const liveReady = supportsLiveOAuth(p.id) && isPlatformConfigured(p.id);
        const identity = on
          ? `Signed in as ${esc(c.displayName || c.handle || p.sampleHandle)}`
          : "Not linked yet";
        return `
        <div class="conn-card">
          <div class="conn-card__top">
            <div class="conn-card__icon">${esc(p.glyph)}</div>
            <div>
              <div class="conn-card__name">${esc(p.name)} ${live ? '<span class="live-pill">LIVE</span>' : ""}</div>
              <div class="conn-card__handle">${identity}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <span class="conn-card__status ${on ? "is-connected" : "is-disconnected"}">
              <span class="status-dot ${on ? "on" : ""}"></span>${on ? "Connected" : "Not connected"}
            </span>
            ${on
              ? `<button class="btn btn--soft btn--sm" data-disconnect="${p.id}">Disconnect</button>`
              : `<button class="btn btn--primary btn--sm" data-connect-open="${p.id}">Log in &amp; Connect</button>`}
          </div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-faint);">
            ${on && c.connectedAt ? `Linked ${timeAgo(c.connectedAt)} · ` : ""}${p.canCollect ? "Collect + Publish" : "Publish only"} · ${p.charLimit.toLocaleString()} char limit
            ${!on && liveReady ? " · Live login ready" : ""}
          </div>
        </div>`;
      }).join("")}
    </div>`;
}

/* ---------- Restore the default grid scaffold (after connections view) ---------- */

let gridScaffold = null;
export function captureGridScaffold() {
  if (!gridScaffold) gridScaffold = document.querySelector(".content").innerHTML;
}
export function restoreGridScaffold() {
  const content = document.querySelector(".content");
  if (gridScaffold && !document.getElementById("postGrid")) {
    content.innerHTML = gridScaffold;
  }
}
