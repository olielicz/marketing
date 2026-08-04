/**
 * server.js
 * =========
 * The actual integration server. Run with: `npm start` (or `node server.js`).
 *
 * This is what was missing from the original 7 integration-layer-*.js
 * files - they were standalone modules with no process that imported and
 * ran them together. This file is that process.
 *
 * Endpoints:
 *   GET  /health                                   - liveness check
 *
 *   POST /api/tokens                                - issue a bearer token for a userId (dev/admin use)
 *   DELETE /api/tokens/:tokenId                      - revoke a token
 *
 *   POST /api/webhooks/v1/:toolKey/:action          - INBOUND bridge (Zapier/Make/n8n/GHL -> Oli)
 *   POST /api/webhooks/register                     - subscribe to OUTBOUND events
 *   GET  /api/webhooks?userId=...                    - list a user's outbound subscriptions
 *   PUT  /api/webhooks/:webhookId                    - update a subscription
 *   DELETE /api/webhooks/:webhookId                  - delete a subscription
 *   POST /api/webhooks/emit-event                    - manually emit an event (testing)
 *   GET  /api/webhooks/statistics                     - delivery stats
 *   GET  /api/webhooks/dead-letter-queue              - failed deliveries
 *   POST /api/webhooks/dead-letter-queue/:id/retry     - retry a failed delivery
 *
 *   GET  /api/oauth/authorize?provider=&userId=&redirectUri=   - start OAuth flow
 *   POST /api/oauth/callback                          - exchange code for token
 *   POST /api/oauth/refresh                           - refresh a token
 *   GET  /api/oauth/token?userId=&provider=            - get a valid access token
 *   POST /api/oauth/disconnect                         - revoke + disconnect
 *   GET  /api/oauth/providers?userId=                   - list connected providers
 *
 *   POST /api/ghl/connect                             - register a GHL connection for a user
 *   POST /api/ghl/sync/contacts                        - pull GHL contacts -> Oli-Locator (emits lead.created)
 *   POST /api/ghl/sync/lead-to-ghl                     - push an Oli lead -> GHL contact+opportunity
 *   POST /api/ghl/webhook                              - GHL calls this on contact/opportunity changes
 */

const http = require('http');
const { Router, sendJson } = require('./lib/router');
const tokens = require('./lib/tokens');
const { OutboundWebhookManager } = require('./lib/outbound-webhooks');
const { OliWebhookBridge } = require('./lib/webhook-bridge');
const { OAuthProviderManager } = require('./lib/oauth');
const { OliGHLSyncManager, verifyGHLSignature } = require('./lib/ghl-bridge');

const outbound = new OutboundWebhookManager();
const bridge = new OliWebhookBridge(outbound);
const oauthManager = new OAuthProviderManager();
const ghlSync = new OliGHLSyncManager(outbound);

const router = new Router();

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
router.get('/health', (req, res) => {
  sendJson(res, 200, {
    status: 'healthy',
    tools: Object.keys(bridge.toolHandlers),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// Token issuance (protect this route in production - see README)
// ---------------------------------------------------------------------------
router.post('/api/tokens', (req, res, { body }) => {
  if (!body || !body.userId) return sendJson(res, 400, { error: 'userId is required' });
  const token = tokens.issue(body.userId);
  sendJson(res, 201, { token, message: 'Store this token securely - it will not be shown again in full.' });
});

router.delete('/api/tokens/:tokenId', (req, res, { params }) => {
  const revoked = tokens.revoke(params.tokenId);
  sendJson(res, revoked ? 200 : 404, revoked ? { success: true } : { error: 'Token not found' });
});

// ---------------------------------------------------------------------------
// Inbound webhook bridge
// ---------------------------------------------------------------------------
router.post('/api/webhooks/v1/:toolKey/:action', async (req, res, { params, body }) => {
  try {
    const result = await bridge.handle(params.toolKey, params.action, body, req.headers);
    sendJson(res, 200, { success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    sendJson(res, err.status || 500, { success: false, error: err.message, ...(err.details || {}) });
  }
});

// ---------------------------------------------------------------------------
// Outbound webhook subscription management
// ---------------------------------------------------------------------------
router.post('/api/webhooks/register', (req, res, { body }) => {
  try {
    const webhook = outbound.registerWebhook(body || {});
    sendJson(res, 201, { success: true, webhookId: webhook.id, secret: webhook.secret });
  } catch (err) {
    sendJson(res, 400, { success: false, error: err.message });
  }
});

router.get('/api/webhooks', (req, res, { query }) => {
  if (!query.userId) return sendJson(res, 400, { error: 'userId query param is required' });
  const webhooks = outbound.listWebhooks(query.userId, query.toolKey);
  sendJson(res, 200, { webhooks: webhooks.map(w => ({ ...w, secret: undefined })), count: webhooks.length });
});

router.put('/api/webhooks/:webhookId', (req, res, { params, body }) => {
  try {
    const webhook = outbound.updateWebhook(params.webhookId, body || {});
    sendJson(res, 200, { success: true, webhook: { ...webhook, secret: undefined } });
  } catch (err) {
    sendJson(res, 404, { success: false, error: err.message });
  }
});

router.delete('/api/webhooks/:webhookId', (req, res, { params }) => {
  const deleted = outbound.deleteWebhook(params.webhookId);
  sendJson(res, deleted ? 200 : 404, deleted ? { success: true } : { error: 'Webhook not found' });
});

router.post('/api/webhooks/emit-event', (req, res, { body }) => {
  try {
    const eventId = outbound.emitEvent(body || {});
    sendJson(res, 202, { success: true, eventId, message: 'Event queued for delivery' });
  } catch (err) {
    sendJson(res, 400, { success: false, error: err.message });
  }
});

router.get('/api/webhooks/statistics', (req, res) => {
  sendJson(res, 200, outbound.getStatistics());
});

router.get('/api/webhooks/dead-letter-queue', (req, res, { query }) => {
  sendJson(res, 200, { items: outbound.getDeadLetterQueue(query.userId || null) });
});

router.post('/api/webhooks/dead-letter-queue/:id/retry', async (req, res, { params }) => {
  try {
    await outbound.retryDeadLettered(params.id);
    sendJson(res, 200, { success: true });
  } catch (err) {
    sendJson(res, 400, { success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
router.get('/api/oauth/authorize', (req, res, { query }) => {
  try {
    const { provider, userId, redirectUri } = query;
    if (!provider || !userId || !redirectUri) return sendJson(res, 400, { error: 'provider, userId, and redirectUri are required' });
    const url = oauthManager.generateAuthorizationUrl(provider, userId, redirectUri);
    sendJson(res, 200, { authorizationUrl: url });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

router.post('/api/oauth/callback', async (req, res, { body }) => {
  try {
    const { provider, code, state, redirectUri } = body || {};
    if (!provider || !code || !state) return sendJson(res, 400, { error: 'provider, code, and state are required' });
    const result = await oauthManager.exchangeCodeForToken(provider, code, state, redirectUri);
    sendJson(res, 200, { success: true, ...result });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

router.post('/api/oauth/refresh', async (req, res, { body }) => {
  try {
    const { userId, provider } = body || {};
    const result = await oauthManager.refreshAccessToken(userId, provider);
    sendJson(res, 200, { success: true, ...result });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

router.get('/api/oauth/token', async (req, res, { query }) => {
  try {
    const result = await oauthManager.getValidAccessToken(query.userId, query.provider);
    sendJson(res, 200, { success: true, ...result });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

router.post('/api/oauth/disconnect', async (req, res, { body }) => {
  try {
    await oauthManager.revokeAccessToken(body.userId, body.provider);
    sendJson(res, 200, { success: true });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

router.get('/api/oauth/providers', (req, res, { query }) => {
  if (!query.userId) return sendJson(res, 400, { error: 'userId is required' });
  sendJson(res, 200, { providers: oauthManager.listConnectedProviders(query.userId) });
});

// ---------------------------------------------------------------------------
// GoHighLevel
// ---------------------------------------------------------------------------
router.post('/api/ghl/connect', (req, res, { body }) => {
  try {
    const { userId, ghlAccessToken, ghlLocationId, oliToolKey } = body || {};
    if (!userId || !ghlAccessToken || !ghlLocationId) return sendJson(res, 400, { error: 'userId, ghlAccessToken, and ghlLocationId are required' });
    const connection = ghlSync.registerConnection(userId, ghlAccessToken, ghlLocationId, oliToolKey || 'oli-locator');
    sendJson(res, 201, { success: true, connection: { ...connection, ghlAccessToken: undefined } });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

router.post('/api/ghl/sync/contacts', async (req, res, { body }) => {
  try {
    const result = await ghlSync.syncContactsFromGHL(body.userId);
    sendJson(res, 200, { success: true, ...result });
  } catch (err) {
    sendJson(res, 400, { success: false, error: err.message });
  }
});

router.post('/api/ghl/sync/lead-to-ghl', async (req, res, { body }) => {
  try {
    const result = await ghlSync.syncLeadToGHL(body.userId, body.lead, body.pipelineId);
    sendJson(res, 200, { success: true, ...result });
  } catch (err) {
    sendJson(res, 400, { success: false, error: err.message });
  }
});

router.post('/api/ghl/webhook', (req, res, { body }) => {
  try {
    const signature = req.headers['x-ghl-signature'];
    if (process.env.GHL_WEBHOOK_SECRET && !verifyGHLSignature(req.rawBody, signature)) {
      return sendJson(res, 401, { error: 'Invalid GHL webhook signature' });
    }
    const { userId, event, data } = body || {};
    const result = ghlSync.handleGHLWebhook(userId, event, data);
    sendJson(res, 200, { success: true, result });
  } catch (err) {
    sendJson(res, 400, { success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// HTTP server bootstrap
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }
  router.handle(req, res).catch(err => sendJson(res, 500, { error: err.message }));
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Oli integration server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = { server, router, outbound, bridge, oauthManager, ghlSync };
