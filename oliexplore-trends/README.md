# OliExplore Trend Radar Server

A small, self-hosted aggregator that powers OliExplore's **Trend Radar** page
(`oliexplore/trends/`) — a feed of trending memes/GIFs and trending video,
kept fresh by a real background auto-refresh, not just a "refresh on page
load" trick.

---

## Why these two sources specifically

Two constraints drove the source choice, worth being upfront about:

1. **Reddit's unauthenticated `.json` endpoints were shut down in May 2026**
   (Reddit's own r/modnews announcement, "Protecting communities from
   scrapers and platform abuse"). Any tool still scraping `reddit.com/*.json`
   without OAuth is already broken as of this writing — so this service
   doesn't use it.
2. Sources need to be **official, currently supported, and have a free
   tier** that a solo operator can realistically use without a paid
   enterprise data contract. That rules out Reddit's own commercial Data API
   ($0.24/1,000 calls, $12,000/mo commercial tier) and most "social listening"
   platforms.

That leaves two official APIs with generous free tiers:

| Source | What it covers | Free tier |
|---|---|---|
| **GIPHY Trending API** | Memes/GIFs, editorially curated as trending | 100 calls/hour (beta key) |
| **YouTube Data API v3** (`chart=mostPopular`) | Trending video | ~10,000 quota units/day |

Both require a free API key (see Setup below) — same pattern as this repo's
Stripe/PayPal setup in `../PAYMENTS-SETUP.md`.

---

## How the auto-update actually works

```
Every REFRESH_INTERVAL_MS (default 5 min):
  RefreshingCache.refreshNow() for each source
        │
        ├─► success → replace cached value, bump "version", clear error
        └─► failure → KEEP the last-good cached value, record the error
                       (a single bad fetch never takes the feed down)

GET /api/trends  ← the frontend polls this
        │
        └─► merges both caches' current snapshot, returns { version, updatedAt, items }
             The frontend only needs to compare "version" to know whether
             anything actually changed since its last poll.
```

This is a genuine server-side auto-refresh, not just "the frontend re-fetches
on an interval" — the cache updates in the background even if nobody has the
page open, so the very next visitor already sees fresh data instead of
triggering a slow live API call themselves.

---

## Setup

```bash
cd oliexplore-trends
npm install    # no external dependencies — this just registers the "type": "module" package
cp .env.example .env
```

Fill in `.env`:

1. **`GIPHY_API_KEY`** — [developers.giphy.com](https://developers.giphy.com/) → Create Account → Create App → copy the API key. Beta keys are rate-limited to 100 calls/hour, which comfortably covers a 5-minute auto-refresh (12 calls/hour) with room for manual refreshes.
2. **`YOUTUBE_API_KEY`** — [console.cloud.google.com](https://console.cloud.google.com/) → create/select a project → enable "YouTube Data API v3" → Credentials → Create API key.
3. **`ALLOWED_ORIGIN`** — set to your real deployed domain once live (e.g. `https://olielicz.github.io`), not `*`, to avoid an open CORS policy.

Start it:

```bash
node server/index.js     # listens on PORT (default 4300)
```

Deploy to any free/cheap Node host already recommended elsewhere in this
repo (Render free tier, Railway, Fly.io) — zero npm dependencies, tiny
memory footprint, same approach as `../licensing/` and
`../olisalestrack-sync/`.

---

## API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/trends` | GET | Current merged feed. Query params: `category` (`all`\|`meme`\|`video`), `limit` (max 100, default 40) |
| `/api/trends/refresh` | POST | Force an immediate refresh of both sources right now (used by the frontend's "Refresh now" button) |
| `/api/health` | GET | Health check (no auth) |

`GET /api/trends` response shape:

```json
{
  "updatedAt": "2026-08-03T04:13:51.858Z",
  "version": 2,
  "refreshIntervalMs": 300000,
  "items": [
    {
      "id": "giphy:g1",
      "source": "giphy",
      "type": "meme",
      "title": "Funny cat meme",
      "url": "https://giphy.com/gifs/g1",
      "thumbnailUrl": "https://media.giphy.com/g1/200.gif",
      "creator": "MemeLord",
      "metricLabel": "trending on GIPHY",
      "metricValue": null,
      "publishedAt": "2026-08-01T10:00:00.000Z"
    }
  ],
  "sources": {
    "giphy":   { "configured": true, "updatedAt": "...", "error": null, "count": 20 },
    "youtube": { "configured": true, "updatedAt": "...", "error": null, "count": 15 }
  }
}
```

If a source's API key isn't configured, `sources.<name>.configured` is
`false` and that source simply contributes zero items — the endpoint never
errors out just because one source isn't set up yet.

---

## Testing

```bash
npm test    # node --test — 34 tests covering normalization (with fixtures
            # matching each API's real response shape), the auto-refresh
            # cache (including failure resilience and overlap prevention),
            # and feed merging
```

No live network calls are made in tests — `fetchImpl` is injectable on both
source fetchers specifically so tests can exercise the real fetch/parse
logic against realistic fixtures without hitting the actual APIs.
