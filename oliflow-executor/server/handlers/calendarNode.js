/**
 * Real "calendar" node — creates a genuine event on Google Calendar via
 * Google's real Calendar API v3, using an OAuth2 access token the user
 * supplies (obtained via a real Google OAuth flow outside this
 * executor — token minting/refresh is out of scope for a single node,
 * same disclosed boundary as every other integration node here that
 * expects a pre-obtained token rather than performing a full OAuth
 * dance itself).
 *
 * Config: { calendarId: "primary", summary: "{{trigger.body.title}}",
 *           startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" }
 * Requires workflow variable: calendar_access_token (a real Google
 * OAuth2 access token with the calendar.events scope).
 */
import { resolveTemplate } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

export async function runCalendarNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "calendar", ["access_token"]);
  if (!credsResult.ok) return credsResult;

  const calendarId = config.calendarId || "primary";
  const summary = resolveTemplate(String(config.summary ?? ""), templateContext);
  const startTime = resolveTemplate(String(config.startTime ?? ""), templateContext);
  const endTime = resolveTemplate(String(config.endTime ?? ""), templateContext);

  if (!summary || !startTime || !endTime) {
    return { ok: false, error: "This node's config needs non-empty 'summary', 'startTime', and 'endTime' fields." };
  }

  const { httpOk, status, json, networkError } = await fetchJson(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${credsResult.creds.access_token}` },
      body: JSON.stringify({
        summary,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      }),
    }
  );

  if (networkError) return { ok: false, error: networkError };
  if (!httpOk) return { ok: false, error: `Google Calendar API error (${status}): ${json?.error?.message || "unknown error"}` };
  return { ok: true, result: { eventId: json.id, htmlLink: json.htmlLink } };
}
