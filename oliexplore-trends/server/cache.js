/**
 * A tiny in-memory cache with a background auto-refresh timer.
 *
 * This is the actual "auto update" mechanism the frontend relies on: the
 * server refreshes each source on its own schedule (default: every 5
 * minutes) regardless of whether anyone is viewing the page, so the very
 * first client request after a refresh already gets fresh data instead of
 * triggering a slow live fetch. Clients then poll GET /api/trends and only
 * see the version number change when something actually refreshed.
 *
 * Kept deliberately dependency-free (no node-cron, no Redis) — same
 * philosophy as licensing/ and olisalestrack-sync/ elsewhere in this repo.
 */

export class RefreshingCache {
  /**
   * @param {object} opts
   * @param {() => Promise<any>} opts.fetcher - returns the fresh value
   * @param {number} opts.intervalMs - how often to auto-refresh
   * @param {any} [opts.initialValue] - value to serve before the first fetch resolves
   */
  constructor({ fetcher, intervalMs, initialValue = [] }) {
    this.fetcher = fetcher;
    this.intervalMs = intervalMs;
    this.value = initialValue;
    this.version = 0;
    this.lastUpdatedAt = null;
    this.lastError = null;
    this.timer = null;
    this.refreshing = false;
  }

  /** Runs one refresh now. Never throws — failures are recorded, not propagated,
   *  so a single bad refresh cycle can't crash the process or the caller. */
  async refreshNow() {
    if (this.refreshing) return; // avoid overlapping refreshes if one is slow
    this.refreshing = true;
    try {
      const fresh = await this.fetcher();
      this.value = fresh;
      this.version += 1;
      this.lastUpdatedAt = new Date().toISOString();
      this.lastError = null;
    } catch (err) {
      // Keep serving the last-good value; just record the error for
      // observability (surfaced via GET /api/trends' "sources" field).
      this.lastError = err.message || String(err);
    } finally {
      this.refreshing = false;
    }
  }

  /** Starts the background auto-refresh timer. Call once at server startup. */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.refreshNow();
    }, this.intervalMs);
    // Node-specific: don't let this timer keep the process alive on its own
    // (useful for tests / graceful shutdown). No-op outside Node.
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snapshot() {
    return {
      value: this.value,
      version: this.version,
      lastUpdatedAt: this.lastUpdatedAt,
      lastError: this.lastError,
    };
  }
}
