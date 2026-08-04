/**
 * lib/tokens.js
 * =============
 * Issues and verifies API bearer tokens used to call the inbound webhook
 * bridge (POST /api/webhooks/v1/:toolKey/:action).
 *
 * Design: token = "<tokenId>.<hmac>"
 *   - tokenId is a random UUID stored (with its owning userId) in the store.
 *   - hmac = HMAC-SHA256(tokenId, OLI_API_SECRET), so a token can be
 *     verified without a DB round trip AND revoked by deleting the tokenId
 *     record (revoked tokens fail the store lookup even if the HMAC still
 *     matches).
 *
 * This replaces the original design in integration-layer-01, which
 * validated a signature but never had any endpoint that *issued* a token,
 * making the whole auth flow untestable end-to-end.
 */

const crypto = require('crypto');
const store = require('./store');

const SECRET = process.env.OLI_API_SECRET || 'dev-secret-change-in-production';

function sign(tokenId) {
  return crypto.createHmac('sha256', SECRET).update(tokenId).digest('base64url');
}

/**
 * Issue a new bearer token for a given userId.
 * @returns {string} token in the form "<tokenId>.<signature>"
 */
function issue(userId) {
  if (!userId) throw new Error('userId is required to issue a token');
  const tokenId = crypto.randomUUID();
  store.update('apiTokens', (apiTokens) => {
    apiTokens[tokenId] = { userId, createdAt: new Date().toISOString() };
  });
  return `${tokenId}.${sign(tokenId)}`;
}

/**
 * Verify a bearer token.
 * @returns {{ userId: string, tokenId: string } | null}
 */
function verify(rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.includes('.')) return null;
  const [tokenId, signature] = rawToken.split('.');
  if (!tokenId || !signature) return null;

  const expected = sign(tokenId);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  const apiTokens = store.get('apiTokens');
  const record = apiTokens[tokenId];
  if (!record) return null; // revoked or never existed

  return { userId: record.userId, tokenId };
}

/** Revoke a previously issued token by its id. */
function revoke(tokenId) {
  let existed = false;
  store.update('apiTokens', (apiTokens) => {
    if (apiTokens[tokenId]) {
      existed = true;
      delete apiTokens[tokenId];
    }
  });
  return existed;
}

/** List issued tokens for a user (id + createdAt only - never returns secrets). */
function listForUser(userId) {
  const apiTokens = store.get('apiTokens');
  return Object.entries(apiTokens)
    .filter(([, record]) => record.userId === userId)
    .map(([tokenId, record]) => ({ tokenId, createdAt: record.createdAt }));
}

module.exports = { issue, verify, revoke, listForUser };
