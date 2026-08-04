# Oli Admin Auth Server

A small, self-hosted authentication service for the **single owner account**
that should have admin access across all 6 Oli tools. Zero npm dependencies
(only Node's built-in `http` and `crypto`), same architectural pattern as
this repo's other backend services (`licensing/`, `olisalestrack-sync/`,
`oliexplore-trends/`).

This exists to replace `shared/auth.js` for anything admin-related.
`shared/auth.js` is 100% client-side (`localStorage`/`sessionStorage`) with
**no server backing it at all** — anyone with browser devtools can forge a
"logged in" state by writing directly to `sessionStorage`, or read/edit the
plaintext-adjacent (non-bcrypt) password hash stored in `localStorage`. That
is fine for the low-stakes case it was built for (a demo per-tool customer
login with no real backend yet), but it is **not acceptable for an admin
account that controls license issuance, revenue data, and deploy controls**
— an admin login needs a real server that can say no.

---

## Why exactly one account?

You asked for an admin login "that I am the only one who can access." This
service is deliberately built around that constraint rather than a general
multi-user system:

- **One owner record, ever.** `scripts/create-owner.js` refuses to run a
  second time once an account exists (see `store.js`'s `createOwner()`).
  There is no "add another admin" endpoint anywhere in `server/index.js` —
  not because it was forgotten, but because you explicitly asked for
  single-owner access, and every additional account is another way in. If
  you ever want a second admin, that's a deliberate, separate decision —
  don't route around this by re-running `create-owner.js` after deleting
  `data/admin.json`, since that also wipes all session/login history.
- **Real password hashing.** `scrypt` (Node's built-in, memory-hard KDF)
  with a random salt per account — see `server/crypto.js`. This replaces
  the non-cryptographic string hash in `shared/auth.js`.
- **Revocable sessions, not just "offline-verifiable forever" tokens.**
  Every issued token is checked against a live session table on every
  `GET /api/verify` call (see "Security model" below) — logout, password
  change, or you manually revoking a session (`POST /api/sessions/:id/revoke`)
  takes effect immediately, not just whenever a cached token happens to
  expire.
- **Login lockout.** 5 failed attempts (configurable) from the same IP
  within 15 minutes (configurable) blocks further attempts, including
  attempts with the *correct* password — protects the one account that
  matters most against password-guessing.

---

## Setup

```bash
cd admin-auth
cp .env.example .env
npm run create-owner -- --username you@example.com
# prints a strong random password ONCE — save it in a password manager now
npm start
```

Test it immediately:

```bash
curl -X POST http://localhost:4300/api/login -H "Content-Type: application/json" \
  -d '{"username":"you@example.com","password":"<the password just printed>"}'
# -> { "ok": true, "token": "...", "expiresAt": "..." }
```

Run the automated tests:

```bash
npm test   # 14 assertions across crypto.js and store.js
```

---

## Security model

**Every request that should require "you, the owner" must check TWO things,
not just a signature:**

1. The token's Ed25519 signature is valid (proves it was issued by this
   server and hasn't been tampered with).
2. The token's `sessionId` is still active in the session table — i.e. it
   hasn't been logged out, revoked, or superseded by a password change.

`GET /api/verify` does both checks in one call and is what every other Oli
backend service in this repo should call before trusting a request as "the
owner." **Do not** implement your own signature-only check against the
public key from `GET /api/public-key` unless you deliberately accept that a
revoked session could still pass for up to however long you cache that
result — the whole point of the revocation table is that logout/password-
change/manual-revoke take effect *immediately*, and a signature-only check
throws that away.

### How another service should integrate

```js
// In e.g. olisalestrack-dashboard/server or licensing/server:
async function requireOwner(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const res = await fetch(`${process.env.OLI_ADMIN_AUTH_URL}/api/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.ok ? data : null; // { ok, username, sessionId }
}
```

This is exactly the pattern used by `oli-salestrack-dashboard/server/index.js`
and `oliflow-executor/server/index.js` in this repo — see those for a
working example rather than just this snippet.

---

## What this does NOT do

- **No password recovery flow.** There's exactly one account and you set
  its password yourself at creation time. If you forget it and are locked
  out entirely, your only path back in is deleting `data/admin.json` and
  running `create-owner.js` again — which also wipes login history and any
  active sessions. There's no "forgot password" email flow, deliberately:
  every extra recovery path is another attack surface for the one account
  that matters most. Store the password in a password manager.
- **No multi-factor authentication.** Out of scope for this pass — if you
  want TOTP-based 2FA added on top of this, that's a real, separate
  follow-up (Node's `crypto` module doesn't include a TOTP implementation,
  so it would either need a small hand-rolled HMAC-based implementation or
  break from the zero-dependency approach used throughout this repo).
- **No rate limiting beyond the login-lockout mechanism above.** A
  determined attacker could still hammer `/api/health` or `/api/public-key`
  (both public, unauthenticated, and cheap) — put this behind a reverse
  proxy with real rate limiting (Cloudflare, nginx, etc.) if you expose it
  directly to the internet.

## API reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Health check + whether an owner account exists |
| `GET /api/public-key` | none | Ed25519 public key PEM, for services that want to verify signatures themselves |
| `POST /api/login` | none | `{ username, password }` → `{ token, expiresAt }` |
| `GET /api/verify` | Bearer | Full check (signature + live revocation) → `{ ok, username, sessionId }` |
| `POST /api/logout` | Bearer | Revokes the current session only |
| `POST /api/change-password` | Bearer | `{ currentPassword, newPassword }` — revokes ALL sessions on success |
| `GET /api/sessions` | Bearer | List your own active sessions (device/IP/last-seen) |
| `POST /api/sessions/:id/revoke` | Bearer | Kill a specific session (e.g. one you don't recognize) |

Full request/response shapes are documented as comments directly above each
route in `server/index.js`.
