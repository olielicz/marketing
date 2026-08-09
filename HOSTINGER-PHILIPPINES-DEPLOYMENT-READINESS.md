# Hostinger (Philippines) Deployment Readiness — Read This First

You said you're about to buy Hostinger web hosting from the Philippines
storefront and deploy all 6 tools there. Before you buy anything, there's
one critical thing to get right: **which Hostinger product** you buy
determines whether any of this actually works.

## The one thing that will break everything if you get it wrong

Hostinger sells several genuinely different products, and only some of
them can run the backends in this repo:

| Hostinger product | Can run persistent Node.js servers? | Works for this repo? |
|---|---|---|
| **Web Hosting** (Single/Premium/Business shared hosting, the cheap ₱ plans) | ❌ No — shared hosting is for static files, PHP, and WordPress only. There's no way to run a long-lived `node server/index.js` process. | Only the **static marketing pages** (landing/buy/account HTML) — none of the 6 tools' real backends. |
| **Node.js Web Apps Hosting** (a separate product, git-push deploy) | ⚠️ Partial — supports one Node.js app per plan via their build pipeline, but is a managed platform (not raw SSH/root), and historically has had constraints on long-running background processes. | Might work for ONE backend per plan, but you'd need 6+ separate plans (one per tool's backend) and it's unproven for this repo's exact setup. |
| **VPS (KVM plans)** | ✅ Yes — full root access, run anything, including PM2-managed persistent Node processes, nginx reverse proxy, multiple services on one box. | **Yes — this is what you want.** This repo already has a complete runbook for exactly this: `DEPLOY-HOSTINGER-VPS.md`. |

**Bottom line: "Hostinger web hosting" (the classic shared-hosting
product) cannot run any of the 6 tools' backends.** If that's what you're
about to purchase, it will only be able to host the static marketing
pages — none of the actual products (CRM, cart recovery, workflow
executor, etc.) will function, because there's nowhere for their Node.js
servers to run.

## What to buy instead

Buy a **Hostinger VPS** plan (KVM 2 — 2 vCPU / 8GB RAM is the tier this
repo's runbook assumes) instead of a Web Hosting plan. It's a genuinely
different purchase in Hostinger's Philippines storefront — look for "VPS
Hosting," not "Web Hosting." Then follow `DEPLOY-HOSTINGER-VPS.md`
(already in this repo) step by step — it's written for exactly this
scenario: one VPS running all 6 tools' backends plus the static site,
reverse-proxied by subdomain over HTTPS.

Why VPS specifically fits this repo well:
- **Zero database dependency.** Every backend here (`oliops-backend`,
  `olicommerce-backend`, `oliflow-executor`, `admin-auth`, `licensing`,
  `olisalestrack-sync`) stores data in plain JSON files, not MySQL/Postgres
  — so you don't need Hostinger's database product at all, and you're not
  limited by their MySQL-only database support.
- **Low resource needs.** These are small, zero-npm-dependency Node
  services (see each backend's README) — a 2 vCPU/8GB VPS comfortably
  runs all 6 plus nginx plus PM2.
- **Full control.** You get root SSH access, so PM2 (process manager),
  nginx (reverse proxy + TLS), and Node itself are all under your control
  — no platform-imposed process-lifetime limits.

## If budget is the concern

If you were choosing Web Hosting specifically to save money, note that
Hostinger's cheapest VPS plans are often priced close to their Business
shared-hosting tier (sometimes even cheaper on promo pricing) — it's
usually not a large cost jump, and it's the only option that actually
works for this repo's 6 real backends. Compare current PHP pricing on
`hostinger.com/ph` directly, since promo pricing changes.

## What ships fine on cheap static hosting (if you want a hybrid approach)

If you want to launch cheaply now and add backends later, that's a valid
staged approach:
1. Put the **static marketing site** (landing pages, `/buy/` checkout
   pages, `/account/`, `/login/`) on Hostinger's cheapest Web Hosting
   plan, or even keep it on GitHub Pages (free, already configured — see
   `.github/workflows/deploy-pages.yml`) — either works for pure HTML/CSS/
   client-side JS.
2. Bring up the 6 backends on a VPS later, or from day one on a second,
   separate VPS purchase, and point the frontend's "Connect Backend" /
   backend-URL settings at that VPS's subdomains.
3. Until step 2 is done, every tool's app (`/app/`, `/dashboard/`) will
   show its own honest "not connected" state rather than fail silently —
   this repo's frontends were built defensively for exactly this
   (self-hosted, bring-your-own-backend) scenario.

## Per-tool backend inventory (what needs the VPS)

| Tool | Backend directory | Needs a running Node process? |
|---|---|---|
| OliOps | `oliops-backend/` | ✅ Yes |
| OliCommerce | `olicommerce-backend/` | ✅ Yes |
| OliFlow | `oliflow-executor/` | ✅ Yes |
| OliExplore | `oliexplore-trends/` (Trend Radar only — the core "collect/rewrite/publish" feature has no backend at all yet, see the Tier 2 note in this repo's audit) | ✅ Yes, for Trend Radar only |
| Oli-Locator | none in this repo — its real app is claimed to live in a separate `lead-gen` repo, not checked out here | N/A here — see the sellability warning below |
| OliSalesTrack | `olisalestrack-sync/` | ✅ Yes |
| Cross-cutting | `admin-auth/`, `licensing/` | ✅ Yes (shared by multiple tools) |

That's up to **7 separate Node processes** to keep running (6 tool
backends + admin-auth, some tools share admin-auth/licensing) — all
covered by the existing `DEPLOY-HOSTINGER-VPS.md` runbook's PM2 setup.

## Two sellability blockers to resolve before launch (unrelated to hosting)

While auditing the repo for this deployment check, two issues were found
that would remain broken on ANY hosting choice — flagging them here since
"ready for deployment" should mean these are resolved too, not just that
the hosting works:

1. **OliExplore's core paid feature doesn't exist yet.** The buy page
   sells Creator/Team/Agency tiers for a "collect your posts → AI-rewrite
   them → publish to 6 platforms" workflow. There is no OAuth, no post
   collection, no AI rewrite code, and no app UI for this anywhere in the
   repo — only the unrelated secondary "Trend Radar" feature is real.
   Recommend excluding OliExplore from the initial launch, or building
   this core loop first.
2. **Oli-Locator's billing may not be connected to its real app.** Per
   this repo's own `PRE-LAUNCH-CHECKLIST.txt`, Oli-Locator's actual
   product lives in a separate `lead-gen` repository (not present here),
   and that document states subscription billing was not wired up there
   as of its last update — "subscribing" reportedly just creates a free
   demo account. If that's still true, the buy page is collecting real
   payment for access that isn't actually gated. Verify this directly in
   the `lead-gen` repo before accepting payments for Oli-Locator.

See the accompanying marketing-copy fixes made across `oliops/`,
`olicommerce/`, and `olisalestrack/` in this same change for a list of
smaller, already-corrected claims (payroll, AI shopping assistant,
correlation analysis, etc.) that didn't match their real backends.
