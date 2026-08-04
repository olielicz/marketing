/**
 * Wires the "email_send" node's config fields (from, to, subject, body —
 * see oliflow/app/index.html's config panel for 'email_send') to the real
 * SMTP client (smtpClient.js), resolving {{...}} templates first.
 *
 * SMTP connection details (host/port/user/pass) are NOT part of the
 * node's own config in the frontend today — the frontend only collects a
 * "SMTP Provider" dropdown label (Gmail/SMTP Custom/Sendgrid/Mailgun/SES),
 * not actual credentials, since those are secrets that shouldn't live in
 * a workflow definition at all. Real credentials come from workflow
 * variables instead (config.smtpVarPrefix, default "smtp" -> looks up
 * vars.smtp_host, vars.smtp_port, vars.smtp_user, vars.smtp_pass) — set
 * these once as workflow variables (see the app's Variables tab) and
 * every email_send node in that workflow can reuse them. See
 * README.md's "Setting up email sending" section for exact steps.
 */
import { resolveTemplate } from "../templateEngine.js";
import { sendMail } from "../smtpClient.js";

export async function runEmailSendNode(config, templateContext) {
  const prefix = config.smtpVarPrefix || "smtp";
  const vars = templateContext.vars || {};
  const host = vars[`${prefix}_host`];
  const port = vars[`${prefix}_port`] ? Number(vars[`${prefix}_port`]) : undefined;
  const user = vars[`${prefix}_user`];
  const pass = vars[`${prefix}_pass`];
  // Optional escape hatch for a self-hosted SMTP server with a
  // self-signed certificate. Defaults to verifying (safe) — matches
  // smtpClient.js's own safe-by-default. Set the variable to the literal
  // string "false" to disable verification; any other value (including
  // unset) keeps verification on.
  const rejectUnauthorized = vars[`${prefix}_reject_unauthorized`] !== "false";

  if (!host) {
    return {
      ok: false,
      error: `No SMTP host configured. Set a workflow variable named "${prefix}_host" (and _port/_user/_pass) — see README.md's "Setting up email sending" section.`,
    };
  }

  const from = resolveTemplate(config.from || "", templateContext);
  const to = resolveTemplate(config.to || "", templateContext);
  const subject = resolveTemplate(config.subject || "", templateContext);
  const body = resolveTemplate(config.body || "", templateContext);
  const isHtml = /<[a-z][\s\S]*>/i.test(body); // matches the frontend's "Body (HTML supported)" label for this field

  return sendMail({
    host,
    port,
    user,
    pass,
    rejectUnauthorized,
    from,
    to,
    subject,
    ...(isHtml ? { html: body } : { text: body }),
  });
}
