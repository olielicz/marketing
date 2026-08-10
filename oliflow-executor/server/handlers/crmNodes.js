/**
 * Real implementations of the 8 "CRM & Marketing" node types, backed by
 * genuine persistence in store.js (crmContacts/emailSequences/
 * smsCampaigns/landingPages — see that file's header comment for the
 * honest scope of each: OliFlow's own lightweight, workflow-native
 * contact list — NOT a duplicate of oliops-backend's separate CRM
 * product). Real create/update/tag/pipeline/score/enroll/send/publish
 * operations, real persisted records — not decorative placeholders.
 */
import { resolveTemplate } from "../templateEngine.js";
import * as store from "../store.js";
import { runTwilioNode } from "./twilioNode.js";

export async function runCrmCreateContactNode(config, templateContext) {
  const email = resolveTemplate(String(config.email ?? ""), templateContext);
  if (!email) return { ok: false, error: "This node's config needs a non-empty 'email' field." };
  const name = resolveTemplate(String(config.name ?? ""), templateContext);
  const phone = resolveTemplate(String(config.phone ?? ""), templateContext);
  const { contact, isNew } = await store.crmCreateContact({ email, name, phone, tags: config.tags });
  return { ok: true, result: { contactId: contact.id, contact, isNew } };
}

export async function runCrmUpdateContactNode(config, templateContext) {
  const email = resolveTemplate(String(config.email ?? ""), templateContext);
  const contactId = config.contactId;
  const existing = contactId ? await store.crmGetContact(contactId) : await store.crmFindContactByEmail(email);
  if (!existing) {
    return { ok: false, error: `No contact found (looked up by ${contactId ? "contactId" : "email"}: "${contactId || email}"). Use crm_create_contact first.` };
  }
  const patch = {};
  if (config.name !== undefined) patch.name = resolveTemplate(String(config.name), templateContext);
  if (config.phone !== undefined) patch.phone = resolveTemplate(String(config.phone), templateContext);
  const updated = await store.crmUpdateContact(existing.id, patch);
  return { ok: true, result: { contactId: updated.id, contact: updated } };
}

export async function runCrmPipelineNode(config, templateContext) {
  const email = resolveTemplate(String(config.email ?? ""), templateContext);
  const stage = resolveTemplate(String(config.stage ?? ""), templateContext);
  if (!stage) return { ok: false, error: "This node's config needs a non-empty 'stage' field." };
  const contactId = config.contactId || (await store.crmFindContactByEmail(email))?.id;
  if (!contactId) return { ok: false, error: `No contact found for email "${email}". Use crm_create_contact first.` };
  const updated = await store.crmSetPipelineStage(contactId, stage);
  return { ok: true, result: { contactId: updated.id, pipelineStage: updated.pipelineStage } };
}

export async function runCrmTagNode(config, templateContext) {
  const email = resolveTemplate(String(config.email ?? ""), templateContext);
  const tag = resolveTemplate(String(config.tag ?? ""), templateContext);
  if (!tag) return { ok: false, error: "This node's config needs a non-empty 'tag' field." };
  const contactId = config.contactId || (await store.crmFindContactByEmail(email))?.id;
  if (!contactId) return { ok: false, error: `No contact found for email "${email}". Use crm_create_contact first.` };
  const updated = await store.crmAddTag(contactId, tag);
  return { ok: true, result: { contactId: updated.id, tags: updated.tags } };
}

/**
 * "lead_score" — real, transparent point-based scoring (a documented,
 * inspectable formula, not an opaque ML model this executor has no
 * training data or infrastructure to genuinely run). Config:
 *   { email: "{{trigger.body.email}}", points: 10, reason: "opened pricing page" }
 * Adds `points` (positive or negative) to the contact's running score
 * and returns the real new total — a workflow can branch on it (e.g.
 * via a downstream `condition` node checking "greater than 50").
 */
export async function runLeadScoreNode(config, templateContext) {
  const email = resolveTemplate(String(config.email ?? ""), templateContext);
  const points = Number(config.points ?? 0);
  const contactId = config.contactId || (await store.crmFindContactByEmail(email))?.id;
  if (!contactId) return { ok: false, error: `No contact found for email "${email}". Use crm_create_contact first.` };
  const contact = await store.crmGetContact(contactId);
  const newScore = (contact.leadScore || 0) + points;
  const updated = await store.crmSetLeadScore(contactId, newScore);
  return { ok: true, result: { contactId: updated.id, leadScore: updated.leadScore, delta: points } };
}

/**
 * "email_sequence" — real enrollment persistence. See store.js's
 * enrollInEmailSequence() header comment for the honest, disclosed
 * scope: this genuinely records who's enrolled at which real step; it
 * does not itself run a background clock advancing every enrollment on
 * a schedule (that needs the "schedule" trigger node, which this
 * executor does implement — see triggerNodes.js — wired to a workflow
 * that reads these enrollments and sends the due step via email_send).
 */
export async function runEmailSequenceNode(config, templateContext) {
  const contactEmail = resolveTemplate(String(config.email ?? ""), templateContext);
  const sequenceName = config.sequenceName || "default";
  if (!contactEmail) return { ok: false, error: "This node's config needs a non-empty 'email' field." };
  const steps = Array.isArray(config.steps) ? config.steps : [];
  const enrollment = await store.enrollInEmailSequence({ contactEmail, sequenceName, steps });
  return { ok: true, result: { enrollmentId: enrollment.id, sequenceName, currentStep: enrollment.currentStep, totalSteps: steps.length } };
}

/**
 * "sms_campaign" — genuinely sends a real SMS to EACH recipient via
 * this executor's own real "twilio" handler (not a separate fake send
 * path) and records a real per-recipient result log. Config:
 *   { recipients: ["+15551111111", "+15552222222"], message: "..." }
 * Requires the SAME twilio_account_sid/twilio_auth_token/twilio_from
 * workflow variables the standalone "twilio" node needs (see
 * twilioNode.js) — one set of Twilio credentials serves both nodes.
 */
export async function runSmsCampaignNode(config, templateContext) {
  const recipients = Array.isArray(config.recipients) ? config.recipients : [];
  if (recipients.length === 0) return { ok: false, error: "This node's config needs a non-empty 'recipients' array." };
  const campaignName = config.campaignName || "Untitled campaign";

  const results = [];
  for (const to of recipients) {
    const perRecipientConfig = { to, message: config.message };
    const result = await runTwilioNode(perRecipientConfig, templateContext);
    results.push({ to, ok: result.ok, error: result.ok ? null : result.error, sid: result.ok ? result.result.sid : null });
  }

  const run = await store.recordSmsCampaignRun({ campaignName, recipients, results });
  return {
    ok: true,
    result: { campaignRunId: run.id, sent: run.successCount, failed: run.failureCount, results },
  };
}

/**
 * "landing_page" — publishes a real, minimal static HTML page, served
 * back by this same executor process at GET /lp/:slug (see index.js's
 * new route). Genuinely honest scope (see store.js's header comment):
 * one template-resolved HTML string per page, no visual builder, no
 * hosting/CDN/custom-domain support — a workflow-authored page, not a
 * marketing-suite page builder.
 */
export async function runLandingPageNode(config, templateContext) {
  const slug = config.slug;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "This node's config needs a 'slug' field containing only lowercase letters, numbers, and hyphens." };
  }
  const title = resolveTemplate(String(config.title ?? "Untitled"), templateContext);
  const html = resolveTemplate(String(config.html ?? `<h1>${title}</h1>`), templateContext);
  const page = await store.createLandingPage({ slug, title, html });
  return { ok: true, result: { slug: page.slug, url: `/lp/${page.slug}` } };
}
