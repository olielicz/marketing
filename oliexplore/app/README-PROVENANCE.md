# Where this app came from

This is the real, working OliExplore app — vendored directly from the
[olielicz/oliexplore](https://github.com/olielicz/oliexplore) repository
(the actual product repo), not written fresh for this marketing site.

**Why it's here:** a repo-wide audit of `../index.html`'s marketing
claims found that OliExplore's landing page described a real,
functioning collect → recycle → publish product, but the `marketing`
repo had no `app/` directory for it at all — unlike every other
self-hosted Oli tool (`../../oliflow/app/`, `../../olicommerce/app/`,
etc.). The actual, working app existed the whole time, just in a
separate repository that was never connected to this one. This copy
fixes that: the landing page's claims are now backed by real, running
code, reachable at `./` from `../index.html`'s "🚀 Open App" link.

## What's real here (ported as-is, unmodified except for this file)

- **Content Library** — collected posts with platform badges, engagement
  stats, keyword search.
- **Recycle Engine** (`js/engine/recycle.js`) — a real, deterministic
  rule-based text transformer: 5 tones (Catchy, Quirky, Punchy, Friendly,
  Professional), each with its own hook/emoji/hashtag injection rules.
  **Honesty note:** this is NOT an LLM/GPT call — it's genuine,
  hand-written transformation logic, not AI-generated text. The landing
  page describes this accurately (it never claims "GPT-powered"), and
  this note exists so nobody assumes otherwise from the "AI-style"
  framing elsewhere in this product line.
- **Publish to All** — a real per-platform publish flow with progress
  tracking, toggleable per platform.
- **Demo mode** (default, zero setup) — every feature above works fully
  offline against seeded sample data, exactly as the landing page
  describes.
- **Live mode** (opt-in, requires YOUR OWN developer app credentials per
  platform) — real OAuth 2.0 + PKCE flows for Facebook, Instagram, X,
  TikTok, and Threads, via the optional Cloudflare Worker proxy in
  `server/`. See `LIVE_SETUP.md` for the exact, per-platform steps —
  registering a developer app on each platform requires YOUR identity/
  account there; this can't be done on your behalf.

## What is genuinely out of scope, honestly

- No server-side persistence — everything is `localStorage`-based, by
  design (see the upstream repo's README for the architecture rationale:
  keeping the app a zero-build, zero-server static site by default).
- Live publishing/collection requires real per-platform developer app
  setup (`LIVE_SETUP.md`) — this is a one-time, ~15-20-minute task per
  platform that only you can do, since it requires your own accounts.
- X (Twitter) posting requires a paid X API tier as of 2026 (X's own
  pricing, not a limitation of this app) — see `LIVE_SETUP.md`.
- TikTok's unaudited-app restriction means posts are private-only until
  TikTok approves your app for public posting (their review process,
  not this app's limitation) — see `LIVE_SETUP.md`.

## Keeping this in sync with the upstream repo

This is a vendored copy, not a git submodule — if the upstream
[olielicz/oliexplore](https://github.com/olielicz/oliexplore) repo gets
real bug fixes or new features, they need to be manually re-copied here
to reach this marketing site's deployment. Consider this a deliberate
tradeoff for keeping this repo's GitHub Pages deployment simple (a
single `git push` to `main` deploys everything, including this app, with
no submodule-init step) — see `../../DEPLOY-HOSTINGER-VPS.md` and
`../../.github/workflows/deploy-pages.yml`.
