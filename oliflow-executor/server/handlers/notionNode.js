/**
 * Real "notion" node — creates a genuine page/row in a Notion database
 * via Notion's real REST API. See integrationCredentials.js's header
 * comment for why credentials never live in node config.
 *
 * Config:
 *   { databaseId: "...", titleProperty: "Name", title: "{{trigger.body.name}}",
 *     properties: { "Status": {"select": {"name": "New"}} } }
 * Requires workflow variable: notion_token (a real Notion internal
 * integration secret, starts with "secret_" or "ntn_", from
 * https://www.notion.so/my-integrations).
 */
import { resolveTemplate, resolveTemplateDeep } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

const NOTION_VERSION = "2022-06-28";

export async function runNotionNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "notion", ["token"]);
  if (!credsResult.ok) return credsResult;

  const databaseId = resolveTemplate(String(config.databaseId ?? ""), templateContext);
  if (!databaseId) return { ok: false, error: "This node's config needs a non-empty 'databaseId' field." };

  const titleProperty = config.titleProperty || "Name";
  const title = resolveTemplate(String(config.title ?? ""), templateContext);
  const extraProperties = resolveTemplateDeep(config.properties || {}, templateContext);

  const properties = {
    [titleProperty]: { title: [{ text: { content: title } }] },
    ...extraProperties,
  };

  const { httpOk, status, json, networkError } = await fetchJson("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credsResult.creds.token}`,
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });

  if (networkError) return { ok: false, error: networkError };
  if (!httpOk) {
    return { ok: false, error: `Notion API error (${status}): ${json?.message || "unknown error"}` };
  }
  return { ok: true, result: { pageId: json.id, url: json.url } };
}
