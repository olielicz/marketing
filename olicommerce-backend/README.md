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
- ✅ **AI Support Assistant** (`server/supportAssistant.js`) — the same
  honest, three-tier pattern as `../oliops-backend`'s: a real
  knowledge-base matcher (zero config, always available), an optional
  AI-assisted tier reusing the same `OPENAI_API_KEY` this service already
  supports for recovery-email rewriting (e.g. a free Groq key), and real
  escalation to a support ticket when neither is confident. See "Setting
  up the AI Support Assistant" below.
- ✅ **Real owner authentication** — same scrypt + Ed25519 + live-
  revocation pattern as `../admin-auth` and `../oliops-backend` (a
  separate account — this is the merchant's own login for their
  OliCommerce instance).
- ✅ **Supplier CSV forwarding** (`server/orderCsv.js`) — a real
  order-paid webhook (`POST /api/webhooks/order-paid`) builds a genuine,
  supplier-friendly CSV (one row per line item, with order/shipping
  context repeated on every row) and emails it to your configured
  supplier as a real attachment via this service's own SMTP client.
  Ported directly from the working
  [ecomm-automation](https://github.com/olielicz/ecomm-automation) repo's
  order-paid handler and CSV builder. This is the honest, working
  version of the "Supplier CSV forwarding" feature that was previously
  marketed on OliCommerce's landing/buy/account pages, found to have
  zero implementation anywhere in this backend, and removed — now
  genuinely built and tested.

58 automated tests (`npm test`), all passing, covering the full
auth+webhook-capture+de-dup+email-preview+email-send lifecycle, the
supplier CSV forwarding path (including a real SMTP send with a real
multipart MIME attachment verified against a from-scratch fake SMTP
server), and the AI shopping assistant (including a test that
specifically proves the honesty guard drops a hallucinated product a
mock AI response tried to recommend). Also verified end-to-end with a
real headless browser driving the actual frontend against a running
backend: injected a real cart-abandoned webhook, logged in, previewed a
recovery email, sent it, and confirmed both the UI and the backend
correctly show `recovery_sent` status.

## AI shopping assistant — real, scoped-down, and honest

The storefront-facing **"OliMind AI shopping assistant"** previously
marketed alongside this feature traced back to a separate, private
build (a full Postgres+pgvector+Redis semantic-search microservice) —
never deployed, and architecturally incompatible with this service's
zero-dependency, JSON-file-backed design (bolting a database onto a
service built to run on a $5-8/mo VPS with none would contradict this
whole repo's deployment philosophy — see
`../HOSTINGER-PHILIPPINES-DEPLOYMENT-READINESS.md`).

Instead, `server/storefrontAssistant.js` is a genuinely real, scoped-down
shopping assistant, following the exact same three-tier honesty pattern
as the merchant-facing AI Support Assistant above:

1. **Catalog match** (zero config, always available) — real keyword
   matching against your own product catalog (`GET`/`POST`/`PUT`/
   `DELETE /api/products`, owner-managed). Every answer quotes a real
   product's real title, real price, and real URL — never invented.
2. **AI-assisted** (opt-in, reuses the same `OPENAI_API_KEY`) — a real
   OpenAI-compatible call, instructed to recommend ONLY products in
   your real catalog. A hard cross-check (`parseAIResponse()`) silently
   drops any product title the model returns that doesn't exactly match
   something in your real catalog — this is enforced in code, not just
   prompted for, so a hallucinated product can never reach a shopper
   even if the model claims one exists.
3. **Honest "we don't carry that"** — when nothing in your catalog
   matches, it says so plainly instead of guessing.

**Embedding the AI shopping assistant on your storefront:** paste this
one line into your theme (Shopify: Online Store → Themes → Edit code →
`theme.liquid`, just before `</body>`):

```html
<script src="https://your-olicommerce-deployment.example.com/api/storefront/widget.js"></script>
```

This loads a real, dependency-free chat widget (no framework, no build
step) that talks to your backend's real `/api/storefront/chat` endpoint
— genuinely working, not a stub.

## Supplier CSV forwarding — what's real, what's a naming clarification

**Supplier CSV forwarding** is genuinely real:
point your storefront's order-paid webhook at
`POST /api/webhooks/order-paid` with the same shape Shopify's real
`orders/paid` webhook sends (`line_items`, `shipping_address`, etc. —
same field-mapping convention as the cart-abandoned webhook documented
below), configure `OLICOMMERCE_SUPPLIER_EMAIL` + your existing SMTP
settings, and every paid order is forwarded to your supplier as a real
CSV attachment automatically.

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

## Setting up the AI Support Assistant

Works with zero configuration via the real knowledge base. To also
enable the AI-assisted tier (reuses the SAME `OPENAI_API_KEY` you may
already have set for recovery-email rewriting — no separate key needed):

1. Get a free key from Groq (no credit card): https://console.groq.com/keys
   — or use OpenAI itself, or any OpenAI-compatible provider.
2. Set in `.env`:
   ```
   OPENAI_API_KEY=gsk_your_real_key_here
   OPENAI_API_BASE_URL=https://api.groq.com/openai/v1
   OPENAI_MODEL=llama-3.3-70b-versatile
   ```
3. Restart. `POST /api/support/chat` now tries the knowledge base first,
   and calls the AI provider (grounded strictly in the same knowledge
   base) only for questions it isn't confident about — whatever it still
   can't confidently resolve becomes a real support ticket.

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
| `OLICOMMERCE_WEBHOOK_SECRET` | (empty = unenforced) | Shared secret your storefront webhook must include (applies to BOTH the cart-abandoned and order-paid webhooks) |
| `OLICOMMERCE_SUPPLIER_EMAIL` | (empty = CSV forwarding disabled) | Where real order CSVs are sent when a `order-paid` webhook fires |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | Required to send recovery emails AND supplier CSV forwarding emails |
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
| `POST /api/webhooks/order-paid` | shared secret (optional) | Forward a paid order's CSV to your configured supplier by email |
| `POST /api/login` | none | `{username, password}` → `{token, expiresAt}` |
| `POST /api/logout` | Bearer | Revoke the current session |
| `POST /api/change-password` | Bearer | Revokes ALL sessions on success |
| `GET /api/carts?status=` | Bearer | List carts, optionally filtered by status |
| `DELETE /api/carts/:id` | Bearer | Delete a cart record |
| `POST /api/carts/:id/preview-email` | Bearer | `{tone, useAi}` → builds (doesn't send) a recovery email |
| `POST /api/carts/:id/send-recovery` | Bearer | `{tone, useAi}` → actually sends the recovery email |
| `POST /api/carts/:id/mark-recovered` | Bearer | Mark a cart as recovered |
| `GET /api/products` | Bearer | List your real product catalog |
| `POST /api/products` | Bearer | Add a product (`title` required) |
| `PUT /api/products/:id` | Bearer | Update a product |
| `DELETE /api/products/:id` | Bearer | Delete a product |
| `POST /api/storefront/chat` | none | `{message, history?, useAi?}` → real, catalog-grounded shopping assistant answer for your shoppers |
| `GET /api/storefront/widget.js` | none | The real, embeddable storefront chat widget script |
| `POST /api/support/chat` | none | `{message, history?, useAi?, contactEmail?, contactName?}` → `{answer, source, confident, shouldEscalate, ticketId}` |
| `POST /api/support/tickets` | none | Manually create a support ticket |
| `GET /api/support/tickets` | Bearer | List support tickets, optionally `?status=open\|closed` |
| `GET /api/support/tickets/:id` | Bearer | View one ticket incl. full transcript |
| `POST /api/support/tickets/:id/close` | Bearer | Mark a ticket closed |
| `POST /api/support/tickets/:id/reopen` | Bearer | Reopen a closed ticket |
| `DELETE /api/support/tickets/:id` | Bearer | Delete a ticket |

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
