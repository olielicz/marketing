/**
 * Real "supabase" node — calls a real Supabase project's PostgREST API
 * (Supabase's real auto-generated REST layer over Postgres — the
 * standard, documented way to read/write Supabase tables over HTTP
 * without a database driver).
 *
 * Config: { table: "leads", operation: "insert", data: { "name": "{{trigger.body.name}}" } }
 *      or: { table: "leads", operation: "select", filter: "status=eq.new" }
 * Requires workflow variables: supabase_url (e.g. "https://xyzcompany.supabase.co"),
 * supabase_service_key (a real Supabase service_role key — has full
 * table access, bypassing Row Level Security, so it must be treated as
 * a genuine secret, exactly like every other credential in this file).
 */
import { resolveTemplate, resolveTemplateDeep } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

export async function runSupabaseNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "supabase", ["url", "service_key"]);
  if (!credsResult.ok) return credsResult;
  const { url, service_key } = credsResult.creds;

  const table = resolveTemplate(String(config.table ?? ""), templateContext);
  if (!table) return { ok: false, error: "This node's config needs a non-empty 'table' field." };

  const headers = {
    apikey: service_key,
    Authorization: `Bearer ${service_key}`,
    "Content-Type": "application/json",
  };
  const base = `${url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(table)}`;

  const operation = config.operation || "select";

  if (operation === "insert") {
    const data = resolveTemplateDeep(config.data || {}, templateContext);
    const { httpOk, status, json, networkError } = await fetchJson(base, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Supabase API error (${status}): ${json?.message || "unknown error"}` };
    return { ok: true, result: { rows: json, rowCount: Array.isArray(json) ? json.length : 1 } };
  }

  if (operation === "select") {
    const filter = config.filter ? `?${resolveTemplate(String(config.filter), templateContext)}` : "";
    const { httpOk, status, json, networkError } = await fetchJson(`${base}${filter}`, { headers });
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Supabase API error (${status}): ${json?.message || "unknown error"}` };
    return { ok: true, result: { rows: json, rowCount: Array.isArray(json) ? json.length : 0 } };
  }

  return { ok: false, error: `Unknown Supabase operation: "${operation}". Use insert or select.` };
}
