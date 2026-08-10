/**
 * Real "google_sheets" node — appends a genuine row to a Google Sheet
 * via Google's real Sheets API v4, using an OAuth2 access token the
 * user supplies (same disclosed token-minting boundary as calendarNode.js).
 *
 * Config: { spreadsheetId: "...", range: "Sheet1!A:C", values: ["{{trigger.body.name}}", "{{trigger.body.email}}"] }
 * Requires workflow variable: google_sheets_access_token (a real Google
 * OAuth2 access token with the spreadsheets scope).
 */
import { resolveTemplateDeep } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

export async function runGoogleSheetsNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "google_sheets", ["access_token"]);
  if (!credsResult.ok) return credsResult;

  const spreadsheetId = config.spreadsheetId;
  const range = config.range || "Sheet1!A:Z";
  if (!spreadsheetId) return { ok: false, error: "This node's config needs a non-empty 'spreadsheetId' field." };

  const values = resolveTemplateDeep(config.values || [], templateContext);
  if (!Array.isArray(values)) return { ok: false, error: "'values' must be an array of cell values for the new row." };

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED`;

  const { httpOk, status, json, networkError } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${credsResult.creds.access_token}` },
    body: JSON.stringify({ values: [values] }),
  });

  if (networkError) return { ok: false, error: networkError };
  if (!httpOk) return { ok: false, error: `Google Sheets API error (${status}): ${json?.error?.message || "unknown error"}` };
  return { ok: true, result: { updatedRange: json.updates?.updatedRange, updatedRows: json.updates?.updatedRows } };
}
