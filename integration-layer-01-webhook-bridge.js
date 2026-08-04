/**
 * Oli Universal Webhook Bridge Handler
 * ====================================
 * 
 * Unified webhook receiver for all 6 Oli tools
 * Compatible with: Zapier, Make.com, n8n, GHL, and any webhook-capable service
 * 
 * Usage:
 * POST /api/webhooks/v1/{toolKey}/{action}
 * Authorization: Bearer {apiToken}
 * 
 * Deployment:
 * - Vercel Serverless Function: /api/webhooks.js
 * - Express Middleware: app.post('/api/webhooks/v1/:toolKey/:action', handler)
 * - AWS Lambda: export.handler = async (event) => webhookHandler(...)
 */

const crypto = require('crypto');

// ============================================================================
// PART 1: WEBHOOK BRIDGE HANDLER (Main Entry Point)
// ============================================================================

class OliWebhookBridge {
  constructor(config = {}) {
    this.config = {
      apiSecret: process.env.OLI_API_SECRET || 'dev-secret-change-in-prod',
      webhookSecret: process.env.OLI_WEBHOOK_SECRET || 'dev-webhook-secret',
      maxPayloadSize: 10 * 1024 * 1024, // 10MB
      requestTimeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryBackoff: 1000, // ms
      ...config
    };

    this.toolHandlers = {
      'oliops': new OliOpsHandler(),
      'olicommerce': new OliCommerceHandler(),
      'oliflow': new OliFlowHandler(),
      'oliexplore': new OliExploreHandler(),
      'oli-locator': new OliLocatorHandler(),
      'olisalestrack': new OliSalesTrackHandler()
    };

    this.eventLog = [];
  }

  /**
   * Main handler - receives webhook from Zapier/Make/n8n/GHL
   * 
   * @param {Object} req - HTTP request object
   * @param {Object} res - HTTP response object
   * @returns {Promise<void>}
   */
  async handleWebhook(req, res) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Step 1: Validate request
      const validation = this.validateRequest(req);
      if (!validation.valid) {
        return res.status(validation.status).json({
          error: validation.error,
          requestId,
          timestamp: new Date().toISOString()
        });
      }

      // Step 2: Parse webhook data
      const { toolKey, action, source } = validation;
      const payload = req.body;

      // Step 3: Route to tool-specific handler
      const handler = this.toolHandlers[toolKey];
      if (!handler) {
        return res.status(400).json({
          error: `Unknown tool: ${toolKey}`,
          available: Object.keys(this.toolHandlers),
          requestId
        });
      }

      // Step 4: Execute action
      const result = await handler.execute(action, payload, {
        source,
        authorization: req.headers.authorization,
        userAgent: req.headers['user-agent'],
        requestId
      });

      // Step 5: Log event for debugging
      this.logEvent({
        requestId,
        toolKey,
        action,
        source,
        status: 'success',
        duration: Date.now() - startTime,
        resultSummary: this.summarizeResult(result)
      });

      // Step 6: Return success
      return res.status(200).json({
        success: true,
        requestId,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // Error handling
      console.error(`[${requestId}] Webhook error:`, error);

      this.logEvent({
        requestId,
        status: 'error',
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      });

      return res.status(500).json({
        error: error.message,
        requestId,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Validate incoming webhook request
   */
  validateRequest(req) {
    // Step 1: Check method
    if (req.method !== 'POST') {
      return { valid: false, status: 405, error: 'Method not allowed. Use POST.' };
    }

    // Step 2: Parse URL params
    const { toolKey, action } = req.params;
    if (!toolKey || !action) {
      return { valid: false, status: 400, error: 'Missing toolKey or action in URL' };
    }

    // Step 3: Validate tool key
    if (!this.toolHandlers[toolKey]) {
      return { valid: false, status: 400, error: `Unknown tool: ${toolKey}` };
    }

    // Step 4: Check authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { valid: false, status: 401, error: 'Missing or invalid Authorization header' };
    }

    const token = authHeader.slice(7);
    if (!this.validateToken(token)) {
      return { valid: false, status: 401, error: 'Invalid or expired token' };
    }

    // Step 5: Check content-type
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return { valid: false, status: 400, error: 'Content-Type must be application/json' };
    }

    // Step 6: Check payload size
    if (JSON.stringify(req.body).length > this.config.maxPayloadSize) {
      return { valid: false, status: 413, error: 'Payload too large' };
    }

    // Step 7: Detect source (Zapier, Make, n8n, GHL, etc)
    const source = this.detectSource(req);

    return {
      valid: true,
      toolKey,
      action,
      source
    };
  }

  /**
   * Validate API token
   * Format: {base64url(email.iat.exp)}.{hmac_sha256}
   */
  validateToken(token) {
    try {
      const [payload, signature] = token.split('.');
      if (!payload || !signature) return false;

      const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
      const [email, iat, exp] = decoded.split('|');

      // Check expiration
      if (parseInt(exp) < Date.now()) return false;

      // Verify signature
      const expectedSig = crypto
        .createHmac('sha256', this.config.apiSecret)
        .update(payload)
        .digest('base64url');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSig)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect source of webhook (Zapier, Make, n8n, GHL, etc)
   */
  detectSource(req) {
    const userAgent = req.headers['user-agent'] || '';
    const xSource = req.headers['x-source'];

    if (userAgent.includes('Zapier')) return 'zapier';
    if (userAgent.includes('Make')) return 'make';
    if (userAgent.includes('n8n')) return 'n8n';
    if (userAgent.includes('GoHighLevel') || xSource === 'ghl') return 'ghl';
    
    return 'unknown';
  }

  /**
   * Log event for debugging/auditing
   */
  logEvent(event) {
    this.eventLog.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep last 1000 events in memory
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-1000);
    }

    // In production, also log to external service (Datadog, Sentry, etc)
    if (process.env.NODE_ENV === 'production') {
      console.log('[WEBHOOK]', JSON.stringify(event));
    }
  }

  /**
   * Summarize result for logging
   */
  summarizeResult(result) {
    if (!result) return null;
    if (typeof result === 'string') return result.slice(0, 100);
    if (Array.isArray(result)) return `Array(${result.length})`;
    if (typeof result === 'object') {
      const keys = Object.keys(result).slice(0, 5);
      return `{${keys.join(',')}}`;
    }
    return String(result).slice(0, 100);
  }

  /**
   * Get event logs (for debugging)
   */
  getLogs(filter = {}) {
    return this.eventLog.filter(event => {
      if (filter.status && event.status !== filter.status) return false;
      if (filter.toolKey && event.toolKey !== filter.toolKey) return false;
      if (filter.source && event.source !== filter.source) return false;
      return true;
    });
  }
}

// ============================================================================
// PART 2: TOOL-SPECIFIC HANDLERS
// ============================================================================

/**
 * Base handler class - all tools inherit from this
 */
class ToolHandler {
  async execute(action, payload, context) {
    const method = this[`action_${action}`];
    if (!method) {
      throw new Error(`Unknown action: ${action}`);
    }
    return await method.call(this, payload, context);
  }
}

/**
 * OliOps Handler
 */
class OliOpsHandler extends ToolHandler {
  async action_create_contact(payload, context) {
    const { email, name, phone, tags } = payload;
    if (!email) throw new Error('email is required');

    return {
      action: 'create_contact',
      contact: {
        id: crypto.randomUUID(),
        email,
        name: name || 'Unknown',
        phone: phone || null,
        tags: tags || [],
        createdAt: new Date().toISOString(),
        source: context.source
      },
      message: `Contact created: ${email}`
    };
  }

  async action_create_task(payload, context) {
    const { title, description, dueDate, assignee } = payload;
    if (!title) throw new Error('title is required');

    return {
      action: 'create_task',
      task: {
        id: crypto.randomUUID(),
        title,
        description: description || null,
        dueDate: dueDate || null,
        assignee: assignee || null,
        status: 'open',
        createdAt: new Date().toISOString(),
        source: context.source
      },
      message: `Task created: ${title}`
    };
  }

  async action_send_email(payload, context) {
    const { to, subject, body, from } = payload;
    if (!to || !subject || !body) throw new Error('to, subject, and body are required');

    return {
      action: 'send_email',
      email: {
        id: crypto.randomUUID(),
        to,
        from: from || 'noreply@oli.tools',
        subject,
        bodyPreview: body.slice(0, 100),
        sentAt: new Date().toISOString(),
        status: 'sent',
        source: context.source
      },
      message: `Email sent to ${to}`
    };
  }

  async action_update_contact(payload, context) {
    const { contactId, ...updates } = payload;
    if (!contactId) throw new Error('contactId is required');

    return {
      action: 'update_contact',
      contact: {
        id: contactId,
        ...updates,
        updatedAt: new Date().toISOString(),
        source: context.source
      },
      message: `Contact updated: ${contactId}`
    };
  }

  async action_log_event(payload, context) {
    const { eventType, eventData } = payload;
    if (!eventType) throw new Error('eventType is required');

    return {
      action: 'log_event',
      event: {
        id: crypto.randomUUID(),
        type: eventType,
        data: eventData || {},
        timestamp: new Date().toISOString(),
        source: context.source
      },
      message: `Event logged: ${eventType}`
    };
  }
}

/**
 * OliCommerce Handler
 */
class OliCommerceHandler extends ToolHandler {
  async action_create_contact(payload, context) {
    const { email, phone, name } = payload;
    if (!email && !phone) throw new Error('email or phone is required');

    return {
      action: 'create_contact',
      contact: {
        id: crypto.randomUUID(),
        email: email || null,
        phone: phone || null,
        name: name || 'Unknown',
        createdAt: new Date().toISOString(),
        source: context.source
      },
      message: `Customer contact created`
    };
  }

  async action_record_cart_recovery(payload, context) {
    const { cartId, email, cartValue, items } = payload;
    if (!cartId || !email) throw new Error('cartId and email are required');

    return {
      action: 'record_cart_recovery',
      recovery: {
        id: crypto.randomUUID(),
        cartId,
        email,
        cartValue: cartValue || 0,
        itemCount: items ? items.length : 0,
        status: 'initiated',
        timestamp: new Date().toISOString(),
        source: context.source
      },
      message: `Cart recovery initiated for ${email}`
    };
  }

  async action_sync_store(payload, context) {
    const { storeId, storeData } = payload;
    if (!storeId) throw new Error('storeId is required');

    return {
      action: 'sync_store',
      store: {
        id: storeId,
        syncedAt: new Date().toISOString(),
        recordsProcessed: storeData ? Object.keys(storeData).length : 0,
        source: context.source
      },
      message: `Store synced: ${storeId}`
    };
  }
}

/**
 * OliFlow Handler
 */
class OliFlowHandler extends ToolHandler {
  async action_trigger_workflow(payload, context) {
    const { workflowId, triggerData } = payload;
    if (!workflowId) throw new Error('workflowId is required');

    return {
      action: 'trigger_workflow',
      execution: {
        id: crypto.randomUUID(),
        workflowId,
        status: 'queued',
        triggerSource: context.source,
        queuedAt: new Date().toISOString(),
        estimatedStart: new Date(Date.now() + 1000).toISOString()
      },
      message: `Workflow ${workflowId} queued for execution`
    };
  }

  async action_create_workflow(payload, context) {
    const { name, trigger, actions } = payload;
    if (!name || !trigger) throw new Error('name and trigger are required');

    return {
      action: 'create_workflow',
      workflow: {
        id: crypto.randomUUID(),
        name,
        trigger,
        actionCount: actions ? actions.length : 0,
        status: 'draft',
        createdAt: new Date().toISOString(),
        source: context.source
      },
      message: `Workflow created: ${name}`
    };
  }

  async action_get_workflow_history(payload, context) {
    const { workflowId, limit = 50 } = payload;
    if (!workflowId) throw new Error('workflowId is required');

    return {
      action: 'get_workflow_history',
      history: {
        workflowId,
        executions: [],
        totalCount: 0,
        limit,
        source: context.source
      },
      message: `History retrieved for workflow ${workflowId}`
    };
  }
}

/**
 * OliExplore Handler
 */
class OliExploreHandler extends ToolHandler {
  async action_publish_post(payload, context) {
    const { platforms, content, hashtags, mediaUrl } = payload;
    if (!platforms || platforms.length === 0) throw new Error('platforms array is required');
    if (!content) throw new Error('content is required');

    return {
      action: 'publish_post',
      post: {
        id: crypto.randomUUID(),
        platforms,
        content: content.slice(0, 100) + '...',
        hashtags: hashtags || [],
        mediaUrl: mediaUrl || null,
        status: 'publishing',
        publishedAt: new Date().toISOString(),
        source: context.source
      },
      message: `Post queued for publishing to ${platforms.join(', ')}`
    };
  }

  async action_fetch_posts(payload, context) {
    const { platform, limit = 10 } = payload;
    if (!platform) throw new Error('platform is required');

    return {
      action: 'fetch_posts',
      posts: {
        platform,
        posts: [],
        count: 0,
        limit,
        source: context.source
      },
      message: `Posts fetched from ${platform}`
    };
  }

  async action_schedule_post(payload, context) {
    const { platforms, content, scheduledAt } = payload;
    if (!platforms || !content || !scheduledAt) throw new Error('platforms, content, and scheduledAt are required');

    return {
      action: 'schedule_post',
      scheduled: {
        id: crypto.randomUUID(),
        platforms,
        contentPreview: content.slice(0, 50),
        scheduledAt,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        source: context.source
      },
      message: `Post scheduled for ${new Date(scheduledAt).toLocaleString()}`
    };
  }
}

/**
 * Oli-Locator Handler
 */
class OliLocatorHandler extends ToolHandler {
  async action_create_lead(payload, context) {
    const { name, phone, email, location, service } = payload;
    if (!name || !phone) throw new Error('name and phone are required');

    return {
      action: 'create_lead',
      lead: {
        id: crypto.randomUUID(),
        name,
        phone,
        email: email || null,
        location: location || null,
        service: service || 'general',
        status: 'new',
        createdAt: new Date().toISOString(),
        source: context.source
      },
      message: `Lead created: ${name}`
    };
  }

  async action_update_lead(payload, context) {
    const { leadId, ...updates } = payload;
    if (!leadId) throw new Error('leadId is required');

    return {
      action: 'update_lead',
      lead: {
        id: leadId,
        ...updates,
        updatedAt: new Date().toISOString(),
        source: context.source
      },
      message: `Lead updated: ${leadId}`
    };
  }

  async action_assign_lead(payload, context) {
    const { leadId, agentId } = payload;
    if (!leadId || !agentId) throw new Error('leadId and agentId are required');

    return {
      action: 'assign_lead',
      assignment: {
        id: crypto.randomUUID(),
        leadId,
        agentId,
        assignedAt: new Date().toISOString(),
        status: 'assigned',
        source: context.source
      },
      message: `Lead assigned to agent ${agentId}`
    };
  }

  async action_get_leads(payload, context) {
    const { status = 'all', limit = 50 } = payload;

    return {
      action: 'get_leads',
      leads: {
        status,
        leads: [],
        count: 0,
        limit,
        source: context.source
      },
      message: `Retrieved ${limit} leads with status: ${status}`
    };
  }
}

/**
 * OliSalesTrack Handler
 */
class OliSalesTrackHandler extends ToolHandler {
  async action_record_sale(payload, context) {
    const { amount, productId, customerId, currency = 'USD' } = payload;
    if (!amount || !productId) throw new Error('amount and productId are required');

    return {
      action: 'record_sale',
      sale: {
        id: crypto.randomUUID(),
        amount,
        currency,
        productId,
        customerId: customerId || null,
        status: 'recorded',
        timestamp: new Date().toISOString(),
        source: context.source
      },
      message: `Sale recorded: $${amount} ${currency}`
    };
  }

  async action_record_refund(payload, context) {
    const { saleId, amount, reason } = payload;
    if (!saleId || !amount) throw new Error('saleId and amount are required');

    return {
      action: 'record_refund',
      refund: {
        id: crypto.randomUUID(),
        saleId,
        amount,
        reason: reason || 'unspecified',
        status: 'recorded',
        timestamp: new Date().toISOString(),
        source: context.source
      },
      message: `Refund recorded: $${amount}`
    };
  }

  async action_get_revenue_report(payload, context) {
    const { startDate, endDate, groupBy = 'day' } = payload;

    return {
      action: 'get_revenue_report',
      report: {
        startDate,
        endDate,
        groupBy,
        totalRevenue: 0,
        totalRefunds: 0,
        netRevenue: 0,
        transactionCount: 0,
        source: context.source
      },
      message: `Revenue report generated from ${startDate} to ${endDate}`
    };
  }
}

// ============================================================================
// PART 3: VERCEL SERVERLESS FUNCTION EXPORT
// ============================================================================

const bridge = new OliWebhookBridge();

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET' && req.url === '/api/webhooks/health') {
    return res.status(200).json({
      status: 'healthy',
      tools: Object.keys(bridge.toolHandlers),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }

  // Logs endpoint (debugging)
  if (req.method === 'GET' && req.url.startsWith('/api/webhooks/logs')) {
    const filter = {};
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.searchParams.get('status')) filter.status = url.searchParams.get('status');
    if (url.searchParams.get('tool')) filter.toolKey = url.searchParams.get('tool');

    return res.status(200).json({
      logs: bridge.getLogs(filter),
      count: bridge.getLogs(filter).length,
      timestamp: new Date().toISOString()
    });
  }

  // Main webhook handler
  if (req.method === 'POST' && req.url.startsWith('/api/webhooks/v1/')) {
    return bridge.handleWebhook(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
};

// ============================================================================
// PART 4: EXPRESS MIDDLEWARE EXPORT (for local testing)
// ============================================================================

function createWebhookMiddleware(config = {}) {
  const webhookBridge = new OliWebhookBridge(config);

  return async (req, res, next) => {
    // Only handle /api/webhooks/* routes
    if (!req.path.startsWith('/api/webhooks')) {
      return next();
    }

    if (req.method === 'GET' && req.path === '/api/webhooks/health') {
      return res.status(200).json({
        status: 'healthy',
        tools: Object.keys(webhookBridge.toolHandlers)
      });
    }

    if (req.method === 'POST' && req.path.startsWith('/api/webhooks/v1/')) {
      return webhookBridge.handleWebhook(req, res);
    }

    return next();
  };
}

module.exports = { OliWebhookBridge, createWebhookMiddleware };
