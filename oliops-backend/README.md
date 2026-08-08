# OliOps Backend

A real, self-hosted CRM + invoicing server. Zero npm dependencies (only
Node's built-in `http` and `crypto`), matching the architectural pattern
of every other backend service in this repo.

This replaces the previous state of OliOps in this repo: a marketing
site plus `shared/auth.js` (a 100% client-side, `localStorage`-based demo
login with no server behind it, and a non-cryptographic password hash
explicitly marked in that file as "replace with bcrypt when adding a
backend"). This IS that backend, for the CRM + invoicing part of OliOps.

## What's real here

- ✅ **Contacts (CRM)** — create, list, update, delete. Full CRUD, real
  persistence.
- ✅ **Tasks** — create, list, update status (open/done), delete, can be
  linked to a contact.
- ✅ **Invoices** — create with real line-item math (quantity × unit
  price, summed into a real total), sequential invoice numbering that's
  never reused even after deletion, mark paid/unpaid, and a genuine
  printable HTML view (`GET /api/invoices/:id/html`) any browser can
  print-to-PDF natively.
- ✅ **AI Support Assistant** (`server/supportAssistant.js`) — real,
  three-tier, honest support automation:
  1. A deterministic knowledge-base matcher (zero configuration, always
     available) grounded in this product's actual, documented behavior.
  2. An optional AI-assisted tier — if (and only if) you configure a
     real `OPENAI_API_KEY`, questions the knowledge base doesn't confidently
     cover are answered by a real OpenAI-compatible chat completions call,
     instructed to answer only from the same knowledge base and to say so
     honestly when it isn't sure. **Without a configured key, every answer
     comes from the real knowledge base — never a fabricated "AI" result.**
  3. Real escalation — when neither tier is confident, a real support
     ticket is created (`POST /api/support/tickets`, `GET /api/support/tickets`)
     instead of guessing. This is the honest, working version of the
     "AI support router" that was previously marketed but never built —
     see the git history of this README for that prior state, and
     `../olicommerce-backend/server/recoveryEmail.js` for the identical
     honesty pattern this follows (never claim AI was used unless it
     genuinely was, always have a real non-AI fallback).
- ✅ **Real owner authentication** — scrypt password hashing, Ed25519-
  signed sessions checked against a live server-side revocation table
  (logout/password-change take effect immediately), login lockout after
  5 failed attempts. Same security pattern as `../admin-auth`, but this
  is a SEPARATE account system — this is YOUR customer's own login for
  THEIR OliOps instance, not the cross-tool admin-auth service that
  administers your (the seller's) licensing/sales infrastructure.

Automated tests (`npm test`) cover the full auth+contacts+tasks+invoices
lifecycle including edge cases (rejecting an invoice with no line items,
confirming invoice numbers are never reused, confirming a password change
actually revokes every session), plus the AI Support Assistant's
knowledge-base matching, honest AI fallback behavior, and ticket
escalation (see `test/supportAssistant.test.js`). Also verified
end-to-end with a real headless browser driving the actual frontend
(`../oliops/app/`) against a running instance of this backend — not just
unit tests in isolation.

## Setting up the AI Support Assistant

The knowledge-base tier works immediately with **zero configuration** —
it's real keyword matching against an accurate FAQ, not a stub. To also
enable the AI-assisted tier for questions the knowledge base doesn't
confidently cover:

1. Get a free API key from an OpenAI-compatible provider. **Groq** is
   recommended — genuinely free, no credit card required, and fast:
   https://console.groq.com/keys. OpenAI itself, or any other
   OpenAI-compatible provider, also works.
2. Set these in your `.env` (see `.env.example`):
   ```
   OPENAI_API_KEY=gsk_your_real_key_here
   OPENAI_API_BASE_URL=https://api.groq.com/openai/v1
   OPENAI_MODEL=llama-3.3-70b-versatile
   ```
   (For OpenAI directly, use `https://api.openai.com/v1` and a model
   like `gpt-4o-mini` instead.)
3. Restart the server. The assistant now tries the knowledge base first,
   and only calls the AI provider for questions it isn't confident
   about — the AI is instructed to answer strictly from the same
   knowledge base and to admit when it doesn't know, rather than invent
   an answer. Either way, whatever it can't confidently resolve becomes
   a real support ticket.

## Explicit scope — what is NOT included, and why

**Payroll is not implemented.** Building payroll correctly means tax
withholding tables (federal + state, which change every year), employer
tax filings, multi-state compliance, and getting all of that legally
correct for a real business's real employees. That is a serious,
regulated-domain undertaking — not a feature you bolt onto a CRM in one
pass. Shipping a fake or half-correct version of payroll would be
actively harmful to a real customer's business (wrong withholding =
their problem with the IRS, not a bug report). If you want real payroll,
integrate a real payroll provider's API (Gusto, Check, etc.) rather than
building tax-compliance logic from scratch here.

Selling OliOps today should describe it as **CRM + Invoicing + AI
Support**, not payroll — until (if ever) payroll gets built for real via
a real provider integration.

## Setup

```bash
cd oliops-backend
npm run create-owner -- --username you@yourbusiness.com
# prints a strong random password ONCE — save it in a password manager now
npm start
```

Test it immediately:

```bash
curl -X POST http://localhost:4500/api/login -H "Content-Type: application/json" \
  -d '{"username":"you@yourbusiness.com","password":"<the password just printed>"}'
```

Then open `../oliops/app/index.html`, click "⚙ Configure server URL,"
enter `http://localhost:4500`, and sign in.

Run the automated tests:

```bash
npm test   # 12 assertions covering the full lifecycle
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4500` | Port this server listens on |
| `OLIOPS_DATA_DIR` | `./data` | Where contacts/tasks/invoices/sessions are stored |
| `OLIOPS_BUSINESS_NAME` | `Your Business` | Shown on printable invoices |
| `OLIOPS_BUSINESS_EMAIL` | (empty) | Shown on printable invoices |
| `OLIOPS_SESSION_TTL_HOURS` | `12` | How long a login session lasts |
| `OLIOPS_MAX_FAILED_ATTEMPTS` | `5` | Login lockout threshold |
| `OLIOPS_LOCKOUT_WINDOW_MINUTES` | `15` | Login lockout window |
| `ALLOWED_ORIGIN` | `*` | CORS origin for the app's browser-side requests |

## API reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Health check |
| `POST /api/login` | none | `{username, password}` → `{token, expiresAt}` |
| `POST /api/logout` | Bearer | Revoke the current session |
| `POST /api/change-password` | Bearer | Revokes ALL sessions on success |
| `GET /api/contacts` | Bearer | List all contacts |
| `POST /api/contacts` | Bearer | Create a contact (`name` required) |
| `PUT /api/contacts/:id` | Bearer | Update a contact |
| `DELETE /api/contacts/:id` | Bearer | Delete a contact |
| `GET /api/tasks` | Bearer | List all tasks |
| `POST /api/tasks` | Bearer | Create a task (`title` required) |
| `PUT /api/tasks/:id` | Bearer | Update a task |
| `DELETE /api/tasks/:id` | Bearer | Delete a task |
| `GET /api/invoices` | Bearer | List all invoices |
| `POST /api/invoices` | Bearer | Create an invoice (`items[]` required) |
| `POST /api/invoices/:id/mark-paid` | Bearer | Mark an invoice paid |
| `GET /api/invoices/:id/html` | Bearer | Printable HTML view |
| `DELETE /api/invoices/:id` | Bearer | Delete an invoice |
| `POST /api/support/chat` | none | `{message, history?, useAi?, contactEmail?, contactName?}` → `{answer, source, confident, shouldEscalate, ticketId}` |
| `POST /api/support/tickets` | none | Manually create a support ticket (e.g. an explicit "talk to a human" button) |
| `GET /api/support/tickets` | Bearer | List support tickets, optionally `?status=open\|closed` |
| `GET /api/support/tickets/:id` | Bearer | View one ticket incl. full transcript |
| `POST /api/support/tickets/:id/close` | Bearer | Mark a ticket closed |
| `POST /api/support/tickets/:id/reopen` | Bearer | Reopen a closed ticket |
| `DELETE /api/support/tickets/:id` | Bearer | Delete a ticket |

## Known limitations

- File-based storage (`server/store.js`) is fine for a single business's
  CRM/invoicing volume, but would need a real database if data volume
  ever gets large — the module boundary for that swap is documented in
  the file itself.
- No email sending for invoices — the printable HTML view is meant to be
  printed/saved as a PDF and sent manually, or attached via your own
  email client. Adding real automated invoice emails would reuse the
  same SMTP client approach as `../oliflow-executor/server/smtpClient.js`
  (a real, tested, zero-dependency SMTP client) — that's a reasonable,
  scoped follow-up, not done in this pass.
- No multi-user support — this is a single-owner system by design,
  matching the rest of this repo's self-hosted, single-tenant model.
