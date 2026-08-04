/**
 * lib/ghl-bridge.js
 * ==================
 * Bi-directional sync with GoHighLevel (GHL).
 *
 * Fixes vs. integration-layer-06-ghl-bridge.js:
 *  - Native fetch() does not support a `timeout` option (the original code
 *    passed `timeout: 30000` into fetch() calls, which fetch silently
 *    ignores - there was no actual timeout). Replaced with AbortController.
 *  - GHL's real API base is `https://services.leadconnectorhq.com` with an
 *    API version header, not `https://api.gohighlevel.com/v1`. Updated to
 *    match GHL's current (2024+) API surface. Verify against GHL's docs
 *    for your app type (agency vs sub-account) before going live.
 *  - Connections and sync stats persist via lib/store.js.
 *  - GHL webhook events now actually call outboundManager.emitEvent(...)
 *    so a GHL contact/opportunity change can trigger a customer's Zapier/
 *    Make/n8n webhook, and inbound Oli tool actions can push to GHL.
 */

const crypto = require('crypto');
const store = require('./store');

const GHL_API_BASE = process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = process.env.GHL_API_VERSION || '2021-07-28';

class GHLClient {
  constructor(accessToken, locationId) {
    this.accessToken = accessToken;
    this.locationId = locationId;
  }

  async request(method, path, body = null, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${GHL_API_BASE}${path}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Version': GHL_API_VERSION
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const text = await res.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      if (!res.ok) throw new Error(`GHL API ${method} ${path} -> ${res.status}: ${json.message || text.slice(0, 200)}`);
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  getContact(contactId) { return this.request('GET', `/contacts/${contactId}`); }
  listContacts(filter = {}) {
    const params = new URLSearchParams({ locationId: this.locationId, limit: filter.limit || 100, ...(filter.startAfterId ? { startAfterId: filter.startAfterId } : {}) });
    return this.request('GET', `/contacts/?${params.toString()}`);
  }
  createContact(data) {
    return this.request('POST', '/contacts/', {
      locationId: this.locationId,
      firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone,
      address1: data.address, city: data.city, state: data.state, postalCode: data.postalCode, country: data.country,
      customFields: data.customFields || []
    });
  }
  updateContact(contactId, updates) { return this.request('PUT', `/contacts/${contactId}`, updates); }

  createOpportunity(data) {
    return this.request('POST', '/opportunities/', {
      pipelineId: data.pipelineId, locationId: this.locationId, contactId: data.contactId,
      name: data.name, monetaryValue: data.value, status: data.status || 'open'
    });
  }
  updateOpportunity(opportunityId, updates) { return this.request('PUT', `/opportunities/${opportunityId}`, updates); }
  searchOpportunities(query) {
    const params = new URLSearchParams({ location_id: this.locationId, ...query });
    return this.request('GET', `/opportunities/search?${params.toString()}`);
  }
}

class OliGHLSyncManager {
  constructor(outboundManager, config = {}) {
    this.outbound = outboundManager;
    this.config = { batchSize: config.batchSize || 100, ...config };
  }

  registerConnection(userId, ghlAccessToken, ghlLocationId, oliToolKey) {
    const connection = { userId, ghlAccessToken, ghlLocationId, oliToolKey, syncEnabled: true, createdAt: new Date().toISOString(), lastSyncAt: null };
    store.update('ghlConnections', (conns) => { conns[userId] = connection; });
    return connection;
  }

  getConnection(userId) {
    return store.get('ghlConnections')[userId] || null;
  }

  transformGHLContactToOli(ghlContact) {
    const name = `${ghlContact.firstName || ''} ${ghlContact.lastName || ''}`.trim() || 'Unknown';
    return {
      name, phone: ghlContact.phone || null, email: ghlContact.email || null,
      location: ghlContact.address1 || [ghlContact.city, ghlContact.state].filter(Boolean).join(', '),
      status: 'new', source: 'ghl', ghlContactId: ghlContact.id
    };
  }

  mapOliStatusToGHL(oliStatus) {
    return { new: 'open', contacted: 'qualified', converted: 'won', lost: 'lost' }[oliStatus] || 'open';
  }

  /** GHL -> Oli: pull contacts and emit lead.created events for anyone subscribed. */
  async syncContactsFromGHL(userId) {
    const connection = this.getConnection(userId);
    if (!connection) throw new Error(`No GHL connection registered for user ${userId}`);

    const client = new GHLClient(connection.ghlAccessToken, connection.ghlLocationId);
    let all = [];
    let startAfterId;
    do {
      const page = await client.listContacts({ limit: this.config.batchSize, startAfterId });
      const contacts = page.contacts || [];
      all = all.concat(contacts);
      startAfterId = contacts.length === this.config.batchSize ? contacts[contacts.length - 1].id : null;
    } while (startAfterId);

    let success = 0, failure = 0;
    for (const contact of all) {
      try {
        const oliLead = this.transformGHLContactToOli(contact);
        this.outbound.emitEvent({ toolKey: 'oli-locator', userId, eventType: 'lead.created', data: oliLead });
        success++;
      } catch (err) {
        failure++;
      }
    }

    store.update('ghlConnections', (conns) => { if (conns[userId]) conns[userId].lastSyncAt = new Date().toISOString(); });
    return { contactsProcessed: all.length, success, failure };
  }

  /** Oli -> GHL: push a lead created in Oli-Locator into GHL as a contact + opportunity. */
  async syncLeadToGHL(userId, oliLead, pipelineId) {
    const connection = this.getConnection(userId);
    if (!connection) throw new Error(`No GHL connection registered for user ${userId}`);
    const client = new GHLClient(connection.ghlAccessToken, connection.ghlLocationId);

    const contactResult = await client.createContact({
      firstName: (oliLead.name || 'Unknown').split(' ')[0],
      lastName: (oliLead.name || '').split(' ').slice(1).join(' '),
      email: oliLead.email, phone: oliLead.phone, address: oliLead.location,
      customFields: [{ key: 'oli_lead_id', field_value: oliLead.id }]
    });
    const contact = contactResult.contact || contactResult;

    const opportunity = await client.createOpportunity({
      pipelineId, contactId: contact.id,
      name: `${oliLead.name || 'Lead'} - ${oliLead.service || 'general'}`,
      value: oliLead.budget || 0,
      status: this.mapOliStatusToGHL(oliLead.status)
    });

    return { contact, opportunity };
  }

  /** Called from the GHL webhook receiver. Emits corresponding Oli outbound events. */
  handleGHLWebhook(userId, eventType, eventData) {
    switch (eventType) {
      case 'ContactCreate':
      case 'ContactUpdate': {
        const oliLead = this.transformGHLContactToOli(eventData);
        this.outbound.emitEvent({ toolKey: 'oli-locator', userId, eventType: 'lead.created', data: oliLead });
        return oliLead;
      }
      case 'OpportunityStatusUpdate':
        if (eventData.status === 'won') {
          const sale = { ghlOpportunityId: eventData.id, amount: eventData.monetaryValue, customerId: eventData.contactId };
          this.outbound.emitEvent({ toolKey: 'olisalestrack', userId, eventType: 'sale.recorded', data: sale });
          return sale;
        }
        return null;
      default:
        return null;
    }
  }
}

function verifyGHLSignature(rawBody, signatureHeader) {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signatureHeader || '');
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

module.exports = { GHLClient, OliGHLSyncManager, verifyGHLSignature };
