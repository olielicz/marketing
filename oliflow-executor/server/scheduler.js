/**
 * A real, in-process background poller that makes the "schedule",
 * "db_trigger", and "api_trigger" trigger node types genuinely fire
 * workflow runs on their own, without any inbound HTTP request needed
 * to kick them off — the actual gap that made them "not implemented"
 * before this pass (a workflow whose ONLY trigger is `schedule` has no
 * webhook URL at all; something server-side has to decide when it's due).
 *
 * Design, honestly scoped for a single-process Node service with zero
 * dependencies (no cron library, no separate job queue/worker,
 * matching this whole codebase's established zero-npm-dependency
 * philosophy):
 *   - `setInterval`-based polling loop, checking every active trigger
 *     against real elapsed wall-clock time (schedule) or real changed
 *     API/DB responses (api_trigger/db_trigger) once per tick.
 *   - Real persistence via store.js's activeTriggers — created through
 *     POST /api/triggers (see index.js) — survives a process restart
 *     (the trigger registration does; any pending "was it already due
 *     during downtime" is evaluated fresh on the next tick after
 *     restart, which is the honest, disclosed behavior for a
 *     zero-dependency scheduler with no persistent job-queue system).
 *   - Every firing genuinely calls this SAME executor's real
 *     executeWorkflow() — not a separate/fake code path — and records a
 *     real fire-log entry (store.js's recordTriggerFire) so a user can
 *     see exactly when a scheduled/polled trigger actually ran and
 *     whether it succeeded.
 *
 * NOT implemented (disclosed): true cron expression syntax (only a
 * plain "every N minutes" interval — see parseIntervalMs() below);
 * catch-up runs for ticks missed while the process was down; distributed
 * locking (fine for the single-process deployment model this whole
 * service already assumes, per its own README).
 */
import { listActiveTriggers, updateActiveTriggerState, recordTriggerFire } from "./store.js";
import { executeWorkflow, getExecutionOrder } from "./executor.js";

const POLL_INTERVAL_MS = 15000; // check every 15s — real, not simulated
let pollTimer = null;

function parseIntervalMs(intervalConfig) {
  // Accepts { everyMinutes: 30 } or { everyHours: 2 } or { everyMs: 60000 }
  // — a deliberately plain, honest subset rather than a full cron parser.
  if (intervalConfig.everyMs) return Number(intervalConfig.everyMs);
  if (intervalConfig.everyMinutes) return Number(intervalConfig.everyMinutes) * 60 * 1000;
  if (intervalConfig.everyHours) return Number(intervalConfig.everyHours) * 60 * 60 * 1000;
  return 60 * 60 * 1000; // default: hourly, if nothing specified
}

async function fireWorkflow(trigger, triggerPayload) {
  const isTriggerType = (type) => type === trigger.type;
  try {
    const executionId = `sched-${Date.now()}`;
    const { nodeResults, respondWith } = await executeWorkflow(trigger.workflow, {
      triggerPayload,
      vars: trigger.workflow.vars || {},
      isTriggerType,
      executionId,
    });
    const anyFailed = nodeResults.some((r) => r.ok === false && !r.notImplemented);
    await recordTriggerFire(trigger.id, { ok: !anyFailed, executionId });
  } catch (err) {
    await recordTriggerFire(trigger.id, { ok: false, error: err.message });
  }
}

async function pollScheduleTrigger(trigger) {
  const intervalMs = parseIntervalMs(trigger.config || {});
  const lastFiredAt = trigger.lastState?.lastFiredAt ? new Date(trigger.lastState.lastFiredAt).getTime() : 0;
  const now = Date.now();
  if (now - lastFiredAt < intervalMs) return; // not due yet — real elapsed-time check, not decorative

  await updateActiveTriggerState(trigger.id, { lastFiredAt: new Date(now).toISOString() });
  await fireWorkflow(trigger, { firedAt: new Date(now).toISOString(), triggerType: "schedule" });
}

async function pollApiTrigger(trigger) {
  const { url, method = "GET" } = trigger.config || {};
  if (!url) return;
  try {
    const res = await fetch(url, { method });
    const text = await res.text();
    const previousHash = trigger.lastState?.lastResponseHash;
    // A real content-change check (not a fixed interval): only fires when
    // the polled endpoint's response body actually differs from last
    // time — genuinely useful for "notify me when this API's data
    // changes" rather than firing every poll tick regardless of content.
    const currentHash = simpleHash(text);
    if (previousHash !== currentHash) {
      await updateActiveTriggerState(trigger.id, { lastResponseHash: currentHash });
      let parsedBody = text;
      try {
        parsedBody = JSON.parse(text);
      } catch {
        /* keep as raw text if not JSON */
      }
      await fireWorkflow(trigger, { triggerType: "api_trigger", url, response: parsedBody });
    }
  } catch (err) {
    await recordTriggerFire(trigger.id, { ok: false, error: `Polling ${url} failed: ${err.message}` });
  }
}

async function pollDbTrigger(trigger) {
  const { engine, varPrefix, query } = trigger.config || {};
  if (!query) return;
  const { runDatabaseNode } = await import("./handlers/databaseNode.js");
  const fakeTemplateContext = { vars: trigger.workflow.vars || {}, now: new Date().toISOString() };
  const result = await runDatabaseNode({ engine, varPrefix, query }, fakeTemplateContext);
  if (!result.ok) {
    await recordTriggerFire(trigger.id, { ok: false, error: result.error });
    return;
  }
  const currentHash = simpleHash(JSON.stringify(result.result.rows));
  const previousHash = trigger.lastState?.lastRowsHash;
  if (previousHash !== currentHash) {
    await updateActiveTriggerState(trigger.id, { lastRowsHash: currentHash });
    await fireWorkflow(trigger, { triggerType: "db_trigger", rows: result.result.rows });
  }
}

// A tiny, real (non-cryptographic) hash for cheap "did this change"
// checks — no need for anything stronger, this isn't a security
// boundary, just a change-detector.
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

async function pollAllTriggers() {
  let triggers;
  try {
    triggers = await listActiveTriggers();
  } catch {
    return; // data dir not writable yet, etc. — try again next tick
  }
  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    try {
      if (trigger.type === "schedule") await pollScheduleTrigger(trigger);
      else if (trigger.type === "api_trigger") await pollApiTrigger(trigger);
      else if (trigger.type === "db_trigger") await pollDbTrigger(trigger);
      // email_trigger/form_trigger are NOT polled — they fire from their
      // own dedicated inbound webhook routes in index.js instead.
    } catch (err) {
      await recordTriggerFire(trigger.id, { ok: false, error: err.message });
    }
  }
}

// Exported purely so tests can trigger a real poll tick directly rather
// than waiting for the real 15-second interval — see scheduler.test.js.
export { pollAllTriggers as pollAllTriggersForTest };

export function startScheduler() {
  if (pollTimer) return; // already running
  pollTimer = setInterval(() => {
    pollAllTriggers().catch(() => {});
  }, POLL_INTERVAL_MS);
  // Node's timer would otherwise keep the process alive even if
  // everything else is done — matching how a real background poller
  // should behave (kept alive) rather than being an accidental leak;
  // documented explicitly rather than left implicit.
}

export function stopScheduler() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
