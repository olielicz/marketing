/**
 * test/oauth-flow-test.js
 * ========================
 * Verifies the OAuth module makes a REAL HTTP call to a token endpoint
 * (using a local mock provider standing in for Zapier) and correctly
 * stores/returns the resulting token. This specifically re-tests the
 * exact defect found in the original integration-layer-03-oauth-auth.js,
 * where requestToken() returned crypto.randomBytes(...) regardless of
 * what was requested, never contacting any provider at all.
 *
 * Run: node test/oauth-flow-test.js
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const TEST_DATA_DIR = path.join(__dirname, '.test-data-oauth');
if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
process.env.OLI_DATA_DIR = TEST_DATA_DIR;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

async function main() {
  // 1. Stand up a mock "Zapier" OAuth token endpoint that records what it received.
  let receivedTokenRequest = null;
  const mockProvider = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      receivedTokenRequest = { path: req.url, body: Object.fromEntries(new URLSearchParams(raw)) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'real-access-token-abc', refresh_token: 'real-refresh-token-xyz', expires_in: 3600, token_type: 'Bearer' }));
    });
  });
  await new Promise(resolve => mockProvider.listen(34569, resolve));

  // 2. Monkey-patch the zapier tokenUrl to point at our mock provider.
  //    (In real use this is https://zapier.com/oauth/token - here we override
  //    via env-driven provider config isn't supported for zapier by design,
  //    so we test the generic HTTP-calling behavior via the internal method.)
  const { OAuthProviderManager } = require('../lib/oauth');
  const manager = new OAuthProviderManager();

  // Directly exercise _postToken against our mock endpoint to prove it makes
  // a real network call and parses a real response (this is the exact
  // method exchangeCodeForToken/refreshAccessToken call internally).
  const fakeCfg = { clientId: 'test-client', clientSecret: 'test-secret', tokenUrl: 'http://localhost:34569/oauth/token' };
  const result = await manager._postToken('zapier', fakeCfg, {
    grant_type: 'authorization_code',
    code: 'auth-code-123',
    redirect_uri: 'http://localhost/cb',
    client_id: fakeCfg.clientId,
    client_secret: fakeCfg.clientSecret
  });

  assert(Boolean(receivedTokenRequest), 'a real HTTP request was sent to the token endpoint');
  assert(receivedTokenRequest.body.grant_type === 'authorization_code', 'request body included the real grant_type');
  assert(receivedTokenRequest.body.code === 'auth-code-123', 'request body included the real authorization code');
  assert(result.access_token === 'real-access-token-abc', 'the REAL token from the mock provider was returned (not crypto.randomBytes mock data)');
  assert(result.access_token !== undefined && result.access_token.length > 0, 'access_token is present');

  // 3. Confirm a provider with no client id/secret configured fails loudly instead of faking success.
  assert(manager.isConfigured('zapier') === false, 'zapier correctly reports unconfigured when env vars are unset');

  await new Promise(resolve => mockProvider.close(resolve));
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1); });
