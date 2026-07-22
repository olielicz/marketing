# Oli License Server

A small, self-hosted licensing service shared by the 4 downloadable/self-hosted Oli tools:

| Product | Code |
|---|---|
| OliOps Suite | `OPS` |
| OliCommerce Stack | `COM` |
| OliFlow Automation Engine | `FLW` |
| OliConnect | `CNT` |

**Oli-Locator is excluded on purpose.** It's a hosted, login-based SaaS (no download, no install) — there's
nothing on a customer's machine to "activate." Device limits for Oli-Locator should instead be enforced as
a simple **concurrent session cap** in its own login system (e.g. max 5 active sessions per account), which
is a different, much simpler mechanism than what's built here. This service only issues and enforces serial
codes for the 4 products that customers actually install/self-host.

---

## What this actually does (and does not do)

This is a **soft-enforcement** licensing system, not copy-protection DRM. Be honest with yourself and your
customers about that:

- ✅ It stops **casual, accidental over-sharing** — e.g. a customer who bought one seat installing it on 20
  machines without realizing there's a limit, or forwarding their serial code to a friend who then activates
  it too.
- ✅ It gives you a clean, professional "enter your serial code" activation flow, and lets a customer move
  their license to a new machine themselves (deactivate old device, activate new one) without emailing you.
- ❌ It does **not** stop a technically sophisticated user from reading the source (all 4 products are
  self-hosted and, per their existing LICENSE files, MIT-licensed) and patching out the license check
  entirely. Nothing short of proprietary compiled binaries with server-side execution can fully prevent
  that, and none of these products work that way.

This tradeoff is completely normal for indie/self-hosted software — most small dev-tool and LTD products on
AppSumo, Gumroad, etc. use exactly this level of enforcement. It's about setting a fair, visible line, not
building an unbreakable lock.

---

## How the 5-device limit works

1. You generate a **serial code** per customer/purchase using the CLI (`scripts/generate-license.js`),
   specifying the product and `maxDevices` (defaults to 5).
2. Each product's client (a copy of `client/oli-license-client.js`) asks the customer for their serial code
   on first run, then calls `POST /api/activate` with the serial code and a **device ID** — a random ID
   generated once and stored locally on that install (not real hardware fingerprinting; see "Why not
   fingerprint hardware?" below).
3. The server checks how many *distinct* device IDs are already registered against that serial code:
   - Under the limit (default 5) → registers the new device, returns a **signed activation token**.
   - Already registered → returns a fresh token for that same device (re-activation is always allowed).
   - At the limit and this is a genuinely new device → activation is refused with a clear "device limit
     reached" message and a link to the deactivate-a-device flow.
4. The activation token is signed with the server's private key (Ed25519, using Node's built-in `crypto`
   module — no external dependencies) and cached locally by the client. The client can **verify the token
   itself offline** using the server's public key, so the product keeps working for up to
   `OLI_LICENSE_OFFLINE_GRACE_DAYS` (default 14 days) without needing to reach the server every time it
   starts. After that grace window, it needs to successfully re-check in once.
5. To move a license to a new machine, the customer (or you, as support) calls
   `POST /api/deactivate` for the old device ID, freeing up a slot.

### Why not fingerprint hardware?

True hardware fingerprinting (CPU serials, disk IDs, MAC addresses, etc.) is unreliable across OS
reinstalls/VMs/containers, and raises consent/privacy questions for very little real security benefit —
a persisted random ID is just as effective for counting "how many installs" and is far more honest and
GDPR-friendly. That's what `client/oli-license-client.js` does: it generates one random ID on first run and
reuses it forever after (stored in `data/device-id` for Node apps, or browser `localStorage`/
`chrome.storage.local` for the browser-extension case).

---

## Deployment

```bash
cd licensing
npm install    # no external dependencies — this just registers the "type": "module" package
cp .env.example .env
node scripts/generate-keys.js          # generates the Ed25519 signing keypair (do this ONCE, ever)
node server/index.js                   # starts the activation server (default port 4100)
```

Deploy `server/index.js` to any of the free/cheap Node hosts already recommended elsewhere in this repo
(Render free tier, Vercel serverless, etc.) — it has zero npm dependencies and a tiny memory footprint, so
it comfortably fits a free tier.

**⚠️ Keep `data/keys/private.pem` secret.** It signs every activation token. If it leaks, an attacker could
forge valid-looking (but not device-limit-checked, since they don't have server access) tokens for offline
grace-period use only — still not full DRM bypass, but rotate the keypair and re-issue codes if this happens.

**⚠️ Set `ADMIN_TOKEN` in `.env` to a long random value.** It's required to generate/view licenses through
the HTTP API — without it, anyone could mint their own valid serial codes.

---

## Generating a serial code for a customer

```bash
node scripts/generate-license.js --product oliops --email customer@example.com --max-devices 5
# → OLI-OPS-7F3K-9QZX-M
```

Product codes: `oliops`, `olicommerce`, `oliflow`, `oliconnect`. Omit `--max-devices` to use the default (5).

Pass `--product all` to generate a single serial code that activates **any** of the 4 products — useful if
you ever want to sell an "everything bundle."

---

## Wiring a serial code check into a product

Copy `client/oli-license-client.js` into the product's repo (e.g. `oliops/lib/oliLicenseClient.js`) and call
it once at startup:

```js
import { activateLicense, verifyCachedToken } from "./oliLicenseClient.js";

const cached = await verifyCachedToken({ product: "OPS" });
if (!cached) {
  const code = await promptForSerialCode(); // your own UI for this
  await activateLicense({ product: "OPS", licenseKey: code, licenseServerUrl: "https://license.yourdomain.com" });
}
```

See the inline comments in `client/oli-license-client.js` for the full API (`activateLicense`,
`verifyCachedToken`, `deactivateThisDevice`) and how the offline grace period is computed.

---

## API reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/licenses` | `ADMIN_TOKEN` | Create a new serial code |
| `GET /api/licenses/:key` | `ADMIN_TOKEN` | View a license's devices/status |
| `POST /api/activate` | none (public) | Activate this device against a serial code |
| `POST /api/deactivate` | none (public) | Free up a device slot |
| `GET /api/public-key` | none (public) | Fetch the Ed25519 public key (PEM) for offline token verification |
| `GET /api/health` | none (public) | Health check |

Full request/response shapes are documented as comments directly above each route in `server/index.js`.
