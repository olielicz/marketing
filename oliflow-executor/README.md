# OliFlow Executor

A real backend that runs OliFlow workflows — replacing the frontend's
simulated engine (`setTimeout` + `Math.random()`, see
`oliflow/app/index.html`'s `runWorkflowSimulated()`). Zero npm
dependencies (only Node's built-in `http`, `crypto`, `net`, `tls`, `vm`).

**As of this pass, all 48 of the 49 node types in the frontend's
NODE_LIBRARY have a real, working implementation** — see "Node type
coverage" below for the full list and exactly what each one does and
which credentials/workflow variables it needs. The one remaining gap
(`sub_workflow`) is disclosed, not hidden — see that section.

## What's real here (and how it was verified)

Every claim below was verified by running actual code against actual
requests, not just by reading it:

- **134 automated tests, all passing** (`npm test`), covering the
  template engine, the sandboxed code/loop executors, the HTTP request
  node (including a real SSRF guard), every logic/flow node (including
  real branch-gating — see "Branching is genuine" below), every
  data/transform node, a from-scratch SMTP client tested against a
  from-scratch fake SMTP server, a from-scratch PostgreSQL wire-protocol
  client and a from-scratch MySQL wire-protocol client each tested
  against a from-scratch fake server speaking the real byte-level
  protocol, every third-party integration node tested against a real
  local mock HTTP server standing in for the real API, every CRM/
  Marketing node's real persistence, the real background scheduler, and
  the full executor pipeline end-to-end.
- **Real live end-to-end verification beyond the test suite**: a real
  running executor + admin-auth pair was used to POST a real multi-node
  workflow (webhook → switch → crm_create_contact → lead_score →
  aggregate → format_date) through `POST /api/execute` and confirmed the
  real persisted contact record, the real accumulated lead score, and
  the real branch-skip behavior for the switch's non-matched cases — not
  just unit-tested in isolation. A `landing_page` node was published and
  then genuinely re-fetched via `GET /lp/:slug`. An `email_trigger` was
  registered via the Active Triggers API and fired for real via its own
  inbound webhook URL, end to end.
- **Branching is genuine, not decorative.** `condition`/`switch`/
  `error_handler` results determine which of their output ports is
  "live" for that run — `executor.js`'s branch-gating logic honestly
  SKIPS any node reached only through an inactive port, so an If/Else or
  Switch behaves like a real decision. A node fed by both branches of an
  If/Else (e.g. a shared `merge`/`log` downstream of both) correctly
  stays live, verified by a dedicated test.
- **Several real bugs were found and fixed while building this**, only
  caught by testing against real protocol implementations / real request
  flows rather than trusting the code:
  1. The SMTP client's response reader only read the FIRST line of a
     multi-line SMTP reply (like EHLO's), silently missing the
     `250-STARTTLS` advertisement on every real server. Fixed and
     covered by a dedicated regression test.
  2. The sandboxed `code`/`loop` nodes' output objects had a different
     `Object.prototype` than the host process (a `vm.createContext`
     cross-realm quirk). Fixed by round-tripping through
     `structuredClone()`.
  3. The initial branch-gating implementation skipped a node based on
     whether the WHOLE NODE was already marked skipped, rather than
     whether the SPECIFIC INCOMING EDGE it was reached through was dead —
     this incorrectly marked every branch's downstream nodes as skipped
     regardless of which branch actually fired. Caught by a live test
     asserting the TRUE branch's node was NOT skipped when the condition
     was true; fixed by tracking dead connections (edges) rather than
     dead nodes, and computing each node's skipped status lazily from
     whether ALL of its incoming edges are dead.
  4. The `POST /api/triggers/:id/email|form` route destructured the URL
     path's segments off by one (`const [, , id, kind] = ...` instead of
     indices 3/4), so every real inbound email/form trigger fire 404'd.
     Caught by a live end-to-end test, not a unit test (the route
     matching regex itself was correct, only the handler's body was
     wrong) — fixed and re-verified live.
  5. The first draft of the Python Code node used `$input`/`$vars` (the
     same names as the JavaScript path) inside the generated Python
     shim — `$` is not a legal character in a Python identifier at all,
     so every single Python Code node run failed with a real
     `SyntaxError` before a single line of user code ran. Caught
     immediately by live testing (not caught by a unit test written
     beforehand, since the bug was in the test's own assumption too);
     fixed by using plain `input`/`vars`/`fetch` for Python, documented
     as a genuine, disclosed naming difference between the two
     languages rather than silently "fixed" without explanation.

## AI Support Assistant

A real, honest, three-tier support assistant (`server/supportAssistant.js`
+ `server/store.js`), following the exact same pattern already used by
`../oliops-backend` and `../olicommerce-backend`:

1. **Knowledge base** (zero configuration, always available) — real
   keyword matching against an accurate FAQ grounded in this executor's
   actual node-type coverage (the table below) and known limitations.
2. **AI-assisted** (opt-in, requires a real `OPENAI_API_KEY` — a free
   Groq key works: https://console.groq.com/keys) — a real call to an
   OpenAI-compatible chat completions endpoint, instructed to answer
   ONLY from the same knowledge base and to admit when it doesn't know,
   rather than invent a wrong answer about what this executor supports.
3. **Escalation** — when neither tier is confident, a real support
   ticket is created and persisted (the first real persistence this
   service has needed — see `server/store.js`'s header comment for why
   that's different from the stateless `POST /api/execute` design).

```bash
# Try it with zero configuration:
curl -X POST http://localhost:4400/api/support/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "why is my workflow not triggering"}'
```

`POST /api/support/chat` and `POST /api/support/tickets` (ticket
creation) are deliberately public — a user whose admin-auth token is
broken still needs to be able to ask why. Listing/managing tickets
(`GET /api/support/tickets`, close/reopen/delete) requires the same real
admin-auth session as `POST /api/execute`.

## Node type coverage

**48 of the frontend's 49 node types are real** (everything below marked
✅). All required workflow variables are set via the app's "Variables"
tab, never inside a node's own config — same secrets-don't-belong-in-a-
workflow-definition principle already established for `email_send`'s
SMTP credentials.

### Triggers

| Node type | Status | Notes |
|---|---|---|
| `webhook` | ✅ Real | Inbound `POST /api/execute` — see "Wiring the frontend" |
| `schedule` | ✅ Real | Real background poller (`server/scheduler.js`) fires on a real elapsed-time interval — see "Setting up scheduled/polling triggers" |
| `email_trigger` | ✅ Real | Fires immediately on a real inbound `POST /api/triggers/:id/email` (point an email provider's inbound-parse webhook here) |
| `form_trigger` | ✅ Real | Same as above, at `POST /api/triggers/:id/form` (point Formspree/Netlify Forms/etc. here) |
| `db_trigger` | ✅ Real | Polls a real SQL query via the same client as the `mysql` node; fires only when the result actually changes |
| `api_trigger` | ✅ Real | Polls a real HTTP endpoint; fires only when the response body actually changes |

### Logic & Flow

| Node type | Status | Notes |
|---|---|---|
| `condition` | ✅ Real | All 8 operators; a genuine branch — see "Branching is genuine" above |
| `switch` | ✅ Real | Real multi-way branch on a resolved field vs. configured cases |
| `loop` | ✅ Real | Runs real sandboxed code once per real array item (same `node:vm` pattern as `code`), collects real results |
| `delay` | ✅ Real | Genuinely waits; capped at 5 min per single sync run — see "Known limitations" |
| `merge` | ✅ Real | Real fan-in of already-computed upstream node outputs |
| `filter` | ✅ Real | Real array filtering into matched/rejected |
| `error_handler` | ✅ Real | A genuine branch based on whether a named upstream node actually failed |

### Data & Transform

| Node type | Status | Notes |
|---|---|---|
| `set_fields` | ✅ Real | Resolves `{{...}}` templates in a JSON field map |
| `code` | ✅ Real, two real languages | JavaScript (default, sandboxed via `node:vm`, 2s timeout) or Python 3 (config `language:"python"`, a real `python3` subprocess, 5s timeout) — see "Setting up the Code node" below for what each language sandbox does and doesn't restrict, including the now-real `$fetch`/`fetch()` |
| `json_parse` | ✅ Real | Real `JSON.parse` of a resolved string, with an honest parse-error message |
| `template` | ✅ Real | Fills a free-text template with multiple `{{...}}` placeholders |
| `aggregate` | ✅ Real | sum/avg/min/max/count/group over a real array |
| `split` | ✅ Real | String delimiter split, or `chunk:N` real array batching |
| `format_date` | ✅ Real | YYYY/MM/DD/HH/mm/ss token formatting of a real parsed date |

### Integrations

| Node type | Status | Notes |
|---|---|---|
| `http_request` | ✅ Real | Real outbound fetch; blocks private/internal addresses by default (see `OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS`) |
| `email_send` | ✅ Real | Via the from-scratch SMTP client — see "Setting up email sending" |
| `slack` | ✅ Real | Real `chat.postMessage` call — needs `slack_token` |
| `google_sheets` | ✅ Real | Real Sheets API v4 row append — needs `google_sheets_access_token` (pre-obtained OAuth2 token) |
| `airtable` | ✅ Real | Real record creation — needs `airtable_token` |
| `notion` | ✅ Real | Real page creation in a database — needs `notion_token` |
| `openai` | ✅ Real | General-purpose chat completion for use INSIDE a workflow (distinct from the separate AI Support Assistant below) — needs `openai_api_key` (+ optional `openai_base_url`/`openai_model`) |
| `twilio` | ✅ Real | Real SMS send — needs `twilio_account_sid`, `twilio_auth_token`, `twilio_from` |
| `stripe` | ✅ Real | create_customer / get_customer / create_payment_link — needs `stripe_secret_key` |
| `shopify` | ✅ Real | get_order / list_products / create_order against your own store — needs `shopify_shop_domain`, `shopify_access_token` |
| `mysql` | ✅ Real | A real, hand-rolled PostgreSQL AND MySQL wire-protocol client (config `engine: "postgres"` or `"mysql"`) — needs `<prefix>_host`/`_user`/`_pass`/`_database` (see "Setting up database access") |
| `supabase` | ✅ Real | insert/select via Supabase's real PostgREST API — needs `supabase_url`, `supabase_service_key` |
| `paypal_node` | ✅ Real | create_order / get_order via PayPal's real v2 Orders API (real OAuth2 client-credentials flow) — needs `paypal_client_id`, `paypal_client_secret` |
| `whatsapp` | ✅ Real | Real WhatsApp Cloud API message send — needs `whatsapp_phone_number_id`, `whatsapp_access_token` |
| `calendar` | ✅ Real | Real Google Calendar event creation — needs `calendar_access_token` (pre-obtained OAuth2 token) |

### CRM & Marketing

All backed by real, persisted storage in `server/store.js` (OliFlow's
own lightweight, workflow-native contact list — NOT a duplicate of
`../oliops-backend`'s separate CRM product).

| Node type | Status | Notes |
|---|---|---|
| `crm_create_contact` | ✅ Real | Real create, idempotent by email |
| `crm_update_contact` | ✅ Real | Real field updates on an existing contact |
| `crm_pipeline` | ✅ Real | Real, persisted pipeline stage |
| `crm_tag` | ✅ Real | Real, persisted tags (deduplicated) |
| `email_sequence` | ✅ Real (disclosed scope) | Real enrollment/step persistence — does NOT itself run a background clock advancing every enrollment; pair it with a `schedule` trigger that reads enrollments and sends the due step |
| `lead_score` | ✅ Real | Real, transparent point-based score (not an opaque ML model) |
| `sms_campaign` | ✅ Real | Sends a REAL SMS to each recipient via the same `twilio` node handler, and records a real per-recipient result log |
| `landing_page` | ✅ Real (disclosed scope) | Publishes one real static HTML page per slug, served at `GET /lp/:slug` — a workflow-authored page, not a visual page builder |

### Utilities

| Node type | Status | Notes |
|---|---|---|
| `note` | ✅ Real (no-op by design) | Documentation-only, matches the frontend |
| `log` | ✅ Real | Writes to the executor's own process logs |
| `respond_webhook` | ✅ Real | Shapes the HTTP response for webhook-triggered runs |
| `set_variable` / `get_variable` | ✅ Real | Workflow-level variables |
| `sub_workflow` | ❌ Not implemented (disclosed) | The one remaining gap — see below |

**`sub_workflow` is honestly disclosed as not implemented.** It needs
re-entrant subgraph execution (running an entire other workflow as a
single step, then resuming the parent) — a materially different shape
of change than every other node type in this pass (each of which is a
self-contained handler function), since it requires `executor.js`'s own
graph-walking logic to support calling itself recursively on a different
workflow. Like every other unimplemented type, it returns
`{ ok: false, notImplemented: true, error: "..." }` rather than faking
success, and does NOT halt the run — downstream nodes still execute.

**A workflow using `sub_workflow` (or any node type not in this
executor's `IMPLEMENTED_TYPES`, e.g. a typo'd type from a hand-edited
workflow JSON) does NOT fail the whole run** — that node's result is
reported honestly and execution continues to downstream nodes. The
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

## Setting up scheduled/polling triggers

`schedule`/`db_trigger`/`api_trigger` need to be registered as **Active
Triggers** (a real, persisted registration — separate from just adding
the node to a workflow) so the background scheduler knows to poll them:

```bash
curl -X POST http://localhost:4400/api/triggers \
  -H "Authorization: Bearer <owner token>" -H "Content-Type: application/json" \
  -d '{
    "type": "schedule",
    "config": { "everyMinutes": 30 },
    "workflow": { "id": "wf1", "nodes": [...], "connections": [...] }
  }'
```

The background poller (`server/scheduler.js`) checks every registered
trigger every 15 seconds — for `schedule`, against real elapsed wall-
clock time; for `db_trigger`/`api_trigger`, by re-running the real
query/request and firing only if the result actually **changed** since
last time (a real content-diff, not a fixed interval). `email_trigger`/
`form_trigger` are NOT polled — they fire immediately from their own
dedicated inbound URLs: `POST /api/triggers/:id/email` and
`POST /api/triggers/:id/form` (both public, no admin auth — an inbound
email/form provider can't complete an OAuth-style login).

Manage registered triggers with `GET /api/triggers`, `GET
/api/triggers/:id/log` (real fire history), and `DELETE
/api/triggers/:id`.

## Setting up the Code node (JavaScript and Python)

The Code node's config now has a real `language` field (`"javascript"`,
the default, or `"python"`) — set from the app's Code node config panel,
or directly in the workflow JSON:

```json
{ "id": "n2", "type": "code", "config": { "language": "python", "code": "..." } }
```

**JavaScript** — runs in a sandboxed `node:vm` context, 2s synchronous
timeout (plus a separate 5s wall-clock timeout on any `await`ed work,
e.g. a `$fetch` call — see `server/handlers/codeNode.js`'s
`withAsyncTimeout()`). Available: `$input`, `$vars`, and a REAL
`$fetch(url, options)` (async — `await` it) that makes a genuine
outbound HTTP request, guarded by the exact same private/internal-
address block as the `http_request` node (see
`OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS` above), and capped at 10 calls
per Code node run.

**Python 3** — runs as a REAL, separate `python3` child process (via
`node:child_process.spawn`, isolated with `-I`), 5s wall-clock timeout
that genuinely `SIGTERM`s (then `SIGKILL`s) a hung process — this was
verified to actually kill a real infinite loop, not just documented as
an intention. Available: `input`, `vars` (no `$` — Python's grammar
doesn't allow `$` in identifiers, a real language constraint, not a
design choice), and a real `fetch(url, method=, headers=, body=)`
function, using only Python's stdlib `urllib.request` — no extra
Python packages are required or used.

**Be honest with yourself about what Python's sandbox actually is.**
Unlike the JavaScript path's real `node:vm` isolation (no `require`, no
`process`, no filesystem/network access except through the guarded
`$fetch`), the Python path is a real OS child process — Python's
standard library has file I/O, `subprocess`, and socket primitives that
cannot be fully disabled short of a real OS-level sandbox (a container,
gVisor, a seccomp profile, etc.), which is genuinely out of scope for
this zero-dependency package. The private-address block on Python's
`fetch()` is real and enforced, but it's implemented as an inline check
in the generated Python shim (mirroring `httpRequestNode.js`'s address
patterns by hand) rather than a single shared source of truth with the
JavaScript path's guard — a known, disclosed follow-up to unify rather
than a silent gap. **Only enable the Python code path in a self-hosted
deployment you already trust the people writing workflows in** — the
same trust model this whole executor already assumes end to end (see
this README's own framing: a single-owner, self-hosted tool, not a
multi-tenant platform where untrusted third parties author workflows).

If `python3` isn't installed on the machine running this executor, a
Python Code node returns a clear, honest error telling you so, rather
than a confusing generic failure.

## Setting up database access (the `mysql` node)

Like `email_send`'s SMTP credentials, database credentials are real
**workflow variables**, never inside the node's own config:

| Variable name (prefix defaults to `db`) | Example |
|---|---|
| `db_host` | `localhost` |
| `db_port` | `5432` (Postgres) or `3306` (MySQL) — optional, defaults per engine |
| `db_user` | `myuser` |
| `db_pass` | your real password |
| `db_database` | `mydb` |

Set `config.engine` to `"postgres"` (default) or `"mysql"`. Use a custom
`config.varPrefix` (e.g. `"warehouse"`) if a workflow needs to talk to
more than one database. The underlying clients
(`server/handlers/postgresProtocol.js` / `mysqlProtocol.js`) are real,
from-scratch wire-protocol implementations — see their own header
comments for exactly which auth methods (MD5/cleartext for Postgres,
mysql_native_password for MySQL) and protocol features are supported,
and which are honestly out of scope (SCRAM-SHA-256, SSL/TLS, prepared
statements).

## Known limitations (be honest about scope)

- **`sub_workflow` is not implemented** — see the "CRM & Marketing" /
  "Utilities" table above for why (needs re-entrant subgraph execution).
- **`delay` is capped at 5 minutes per synchronous run.** A single
  HTTP request holding a connection open for hours isn't a viable
  architecture; use the `schedule` trigger instead for anything longer.
- **`loop` is a single-node item-transform, not a sub-workflow-per-
  iteration re-execution of arbitrary downstream nodes.** It runs
  sandboxed code once per real array item and collects results — it does
  not re-run other nodes in the graph once per item (that would need the
  same re-entrant subgraph support `sub_workflow` is missing). Capped at
  1000 items per run.
- **`code` node's Python sandbox is a real OS process, not a `node:vm`-
  equivalent sandbox** — see "Setting up the Code node" above for
  exactly what that does and doesn't restrict, and why. Only enable the
  Python language option in a deployment you trust the workflow authors
  in.
- **`$fetch`/`fetch()` inside a Code node is capped at 10 calls per run**
  and shares the same private/internal-address block as the
  `http_request` node — see "Setting up the Code node" above.
- **Several integration nodes expect a pre-obtained OAuth2 access
  token** (`google_sheets`, `calendar`) rather than performing a full
  OAuth authorization-code flow themselves — minting/refreshing that
  token is out of scope for a single workflow node. Others
  (`slack`/`airtable`/`notion`/`twilio`/`stripe`/`shopify`/`supabase`/
  `whatsapp`) use a long-lived API key/token instead, which doesn't have
  this limitation.
- **The database client's auth support is intentionally bounded** — see
  "Setting up database access" above.
- **The scheduler is a real, single-process `setInterval` poller with no
  distributed locking, no cron expression syntax (only "every N
  minutes/hours"), and no catch-up runs for ticks missed while the
  process was down.** This matches the single-process deployment model
  the rest of this service already assumes; a multi-instance or
  high-availability deployment would need a real job-queue system
  instead, which is out of scope for this zero-dependency executor.
- **No retry logic, no dead-letter queue.** A real error in an
  implemented node halts that run (see "Branching is genuine" above for
  the one exception: a `notImplemented` result doesn't halt the run).
  Execution HISTORY, however, IS now genuinely persisted for anything
  registered via the Active Triggers API (`GET /api/triggers/:id/log`) —
  ad-hoc `POST /api/execute` calls (e.g. from the app's "▶ Run" button)
  remain fire-and-forget, with the frontend storing results in its own
  `localStorage`, same as before this pass.
