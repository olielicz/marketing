/**
 * Real handlers for the 5 previously-unimplemented trigger node types:
 * schedule, email_trigger, form_trigger, db_trigger, api_trigger.
 *
 * Like the existing "webhook" trigger (see executor.js's runNode(),
 * webhook case), a trigger node itself does no "work" at run time — it
 * IS the entry point, so by the time runNode() reaches it, the run has
 * already started because of it. What each of these needed for real
 * (unlike webhook, which just returns the already-available inbound
 * request) is a genuine mechanism to actually FIRE a workflow run in
 * the first place:
 *
 *  - schedule: a real background poller (scheduler.js) that checks
 *    real elapsed time against a real cron-like interval and calls
 *    POST /api/execute on itself when due.
 *  - db_trigger / api_trigger: the SAME background poller, but checking
 *    "has this database query's result / this API endpoint's response
 *    changed since I last looked" instead of elapsed time — see
 *    scheduler.js's pollDbTrigger()/pollApiTrigger().
 *  - email_trigger / form_trigger: NOT poll-based — these fire the
 *    instant a real inbound request hits their own dedicated webhook
 *    URLs (POST /api/triggers/:id/email and POST /api/triggers/:id/form
 *    in index.js), exactly like the existing "webhook" node's own
 *    POST /api/hooks/:workflowId, just semantically distinct endpoints
 *    (so a user can point Formspree/Mailgun's inbound-parse webhook at
 *    the form/email variant specifically instead of the generic one).
 *
 * The node handlers below just echo back the same trigger payload the
 * "webhook" case already returns — the real, new work for these 5
 * types lives in scheduler.js + the new routes in index.js, registered
 * via the Active Triggers API (POST /api/triggers).
 */
export function runGenericTriggerNode(templateContext) {
  return { ok: true, result: templateContext.trigger };
}
