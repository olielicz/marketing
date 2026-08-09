/* =====================================================================
   app.js — Bootstrap & event wiring for OliExplore.

   Responsibilities:
     • subscribe to the store and re-render on every change
     • route between views (library / recycled / published / connections)
     • wire global controls: search, sort, nav, collect, publish-all
     • delegate card actions (edit / publish) to the right modules
   ===================================================================== */

import { store } from "./store.js";
import { collectPosts } from "./services/collector.js";
import { publishablePlatforms, platformById } from "./services/platforms.js";
import { getSuggestions, highlightMatch } from "./services/searchIndex.js";
import { esc } from "./ui/util.js";
import {
  renderStats,
  renderChips,
  renderGrid,
  renderConnectionsView,
  captureGridScaffold,
  restoreGridScaffold,
  visiblePosts,
} from "./ui/render.js";
import { initEditor, openEditor } from "./ui/editor.js";
import { initPublish, openPublish } from "./ui/publish.js";
import { initConnect, openConnect } from "./ui/connect.js";
import { initSettings, openSettings } from "./ui/settings.js";
import { clearToken } from "./services/config.js";
import { toast } from "./ui/toast.js";

/* ---------------- Render orchestration ---------------- */

function render() {
  const { ui } = store.state;
  const statsEl = document.getElementById("stats");
  const toolbarEl = document.querySelector(".toolbar");
  const isConnections = ui.view === "connections";

  // Stats + filter toolbar are only relevant for content views.
  if (statsEl) statsEl.style.display = isConnections ? "none" : "";
  if (toolbarEl) toolbarEl.style.display = isConnections ? "none" : "";

  if (isConnections) {
    renderConnectionsView();
    return;
  }

  // Make sure the grid scaffold is present (it may have been replaced
  // by the connections view), then render the data-driven sections.
  restoreGridScaffold();
  renderStats();
  renderChips();
  renderGrid();
}

/* ---------------- Navigation ---------------- */

function setView(view) {
  document.querySelectorAll(".nav__item").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.view === view)
  );
  // Reset platform filter when switching views so counts stay intuitive.
  store.setUI({ view, platformFilter: "all" });
  closeSidebarOnMobile();
}

/* ---------------- Collect ---------------- */

let collecting = false;
async function handleCollect() {
  if (collecting) return;
  const connected = store.connectedPlatformIds();
  if (!connected.length) {
    toast("Connect an account first (Connections tab).", "error");
    return;
  }

  collecting = true;
  const btn = document.getElementById("collectBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>⏳</span> Collecting…`;

  try {
    const fresh = await collectPosts(connected, (id, message) => {
      toast(message, "error", 5000);
    });
    const added = store.addPosts(fresh);
    toast(
      added ? `Collected ${added} new post${added === 1 ? "" : "s"} ⤓` : "No new posts right now.",
      added ? "success" : "info"
    );
  } catch (err) {
    toast("Collection failed. Try again.", "error");
    console.error(err);
  } finally {
    collecting = false;
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

/* ---------------- Publish-all entry points ---------------- */

function handlePublishAll() {
  // Pick the most relevant post to publish: prefer the top recycled one,
  // else the top of the current view.
  const list = visiblePosts();
  const recycled = list.find((p) => p.recycled);
  const target = recycled || list[0];

  if (!target) {
    toast("Nothing to publish yet. Collect or recycle a post first.", "info");
    return;
  }
  if (!recycled) {
    toast("Tip: recycle a post first to make it catchy ✨", "info");
  }
  openPublish(target.id);
}

/* ---------------- Search + live autocomplete ---------------- */

/**
 * Wires the search box: debounced filtering (fast typing stays smooth)
 * plus a live dropdown of matching keywords/hashtags/platforms/authors
 * built from whatever's actually in the library right now. Fully
 * keyboard-navigable (Up/Down/Enter/Escape) and mouse-clickable.
 */
function wireSearch() {
  const search = document.getElementById("searchInput");
  const clear = document.getElementById("searchClear");
  const suggestBox = document.getElementById("searchSuggest");

  search.value = store.state.ui.query;
  clear.hidden = !search.value;

  let searchDebounce = null;
  let items = [];
  let activeIndex = -1;

  const typeIcon = { platform: "⌁", hashtag: "#", author: "@", keyword: "⌕" };

  function closeSuggestions() {
    suggestBox.hidden = true;
    suggestBox.innerHTML = "";
    search.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    items = [];
  }

  function commitQuery(value) {
    clear.hidden = !value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => store.setUI({ query: value }), 150);
  }

  function renderSuggestions(query) {
    items = getSuggestions(query, 8);
    if (!items.length) {
      closeSuggestions();
      return;
    }
    activeIndex = -1;
    suggestBox.innerHTML = items
      .map(
        (item, i) => `
        <button type="button" class="search-suggest__item" role="option" data-index="${i}" id="suggest-${i}">
          <span class="search-suggest__icon search-suggest__icon--${item.type}">${typeIcon[item.type]}</span>
          <span class="search-suggest__label">${highlightMatch(esc(item.label), esc(query))}</span>
          ${item.sub ? `<span class="search-suggest__sub">${esc(item.sub)}</span>` : ""}
        </button>`
      )
      .join("");
    suggestBox.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }

  function pick(index) {
    const item = items[index];
    if (!item) return;
    search.value = item.value;
    commitQuery(item.value);
    // Fire the store update immediately on explicit selection instead
    // of waiting out the debounce, so picking a suggestion feels instant.
    if (searchDebounce) clearTimeout(searchDebounce);
    store.setUI({ query: item.value });
    clear.hidden = false;
    closeSuggestions();
  }

  function setActive(index) {
    const nodes = suggestBox.querySelectorAll(".search-suggest__item");
    nodes.forEach((n) => n.classList.remove("is-active"));
    if (index >= 0 && nodes[index]) {
      nodes[index].classList.add("is-active");
      nodes[index].scrollIntoView({ block: "nearest" });
      search.setAttribute("aria-activedescendant", `suggest-${index}`);
    } else {
      search.removeAttribute("aria-activedescendant");
    }
    activeIndex = index;
  }

  search.addEventListener("input", () => {
    const value = search.value;
    clear.hidden = !value;
    commitQuery(value);
    renderSuggestions(value);
  });

  search.addEventListener("focus", () => {
    if (search.value) renderSuggestions(search.value);
  });

  search.addEventListener("keydown", (e) => {
    if (suggestBox.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        pick(activeIndex);
      } else {
        closeSuggestions();
      }
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  suggestBox.addEventListener("mousedown", (e) => {
    // mousedown (not click) so this fires before the input's blur.
    const btn = e.target.closest(".search-suggest__item");
    if (!btn) return;
    e.preventDefault();
    pick(Number(btn.dataset.index));
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#searchWrap")) closeSuggestions();
  });

  clear.addEventListener("click", () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    search.value = "";
    clear.hidden = true;
    store.setUI({ query: "" });
    closeSuggestions();
    search.focus();
  });
}

/* ---------------- Event wiring ---------------- */

function wireGlobalControls() {
  wireSearch();

  // Sort
  const sort = document.getElementById("sortSelect");
  sort.value = store.state.ui.sort;
  sort.addEventListener("change", () => store.setUI({ sort: sort.value }));

  // Nav
  document.querySelectorAll(".nav__item").forEach((btn) =>
    btn.addEventListener("click", () => setView(btn.dataset.view))
  );

  // Collect + Publish-all
  document.getElementById("collectBtn").addEventListener("click", handleCollect);
  document.getElementById("publishAllBtn").addEventListener("click", handlePublishAll);

  // Connect Accounts shortcut -> Connections page
  document.getElementById("connectAccountsBtn").addEventListener("click", () =>
    setView("connections")
  );

  // Live API Settings
  document.getElementById("settingsBtn").addEventListener("click", () => openSettings());

  // Mobile sidebar
  document.getElementById("menuToggle").addEventListener("click", () =>
    document.getElementById("sidebar").classList.toggle("is-open")
  );
}

/* Delegated clicks inside the main content area (cards, chips, connections). */
function wireDelegation() {
  document.querySelector(".main").addEventListener("click", (e) => {
    // Filter chips
    const chip = e.target.closest("[data-platform]");
    if (chip) {
      store.setUI({ platformFilter: chip.dataset.platform });
      return;
    }

    // Connection: open login flow / disconnect
    const openConn = e.target.closest("[data-connect-open]");
    if (openConn) {
      openConnect(openConn.dataset.connectOpen);
      return;
    }
    const disConn = e.target.closest("[data-disconnect]");
    if (disConn) {
      const id = disConn.dataset.disconnect;
      store.disconnectAccount(id);
      clearToken(id);
      toast(`${platformById(id)?.name || "Account"} disconnected`, "info");
      return;
    }

    // Card actions
    const card = e.target.closest(".card");
    if (!card) return;
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "edit") openEditor(card.dataset.id);
    if (action === "publish") openPublish(card.dataset.id);
  });
}

function closeSidebarOnMobile() {
  document.getElementById("sidebar").classList.remove("is-open");
}

/* ---------------- Init ---------------- */

function init() {
  captureGridScaffold();

  initEditor({ onPublish: (id) => openPublish(id) });
  initPublish();
  initConnect();
  initSettings();

  wireGlobalControls();
  wireDelegation();

  // Re-render whenever state changes.
  store.subscribe(render);

  render();

  // Friendly welcome.
  setTimeout(
    () =>
      toast(
        `Welcome to OliExplore — ${publishablePlatforms().length} platforms ready to publish.`,
        "info",
        4000
      ),
    500
  );
}

document.addEventListener("DOMContentLoaded", init);
