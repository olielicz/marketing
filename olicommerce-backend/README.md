# OliCommerce Backend

A real, self-hosted abandoned-cart recovery server. Zero npm dependencies
(only Node's built-in `http`, `crypto`, `net`, `tls`), matching the
architectural pattern of every other backend service in this repo.

This replaces the previous state of OliCommerce in this repo: a
marketing site plus `shared/auth.js` (a 100% client-side demo login with
no server behind it). This IS that backend, for the cart-recovery part
of OliCommerce.

## What's real here

- ✅ **Abandoned-cart capture** — a real webhook endpoint
  (`POST /api/webhooks/cart-abandoned`) your storefront platform calls
  when a checkout is abandoned. De-duplicates repeated webhook fires for
  the same cart/checkout by the platform's own id, so retries or
  "checkout updated" events update the existing record instead of
  creating duplicates.
- ✅ **Cart listing and status tracking** — abandoned → recovery_sent →
  recovered, with a real dashboard (`../olicommerce/app/`).
- ✅ **Real recovery emails** — sent via a real, from-scratch SMTP client
  (STARTTLS + AUTH LOGIN, works with Gmail, Sendgrid, Mailgun, SES's SMTP
  interface, or a self-hosted server), not a stub.
- ✅ **Honest, opt-in AI rewrite** — if (and only if) you configure a
  real `OPENAI_API_KEY`, recovery emails can be rewritten by a real
  OpenAI-compatible chat completions call. **Without a configured key,
  every email uses a real, working plain template — never a fabricated
  "AI-written" result.** This mirrors the same principle already applied
  to OliFlow's `openai` node (not implemented, rather than faked — see
  `../oliflow-executor/README.md`'s node coverage table) and OliOps' "AI
  support router" (left out entirely — see `../oliops-backend/README.md`'s
  Scope section). If the AI call fails for any reason (bad key, network
  error, rate limit), the system automatically falls back to the plain
  template and tells you so — it never blocks sending, and never
  pretends a template email came from AI.
- ✅ **Real owner authentication** — same scrypt + Ed25519 + live-
  revocation pattern as `../admin-auth` and `../oliops-backend` (a
  separate account — this is the merchant's own login for their
  OliCommerce instance).

24 automated tests (`npm test`), all passing, covering the full
auth+webhook-capture+de-dup+email-preview+email-send lifecycle,
including a real SMTP send verified against a from-scratch fake SMTP
server, and a real (mocked) OpenAI-compatible endpoint call proving the
AI path genuinely makes an HTTP request and genuinely falls back
honestly when unconfigured or failing. Also verified end-to-end with a
real headless browser driving the actual frontend against a running
backend: injected a real cart-abandoned webhook, logged in, previewed a
recovery email, sent it, and confirmed both the UI and the backend
correctly show `recovery_sent` status.

## Explicit scope — what is NOT included, and why

- **No browse-abandonment tracking** — only cart/checkout abandonment
  (a customer who added items to cart and left checkout) is captured.
  Tracking a customer who merely *viewed* products without adding them
  to cart would need storefront-side tracking-pixel infrastructure this
  pass didn't build.
- **No automated multi-step drip sequences** — this sends ONE recovery
  email per explicit trigger call (from the dashboard, or your own
  scheduled job hitting `POST /api/carts/:id/send-recovery`). A real
  "send email 1 hour after abandonment, email 2 after 24 hours, email 3
  with a bigger discount after 72 hours" sequence needs a scheduler
  (cron, or a queue) — that's a real, scoped follow-up, not done here.
- **No payment-gateway-specific webhook signature verification** for the
  cart-abandoned endpoint. Unlike `../olisalestrack-sync` (which
  verifies real Stripe/Shopify/PayPal HMAC signatures on payment
  webhooks), this endpoint uses a simpler shared-secret model (see
  "Setup" below) since cart-abandonment webhooks aren't standardized
  across platforms the way payment webhooks are — you're expected to
  configure your storefront's outgoing webhook to include the shared
  secret.

## Setup

```bash
cd olicommerce-backend
npm run create-owner -- --username you@yourstore.com
# prints a strong random password ONCE — save it in a password manager now
```

Configure SMTP (required for sending recovery emails — see
`.env.example`):

```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=you@yourstore.com
export SMTP_PASS=your-app-specific-password
export SMTP_FROM=you@yourstore.com
npm start
```

Then open `../olicommerce/app/index.html`, click "⚙ Configure server
URL," enter `http://localhost:4600`, and sign in.

Run the automated tests:

```bash
npm test   # 24 assertions across the full lifecycle
```

## Connecting your storefront (Shopify, WooCommerce, or custom)

Point your storefront's abandoned-checkout webhook at:

```
POST https://your-olicommerce-deployment.example.com/api/webhooks/cart-abandoned
X-Webhook-Secret: <your OLICOMMERCE_WEBHOOK_SECRET>
Content-Type: application/json

{
  "externalId": "<your platform's own cart/checkout id — REQUIRED, used to de-dupe>",
  "source": "shopify",
  "customerEmail": "customer@example.com",
  "customerName": "Jane Doe",
  "items": [
    { "title": "Blue T-Shirt", "quantity": 2, "priceCents": 2500 }
  ],
  "cartValueCents": 5000,
  "currency": "USD",
  "checkoutUrl": "https://yourstore.com/checkout/abc123"
}
```

- **Shopify**: use the `checkouts/update` webhook topic (Settings →
  Notifications → Webhooks, or the Admin API). Map Shopify's
  `checkout.token` to `externalId`, `checkout.email` to `customerEmail`,
  `checkout.line_items` to `items`, `checkout.abandoned_checkout_url` to
  `checkoutUrl`.
- **WooCommerce**: no built-in "abandoned cart" webhook exists natively
  — you'll need a small plugin/snippet (e.g. hooking `woocommerce_add_to_cart`
  + a scheduled check for stale sessions) to detect abandonment and POST
  here. This is a real gap in WooCommerce itself, not this backend.
- **Custom storefront**: call this endpoint directly whenever you detect
  an abandoned checkout (e.g. a session with items in cart that goes
  inactive for N minutes).

`cartValueCents` is optional — if omitted, it's computed from
`items[].quantity × items[].priceCents`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4600` | Port this server listens on |
| `OLICOMMERCE_DATA_DIR` | `./data` | Where carts/sessions are stored |
| `OLICOMMERCE_STORE_NAME` | `your store` | Used in recovery email copy |
| `OLICOMMERCE_WEBHOOK_SECRET` | (empty = unenforced) | Shared secret your storefront webhook must include |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | Required to send recovery emails |
| `SMTP_REJECT_UNAUTHORIZED` | `true` | Set to `false` ONLY for a self-hosted SMTP server with a self-signed cert |
| `OPENAI_API_KEY` | (empty = AI rewrite unavailable) | Enables the optional AI-rewrite path |
| `OPENAI_API_BASE_URL` | `https://api.openai.com/v1` | Point at an OpenAI-compatible provider if not using OpenAI directly |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used for AI rewrite |
| `OLICOMMERCE_SESSION_TTL_HOURS` | `12` | How long a login session lasts |
| `ALLOWED_ORIGIN` | `*` | CORS origin for the app's browser-side requests |

## API reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Health check |
| `POST /api/webhooks/cart-abandoned` | shared secret (optional) | Capture/update an abandoned cart from your storefront |
| `POST /api/login` | none | `{username, password}` → `{token, expiresAt}` |
| `POST /api/logout` | Bearer | Revoke the current session |
| `POST /api/change-password` | Bearer | Revokes ALL sessions on success |
| `GET /api/carts?status=` | Bearer | List carts, optionally filtered by status |
| `DELETE /api/carts/:id` | Bearer | Delete a cart record |
| `POST /api/carts/:id/preview-email` | Bearer | `{tone, useAi}` → builds (doesn't send) a recovery email |
| `POST /api/carts/:id/send-recovery` | Bearer | `{tone, useAi}` → actually sends the recovery email |
| `POST /api/carts/:id/mark-recovered` | Bearer | Mark a cart as recovered |

## Known limitations

- File-based storage is fine for a small-to-mid-size store's cart
  volume; would need a real database at very high volume.
- No pagination on `GET /api/carts` — fine for a reasonable cart
  backlog, would need adding for a very high-volume store.
- AI rewrite calls OpenAI's chat completions format specifically
  (`{model, messages, temperature}` → `choices[0].message.content`);
  most OpenAI-compatible providers (Together, Groq, local Ollama with an
  OpenAI-compatible shim, etc.) match this shape, but it hasn't been
  tested against every provider — only against a real OpenAI-shaped mock
  server (see `test/recoveryEmail.test.js`).
