/**
 * Real implementation of the "http_request" node type — makes an actual
 * outbound HTTP request, using the config fields the frontend already
 * collects (method, url, headers JSON, body JSON — see
 * oliflow/app/index.html's config panel for 'http_request').
 *
 * SSRF guard: this executor runs on YOUR server with YOUR credentials in
 * $vars, and any workflow you build can point an http_request node at
 * any URL. Since this is a single-owner, self-hosted tool (not a
 * multi-tenant platform where untrusted third parties author workflows),
 * the main realistic risk isn't "an attacker tricks you into workflow
 * that hits your internal network" — it's "a typo or copy-pasted
 * template accidentally targets something like
 * http://169.254.169.254/latest/meta-data (cloud provider instance
 * metadata) or http://localhost:<some-internal-port>." Blocking those by
 * default costs nothing for legitimate use and prevents a nasty class of
 * accident. If you deliberately need to call an internal service, set
 * OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS=1.
 */
import { resolveTemplateDeep } from "../templateEngine.js";

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local, incl. cloud instance metadata endpoints
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
];

function isPrivateHostname(hostname) {
  return PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * @param {object} config - { method, url, headers: string|object, body: string|object }
 * @param {object} templateContext - see templateEngine.js's buildBaseContext()
 * @returns {Promise<{ ok: true, statusCode: number, headers: object, body: string } | { ok: false, error: string }>}
 */
export async function runHttpRequestNode(config, templateContext) {
  const method = (config.method || "GET").toUpperCase();
  const rawUrl = resolveTemplateDeep(config.url || "", templateContext);

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: `"${rawUrl}" is not a valid URL.` };
  }

  // Read env vars fresh on every call (not captured once at module load)
  // so tests and runtime config changes both take effect correctly.
  const allowPrivateNetwork = process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS === "1";
  if (!allowPrivateNetwork && isPrivateHostname(url.hostname)) {
    return {
      ok: false,
      error: `Refusing to request "${url.hostname}" — it looks like a private/internal address. ` +
        `Set OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS=1 if this is intentional.`,
    };
  }

  let headers = {};
  if (config.headers) {
    const resolvedHeadersStr = resolveTemplateDeep(config.headers, templateContext);
    try {
      headers = typeof resolvedHeadersStr === "string" ? JSON.parse(resolvedHeadersStr) : resolvedHeadersStr;
    } catch {
      return { ok: false, error: `Headers field is not valid JSON: ${resolvedHeadersStr}` };
    }
  }

  let body;
  if (config.body && method !== "GET" && method !== "HEAD") {
    const resolvedBody = resolveTemplateDeep(config.body, templateContext);
    body = typeof resolvedBody === "string" ? resolvedBody : JSON.stringify(resolvedBody);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const requestTimeoutMs = Number(process.env.OLIFLOW_HTTP_NODE_TIMEOUT_MS) || 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const res = await fetch(url.toString(), { method, headers, body, signal: controller.signal });
    const responseBody = await res.text();
    return {
      ok: true,
      statusCode: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: responseBody,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, error: `Request timed out after ${requestTimeoutMs}ms.` };
    }
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}
