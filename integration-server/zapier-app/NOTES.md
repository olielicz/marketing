# Zapier App - What's Real vs. What's Left

## Verified working (as of this session)
- `index.js` loads and composes without error (checked with `node -e "require('./index.js')"`).
- Structure matches the real `zapier-platform-core` v15 schema (authentication, triggers, creates, beforeRequest/afterResponse middleware).
- 1 instant trigger (`new_event`, REST Hook pattern) wired to the real `/api/webhooks/register` and `/api/webhooks/:id` DELETE endpoints in `server.js`.
- 7 create actions wired to real endpoints in `server.js` (not every action listed in the old `integration-layer-05` doc - see below).

## What is NOT yet done (do not tell customers these exist until done)
1. **Not installed/built with the real Zapier CLI.** This sandbox has no npm registry access, so `zapier-platform-cli` / `zapier-platform-core` were never actually installed here, and `zapier build` / `zapier push` were never run. The code is schema-correct by hand-verification against the documented CLI structure, but it has not been round-tripped through Zapier's own tooling. **Before submitting to Zapier, you must run this on a machine with npm access:**
   ```
   cd zapier-app
   npm install
   zapier login
   zapier register "Oli Tools"
   zapier push
   ```
2. **Only 7 of the ~20+ actions per tool described in the old planning doc exist as real files.** I built one full, real example per major tool (OliOps x2, OliFlow, OliCommerce, OliSalesTrack, OliExplore, Oli-Locator) to prove the pattern end-to-end. Adding the rest is mechanical - copy `creates/oliops-create-contact.js`, change the URL path and `inputFields` to match another action already implemented in `server.js`/`lib/webhook-bridge.js`. Do NOT copy the old markdown descriptions for actions that don't exist in `lib/webhook-bridge.js` yet - add the handler there first.
3. **No app icon, description copy, or screenshots.** Zapier requires these for submission. That's a design/marketing task, not a code task.
4. **No Zapier developer account exists yet** (or if one does, I have no access to confirm). `zapier register` will fail until you're logged in with an account that has app-creation permission.
5. **Custom auth, not OAuth2.** This is a deliberate simplification (see comment in `authentication.js`) so you can ship faster. Upgrading to OAuth2 later is possible without breaking existing users, but is real additional work, not a config flag.

## Bottom line
The code is genuine and internally consistent, and it will call your real, running server correctly. It has **not** been pushed to Zapier or reviewed by Zapier - that step requires your Zapier account and cannot be completed inside this sandbox (no registry/network access, and it requires your credentials).
