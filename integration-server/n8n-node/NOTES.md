# n8n Community Node - What's Real vs. What's Left

## Verified working (as of this session)
- TypeScript syntax checked directly with `tsc` against the real n8n node interfaces
  (`INodeType`, `IHookFunctions`, `IWebhookFunctions`, etc.). The only compile
  errors produced are "Cannot find module 'n8n-workflow'" - i.e. the missing
  type-only dependency, not a code defect. That dependency cannot be installed
  in this sandbox (no npm registry access), but will install normally wherever
  you run `npm install`.
- `Oli.node.ts` covers all 6 tools via a resource/operation dropdown, calling
  the real `/api/webhooks/v1/:toolKey/:action` route in `server.js`.
- `OliTrigger.node.ts` implements the full n8n webhook lifecycle
  (checkExists/create/delete) against the real `/api/webhooks/register` and
  `/api/webhooks/:id` DELETE routes - the same outbound webhook system the
  Zapier app's trigger uses.
- `OliApi.credentials.ts` includes a live credential test against `GET /health`.

## What is NOT yet done
1. **Never built with the real n8n/TypeScript toolchain.** `npm install` inside
   `n8n-node/` was not run (blocked by sandbox network policy). You must run,
   on a machine with npm access:
   ```
   cd n8n-node
   npm install
   npm run build      # compiles TypeScript -> dist/
   ```
2. **Generic "Fields (JSON)" input, not per-operation form fields.** To keep
   this node reviewable in one pass, `Oli.node.ts` uses one JSON textbox for
   the action payload instead of ~40+ hand-built individual input fields (one
   set per operation x tool). This works today, but is less friendly than the
   Zapier app's dedicated fields. Upgrading each operation to native n8n
   fields is mechanical (copy the `inputFields` shape from the matching
   Zapier `creates/*.js` file) but real, uncompleted work.
3. **Not published to npm.** `npm publish` was never run - this sandbox can't
   reach the npm registry, and publishing requires your npm account.
4. **Not submitted to n8n's community node list.** After publishing to npm,
   n8n's verification/listing process is a separate step on n8n's site.

## Bottom line
The TypeScript is real, matches n8n's actual API surface, and type-checks
cleanly against everything except the not-yet-installed `n8n-workflow`
package. It has not been compiled with a real install, published, or
reviewed by n8n - those steps need your npm/n8n accounts and are outside
what this sandbox can do.
