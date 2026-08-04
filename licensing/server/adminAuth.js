/**
 * Verifies that a request is genuinely coming from the one Oli owner
 * account, by checking its bearer token against the shared admin-auth
 * service (../../admin-auth) rather than a static shared secret.
 *
 * This is a small, self-contained copy rather than a cross-directory
 * import, matching this repo's existing pattern where every backend
 * service (licensing/, olisalestrack-sync/, oliexplore-trends/) is
 * independently deployable with zero shared runtime code between them —
 * each one can be deployed to a different host/free-tier account without
 * needing the others to be reachable at deploy time, only at request time
 * for this one check.
 */

const ADMIN_AUTH_URL = process.env.OLI_ADMIN_AUTH_URL || "";
// Optional break-glass fallback for scripted/CI use where running a full
// login flow is impractical (e.g. a nightly license-audit script). Prefer
// leaving this UNSET — every admin action should go through a real,
// revocable owner session via ADMIN_AUTH_URL instead of a secret that, once
// shared with any script or CI system, can't be individually revoked the
// way a session can. See admin-auth/README.md.
const ADMIN_TOKEN_FALLBACK = process.env.ADMIN_TOKEN || "";

if (!ADMIN_AUTH_URL && !ADMIN_TOKEN_FALLBACK) {
  console.warn(
    "\n⚠️  Neither OLI_ADMIN_AUTH_URL nor ADMIN_TOKEN is set. Every admin endpoint will reject all requests\n" +
      "   until you set OLI_ADMIN_AUTH_URL to point at a running admin-auth server (recommended — see\n" +
      "   ../admin-auth/README.md), or set ADMIN_TOKEN as a break-glass fallback (not recommended for routine use).\n"
  );
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<boolean>}
 */
export async function requireAdmin(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;

  // Static fallback secret, checked first only because it's a synchronous,
  // network-free comparison — this does NOT make it the preferred path.
  if (ADMIN_TOKEN_FALLBACK && token === ADMIN_TOKEN_FALLBACK) return true;

  if (!ADMIN_AUTH_URL) return false;
  try {
    const res = await fetch(`${ADMIN_AUTH_URL.replace(/\/$/, "")}/api/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error("[adminAuth] Could not reach admin-auth service at", ADMIN_AUTH_URL, "-", err.message);
    return false; // fail CLOSED — a network error must never be treated as "authenticated"
  }
}
