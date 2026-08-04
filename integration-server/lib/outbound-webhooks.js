/**
 * lib/outbound-webhooks.js
 * =========================
 * Sends events out to external services (Zapier "Instant Trigger" hooks,
 * Make.com webhook modules, n8n webhook nodes, customer-owned endpoints).
 *
 * Fixes vs. the original integration-layer-02-outbound-webhooks.js:
 *  - Subscriptions and dead-letter entries persist via lib/store.js instead
 *    of an in-memory Map that resets on every restart/redeploy.
 *  - Retries are scheduled with setTimeout instead of blocking the calling
 *    request with `await new Promise(setTimeout)` inside a recursive retry
 *    (the original blocked the HTTP response that triggered emitEvent for
 *    up to 5 retries x exponential backoff, i.e. minutes).
 *  - emitEvent() is actually called by lib/webhook-bridge.js now.
 */

const crypto = require('crypto');
const store = require('./store');

const VALID_EVENTS = [
  'contact.created', 'contact.updated', 'contact.deleted',
  'lead.created', 'lead.updated', 'lead.assigned',
  'task.created', 'email.sent',
  'order.created', 'order.completed', 'order.refunded',
  'workflow.triggered', 'workflow.completed', 'workflow.failed',
  'post.published', 'post.scheduled', 'post.deleted',
  'sale.recorded', 'refund.recorded',
  'cart.recovery_initiated',
  '*'
];

class OutboundWebhookManager {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 5,
      initialBackoffMs: config.initialBackoffMs ?? 1000,
      maxBackoffMs: config.maxBackoffMs ?? 300000, // 5 min
      requestTimeoutMs: config.requestTimeoutMs ?? 15000,
      ...config
    };
  }

  registerWebhook({ userId, url, events = ['*'], toolKey, secret }) {
    if (!userId || !url || !toolKey) {
      throw new Error('userId, url, and toolKey are required');
    }
    try { new URL(url); } catch { throw new Error('Invalid webhook URL'); }

    const unknown = events.filter(e => !VALID_EVENTS.includes(e));
    if (unknown.length) {
      console.warn(`[outbound] Registering webhook with unrecognized event types: ${unknown.join(', ')}`);
    }

    const webhook = {
      id: `wh_${crypto.randomUUID()}`,
      userId,
      toolKey,
      url,
      events,
      active: true,
      secret: secret || crypto.randomBytes(32).toString('hex'),
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      successCount: 0,
      failureCount: 0
    };

    store.update('webhookSubscriptions', (subs) => {
      if (!subs[userId]) subs[userId] = [];
      subs[userId].push(webhook);
    });

    return webhook;
  }

  listWebhooks(userId, toolKey = null) {
    const subs = store.get('webhookSubscriptions');
    const list = subs[userId] || [];
    return toolKey ? list.filter(w => w.toolKey === toolKey) : list;
  }

  updateWebhook(webhookId, updates) {
    let updated = null;
    store.update('webhookSubscriptions', (subs) => {
      for (const userId of Object.keys(subs)) {
        const webhook = subs[userId].find(w => w.id === webhookId);
        if (webhook) {
          Object.assign(webhook, updates, { updatedAt: new Date().toISOString() });
          updated = webhook;
          return;
        }
      }
    });
    if (!updated) throw new Error(`Webhook not found: ${webhookId}`);
    return updated;
  }

  deleteWebhook(webhookId) {
    let deleted = false;
    store.update('webhookSubscriptions', (subs) => {
      for (const userId of Object.keys(subs)) {
        const idx = subs[userId].findIndex(w => w.id === webhookId);
        if (idx !== -1) {
          subs[userId].splice(idx, 1);
          deleted = true;
          return;
        }
      }
    });
    return deleted;
  }

  /** Called by webhook-bridge.js (and GHL bridge) when something happens. */
  emitEvent({ toolKey, userId, eventType, data }) {
    if (!toolKey || !userId || !eventType) {
      throw new Error('toolKey, userId, and eventType are required');
    }
    const event = {
      id: `evt_${crypto.randomUUID()}`,
      toolKey, userId, eventType, data,
      timestamp: new Date().toISOString()
    };
    // Fire and forget - don't block the caller (e.g. an inbound webhook
    // response) on outbound delivery.
    setImmediate(() => this._processEvent(event).catch(err => {
      console.error('[outbound] processEvent failed:', err.message);
    }));
    return event.id;
  }

  async _processEvent(event) {
    const subs = store.get('webhookSubscriptions');
    const userWebhooks = subs[event.userId] || [];
    const matching = userWebhooks.filter(w =>
      w.active &&
      (w.toolKey === event.toolKey || w.toolKey === '*') &&
      (w.events.includes('*') || w.events.includes(event.eventType))
    );

    if (matching.length === 0) return;

    await Promise.allSettled(matching.map(w => this._deliverWithRetry(event, w.id)));
  }

  async _deliverWithRetry(event, webhookId, attempt = 0) {
    const webhook = this._findWebhook(webhookId);
    if (!webhook) return; // deleted mid-flight

    try {
      const payload = { id: event.id, type: event.eventType, tool: event.toolKey, timestamp: event.timestamp, data: event.data };
      const signature = crypto.createHmac('sha256', webhook.secret).update(JSON.stringify(payload)).digest('hex');

      const res = await this._sendWithTimeout(webhook.url, payload, signature);

      if (res.ok) {
        this._recordResult(webhookId, true);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= this.config.maxRetries) {
        store.update('deadLetterQueue', (queue) => {
          queue.push({
            id: crypto.randomUUID(),
            webhookId,
            event,
            attempts: attempt + 1,
            lastError: err.message,
            failedAt: new Date().toISOString()
          });
        });
        store.capArray('deadLetterQueue', 500);
        this._recordResult(webhookId, false);
        return;
      }

      const backoff = Math.min(this.config.initialBackoffMs * (2 ** attempt), this.config.maxBackoffMs);
      await new Promise(r => setTimeout(r, backoff));
      return this._deliverWithRetry(event, webhookId, attempt + 1);
    }
  }

  async _sendWithTimeout(url, payload, signature) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Oli-Signature': signature,
          'X-Oli-Delivery-Id': crypto.randomUUID(),
          'User-Agent': 'Oli-Webhooks/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  _findWebhook(webhookId) {
    const subs = store.get('webhookSubscriptions');
    for (const userId of Object.keys(subs)) {
      const found = subs[userId].find(w => w.id === webhookId);
      if (found) return found;
    }
    return null;
  }

  _recordResult(webhookId, success) {
    store.update('webhookSubscriptions', (subs) => {
      for (const userId of Object.keys(subs)) {
        const webhook = subs[userId].find(w => w.id === webhookId);
        if (webhook) {
          if (success) { webhook.successCount++; webhook.lastTriggeredAt = new Date().toISOString(); }
          else { webhook.failureCount++; }
          return;
        }
      }
    });
  }

  getDeadLetterQueue(userId = null) {
    const queue = store.get('deadLetterQueue');
    if (!userId) return queue;
    return queue.filter(item => item.event.userId === userId);
  }

  async retryDeadLettered(deadLetterId) {
    const queue = store.get('deadLetterQueue');
    const idx = queue.findIndex(item => item.id === deadLetterId);
    if (idx === -1) throw new Error('Dead-lettered event not found');
    const [item] = queue.splice(idx, 1);
    store.set('deadLetterQueue', queue);
    return this._deliverWithRetry(item.event, item.webhookId, 0);
  }

  getStatistics() {
    const subs = store.get('webhookSubscriptions');
    let total = 0, active = 0, successes = 0, failures = 0;
    for (const list of Object.values(subs)) {
      total += list.length;
      active += list.filter(w => w.active).length;
      successes += list.reduce((s, w) => s + w.successCount, 0);
      failures += list.reduce((s, w) => s + w.failureCount, 0);
    }
    return {
      totalWebhooks: total,
      activeWebhooks: active,
      totalSuccesses: successes,
      totalFailures: failures,
      successRate: (successes + failures) > 0 ? `${((successes / (successes + failures)) * 100).toFixed(2)}%` : 'N/A',
      deadLetteredCount: store.get('deadLetterQueue').length
    };
  }
}

module.exports = { OutboundWebhookManager, VALID_EVENTS };
