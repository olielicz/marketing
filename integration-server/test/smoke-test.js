/**
 * test/smoke-test.js
 * ===================
 * End-to-end smoke test. Starts the real server on an ephemeral port,
 * exercises the full inbound -> outbound event flow, OAuth error paths,
 * and GHL webhook handling, then reports pass/fail. No test framework
 * dependency (avoids npm install, which is blocked in this sandbox).
 *
 * Run: node test/smoke-test.js
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Use an isolated data file so repeat test runs don't pollute real data.
const TEST_DATA_DIR = path.join(__dirname, '.test-data');
if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
process.env.OLI_DATA_DIR = TEST_DATA_DIR;
process.env.OLI_API_SECRET = 'test-secret';

const { server, outbound } = require('../server');
const tokens = require('../lib/tokens');

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function request(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: 'localhost', port, method, path, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          let json;
          try { json = JSON.parse(raw); } catch { json = raw; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const port = 34567;
  await new Promise(resolve => server.listen(port, resolve));
  console.log(`Test server listening on ${port}\n`);

  // Start a tiny receiver to act as "Zapier" for outbound webhook delivery
  let receivedEvents = [];
  const receiver = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      receivedEvents.push(JSON.parse(raw));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const receiverPort = 34568;
  await new Promise(resolve => receiver.listen(receiverPort, resolve));

  try {
    console.log('1. Health check');
    const health = await request(port, 'GET', '/health');
    assert(health.status === 200, 'GET /health returns 200');
    assert(Array.isArray(health.body.tools) && health.body.tools.length === 6, 'health reports all 6 tool handlers');

    console.log('\n2. Token issuance + auth enforcement');
    const noToken = await request(port, 'POST', '/api/webhooks/v1/oliops/create_contact', { body: { email: 'x@example.com' } });
    assert(noToken.status === 401, 'request without Authorization header is rejected (401)');

    const tokenRes = await request(port, 'POST', '/api/tokens', { body: { userId: 'user_123' } });
    assert(tokenRes.status === 201 && tokenRes.body.token, 'token issuance succeeds');
    const userToken = tokenRes.body.token;

    const badToken = await request(port, 'POST', '/api/webhooks/v1/oliops/create_contact', {
      headers: { Authorization: 'Bearer not.a.real.token' }, body: { email: 'x@example.com' }
    });
    assert(badToken.status === 401, 'forged token is rejected (401)');

    console.log('\n3. Register an outbound webhook subscription for user_123');
    const regRes = await request(port, 'POST', '/api/webhooks/register', {
      body: { userId: 'user_123', url: `http://localhost:${receiverPort}/`, events: ['contact.created'], toolKey: 'oliops' }
    });
    assert(regRes.status === 201 && regRes.body.webhookId, 'webhook registration succeeds');

    console.log('\n4. Inbound webhook call (simulating Zapier calling Oli) should create contact AND trigger outbound event');
    const createRes = await request(port, 'POST', '/api/webhooks/v1/oliops/create_contact', {
      headers: { Authorization: `Bearer ${userToken}`, 'User-Agent': 'Zapier/1.0' },
      body: { email: 'lead@customer.com', name: 'Test Lead' }
    });
    assert(createRes.status === 200 && createRes.body.success, 'inbound create_contact returns success');
    assert(createRes.body.contact && createRes.body.contact.email === 'lead@customer.com', 'contact payload echoes correct email');

    // Outbound delivery is async (setImmediate); wait briefly for it to land.
    await new Promise(r => setTimeout(r, 500));
    assert(receivedEvents.length === 1, `outbound webhook receiver got exactly 1 event (got ${receivedEvents.length})`);
    if (receivedEvents.length) {
      assert(receivedEvents[0].type === 'contact.created', 'delivered event type is contact.created');
      assert(receivedEvents[0].data.email === 'lead@customer.com', 'delivered event data has correct email');
    }

    console.log('\n5. Unknown tool / unknown action produce clear errors, not crashes');
    const badTool = await request(port, 'POST', '/api/webhooks/v1/notarealtool/create_contact', {
      headers: { Authorization: `Bearer ${userToken}` }, body: {}
    });
    assert(badTool.status === 400 && /Unknown tool/.test(badTool.body.error), 'unknown tool returns 400 with clear message');

    const badAction = await request(port, 'POST', '/api/webhooks/v1/oliops/not_a_real_action', {
      headers: { Authorization: `Bearer ${userToken}` }, body: {}
    });
    assert(badAction.status === 500 && /Unknown action/.test(badAction.body.error), 'unknown action returns error with clear message');

    console.log('\n6. Validation errors are surfaced (missing required field)');
    const missingField = await request(port, 'POST', '/api/webhooks/v1/oliops/create_contact', {
      headers: { Authorization: `Bearer ${userToken}` }, body: {}
    });
    assert(missingField.status === 500 && /email is required/.test(missingField.body.error), 'missing email field produces a clear validation error');

    console.log('\n7. OAuth: unconfigured provider fails clearly instead of faking a token');
    const oauthStart = await request(port, 'GET', `/api/oauth/authorize?provider=zapier&userId=user_123&redirectUri=http://localhost/cb`);
    assert(oauthStart.status === 400 && /not configured/.test(oauthStart.body.error), 'OAuth authorize fails clearly when ZAPIER_CLIENT_ID/SECRET are unset (no fake success)');

    console.log('\n8. GHL webhook receiver processes an opportunity-won event into a sale.recorded outbound event');
    await request(port, 'POST', '/api/webhooks/register', {
      body: { userId: 'user_123', url: `http://localhost:${receiverPort}/`, events: ['sale.recorded'], toolKey: 'olisalestrack' }
    });
    const ghlWebhook = await request(port, 'POST', '/api/ghl/webhook', {
      body: { userId: 'user_123', event: 'OpportunityStatusUpdate', data: { id: 'opp_1', status: 'won', monetaryValue: 500, contactId: 'contact_1' } }
    });
    assert(ghlWebhook.status === 200 && ghlWebhook.body.success, 'GHL webhook endpoint accepts opportunity update');
    await new Promise(r => setTimeout(r, 500));
    const saleEvent = receivedEvents.find(e => e.type === 'sale.recorded');
    assert(Boolean(saleEvent), 'GHL opportunity-won event resulted in a delivered sale.recorded outbound webhook');

    console.log('\n9. Statistics endpoint reflects real delivered events');
    const stats = await request(port, 'GET', '/api/webhooks/statistics');
    assert(stats.status === 200 && stats.body.totalSuccesses >= 2, `statistics show >=2 successful deliveries (got ${stats.body.totalSuccesses})`);

    console.log('\n10. Data persists across a simulated restart (store re-read from disk)');
    delete require.cache[require.resolve('../lib/store')];
    const freshStore = require('../lib/store');
    const persistedSubs = freshStore.get('webhookSubscriptions');
    assert(Array.isArray(persistedSubs['user_123']) && persistedSubs['user_123'].length === 2, 'webhook subscriptions persisted to disk and reloaded');

  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => receiver.close(resolve));
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
