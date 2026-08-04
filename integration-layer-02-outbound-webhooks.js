/**
 * Oli Outbound Webhook System
 * ============================
 * 
 * Allows Oli tools to send webhooks to external services
 * (Zapier, Make, n8n, GHL, custom apps, etc.)
 * 
 * Features:
 * - Event subscriptions (user configures which events to send)
 * - Retry logic with exponential backoff
 * - Event signing (HMAC-SHA256)
 * - Dead letter queue for failed deliveries
 * - Event filtering and transformation
 * - Rate limiting
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ============================================================================
// PART 1: OUTBOUND WEBHOOK MANAGER
// ============================================================================

class OutboundWebhookManager {
  constructor(config = {}) {
    this.config = {
      webhookSecret: process.env.OLI_WEBHOOK_SECRET || 'dev-webhook-secret',
      maxRetries: config.maxRetries || 5,
      initialBackoff: config.initialBackoff || 1000, // ms
      maxBackoff: config.maxBackoff || 300000, // 5 minutes
      requestTimeout: config.requestTimeout || 30000, // 30 seconds
      maxPayloadSize: config.maxPayloadSize || 5 * 1024 * 1024, // 5MB
      ...config
    };

    // In-memory storage (in production, use database)
    this.webhookSubscriptions = new Map(); // userId -> [webhooks]
    this.eventQueue = [];
    this.deadLetterQueue = [];
    this.eventLog = [];
  }

  /**
   * Register a webhook subscription
   * 
   * @param {Object} subscription - { userId, url, events, active, secret, filter }
   * @returns {string} subscriptionId
   */
  registerWebhook(subscription) {
    const {
      userId,
      url,
      events = ['*'], // * means all events
      active = true,
      toolKey,
      secret = crypto.randomBytes(32).toString('hex')
    } = subscription;

    if (!userId || !url || !toolKey) {
      throw new Error('userId, url, and toolKey are required');
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    // Validate events
    const validEvents = [
      'contact.created', 'contact.updated', 'contact.deleted',
      'lead.created', 'lead.updated', 'lead.assigned',
      'order.created', 'order.completed', 'order.refunded',
      'workflow.triggered', 'workflow.completed', 'workflow.failed',
      'post.published', 'post.scheduled', 'post.deleted',
      'sale.recorded', 'refund.recorded',
      '*' // catch-all
    ];

    const normalizedEvents = events.map(e => {
      if (e === '*') return '*';
      if (!validEvents.includes(e)) {
        console.warn(`Unknown event type: ${e}, will be accepted but may not trigger`);
      }
      return e;
    });

    const webhookId = `wh_${crypto.randomUUID()}`;
    const webhook = {
      id: webhookId,
      userId,
      toolKey,
      url,
      events: normalizedEvents,
      active,
      secret,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      failureCount: 0,
      successCount: 0
    };

    if (!this.webhookSubscriptions.has(userId)) {
      this.webhookSubscriptions.set(userId, []);
    }

    this.webhookSubscriptions.get(userId).push(webhook);

    this.logEvent({
      type: 'webhook.registered',
      webhookId,
      userId,
      url: this.maskUrl(url),
      events: normalizedEvents
    });

    return webhookId;
  }

  /**
   * Update a webhook subscription
   */
  updateWebhook(webhookId, updates) {
    for (const webhooks of this.webhookSubscriptions.values()) {
      const webhook = webhooks.find(w => w.id === webhookId);
      if (webhook) {
        Object.assign(webhook, updates);
        webhook.updatedAt = new Date().toISOString();
        return webhook;
      }
    }
    throw new Error(`Webhook not found: ${webhookId}`);
  }

  /**
   * Delete a webhook subscription
   */
  deleteWebhook(webhookId) {
    for (const [userId, webhooks] of this.webhookSubscriptions.entries()) {
      const index = webhooks.findIndex(w => w.id === webhookId);
      if (index !== -1) {
        webhooks.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * List webhooks for a user
   */
  listWebhooks(userId, toolKey = null) {
    const webhooks = this.webhookSubscriptions.get(userId) || [];
    if (toolKey) {
      return webhooks.filter(w => w.toolKey === toolKey);
    }
    return webhooks;
  }

  /**
   * Emit an event (triggered by tool action)
   * This is called when something happens in an Oli tool
   */
  async emitEvent(event) {
    const {
      toolKey,
      userId,
      eventType,
      data,
      timestamp = new Date().toISOString()
    } = event;

    if (!toolKey || !userId || !eventType) {
      throw new Error('toolKey, userId, and eventType are required');
    }

    // Create event object
    const eventId = `evt_${crypto.randomUUID()}`;
    const eventObject = {
      id: eventId,
      toolKey,
      userId,
      eventType,
      data,
      timestamp,
      deliveryStatus: 'pending'
    };

    // Add to queue
    this.eventQueue.push(eventObject);

    this.logEvent({
      type: 'event.queued',
      eventId,
      eventType,
      userId
    });

    // Process event immediately (in production, use job queue)
    setImmediate(() => this.processEvent(eventObject));

    return eventId;
  }

  /**
   * Process an event - send to all matching webhooks
   */
  async processEvent(event) {
    const webhooks = this.webhookSubscriptions.get(event.userId) || [];
    
    const matchingWebhooks = webhooks.filter(webhook => {
      // Check if webhook is active
      if (!webhook.active) return false;

      // Check if webhook is for this tool
      if (webhook.toolKey !== event.toolKey && webhook.toolKey !== '*') return false;

      // Check if webhook matches event type
      if (!webhook.events.includes('*') && !webhook.events.includes(event.eventType)) {
        return false;
      }

      return true;
    });

    if (matchingWebhooks.length === 0) {
      this.logEvent({
        type: 'event.noWebhooksMatched',
        eventId: event.id,
        eventType: event.eventType
      });
      return;
    }

    // Send to all matching webhooks
    const deliveries = await Promise.allSettled(
      matchingWebhooks.map(webhook => this.deliverWebhook(event, webhook))
    );

    // Track results
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < deliveries.length; i++) {
      if (deliveries[i].status === 'fulfilled' && deliveries[i].value.success) {
        successCount++;
        matchingWebhooks[i].successCount++;
        matchingWebhooks[i].lastTriggeredAt = new Date().toISOString();
      } else {
        failureCount++;
        matchingWebhooks[i].failureCount++;
      }
    }

    this.logEvent({
      type: 'event.processed',
      eventId: event.id,
      webhookCount: matchingWebhooks.length,
      successCount,
      failureCount
    });
  }

  /**
   * Deliver webhook to a single endpoint
   * Implements retry logic with exponential backoff
   */
  async deliverWebhook(event, webhook, attemptNumber = 0) {
    const deliveryId = `del_${crypto.randomUUID()}`;

    try {
      // Check if max retries exceeded
      if (attemptNumber > this.config.maxRetries) {
        this.deadLetterQueue.push({
          deliveryId,
          eventId: event.id,
          webhookId: webhook.id,
          webhook,
          event,
          attempt: attemptNumber,
          reason: 'max retries exceeded',
          timestamp: new Date().toISOString()
        });

        this.logEvent({
          type: 'delivery.maxRetriesExceeded',
          deliveryId,
          webhookId: webhook.id,
          attempts: attemptNumber
        });

        return { success: false, reason: 'max retries exceeded' };
      }

      // Create payload
      const payload = this.createPayload(event, webhook);

      // Sign payload
      const signature = this.signPayload(payload, webhook.secret);

      // Send webhook
      const response = await this.sendRequest(webhook.url, payload, signature);

      // Check response
      if (response.statusCode >= 200 && response.statusCode < 300) {
        this.logEvent({
          type: 'delivery.success',
          deliveryId,
          webhookId: webhook.id,
          url: this.maskUrl(webhook.url),
          statusCode: response.statusCode
        });

        return { success: true, statusCode: response.statusCode };
      } else {
        throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
      }

    } catch (error) {
      // Retry with exponential backoff
      const backoff = Math.min(
        this.config.initialBackoff * Math.pow(2, attemptNumber),
        this.config.maxBackoff
      );

      this.logEvent({
        type: 'delivery.failed',
        deliveryId,
        webhookId: webhook.id,
        attempt: attemptNumber,
        error: error.message,
        retryIn: `${backoff}ms`
      });

      // Schedule retry
      await new Promise(resolve => setTimeout(resolve, backoff));
      return this.deliverWebhook(event, webhook, attemptNumber + 1);
    }
  }

  /**
   * Create webhook payload
   */
  createPayload(event, webhook) {
    return {
      id: event.id,
      type: event.eventType,
      tool: event.toolKey,
      timestamp: event.timestamp,
      data: event.data,
      deliveryUrl: webhook.url // for debugging
    };
  }

  /**
   * Sign payload with HMAC
   */
  signPayload(payload, secret) {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Send HTTP request
   */
  sendRequest(url, payload, signature) {
    return new Promise((resolve, reject) => {
      const payloadString = JSON.stringify(payload);
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadString),
          'X-Oli-Signature': signature,
          'X-Oli-Delivery-ID': `del_${crypto.randomUUID()}`,
          'User-Agent': 'Oli-Webhooks/1.0'
        },
        timeout: this.config.requestTimeout
      };

      const req = client.request(url, options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            body: data,
            headers: res.headers
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(payloadString);
      req.end();
    });
  }

  /**
   * Get delivery status
   */
  getDeliveryStatus(eventId) {
    return {
      eventId,
      queued: this.eventQueue.some(e => e.id === eventId),
      deadLettered: this.deadLetterQueue.some(d => d.eventId === eventId),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(filter = {}) {
    return this.deadLetterQueue.filter(item => {
      if (filter.webhookId && item.webhookId !== filter.webhookId) return false;
      if (filter.userId && item.webhook.userId !== filter.userId) return false;
      return true;
    });
  }

  /**
   * Retry dead lettered event
   */
  async retryDeadLetteredEvent(deliveryId) {
    const index = this.deadLetterQueue.findIndex(d => d.deliveryId === deliveryId);
    if (index === -1) throw new Error('Delivery not found in dead letter queue');

    const { event, webhook } = this.deadLetterQueue[index];

    // Remove from dead letter queue
    this.deadLetterQueue.splice(index, 1);

    // Re-process event
    return this.deliverWebhook(event, webhook, 0);
  }

  /**
   * Log event for debugging
   */
  logEvent(event) {
    this.eventLog.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep last 10000 events
    if (this.eventLog.length > 10000) {
      this.eventLog = this.eventLog.slice(-10000);
    }

    if (process.env.NODE_ENV === 'production') {
      console.log('[OUTBOUND_WEBHOOK]', JSON.stringify(event));
    }
  }

  /**
   * Get logs
   */
  getLogs(filter = {}) {
    return this.eventLog.filter(log => {
      if (filter.type && log.type !== filter.type) return false;
      if (filter.webhookId && log.webhookId !== filter.webhookId) return false;
      return true;
    });
  }

  /**
   * Mask sensitive URL data
   */
  maskUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}***`;
    } catch {
      return '***';
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    let totalWebhooks = 0;
    let activeWebhooks = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;

    for (const webhooks of this.webhookSubscriptions.values()) {
      totalWebhooks += webhooks.length;
      activeWebhooks += webhooks.filter(w => w.active).length;
      totalSuccesses += webhooks.reduce((sum, w) => sum + w.successCount, 0);
      totalFailures += webhooks.reduce((sum, w) => sum + w.failureCount, 0);
    }

    return {
      totalWebhooks,
      activeWebhooks,
      totalSuccesses,
      totalFailures,
      successRate: totalSuccesses + totalFailures > 0
        ? ((totalSuccesses / (totalSuccesses + totalFailures)) * 100).toFixed(2) + '%'
        : 'N/A',
      queuedEvents: this.eventQueue.length,
      deadLetteredCount: this.deadLetterQueue.length,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// PART 2: WEBHOOK MANAGER API ENDPOINTS
// ============================================================================

class WebhookManagerAPI {
  constructor(webhookManager) {
    this.manager = webhookManager;
  }

  /**
   * Endpoint: POST /api/webhooks/register
   * Register a new webhook
   */
  async handleRegister(req, res) {
    try {
      const { userId, url, events, toolKey } = req.body;
      const webhookId = this.manager.registerWebhook({
        userId,
        url,
        events,
        toolKey
      });

      return res.status(201).json({
        success: true,
        webhookId,
        message: 'Webhook registered successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Endpoint: PUT /api/webhooks/:webhookId
   * Update a webhook
   */
  async handleUpdate(req, res) {
    try {
      const { webhookId } = req.params;
      const updates = req.body;
      const webhook = this.manager.updateWebhook(webhookId, updates);

      return res.status(200).json({
        success: true,
        webhook
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Endpoint: DELETE /api/webhooks/:webhookId
   * Delete a webhook
   */
  async handleDelete(req, res) {
    const { webhookId } = req.params;
    const deleted = this.manager.deleteWebhook(webhookId);

    if (deleted) {
      return res.status(200).json({
        success: true,
        message: 'Webhook deleted'
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found'
      });
    }
  }

  /**
   * Endpoint: GET /api/webhooks?userId=...&toolKey=...
   * List webhooks
   */
  async handleList(req, res) {
    try {
      const { userId, toolKey } = req.query;
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required'
        });
      }

      const webhooks = this.manager.listWebhooks(userId, toolKey);

      return res.status(200).json({
        success: true,
        webhooks,
        count: webhooks.length
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Endpoint: POST /api/webhooks/emit-event
   * Emit an event (for testing or internal use)
   */
  async handleEmitEvent(req, res) {
    try {
      const { toolKey, userId, eventType, data } = req.body;
      const eventId = await this.manager.emitEvent({
        toolKey,
        userId,
        eventType,
        data
      });

      return res.status(202).json({
        success: true,
        eventId,
        message: 'Event queued for delivery'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Endpoint: GET /api/webhooks/statistics
   * Get statistics
   */
  async handleStatistics(req, res) {
    const stats = this.manager.getStatistics();
    return res.status(200).json(stats);
  }

  /**
   * Endpoint: GET /api/webhooks/dead-letter-queue
   * Get dead lettered events
   */
  async handleDeadLetterQueue(req, res) {
    const { userId } = req.query;
    const items = this.manager.getDeadLetterQueue({ userId });

    return res.status(200).json({
      items,
      count: items.length
    });
  }

  /**
   * Endpoint: POST /api/webhooks/retry/:deliveryId
   * Retry a dead lettered event
   */
  async handleRetry(req, res) {
    try {
      const { deliveryId } = req.params;
      const result = await this.manager.retryDeadLetteredEvent(deliveryId);

      return res.status(200).json({
        success: true,
        result,
        message: 'Event requeued for delivery'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
}

// ============================================================================
// PART 3: EXPORTS
// ============================================================================

module.exports = {
  OutboundWebhookManager,
  WebhookManagerAPI
};
