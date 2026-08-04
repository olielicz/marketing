/**
 * Oli ↔ GoHighLevel (GHL) Integration Bridge
 * ===========================================
 * 
 * Bi-directional integration with GoHighLevel
 * 
 * Features:
 * - Auto-sync contacts from GHL to Oli-Locator
 * - Send leads from Oli tools to GHL
 * - Two-way calendar sync
 * - Message routing
 * - Deal/opportunity sync (GHL → Oli)
 */

const crypto = require('crypto');

// ============================================================================
// PART 1: GHL API CLIENT
// ============================================================================

class GHLClient {
  constructor(accessToken, locationId) {
    this.accessToken = accessToken;
    this.locationId = locationId;
    this.baseUrl = 'https://api.gohighlevel.com/v1';
    this.apiVersion = 'v1';
  }

  /**
   * Make authenticated request to GHL API
   */
  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Location-ID': this.locationId
      },
      timeout: 30000
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`GHL API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[GHL] Request failed: ${method} ${path}`, error.message);
      throw error;
    }
  }

  /**
   * Fetch a contact from GHL
   */
  async getContact(contactId) {
    return this.request('GET', `/contacts/${contactId}`);
  }

  /**
   * List all contacts in GHL location
   */
  async listContacts(filter = {}) {
    const params = new URLSearchParams({
      limit: filter.limit || 100,
      skip: filter.skip || 0,
      ...filter
    });
    return this.request('GET', `/contacts?${params.toString()}`);
  }

  /**
   * Create a contact in GHL
   */
  async createContact(contactData) {
    return this.request('POST', '/contacts', {
      firstName: contactData.firstName,
      lastName: contactData.lastName,
      email: contactData.email,
      phone: contactData.phone,
      address: contactData.address,
      city: contactData.city,
      state: contactData.state,
      postalCode: contactData.postalCode,
      country: contactData.country,
      customFields: contactData.customFields || {}
    });
  }

  /**
   * Update a contact in GHL
   */
  async updateContact(contactId, updates) {
    return this.request('PUT', `/contacts/${contactId}`, updates);
  }

  /**
   * Create an opportunity (deal) in GHL
   */
  async createOpportunity(opportunityData) {
    return this.request('POST', '/opportunities', {
      contactId: opportunityData.contactId,
      name: opportunityData.name,
      value: opportunityData.value,
      status: opportunityData.status || 'open',
      description: opportunityData.description,
      customFields: opportunityData.customFields || {}
    });
  }

  /**
   * Update opportunity
   */
  async updateOpportunity(opportunityId, updates) {
    return this.request('PUT', `/opportunities/${opportunityId}`, updates);
  }

  /**
   * Get calendar events
   */
  async getCalendarEvents(filter = {}) {
    const params = new URLSearchParams({
      limit: filter.limit || 50,
      startDate: filter.startDate || new Date().toISOString(),
      ...filter
    });
    return this.request('GET', `/calendar-events?${params.toString()}`);
  }

  /**
   * Create calendar event
   */
  async createCalendarEvent(eventData) {
    return this.request('POST', '/calendar-events', {
      title: eventData.title,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      contactId: eventData.contactId,
      description: eventData.description,
      location: eventData.location
    });
  }

  /**
   * Send SMS via GHL
   */
  async sendSMS(contactId, message) {
    return this.request('POST', '/conversations/sms/send', {
      contactId,
      message
    });
  }

  /**
   * Send email via GHL
   */
  async sendEmail(contactId, emailData) {
    return this.request('POST', '/conversations/email/send', {
      contactId,
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      body: emailData.body
    });
  }
}

// ============================================================================
// PART 2: OLI ↔ GHL SYNC MANAGER
// ============================================================================

class OliGHLSyncManager {
  constructor(config = {}) {
    this.config = {
      syncInterval: config.syncInterval || 300000, // 5 minutes
      batchSize: config.batchSize || 100,
      retryAttempts: config.retryAttempts || 3,
      ...config
    };

    this.syncLog = [];
    this.activeSync = new Map();
    this.fieldMapping = {
      // Oli → GHL field mapping
      'oli_name': 'firstName', // Will be split into first/last
      'oli_email': 'email',
      'oli_phone': 'phone',
      'oli_tags': 'customFields.tags', // Array
      'oli_lead_status': 'status',
      'oli_location': 'address',
      'oli_service_category': 'customFields.serviceCategory'
    };
  }

  /**
   * Register OAuth connection from user
   */
  registerConnection(userId, ghlAccessToken, ghlLocationId, oliToolKey) {
    return {
      userId,
      ghlAccessToken,
      ghlLocationId,
      oliToolKey,
      syncEnabled: true,
      createdAt: new Date().toISOString(),
      lastSyncAt: null,
      nextSyncAt: new Date(Date.now() + this.config.syncInterval).toISOString()
    };
  }

  /**
   * Sync GHL contacts → Oli-Locator
   */
  async syncContactsFromGHL(connection, oliWebhookUrl, oliToken) {
    const syncId = crypto.randomUUID();

    try {
      this.logSync({
        id: syncId,
        direction: 'ghl_to_oli',
        status: 'started',
        timestamp: new Date().toISOString()
      });

      // Initialize GHL client
      const ghlClient = new GHLClient(connection.ghlAccessToken, connection.ghlLocationId);

      // Fetch contacts from GHL
      let allContacts = [];
      let skip = 0;

      while (true) {
        const response = await ghlClient.listContacts({ skip, limit: this.config.batchSize });
        allContacts = allContacts.concat(response.contacts || []);

        if (!response.contacts || response.contacts.length < this.config.batchSize) {
          break;
        }
        skip += this.config.batchSize;
      }

      // Transform and send to Oli-Locator
      let successCount = 0;
      let failureCount = 0;

      for (const contact of allContacts) {
        try {
          // Transform GHL contact to Oli-Locator format
          const oliContact = this.transformGHLContactToOli(contact);

          // Send to Oli-Locator via webhook
          await this.sendToOliWebhook(
            oliWebhookUrl,
            'oli-locator/create_lead',
            oliContact,
            oliToken
          );

          successCount++;
        } catch (error) {
          console.error(`Failed to sync contact ${contact.id}:`, error.message);
          failureCount++;
        }
      }

      this.logSync({
        id: syncId,
        direction: 'ghl_to_oli',
        status: 'completed',
        contactsProcessed: allContacts.length,
        successCount,
        failureCount,
        timestamp: new Date().toISOString()
      });

      return { syncId, successCount, failureCount };

    } catch (error) {
      this.logSync({
        id: syncId,
        direction: 'ghl_to_oli',
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Sync Oli leads → GHL opportunities
   */
  async syncLeadsToGHL(connection, oliLeads, ghlAccessToken) {
    const syncId = crypto.randomUUID();

    try {
      this.logSync({
        id: syncId,
        direction: 'oli_to_ghl',
        status: 'started',
        timestamp: new Date().toISOString()
      });

      const ghlClient = new GHLClient(ghlAccessToken, connection.ghlLocationId);

      let successCount = 0;
      let failureCount = 0;

      for (const oliLead of oliLeads) {
        try {
          // Check if contact exists in GHL
          let ghlContact = await this.findOrCreateGHLContact(
            ghlClient,
            oliLead
          );

          // Create opportunity from Oli lead
          const ghlOpportunity = await ghlClient.createOpportunity({
            contactId: ghlContact.id,
            name: `${oliLead.name} - ${oliLead.service}`,
            value: oliLead.budget || 0,
            status: this.mapOliStatusToGHL(oliLead.status),
            description: `Lead from Oli-Locator: ${oliLead.location}`,
            customFields: {
              source: 'oli',
              oliLeadId: oliLead.id,
              service: oliLead.service
            }
          });

          successCount++;
        } catch (error) {
          console.error(`Failed to sync lead ${oliLead.id}:`, error.message);
          failureCount++;
        }
      }

      this.logSync({
        id: syncId,
        direction: 'oli_to_ghl',
        status: 'completed',
        leadsProcessed: oliLeads.length,
        successCount,
        failureCount,
        timestamp: new Date().toISOString()
      });

      return { syncId, successCount, failureCount };

    } catch (error) {
      this.logSync({
        id: syncId,
        direction: 'oli_to_ghl',
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Transform GHL contact to Oli lead format
   */
  transformGHLContactToOli(ghlContact) {
    const firstName = ghlContact.firstName || '';
    const lastName = ghlContact.lastName || '';
    const name = `${firstName} ${lastName}`.trim() || 'Unknown';

    return {
      name,
      phone: ghlContact.phone || null,
      email: ghlContact.email || null,
      location: ghlContact.address || `${ghlContact.city || ''}, ${ghlContact.state || ''}`.trim(),
      service: ghlContact.customFields?.serviceCategory || 'general',
      status: 'new',
      source: 'ghl',
      ghlContactId: ghlContact.id
    };
  }

  /**
   * Find or create GHL contact from Oli lead
   */
  async findOrCreateGHLContact(ghlClient, oliLead) {
    try {
      // Try to find by email or phone
      if (oliLead.email) {
        const contacts = await ghlClient.listContacts();
        const existing = contacts.contacts?.find(c => c.email === oliLead.email);
        if (existing) return existing;
      }

      // Create new contact
      return await ghlClient.createContact({
        firstName: oliLead.name.split(' ')[0] || 'Unknown',
        lastName: oliLead.name.split(' ').slice(1).join(' ') || '',
        email: oliLead.email,
        phone: oliLead.phone,
        address: oliLead.location,
        customFields: {
          source: 'oli',
          oliLeadId: oliLead.id
        }
      });

    } catch (error) {
      console.error('Failed to find or create contact:', error.message);
      throw error;
    }
  }

  /**
   * Map Oli lead status to GHL opportunity status
   */
  mapOliStatusToGHL(oliStatus) {
    const statusMap = {
      'new': 'open',
      'contacted': 'qualified',
      'converted': 'won',
      'lost': 'lost'
    };
    return statusMap[oliStatus] || 'open';
  }

  /**
   * Send data to Oli webhook
   */
  async sendToOliWebhook(webhookUrl, action, data, authToken) {
    const payload = {
      action,
      data,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Sync-Source': 'ghl'
      },
      body: JSON.stringify(payload),
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(`Failed to send to Oli: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Sync two-way: Oli → GHL when sales happen
   */
  async syncSaleToGHL(oliSale, connection, ghlAccessToken) {
    /**
     * When a sale happens in OliSalesTrack, update the
     * corresponding GHL opportunity
     */

    const ghlClient = new GHLClient(ghlAccessToken, connection.ghlLocationId);

    try {
      // Find related opportunities for this customer
      const opportunities = await ghlClient.request(
        'GET',
        `/opportunities?customFields.oliCustomerId=${oliSale.customerId}`
      );

      if (opportunities.opportunities?.length > 0) {
        // Update the most recent opportunity status to "won"
        const opportunity = opportunities.opportunities[0];

        await ghlClient.updateOpportunity(opportunity.id, {
          status: 'won',
          customFields: {
            saleAmount: oliSale.amount,
            saleCurrency: oliSale.currency,
            saleDate: new Date().toISOString(),
            oliSaleId: oliSale.id
          }
        });
      }
    } catch (error) {
      console.error('Failed to sync sale to GHL:', error.message);
      // Don't throw - this is a secondary sync
    }
  }

  /**
   * Handle GHL webhooks (GHL → Oli)
   */
  async handleGHLWebhook(eventType, eventData) {
    switch (eventType) {
      case 'contact.added':
        // New contact in GHL - send to Oli-Locator
        return this.transformGHLContactToOli(eventData);

      case 'contact.updated':
        // Updated contact - sync back to Oli
        return this.transformGHLContactToOli(eventData);

      case 'opportunity.won':
        // Deal won in GHL - update Oli-SalesTrack
        return {
          type: 'sale_won',
          ghlOpportunityId: eventData.id,
          amount: eventData.value,
          customerId: eventData.contactId
        };

      case 'task.created':
        // Task in GHL - create task in OliOps
        return {
          type: 'task_created',
          title: eventData.title,
          dueDate: eventData.dueDate,
          assignee: eventData.assignedToId
        };

      default:
        console.log(`Unknown GHL event type: ${eventType}`);
        return null;
    }
  }

  /**
   * Log sync events
   */
  logSync(event) {
    this.syncLog.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep last 1000 sync events
    if (this.syncLog.length > 1000) {
      this.syncLog = this.syncLog.slice(-1000);
    }

    if (process.env.NODE_ENV === 'production') {
      console.log('[GHL_SYNC]', JSON.stringify(event));
    }
  }

  /**
   * Get sync logs
   */
  getLogs(filter = {}) {
    return this.syncLog.filter(log => {
      if (filter.direction && log.direction !== filter.direction) return false;
      if (filter.status && log.status !== filter.status) return false;
      return true;
    });
  }

  /**
   * Get sync statistics
   */
  getStatistics() {
    const logs = this.syncLog;
    const completed = logs.filter(l => l.status === 'completed');
    const failed = logs.filter(l => l.status === 'failed');

    const totalSuccesses = completed.reduce((sum, l) => sum + (l.successCount || 0), 0);
    const totalFailures = completed.reduce((sum, l) => sum + (l.failureCount || 0), 0);

    return {
      totalSyncs: logs.length,
      completedSyncs: completed.length,
      failedSyncs: failed.length,
      totalItemsSynced: totalSuccesses + totalFailures,
      successRate: totalSuccesses + totalFailures > 0
        ? ((totalSuccesses / (totalSuccesses + totalFailures)) * 100).toFixed(2) + '%'
        : 'N/A',
      lastSync: logs[logs.length - 1]?.timestamp || null
    };
  }
}

// ============================================================================
// PART 3: GHL WEBHOOK RECEIVER
// ============================================================================

function createGHLWebhookHandler(syncManager) {
  return async (req, res) => {
    try {
      const { event, data } = req.body;

      // Verify GHL webhook signature
      const signature = req.headers['x-ghl-signature'];
      if (!verifyGHLSignature(req, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Handle webhook
      const transformedData = await syncManager.handleGHLWebhook(event, data);

      if (transformedData) {
        syncManager.logSync({
          type: 'webhook_received',
          event,
          status: 'processed'
        });

        return res.status(200).json({
          success: true,
          data: transformedData
        });
      } else {
        return res.status(200).json({
          success: true,
          message: 'Event received but not processed'
        });
      }
    } catch (error) {
      console.error('GHL webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  };
}

function verifyGHLSignature(req, signature) {
  // Implement GHL signature verification
  // https://docs.gohighlevel.com/webhooks
  const secret = process.env.GHL_WEBHOOK_SECRET;
  const body = req.rawBody; // Raw body before JSON parsing

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ============================================================================
// PART 4: EXPORTS
// ============================================================================

module.exports = {
  GHLClient,
  OliGHLSyncManager,
  createGHLWebhookHandler
};
