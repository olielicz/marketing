/**
 * Multi-Step Recovery Drip Scheduler
 * Checks for abandoned carts on a regular interval and sends
 * follow-up recovery emails at timed intervals:
 *   Step 1 — 1 hour after abandonment: friendly reminder
 *   Step 2 — 24 hours after abandonment: urgency + product benefits
 *   Step 3 — 72 hours after abandonment: discount offer (if configured)
 *
 * Pure Node.js, zero external dependencies.
 */

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const DRIP_STEPS = [
  { step: 1, delay: 3600000, tone: "friendly" },     // 1 hour
  { step: 2, delay: 86400000, tone: "urgency" },     // 24 hours
  { step: 3, delay: 259200000, tone: "discount" },   // 72 hours
];

let intervalHandle = null;

/**
 * Start the drip scheduler.
 * Runs every 5 minutes, checks for abandoned carts that need follow-up emails.
 *
 * @param {Object} store - Data access object
 * @param {Function} store.listCarts - async () => Cart[] — returns all carts with status info
 * @param {Function} store.markCartStatus - async (cartId, status) => void
 * @param {Function} store.recordRecoveryEmailSent - async (cartId, step, timestamp) => void
 * @param {Function} sendEmailFn - async (cart, step) => boolean — sends an email, returns true on success
 */
export function startDripScheduler(store, sendEmailFn) {
  if (intervalHandle) {
    console.log("[dripScheduler] Scheduler already running. Stopping previous instance.");
    stopDripScheduler();
  }

  console.log("[dripScheduler] Starting drip scheduler (check interval: 5 minutes)");
  console.log("[dripScheduler] Steps configured:", DRIP_STEPS.map(s => `Step ${s.step}: ${s.delay / 3600000}h (${s.tone})`).join(", "));

  // Run immediately on start, then every 5 minutes
  runDripCycle(store, sendEmailFn);

  intervalHandle = setInterval(() => {
    runDripCycle(store, sendEmailFn);
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the drip scheduler.
 */
export function stopDripScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[dripScheduler] Scheduler stopped.");
  } else {
    console.log("[dripScheduler] Scheduler was not running.");
  }
}

/**
 * Run a single drip cycle: check all abandoned carts and send follow-up emails as needed.
 * @param {Object} store
 * @param {Function} sendEmailFn
 */
async function runDripCycle(store, sendEmailFn) {
  const now = Date.now();
  console.log(`[dripScheduler] Running drip cycle at ${new Date(now).toISOString()}`);

  let carts;
  try {
    carts = await store.listCarts();
  } catch (err) {
    console.log(`[dripScheduler] Error listing carts: ${err.message}`);
    return;
  }

  // Filter to abandoned carts only
  const abandonedCarts = (carts || []).filter(cart => cart.status === "abandoned");
  console.log(`[dripScheduler] Found ${abandonedCarts.length} abandoned cart(s)`);

  for (const cart of abandonedCarts) {
    try {
      await processCart(cart, store, sendEmailFn, now);
    } catch (err) {
      console.log(`[dripScheduler] Error processing cart ${cart.id}: ${err.message}. Will retry next cycle.`);
    }
  }
}

/**
 * Process a single abandoned cart — determine next step and send email if due.
 * @param {Object} cart
 * @param {Object} store
 * @param {Function} sendEmailFn
 * @param {number} now - Current timestamp in ms
 */
async function processCart(cart, store, sendEmailFn, now) {
  const recoveryEmailsSent = cart.recoveryEmailsSent || [];
  const completedSteps = recoveryEmailsSent.length;

  // If all 3 steps completed, skip (don't spam)
  if (completedSteps >= DRIP_STEPS.length) {
    return;
  }

  // If cart status changed to "recovered", skip
  if (cart.status === "recovered") {
    return;
  }

  const nextStep = DRIP_STEPS[completedSteps];
  const abandonedAt = cart.abandonedAt ? new Date(cart.abandonedAt).getTime() : null;

  if (!abandonedAt) {
    console.log(`[dripScheduler] Cart ${cart.id} has no abandonedAt timestamp, skipping.`);
    return;
  }

  // Determine the reference time for the delay:
  // For step 1: time since abandonment
  // For steps 2+: time since abandonment (delays are cumulative from abandonment time)
  const timeSinceAbandonment = now - abandonedAt;

  if (timeSinceAbandonment < nextStep.delay) {
    // Not enough time has passed yet for this step
    return;
  }

  // Additionally, ensure we don't send too quickly after the last email
  // (at least 30 minutes between any two emails as a safety buffer)
  if (completedSteps > 0) {
    const lastEmailRecord = recoveryEmailsSent[completedSteps - 1];
    const lastSentAt = lastEmailRecord?.sentAt ? new Date(lastEmailRecord.sentAt).getTime() : 0;
    const timeSinceLastEmail = now - lastSentAt;
    if (timeSinceLastEmail < 30 * 60 * 1000) {
      // Less than 30 minutes since last email, wait
      return;
    }
  }

  // Time to send the next email
  console.log(`[dripScheduler] Cart ${cart.id}: sending step ${nextStep.step} (${nextStep.tone}) — ${timeSinceAbandonment / 3600000}h since abandonment`);

  let success = false;
  try {
    success = await sendEmailFn(cart, nextStep);
  } catch (err) {
    console.log(`[dripScheduler] Cart ${cart.id}: email send failed for step ${nextStep.step}: ${err.message}. Will retry next cycle.`);
    return;
  }

  if (success) {
    const sentTimestamp = new Date(now).toISOString();
    console.log(`[dripScheduler] Cart ${cart.id}: step ${nextStep.step} email sent successfully at ${sentTimestamp}`);

    try {
      await store.recordRecoveryEmailSent(cart.id, nextStep.step, sentTimestamp);
    } catch (err) {
      console.log(`[dripScheduler] Cart ${cart.id}: failed to record email sent: ${err.message}`);
    }
  } else {
    console.log(`[dripScheduler] Cart ${cart.id}: sendEmailFn returned false for step ${nextStep.step}. Will retry next cycle.`);
  }
}
