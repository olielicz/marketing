/**
 * lib/oauth.js
 * ============
 * OAuth 2.0 authorization-code flow for Zapier, Make.com, n8n, and
 * GoHighLevel.
 *
 * IMPORTANT FIX vs. the original integration-layer-03-oauth-auth.js:
 * That file's requestToken()/requestRevoke() were mock stubs that returned
 * `crypto.randomBytes(32).toString('hex')` as a fake access token, no
 * matter what provider/code was passed in. It could never have worked
 * against a real Zapier/Make/n8n/GHL app - it wasn't calling their APIs at
 * all. This version makes a real POST to each provider's token endpoint
 * using native fetch() and returns their actual response.
 *
 * You still must register a real OAuth app with each platform and put its
 * client id/secret in your .env (see .env.example). Nothing works without
 * that - no code can substitute for having credentials issued by Zapier
 * etc. But once you have them, this module will actually complete the
 * handshake.
 */

const crypto = require('crypto');
const store = require('./store');

function providers() {
  return {
    zapier: {
      clientId: process.env.ZAPIER_CLIENT_ID,
      clientSecret: process.env.ZAPIER_CLIENT_SECRET,
      authorizationUrl: 'https://zapier.com/oauth/authorize',
      tokenUrl: 'https://zapier.com/oauth/token',
      revokeUrl: 'https://zapier.com/oauth/revoke',
      scopes: ['read:zaps', 'write:zaps']
    },
    make: {
      clientId: process.env.MAKE_CLIENT_ID,
      clientSecret: process.env.MAKE_CLIENT_SECRET,
      authorizationUrl: 'https://www.make.com/oauth/v2/authorize',
      tokenUrl: 'https://www.make.com/oauth/v2/token',
      revokeUrl: null, // Make does not expose a public revoke endpoint as of writing; verify in their current docs
      scopes: ['scenarios:manage']
    },
    n8n: {
      clientId: process.env.N8N_CLIENT_ID,
      clientSecret: process.env.N8N_CLIENT_SECRET,
      // n8n is typically self-hosted; base URL must point at the customer's instance.
      baseUrl: process.env.N8N_BASE_URL || null,
      scopes: ['workflow:read', 'workflow:write']
    },
    ghl: {
      clientId: process.env.GHL_CLIENT_ID,
      clientSecret: process.env.GHL_CLIENT_SECRET,
      authorizationUrl: 'https://marketplace.gohighlevel.com/oauth/chooselocation',
      tokenUrl: 'https://services.leadconnectorhq.com/oauth/token',
      revokeUrl: null,
      scopes: ['contacts.readonly', 'contacts.write', 'opportunities.readonly', 'opportunities.write']
    }
  };
}

function tokenUrlFor(providerKey, cfg) {
  if (providerKey === 'n8n') {
    if (!cfg.baseUrl) throw new Error('N8N_BASE_URL is not configured; required for self-hosted n8n OAuth');
    return `${cfg.baseUrl.replace(/\/$/, '')}/oauth2/token`;
  }
  return cfg.tokenUrl;
}

class OAuthProviderManager {
  isConfigured(providerKey) {
    const cfg = providers()[providerKey];
    return Boolean(cfg && cfg.clientId && cfg.clientSecret);
  }

  generateAuthorizationUrl(providerKey, userId, redirectUri) {
    const cfg = providers()[providerKey];
    if (!cfg) throw new Error(`Unknown provider: ${providerKey}`);
    if (!this.isConfigured(providerKey)) {
      throw new Error(`Provider "${providerKey}" is not configured. Set ${providerKey.toUpperCase()}_CLIENT_ID / _CLIENT_SECRET env vars.`);
    }
    if (providerKey === 'n8n' && !cfg.baseUrl) {
      throw new Error('N8N_BASE_URL is not configured; required for self-hosted n8n OAuth');
    }

    const state = crypto.randomBytes(24).toString('hex');
    store.update('oauthStates', (states) => {
      states[state] = { provider: providerKey, userId, redirectUri, createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 };
    });

    const authUrl = providerKey === 'n8n' ? `${cfg.baseUrl.replace(/\/$/, '')}/oauth2/authorize` : cfg.authorizationUrl;
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: cfg.scopes.join(' '),
      state
    });
    return `${authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(providerKey, code, state, redirectUri) {
    const states = store.get('oauthStates');
    const stateData = states[state];
    if (!stateData) throw new Error('Invalid or unknown state parameter');
    if (stateData.expiresAt < Date.now()) throw new Error('State parameter expired, restart the OAuth flow');
    if (stateData.provider !== providerKey) throw new Error('State/provider mismatch');

    const cfg = providers()[providerKey];
    if (!cfg) throw new Error(`Unknown provider: ${providerKey}`);

    const tokenResponse = await this._postToken(providerKey, cfg, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret
    });

    store.update('oauthTokens', (t) => {
      t[`${stateData.userId}_${providerKey}`] = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || null,
        expiresAt: Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000),
        createdAt: new Date().toISOString(),
        provider: providerKey
      };
    });
    store.update('oauthStates', (states2) => { delete states2[state]; });

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || null,
      expiresIn: tokenResponse.expires_in,
      tokenType: tokenResponse.token_type || 'Bearer'
    };
  }

  async refreshAccessToken(userId, providerKey) {
    const key = `${userId}_${providerKey}`;
    const tokens = store.get('oauthTokens');
    const stored = tokens[key];
    if (!stored || !stored.refreshToken) throw new Error('No refresh token on file; user must re-authorize');

    const cfg = providers()[providerKey];
    const tokenResponse = await this._postToken(providerKey, cfg, {
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret
    });

    store.update('oauthTokens', (t) => {
      t[key] = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || stored.refreshToken,
        expiresAt: Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000),
        updatedAt: new Date().toISOString(),
        provider: providerKey
      };
    });

    return { accessToken: tokenResponse.access_token, expiresIn: tokenResponse.expires_in, tokenType: tokenResponse.token_type || 'Bearer' };
  }

  async getValidAccessToken(userId, providerKey) {
    const key = `${userId}_${providerKey}`;
    const tokens = store.get('oauthTokens');
    const stored = tokens[key];
    if (!stored) throw new Error('No token on file; user must authorize first');

    if (stored.expiresAt < Date.now() + 5 * 60 * 1000) {
      return this.refreshAccessToken(userId, providerKey);
    }
    return { accessToken: stored.accessToken, expiresIn: Math.floor((stored.expiresAt - Date.now()) / 1000), tokenType: 'Bearer' };
  }

  async revokeAccessToken(userId, providerKey) {
    const key = `${userId}_${providerKey}`;
    const tokens = store.get('oauthTokens');
    const stored = tokens[key];
    const cfg = providers()[providerKey];

    if (stored && cfg.revokeUrl) {
      try {
        await fetch(cfg.revokeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: stored.accessToken, client_id: cfg.clientId, client_secret: cfg.clientSecret })
        });
      } catch (err) {
        console.error(`[oauth] Revoke call to ${providerKey} failed (removing local token anyway):`, err.message);
      }
    }

    store.update('oauthTokens', (t) => { delete t[key]; });
    return true;
  }

  listConnectedProviders(userId) {
    const tokens = store.get('oauthTokens');
    return Object.keys(providers())
      .filter(p => tokens[`${userId}_${p}`])
      .map(p => {
        const t = tokens[`${userId}_${p}`];
        return { provider: p, connectedAt: t.createdAt, expiresAt: new Date(t.expiresAt).toISOString(), isExpired: t.expiresAt < Date.now() };
      });
  }

  /** Real HTTP call to the provider's token endpoint. No mocking. */
  async _postToken(providerKey, cfg, params) {
    const url = tokenUrlFor(providerKey, cfg);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams(params)
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok) {
      throw new Error(`${providerKey} token endpoint returned ${res.status}: ${json.error_description || json.error || text.slice(0, 200)}`);
    }
    if (!json.access_token) {
      throw new Error(`${providerKey} token endpoint did not return access_token: ${text.slice(0, 200)}`);
    }
    return json;
  }
}

module.exports = { OAuthProviderManager, providers };
