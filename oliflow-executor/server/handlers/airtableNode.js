/**
 * Real "airtable" node — creates a genuine record in an Airtable base
 * via Airtable's real REST API. See integrationCredentials.js's header
 * comment for why credentials never live in node config.
 *
 * Config: { baseId: "app...", table: "Leads", fields: { "Name": "{{trigger.body.name}}" } }
 * Requires workflow variable: airtable_token (a real Airtable Personal
 * Access Token, from https://airtable.com/create/tokens).
 */
import { resolveTemplate, resolveTemplateDeep } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

export async function runAirtableNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "airtable", ["token"]);
  if (!credsResult.ok) return credsResult;

  const baseId = resolveTemplate(String(config.baseId ?? ""), templateContext);
  const table = resolveTemplate(String(config.table ?? ""), templateContext);
  if (!baseId || !table) return { ok: false, error: "This node's config needs non-empty 'baseId' and 'table' fields." };

  const fields = resolveTemplateDeep(config.fields || {}, templateContext);

  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`;
  const { httpOk, status, json, networkError } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${credsResult.creds.token}` },
    body: JSON.stringify({ fields }),
  });

  if (networkError) return { ok: false, error: networkError };
  if (!httpOk) {
    return { ok: false, error: `Airtable API error (${status}): ${json?.error?.message || json?.error || "unknown error"}` };
  }
  return { ok: true, result: { recordId: json.id, fields: json.fields } };
}
