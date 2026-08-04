# Oli Integration Server

A working, dependency-free Node.js server that bridges all 6 Oli tools
(OliOps, OliCommerce, OliFlow, OliExplore, Oli-Locator, OliSalesTrack) to
Zapier, Make.com, n8n, and GoHighLevel.

This replaces the earlier `integration-layer-*.js` reference files, which
described the right architecture but were never wired into a runnable
process, had a mocked OAuth implementation, and never connected inbound
actions to outbound event delivery. This folder is the actual, tested
implementation. See `../MIGRATION-NOTES.md` for the specifics of what
changed and why.

## What's genuinely done

- ✅ Inbound webhook bridge for all 6 tools (`POST /api/webhooks/v1/:toolKey/:action`)
- ✅ Outbound webhook delivery with HMAC signing, retries, dead-letter queue
- ✅ Inbound actions **actually trigger** outbound events (verified in `test/smoke-test.js`)
- ✅ OAuth2 module that makes **real** HTTP calls to provider token endpoints (verified in `test/oauth-flow-test.js`) - previously mocked
- ✅ GoHighLevel bi-directional sync (contact/opportunity <-> lead/sale), pointed at GHL's real current API host
- ✅ File-based persistence so data survives restarts (previously all in-memory)
- ✅ A real Zapier Platform CLI app skeleton (`zapier-app/`) that loads and composes correctly
- ✅ A real n8n community node (`n8n-node/`) that type-checks against n8n's actual interfaces
- ✅ 25 automated assertions across two test files, all passing, run with plain `node` (no test framework needed)

## What is NOT done (be honest with yourself and customers about this)

- ❌ Not deployed anywhere yet. This runs locally; you still have to put it on a server.
- ❌ Zapier app has not been pushed to Zapier (needs your Zapier account + `npm install` on a machine with registry access - this sandbox has neither).
- ❌ n8n node has not been published to npm (same reason).
- ❌ OAuth only works once you register real apps with Zapier/Make/GHL and put their client ID/secret in `.env`. No code can substitute for that.
- ❌ Only 7 of the 25+ webhook-bridge actions from the original plan are implemented as real handlers in `lib/webhook-bridge.js`. The rest follow the exact same pattern - see "Adding more actions" below.
- ❌ File-based storage (`lib/store.js`) is fine for getting started and for a single-instance deploy (one VM/container), but will NOT work correctly if you run multiple instances behind a load balancer, or on a platform with an ephemeral/read-only filesystem (e.g. Vercel serverless functions reset their filesystem between invocations). See "Choosing where to deploy" below.

## Minimal path to running this yourself

```bash
cd integration-server
cp .env.example .env      # fill in OLI_API_SECRET at minimum
node server.js            # or: npm start
curl http://localhost:3000/health
```

Issue yourself a token and call an action:

```bash
curl -X POST http://localhost:3000/api/tokens -d '{"userId":"you"}' -H 'Content-Type: application/json'
# -> {"token": "xxxxx.yyyyy"}

curl -X POST http://localhost:3000/api/webhooks/v1/oliops/create_contact \
  -H "Authorization: Bearer xxxxx.yyyyy" -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test"}'
```

Run the automated tests:

```bash
node test/smoke-test.js       # 19 assertions - full inbound/outbound/GHL flow
node test/oauth-flow-test.js  # 6 assertions - proves OAuth makes real HTTP calls
```

## Choosing where to deploy (pick one)

**Recommended for getting started: a small always-on VM or container**
(Railway, Render, Fly.io, a $5 DigitalOcean droplet, an EC2 t3.micro). Any
of these keep a persistent filesystem, so `lib/store.js` works as-is.
Deploy is just: copy this folder, set `.env`, run `node server.js` (ideally
under `pm2` or a systemd unit so it restarts on crash).

**If you want serverless (Vercel/Lambda):** you must first swap
`lib/store.js`'s file-backed implementation for a real datastore (e.g.
Vercel KV, DynamoDB, Postgres). The public interface (`get/set/update`) in
`store.js` is designed as the seam for that swap - the rest of the codebase
doesn't need to change. Do NOT deploy this to Vercel/Lambda unmodified;
webhook subscriptions and OAuth tokens would silently disappear.

## Adding more webhook actions

Each tool handler lives in `lib/webhook-bridge.js` as a class with one
`action_<name>` method per action. To add a new one:

1. Add `async action_my_new_action(payload, context) { ... }` to the right handler class.
2. Call `this.emit('some.event', context.userId, data, context)` if it should notify outbound webhook subscribers.
3. Add a matching `creates/*.js` file in `zapier-app/` (copy an existing one, change the URL/fields) if you want it exposed as a Zapier action.
4. No n8n change needed - `Oli.node.ts` calls any `toolKey/operation` combination generically via its JSON fields input.

## Folder map

```
integration-server/
  server.js                  Entry point - wires everything together, defines all HTTP routes
  lib/
    router.js                 Dependency-free HTTP router (Express was unavailable - see below)
    store.js                  File-based JSON persistence
    tokens.js                 Bearer token issuance/verification for the inbound bridge
    webhook-bridge.js         Inbound handlers for all 6 Oli tools
    outbound-webhooks.js      Outbound event subscription + delivery + retries + dead letter queue
    oauth.js                  Real OAuth2 authorization-code flow for Zapier/Make/n8n/GHL
    ghl-bridge.js             GoHighLevel API client + bi-directional sync
  test/
    smoke-test.js              End-to-end test (starts real server, hits real routes)
    oauth-flow-test.js          Proves OAuth calls a real token endpoint
  zapier-app/                 Zapier Platform CLI app (not yet pushed to Zapier - see NOTES.md there)
  n8n-node/                   n8n community node (not yet published - see NOTES.md there)
  .env.example
```

## Why no Express / no npm packages?

This sandbox's network policy blocks `npm install` from the public
registry (confirmed: `npm install express` returns `403 Forbidden`). Rather
than hand you code that can't even be installed to verify, `lib/router.js`
implements the handful of routing features this project needs using only
Node's built-in `http` module. If your real deployment environment has
normal npm access, swapping in Express is optional and mechanical - the
router's `(req, res, {params, query, body})` handler signature maps
directly onto Express route handlers.
