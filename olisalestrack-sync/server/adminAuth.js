/**
 * Verifies that a request is genuinely coming from the one Oli owner
 * account, by checking its bearer token against the shared admin-auth
 * service (../../admin-auth) rather than a static shared secret.
 *
 * Identical pattern to ../licensing/server/adminAuth.js — kept as an
 * independent copy per-service rather than a shared import, matching this
 * repo's existing convention of each backend service being independently
 * deployable with zero shared runtime code between them.
 */

const ADMIN_AUTH_URL = process.env.OLI_ADMIN_AUTH_URL || "";
// Optional break-glass fallback for scripted/CI use. Prefer leaving this
// UNSET — see ../admin-auth/README.md for why a revocable session is
// safer than a static shared secret for routine admin access.
const ACCESS_TOKEN_FALLBACK = process.env.ACCESS_TOKEN || "";

if (!ADMIN_AUTH_URL && !ACCESS_TOKEN_FALLBACK) {
  console.warn(
    "\n⚠️  Neither OLI_ADMIN_AUTH_URL nor ACCESS_TOKEN is set. GET /api/events will reject all requests\n" +
      "   until you set OLI_ADMIN_AUTH_URL to point at a running admin-auth server (recommended — see\n" +
      "   ../admin-auth/README.md), or set ACCESS_TOKEN as a break-glass fallback (not recommended for routine use).\n"
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

  if (ACCESS_TOKEN_FALLBACK && token === ACCESS_TOKEN_FALLBACK) return true;

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
    return false; // fail CLOSED
  }
}
