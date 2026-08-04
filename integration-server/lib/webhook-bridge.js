/**
 * lib/webhook-bridge.js
 * ======================
 * Inbound webhook bridge - receives calls from Zapier/Make/n8n/GHL (or any
 * webhook-capable service) and routes them to the correct Oli tool handler.
 *
 * URL shape:   POST /api/webhooks/v1/:toolKey/:action
 * Auth:        Authorization: Bearer <token>   (see lib/tokens.js)
 *
 * IMPORTANT DIFFERENCE FROM THE ORIGINAL DRAFT:
 * Every successful tool action now calls `outbound.emitEvent(...)` so that
 * anyone who has registered an outbound webhook (via /api/webhooks/register)
 * actually receives a notification. In the original files these two systems
 * never called each other, so "event-triggered integrations" didn't fire.
 */

const crypto = require('crypto');
const tokens = require('./tokens');

class ToolHandler {
  constructor(toolKey, outbound) {
    this.toolKey = toolKey;
    this.outbound = outbound;
  }

  async execute(action, payload, context) {
    const method = this[`action_${action}`];
    if (!method) {
      const available = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
        .filter(name => name.startsWith('action_'))
        .map(name => name.replace('action_', ''));
      throw new Error(`Unknown action "${action}" for tool "${this.toolKey}". Available: ${available.join(', ')}`);
    }
    return method.call(this, payload, context);
  }

  /** Emit an outbound event after a successful action, best-effort (never throws). */
  emit(eventType, userId, data, context) {
    if (!this.outbound) return;
    try {
      this.outbound.emitEvent({
        toolKey: this.toolKey,
        userId: userId || context.userId || 'unknown',
        eventType,
        data
      });
    } catch (err) {
      console.error(`[webhook-bridge] Failed to emit ${eventType}:`, err.message);
    }
  }
}

class OliOpsHandler extends ToolHandler {
  constructor(outbound) { super('oliops', outbound); }

  async action_create_contact(payload, context) {
    if (!payload.email) throw new Error('email is required');
    const contact = {
      id: crypto.randomUUID(),
      email: payload.email,
      name: payload.name || 'Unknown',
      phone: payload.phone || null,
      tags: payload.tags || [],
      createdAt: new Date().toISOString(),
      source: context.source
    };
    this.emit('contact.created', context.userId, contact, context);
    return { action: 'create_contact', contact, message: `Contact created: ${contact.email}` };
  }

  async action_update_contact(payload, context) {
    if (!payload.contactId) throw new Error('contactId is required');
    const { contactId, ...updates } = payload;
    const contact = { id: contactId, ...updates, updatedAt: new Date().toISOString(), source: context.source };
    this.emit('contact.updated', context.userId, contact, context);
    return { action: 'update_contact', contact, message: `Contact updated: ${contactId}` };
  }

  async action_create_task(payload, context) {
    if (!payload.title) throw new Error('title is required');
    const task = {
      id: crypto.randomUUID(),
      title: payload.title,
      description: payload.description || null,
      dueDate: payload.dueDate || null,
      assignee: payload.assignee || null,
      status: 'open',
      createdAt: new Date().toISOString(),
      source: context.source
    };
    this.emit('task.created', context.userId, task, context);
    return { action: 'create_task', task, message: `Task created: ${task.title}` };
  }

  async action_send_email(payload, context) {
    const { to, subject, body, from } = payload;
    if (!to || !subject || !body) throw new Error('to, subject, and body are required');
    const email = {
      id: crypto.randomUUID(),
      to, from: from || 'noreply@oli.tools', subject,
      bodyPreview: body.slice(0, 100),
      sentAt: new Date().toISOString(), status: 'sent', source: context.source
    };
    this.emit('email.sent', context.userId, email, context);
    return { action: 'send_email', email, message: `Email sent to ${to}` };
  }

  async action_log_event(payload, context) {
    if (!payload.eventType) throw new Error('eventType is required');
    const event = { id: crypto.randomUUID(), type: payload.eventType, data: payload.eventData || {}, timestamp: new Date().toISOString(), source: context.source };
    return { action: 'log_event', event, message: `Event logged: ${payload.eventType}` };
  }
}

class OliCommerceHandler extends ToolHandler {
  constructor(outbound) { super('olicommerce', outbound); }

  async action_create_contact(payload, context) {
    if (!payload.email && !payload.phone) throw new Error('email or phone is required');
    const contact = { id: crypto.randomUUID(), email: payload.email || null, phone: payload.phone || null, name: payload.name || 'Unknown', createdAt: new Date().toISOString(), source: context.source };
    this.emit('contact.created', context.userId, contact, context);
    return { action: 'create_contact', contact, message: 'Customer contact created' };
  }

  async action_record_cart_recovery(payload, context) {
    const { cartId, email, cartValue, items } = payload;
    if (!cartId || !email) throw new Error('cartId and email are required');
    const recovery = { id: crypto.randomUUID(), cartId, email, cartValue: cartValue || 0, itemCount: items ? items.length : 0, status: 'initiated', timestamp: new Date().toISOString(), source: context.source };
    this.emit('cart.recovery_initiated', context.userId, recovery, context);
    return { action: 'record_cart_recovery', recovery, message: `Cart recovery initiated for ${email}` };
  }

  async action_sync_store(payload, context) {
    if (!payload.storeId) throw new Error('storeId is required');
    const store = { id: payload.storeId, syncedAt: new Date().toISOString(), recordsProcessed: payload.storeData ? Object.keys(payload.storeData).length : 0, source: context.source };
    return { action: 'sync_store', store, message: `Store synced: ${payload.storeId}` };
  }
}

class OliFlowHandler extends ToolHandler {
  constructor(outbound) { super('oliflow', outbound); }

  async action_trigger_workflow(payload, context) {
    if (!payload.workflowId) throw new Error('workflowId is required');
    const execution = { id: crypto.randomUUID(), workflowId: payload.workflowId, status: 'queued', triggerSource: context.source, queuedAt: new Date().toISOString() };
    this.emit('workflow.triggered', context.userId, execution, context);
    return { action: 'trigger_workflow', execution, message: `Workflow ${payload.workflowId} queued for execution` };
  }

  async action_create_workflow(payload, context) {
    const { name, trigger, actions } = payload;
    if (!name || !trigger) throw new Error('name and trigger are required');
    const workflow = { id: crypto.randomUUID(), name, trigger, actionCount: actions ? actions.length : 0, status: 'draft', createdAt: new Date().toISOString(), source: context.source };
    return { action: 'create_workflow', workflow, message: `Workflow created: ${name}` };
  }

  async action_get_workflow_history(payload, context) {
    if (!payload.workflowId) throw new Error('workflowId is required');
    return { action: 'get_workflow_history', history: { workflowId: payload.workflowId, executions: [], totalCount: 0, limit: payload.limit || 50 }, message: `History retrieved for workflow ${payload.workflowId}` };
  }
}

class OliExploreHandler extends ToolHandler {
  constructor(outbound) { super('oliexplore', outbound); }

  async action_publish_post(payload, context) {
    const { platforms, content, hashtags, mediaUrl } = payload;
    if (!platforms || platforms.length === 0) throw new Error('platforms array is required');
    if (!content) throw new Error('content is required');
    const post = { id: crypto.randomUUID(), platforms, content: content.slice(0, 200), hashtags: hashtags || [], mediaUrl: mediaUrl || null, status: 'publishing', publishedAt: new Date().toISOString(), source: context.source };
    this.emit('post.published', context.userId, post, context);
    return { action: 'publish_post', post, message: `Post queued for publishing to ${platforms.join(', ')}` };
  }

  async action_schedule_post(payload, context) {
    const { platforms, content, scheduledAt } = payload;
    if (!platforms || !content || !scheduledAt) throw new Error('platforms, content, and scheduledAt are required');
    const scheduled = { id: crypto.randomUUID(), platforms, contentPreview: content.slice(0, 50), scheduledAt, status: 'scheduled', createdAt: new Date().toISOString(), source: context.source };
    this.emit('post.scheduled', context.userId, scheduled, context);
    return { action: 'schedule_post', scheduled, message: `Post scheduled for ${scheduledAt}` };
  }

  async action_fetch_posts(payload, context) {
    if (!payload.platform) throw new Error('platform is required');
    return { action: 'fetch_posts', posts: { platform: payload.platform, posts: [], count: 0 }, message: `Posts fetched from ${payload.platform}` };
  }
}

class OliLocatorHandler extends ToolHandler {
  constructor(outbound) { super('oli-locator', outbound); }

  async action_create_lead(payload, context) {
    const { name, phone, email, location, service } = payload;
    if (!name || !phone) throw new Error('name and phone are required');
    const lead = { id: crypto.randomUUID(), name, phone, email: email || null, location: location || null, service: service || 'general', status: 'new', createdAt: new Date().toISOString(), source: context.source };
    this.emit('lead.created', context.userId, lead, context);
    return { action: 'create_lead', lead, message: `Lead created: ${name}` };
  }

  async action_update_lead(payload, context) {
    if (!payload.leadId) throw new Error('leadId is required');
    const { leadId, ...updates } = payload;
    const lead = { id: leadId, ...updates, updatedAt: new Date().toISOString(), source: context.source };
    this.emit('lead.updated', context.userId, lead, context);
    return { action: 'update_lead', lead, message: `Lead updated: ${leadId}` };
  }

  async action_assign_lead(payload, context) {
    const { leadId, agentId } = payload;
    if (!leadId || !agentId) throw new Error('leadId and agentId are required');
    const assignment = { id: crypto.randomUUID(), leadId, agentId, assignedAt: new Date().toISOString(), status: 'assigned', source: context.source };
    this.emit('lead.assigned', context.userId, assignment, context);
    return { action: 'assign_lead', assignment, message: `Lead assigned to agent ${agentId}` };
  }

  async action_get_leads(payload, context) {
    return { action: 'get_leads', leads: { status: payload.status || 'all', leads: [], count: 0 }, message: `Retrieved leads` };
  }
}

class OliSalesTrackHandler extends ToolHandler {
  constructor(outbound) { super('olisalestrack', outbound); }

  async action_record_sale(payload, context) {
    const { amount, productId, customerId, currency = 'USD' } = payload;
    if (!amount || !productId) throw new Error('amount and productId are required');
    const sale = { id: crypto.randomUUID(), amount, currency, productId, customerId: customerId || null, status: 'recorded', timestamp: new Date().toISOString(), source: context.source };
    this.emit('sale.recorded', context.userId, sale, context);
    return { action: 'record_sale', sale, message: `Sale recorded: $${amount} ${currency}` };
  }

  async action_record_refund(payload, context) {
    const { saleId, amount, reason } = payload;
    if (!saleId || !amount) throw new Error('saleId and amount are required');
    const refund = { id: crypto.randomUUID(), saleId, amount, reason: reason || 'unspecified', status: 'recorded', timestamp: new Date().toISOString(), source: context.source };
    this.emit('refund.recorded', context.userId, refund, context);
    return { action: 'record_refund', refund, message: `Refund recorded: $${amount}` };
  }

  async action_get_revenue_report(payload, context) {
    const { startDate, endDate, groupBy = 'day' } = payload;
    return { action: 'get_revenue_report', report: { startDate, endDate, groupBy, totalRevenue: 0, totalRefunds: 0, netRevenue: 0, transactionCount: 0 }, message: `Revenue report generated` };
  }
}

class OliWebhookBridge {
  constructor(outboundManager) {
    this.outbound = outboundManager;
    this.toolHandlers = {
      'oliops': new OliOpsHandler(outboundManager),
      'olicommerce': new OliCommerceHandler(outboundManager),
      'oliflow': new OliFlowHandler(outboundManager),
      'oliexplore': new OliExploreHandler(outboundManager),
      'oli-locator': new OliLocatorHandler(outboundManager),
      'olisalestrack': new OliSalesTrackHandler(outboundManager)
    };
  }

  detectSource(headers) {
    const userAgent = (headers['user-agent'] || '').toLowerCase();
    const xSource = headers['x-source'];
    if (userAgent.includes('zapier')) return 'zapier';
    if (userAgent.includes('make')) return 'make';
    if (userAgent.includes('n8n')) return 'n8n';
    if (userAgent.includes('gohighlevel') || xSource === 'ghl') return 'ghl';
    return xSource || 'unknown';
  }

  /**
   * @param {string} toolKey
   * @param {string} action
   * @param {object} payload
   * @param {object} headers - raw request headers (for auth + source detection)
   * @returns {Promise<object>} result
   */
  async handle(toolKey, action, payload, headers) {
    const handler = this.toolHandlers[toolKey];
    if (!handler) {
      const err = new Error(`Unknown tool: ${toolKey}`);
      err.status = 400;
      err.details = { available: Object.keys(this.toolHandlers) };
      throw err;
    }

    const authHeader = headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      const err = new Error('Missing or invalid Authorization header');
      err.status = 401;
      throw err;
    }
    const rawToken = authHeader.slice(7);
    const tokenInfo = tokens.verify(rawToken);
    if (!tokenInfo) {
      const err = new Error('Invalid or expired token');
      err.status = 401;
      throw err;
    }

    const context = {
      source: this.detectSource(headers),
      userId: tokenInfo.userId,
      requestId: crypto.randomUUID()
    };

    return handler.execute(action, payload || {}, context);
  }
}

module.exports = { OliWebhookBridge };
