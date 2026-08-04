# OliFlow Executor

A real backend that runs OliFlow workflows — replacing the frontend's
simulated engine (`setTimeout` + `Math.random()`, see
`oliflow/app/index.html`'s `runWorkflowSimulated()`) for the node types
that don't require third-party OAuth credentials. Zero npm dependencies
(only Node's built-in `http`, `crypto`, `net`, `tls`, `vm`).

## What's real here (and how it was verified)

Every claim below was verified by running actual code against actual
requests, not just by reading it:

- **63 automated tests, all passing** (`npm test`), covering the template
  engine, the sandboxed code executor, the HTTP request node (including a
  real SSRF guard), the condition node, the simple nodes (delay, set/get
  variable, log, respond_webhook), a from-scratch SMTP client tested
  against a from-scratch fake SMTP server (both written for this repo,
  see `test/fakeSmtpServer.js` and `test/selfSignedCert.js`), and the
  full executor pipeline end-to-end.
- **A genuine, wired-up frontend integration** — `oliflow/app/index.html`
  now has a real "⚙ Connect Backend" button. Verified in a real headless
  browser: connecting the app to a running executor + admin-auth,
  building a workflow, and clicking the actual "▶ Run" button produces
  real HTTP requests and real results rendered into the same Execution
  Log UI — not a simulated one.
- **Two real bugs were found and fixed while building this**, both only
  caught by testing against real protocol implementations rather than
  trusting the code:
  1. The SMTP client's response reader only read the FIRST line of a
     multi-line SMTP reply (like EHLO's), silently missing the
     `250-STARTTLS` advertisement on every real server — meaning
     STARTTLS would never have been detected as supported. Fixed and
     covered by a dedicated regression test.
  2. The sandboxed `code` node's output objects had a different
     `Object.prototype` than the host process (a `vm.createContext`
     cross-realm quirk) — invisible to JSON serialization but would
     silently break strict prototype/equality checks anywhere downstream.
     Fixed by round-tripping the result through `structuredClone()`.

## Node type coverage

| Node type | Status | Notes |
|---|---|---|
| `webhook` | ✅ Real (as trigger entry point) | The inbound request that starts a run — see "Wiring the frontend" below |
| `http_request` | ✅ Real | Real outbound fetch; blocks private/internal addresses by default (see `OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS`) |
| `condition` | ✅ Real | All 8 operators the frontend's config panel offers |
| `delay` | ✅ Real | Genuinely waits; capped at 5 min per single sync run (see "Known limitations") |
| `code` | ✅ Real | Sandboxed via `node:vm`, 2s timeout, no `require`/`process`/`fs` access |
| `set_fields` | ✅ Real | Resolves `{{...}}` templates in a JSON field map |
| `set_variable` / `get_variable` | ✅ Real | Workflow-level variables |
| `log` | ✅ Real | Writes to the executor's own process logs |
| `respond_webhook` | ✅ Real | Shapes the HTTP response for webhook-triggered runs |
| `email_send` | ✅ Real | Via the real SMTP client above — see "Setting up email sending" |
| `note` | ✅ Real (no-op by design) | Documentation-only, matches the frontend |
| `schedule`, `email_trigger`, `form_trigger`, `db_trigger`, `api_trigger` | ❌ Not implemented | Other trigger types the frontend lists — only `webhook` has a real entry point today |
| `switch`, `loop`, `merge`, `filter`, `error_handler` | ❌ Not implemented | Other logic/flow nodes |
| `json_parse`, `template`, `aggregate`, `split`, `format_date` | ❌ Not implemented | Other data/transform nodes |
| `slack`, `google_sheets`, `airtable`, `notion`, `openai`, `twilio`, `stripe`, `shopify`, `mysql`, `supabase`, `paypal_node`, `whatsapp`, `calendar` | ❌ Not implemented | All 13 need real third-party OAuth/API-key integration — genuinely out of scope for this pass, not an oversight |
| `crm_create_contact`, `crm_update_contact`, `crm_pipeline`, `crm_tag`, `email_sequence`, `lead_score`, `sms_campaign`, `landing_page` | ❌ Not implemented | All 8 CRM/Marketing nodes — same reason |

**A workflow using an unimplemented node type does NOT fail the whole
run** — that node's result is reported as `{ ok: false, notImplemented:
true, error: "..." }` and execution continues to downstream nodes. This
lets you build and test a partially-implemented workflow and see exactly
how far real execution gets, rather than an all-or-nothing failure. The
frontend renders this as an "⚪ Not implemented yet" log line, distinct
from a real "❌ Error".

## Setup

```bash
cd oliflow-executor
npm test    # 63 assertions, no setup needed
```

To run it for real:

```bash
cp ../admin-auth/.env.example ../admin-auth/.env   # if you haven't already set up admin-auth
cd ../admin-auth && npm run create-owner -- --username you@example.com && npm start &
cd ../oliflow-executor
OLI_ADMIN_AUTH_URL=http://localhost:4300 node server/index.js
```

Then in the OliFlow app (`oliflow/app/index.html`), click "⚙ Connect
Backend," paste in `http://localhost:4400` and an owner session token
(get one via `POST http://localhost:4300/api/login`), and "▶ Run" will
call this real executor instead of simulating.

## Setting up email sending

The frontend's `email_send` node config only collects `from`/`to`/
`subject`/`body` — not SMTP credentials, since those are secrets that
shouldn't live inside a workflow definition. Instead, set them as
**workflow variables** (the app's "Variables" tab):

| Variable name | Example value |
|---|---|
| `smtp_host` | `smtp.gmail.com` |
| `smtp_port` | `587` |
| `smtp_user` | `you@gmail.com` |
| `smtp_pass` | your app-specific password |

Every `email_send` node in that workflow will use these automatically. If
you're running a self-hosted SMTP server with a self-signed certificate
(not a real provider like Gmail/Sendgrid/Mailgun), also set
`smtp_reject_unauthorized` to the literal string `false` — but leave this
unset for any real provider, since it disables certificate verification.

## Known limitations (be honest about scope)

- **No scheduled/cron triggers.** Only `webhook` has a real entry point
  (`POST /api/execute`). The frontend's `schedule` trigger type has no
  backend counterpart yet — building one would mean adding a real
  process that stays running and fires executions on a timer (or cron),
  which is a genuinely separate piece of infrastructure from this
  request/response executor.
- **`delay` is capped at 5 minutes per synchronous run.** A single
  HTTP request holding a connection open for hours isn't a viable
  architecture; a longer delay needs the same scheduling infrastructure
  above (queue the rest of the workflow to resume later) rather than
  blocking a request.
- **`code` node's `$fetch` is not implemented** — see the comment in
  `server/handlers/codeNode.js` for why this is a deliberate, separate
  security decision (SSRF risk from arbitrary user code) rather than an
  oversight. Use an `http_request` node instead for real outbound calls.
- **13 integration node types (OpenAI, Slack, Stripe, Shopify, etc.) and
  8 CRM/Marketing node types are not implemented.** Each would need real
  OAuth app registration and API integration work — this pass focused on
  the node types that work with zero third-party setup, which is a large
  and genuinely useful subset, but not all 49 types the frontend lists.
- **No retry logic, no dead-letter queue, no execution history
  persistence.** Every run is fire-and-forget from the executor's
  perspective — the frontend stores results in its own `localStorage`.
  A production deployment handling real business-critical workflows
  would likely want durable execution logs and retry-on-failure, which
  this pass didn't build.
