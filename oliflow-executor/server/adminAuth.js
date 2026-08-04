/**
 * Same pattern as ../licensing/server/adminAuth.js and
 * ../olisalestrack-sync/server/adminAuth.js — verifies a request is
 * genuinely from the one Oli owner account via the shared admin-auth
 * service, rather than a static shared secret.
 *
 * This executor gates its ONE endpoint (POST /api/execute) behind owner
 * auth deliberately aggressively: the `code` node type runs arbitrary
 * JavaScript (in a sandboxed VM, see codeNode.js, but still) and
 * `http_request`/`slack` nodes can make outbound requests to anywhere —
 * this must never be reachable by an unauthenticated caller.
 */

const ADMIN_AUTH_URL = process.env.OLI_ADMIN_AUTH_URL || "";
const ADMIN_TOKEN_FALLBACK = process.env.ADMIN_TOKEN || "";

if (!ADMIN_AUTH_URL && !ADMIN_TOKEN_FALLBACK) {
  console.warn(
    "\n⚠️  Neither OLI_ADMIN_AUTH_URL nor ADMIN_TOKEN is set. POST /api/execute will reject all requests\n" +
      "   until you set OLI_ADMIN_AUTH_URL to point at a running admin-auth server (recommended — see\n" +
      "   ../admin-auth/README.md), or set ADMIN_TOKEN as a break-glass fallback (not recommended for routine use).\n"
  );
}

export async function requireAdmin(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;

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
    return false; // fail CLOSED
  }
}
