/* =====================================================================
   store.js — Central application state + persistence
   A tiny observable store. Subscribers re-render on change.
   ===================================================================== */

import { SEED_POSTS } from "./data/seed.js";
import { PLATFORMS } from "./services/platforms.js";

const STORAGE_KEY = "oliexplore.state.v1";

const defaultState = () => ({
  posts: structuredClone(SEED_POSTS),
  connections: PLATFORMS.reduce((acc, p) => {
    acc[p.id] = {
      connected: p.defaultConnected,
      handle: p.defaultConnected ? p.sampleHandle : null,
      displayName: null,
      connectedAt: p.defaultConnected ? Date.now() : null,
    };
    return acc;
  }, {}),
  ui: {
    view: "library",      // library | recycled | published | connections
    query: "",
    platformFilter: "all",
    sort: "recent",
  },
});

/* Performance: persistence + notification are batched.
   Without this, every keystroke in the search box (or any rapid state
   change) would synchronously JSON.stringify the entire posts array
   and hit localStorage on every single change, and re-render the full
   grid immediately. Batching both into a single microtask/idle window
   keeps typing and interactions smooth even as the library grows. */
const PERSIST_DEBOUNCE_MS = 250;

class Store {
  constructor() {
    this._subs = new Set();
    this.state = this._load();
    this._persistTimer = null;
    this._emitScheduled = false;

    // Make sure the last pending write always lands, even if the user
    // closes the tab mid-debounce.
    window.addEventListener("beforeunload", () => this._flushPersist());
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      // Merge with defaults so new fields are always present.
      const base = defaultState();
      return {
        posts: Array.isArray(parsed.posts) ? parsed.posts : base.posts,
        connections: { ...base.connections, ...(parsed.connections || {}) },
        ui: { ...base.ui, ...(parsed.ui || {}) },
      };
    } catch (err) {
      console.warn("OliExplore: failed to load state, using defaults.", err);
      return defaultState();
    }
  }

  /* Debounced write to localStorage — coalesces bursts of mutations
     (e.g. typing in the search box, or a multi-platform publish run
     updating several fields in quick succession) into a single disk
     write instead of one per change. */
  _persist() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => this._flushPersist(), PERSIST_DEBOUNCE_MS);
  }

  _flushPersist() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn("OliExplore: failed to persist state.", err);
    }
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  /* Coalesce synchronous bursts of mutations into a single render pass
     via microtask batching, so e.g. addPosts() followed immediately by
     another mutation doesn't trigger two full grid re-renders. */
  _emit() {
    this._persist();
    if (this._emitScheduled) return;
    this._emitScheduled = true;
    queueMicrotask(() => {
      this._emitScheduled = false;
      this._subs.forEach((fn) => fn(this.state));
    });
  }

  /* ---------- UI mutations ---------- */
  setUI(patch) {
    this.state.ui = { ...this.state.ui, ...patch };
    this._emit();
  }

  /* ---------- Post queries ---------- */
  getPost(id) {
    return this.state.posts.find((p) => p.id === id);
  }

  /* ---------- Post mutations ---------- */
  addPosts(posts) {
    // Prepend newly collected posts, skip duplicates by id.
    const existing = new Set(this.state.posts.map((p) => p.id));
    const fresh = posts.filter((p) => !existing.has(p.id));
    this.state.posts = [...fresh, ...this.state.posts];
    this._emit();
    return fresh.length;
  }

  updatePost(id, patch) {
    this.state.posts = this.state.posts.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
    );
    this._emit();
  }

  deletePost(id) {
    this.state.posts = this.state.posts.filter((p) => p.id !== id);
    this._emit();
  }

  /* ---------- Connections ---------- */

  /** Mark an account connected after a (simulated) successful login. */
  connectAccount(platformId, account = {}) {
    const c = this.state.connections[platformId];
    if (!c) return;
    this.state.connections[platformId] = {
      connected: true,
      handle: account.handle || c.handle,
      displayName: account.displayName || account.handle || c.handle,
      connectedAt: Date.now(),
    };
    this._emit();
  }

  /** Revoke access / log out of an account. */
  disconnectAccount(platformId) {
    const c = this.state.connections[platformId];
    if (!c) return;
    this.state.connections[platformId] = {
      connected: false,
      handle: null,
      displayName: null,
      connectedAt: null,
    };
    this._emit();
  }

  /** Legacy toggle kept for backward compatibility. */
  toggleConnection(platformId) {
    const c = this.state.connections[platformId];
    if (!c) return;
    if (c.connected) this.disconnectAccount(platformId);
    else this.connectAccount(platformId);
  }

  connectedPlatformIds() {
    return Object.entries(this.state.connections)
      .filter(([, c]) => c.connected)
      .map(([id]) => id);
  }
}

export const store = new Store();
