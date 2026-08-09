# OliExplore Live Proxy

A single Cloudflare Worker that lets OliExplore's static front end talk to
real Facebook, Instagram, X, TikTok, and Threads APIs — without ever
exposing a client secret in browser code.

Full step-by-step registration instructions for each platform live in
[`../LIVE_SETUP.md`](../LIVE_SETUP.md). This file only covers deploying
the worker itself.

## Why a proxy is required

Browser JavaScript is fully visible to anyone who opens devtools. OAuth's
authorization-code exchange needs a **client secret**, and a secret that
can be read from the page is not a secret. This worker is the one piece
of infrastructure that:

- Holds each platform's client secret as an encrypted environment
  variable (never in git, never sent to the browser).
- Exchanges an authorization code for a real access token on the app's
  behalf.
- Forwards authenticated collect/publish requests to each platform's
  real API.

Everything else — the UI, the OAuth redirect handling, storing your
resulting access token — happens entirely in the browser and is already
built into the app.

## Deploy (free tier, ~5 minutes)

Requires a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
and Node.js installed locally.

```bash
cd server
npx wrangler login          # opens a browser to authorize the CLI once
npx wrangler deploy         # publishes worker.js using wrangler.toml
```

Wrangler prints your worker's URL, e.g.:

```
https://oliexplore-proxy.<your-subdomain>.workers.dev
```

That's the **proxy URL** you paste into OliExplore's "Live API Setup"
panel (gear icon in the sidebar).

## Configure secrets

Only set secrets for the platforms you're actually enabling — you don't
need all four to start.

```bash
npx wrangler secret put META_CLIENT_SECRET      # Facebook + Instagram
npx wrangler secret put X_CLIENT_SECRET         # X (Twitter)
npx wrangler secret put TIKTOK_CLIENT_SECRET    # TikTok
npx wrangler secret put THREADS_CLIENT_SECRET   # Threads
```

Each prompt pastes in the secret from that platform's developer
dashboard (see LIVE_SETUP.md for exactly where to find it).

## Lock down CORS

By default `wrangler.toml` sets `ALLOWED_ORIGIN = "*"`, which lets any
website call your worker — fine for a first test, but you should restrict
it once things work:

1. Edit `wrangler.toml`, set `ALLOWED_ORIGIN` to your GitHub Pages origin,
   e.g. `https://olielicz.github.io` (no trailing slash or path).
2. Redeploy: `npx wrangler deploy`.

## Local testing

```bash
npx wrangler dev
```

Runs the worker on `http://localhost:8787`. Point OliExplore's proxy URL
at that address while testing locally (you'll also need to add
`http://localhost:8787` as an allowed redirect URI in each platform's app
settings if you test the full OAuth loop locally).

## Extending this worker

This file is intentionally a reference implementation, not a production
backend:

- It stores nothing server-side — every access token flows straight back
  to the browser and is kept in that browser's `localStorage`. Anyone
  using OliExplore on a shared computer should disconnect accounts (or
  use the "Disconnect all live accounts" button in Settings) when done.
- It doesn't handle token refresh automatically. When a token expires,
  OliExplore will show "session expired" and prompt you to reconnect.
- Instagram and TikTok publishing require media (image/video) URLs —
  they don't support pure text posts. The `publish` handlers in
  `worker.js` are stubbed to fail gracefully with a clear reason until
  you wire in real media hosting.
