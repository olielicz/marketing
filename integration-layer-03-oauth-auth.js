/**
 * Oli OAuth Authentication Layer
 * ===============================
 * 
 * Handles OAuth integration for:
 * - Zapier
 * - Make.com
 * - n8n
 * - GoHighLevel (GHL)
 * - Custom integrations
 * 
 * Supports OAuth 2.0 Authorization Code Flow
 */

const crypto = require('crypto');

// ============================================================================
// PART 1: OAUTH PROVIDER MANAGER
// ============================================================================

class OAuthProviderManager {
  constructor(config = {}) {
    this.config = {
      appSecret: process.env.OLI_APP_SECRET || 'dev-app-secret',
      tokenExpiry: config.tokenExpiry || 3600, // 1 hour
      refreshTokenExpiry: config.refreshTokenExpiry || 604800, // 7 days
      ...config
    };

    // Provider configurations
    this.providers = {
      zapier: {
        clientId: process.env.ZAPIER_CLIENT_ID,
        clientSecret: process.env.ZAPIER_CLIENT_SECRET,
        authorizationUrl: 'https://zapier.com/oauth/authorize',
        tokenUrl: 'https://zapier.com/oauth/token',
        revokeUrl: 'https://zapier.com/oauth/revoke',
        scopes: ['read:zaps', 'write:zaps', 'read:data', 'write:data']
      },
      make: {
        clientId: process.env.MAKE_CLIENT_ID,
        clientSecret: process.env.MAKE_CLIENT_SECRET,
        authorizationUrl: 'https://www.make.com/oauth/authorize',
        tokenUrl: 'https://www.make.com/oauth/token',
        revokeUrl: 'https://www.make.com/oauth/revoke',
        scopes: ['connections:manage', 'scenarios:manage', 'data:read', 'data:write']
      },
      n8n: {
        clientId: process.env.N8N_CLIENT_ID,
        clientSecret: process.env.N8N_CLIENT_SECRET,
        baseUrl: process.env.N8N_BASE_URL || 'https://n8n.cloud',
        tokenUrl: null, // Set dynamically based on baseUrl
        revokeUrl: null,
        scopes: ['workflows:read', 'workflows:write', 'credentials:read', 'credentials:write']
      },
      ghl: {
        clientId: process.env.GHL_CLIENT_ID,
        clientSecret: process.env.GHL_CLIENT_SECRET,
        authorizationUrl: 'https://app.gohighlevel.com/oauth/authorize',
        tokenUrl: 'https://api.gohighlevel.com/oauth/token',
        revokeUrl: 'https://api.gohighlevel.com/oauth/revoke',
        scopes: ['contacts:read', 'contacts:write', 'calendars:read', 'messages:send']
      }
    };

    // In-memory storage (use database in production)
    this.authorizationCodes = new Map(); // code -> { provider, userId, expiresAt }
    this.accessTokens = new Map(); // userId_provider -> { token, refreshToken, expiresAt }
    this.auditLog = [];
  }

  /**
   * Generate authorization URL for OAuth flow
   * 
   * @param {string} provider - 'zapier', 'make', 'n8n', 'ghl'
   * @param {string} userId - User ID
   * @param {string} redirectUri - Where to redirect after auth
   * @returns {string} Authorization URL
   */
  generateAuthorizationUrl(provider, userId, redirectUri) {
    const providerConfig = this.providers[provider];
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    if (!providerConfig.clientId || !providerConfig.clientSecret) {
      throw new Error(`Provider ${provider} not configured. Set env variables.`);
    }

    // Generate state token
    const state = crypto.randomBytes(32).toString('hex');

    // Store state for validation
    const stateData = {
      provider,
      userId,
      redirectUri,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000 // 10 minutes
    };

    // Use a simple key (in production, use Redis)
    if (!this.authorizationCodes) this.authorizationCodes = new Map();
    this.authorizationCodes.set(state, stateData);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: providerConfig.scopes.join(' '),
      state,
      // Optional but recommended
      access_type: 'offline', // For providers that support it
      prompt: 'consent'
    });

    const url = `${providerConfig.authorizationUrl}?${params.toString()}`;

    this.logAudit({
      type: 'authorization_url_generated',
      provider,
      userId,
      state: state.slice(0, 8) + '...'
    });

    return url;
  }

  /**
   * Exchange authorization code for access token
   * 
   * @param {string} provider - 'zapier', 'make', 'n8n', 'ghl'
   * @param {string} code - Authorization code
   * @param {string} state - State parameter
   * @param {string} redirectUri - Redirect URI used in auth
   * @returns {Object} { accessToken, refreshToken, expiresIn, tokenType }
   */
  async exchangeCodeForToken(provider, code, state, redirectUri) {
    // Validate state
    if (!this.authorizationCodes || !this.authorizationCodes.has(state)) {
      this.logAudit({
        type: 'token_exchange_failed',
        provider,
        reason: 'invalid_state'
      });
      throw new Error('Invalid state parameter');
    }

    const stateData = this.authorizationCodes.get(state);
    if (stateData.expiresAt < Date.now()) {
      this.logAudit({
        type: 'token_exchange_failed',
        provider,
        reason: 'state_expired'
      });
      throw new Error('State parameter expired');
    }

    const providerConfig = this.providers[provider];
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Get token URL (handle dynamic n8n URL)
    let tokenUrl = providerConfig.tokenUrl;
    if (provider === 'n8n') {
      tokenUrl = `${providerConfig.baseUrl}/oauth/token`;
    }

    // Exchange code for token (mock implementation)
    // In production, actually call the provider's OAuth endpoint
    const tokenResponse = await this.requestToken(provider, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret
    });

    // Store tokens
    const tokenKey = `${stateData.userId}_${provider}`;
    this.accessTokens.set(tokenKey, {
      token: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || null,
      expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
      createdAt: Date.now(),
      provider
    });

    // Clean up state
    this.authorizationCodes.delete(state);

    this.logAudit({
      type: 'token_exchange_success',
      provider,
      userId: stateData.userId
    });

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || null,
      expiresIn: tokenResponse.expires_in,
      tokenType: tokenResponse.token_type || 'Bearer'
    };
  }

  /**
   * Refresh an access token
   */
  async refreshAccessToken(userId, provider) {
    const tokenKey = `${userId}_${provider}`;
    const storedToken = this.accessTokens.get(tokenKey);

    if (!storedToken || !storedToken.refreshToken) {
      throw new Error('No refresh token available. User must re-authorize.');
    }

    const providerConfig = this.providers[provider];

    let tokenUrl = providerConfig.tokenUrl;
    if (provider === 'n8n') {
      tokenUrl = `${providerConfig.baseUrl}/oauth/token`;
    }

    // Request new token
    const tokenResponse = await this.requestToken(provider, {
      grant_type: 'refresh_token',
      refresh_token: storedToken.refreshToken,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret
    });

    // Update stored token
    this.accessTokens.set(tokenKey, {
      token: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || storedToken.refreshToken,
      expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
      updatedAt: Date.now(),
      provider
    });

    this.logAudit({
      type: 'token_refreshed',
      provider,
      userId
    });

    return {
      accessToken: tokenResponse.access_token,
      expiresIn: tokenResponse.expires_in,
      tokenType: tokenResponse.token_type || 'Bearer'
    };
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(userId, provider) {
    const tokenKey = `${userId}_${provider}`;
    let storedToken = this.accessTokens.get(tokenKey);

    if (!storedToken) {
      throw new Error('No token found. User must authorize first.');
    }

    // Check if token expired
    if (storedToken.expiresAt < Date.now() + 300000) { // 5 minute buffer
      return this.refreshAccessToken(userId, provider);
    }

    return {
      accessToken: storedToken.token,
      expiresIn: Math.floor((storedToken.expiresAt - Date.now()) / 1000),
      tokenType: 'Bearer'
    };
  }

  /**
   * Revoke access token
   */
  async revokeAccessToken(userId, provider) {
    const providerConfig = this.providers[provider];
    if (!providerConfig.revokeUrl) {
      // Provider doesn't support revocation, just delete locally
      this.accessTokens.delete(`${userId}_${provider}`);
      return true;
    }

    const tokenKey = `${userId}_${provider}`;
    const storedToken = this.accessTokens.get(tokenKey);

    if (storedToken) {
      // Call revoke endpoint
      await this.requestRevoke(provider, {
        token: storedToken.token,
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret
      });

      this.accessTokens.delete(tokenKey);
    }

    this.logAudit({
      type: 'token_revoked',
      provider,
      userId
    });

    return true;
  }

  /**
   * Mock: Request token from provider
   * In production, make actual HTTP request
   */
  async requestToken(provider, params) {
    // This is a mock implementation
    // In production, actually POST to the provider's token endpoint
    return {
      access_token: crypto.randomBytes(32).toString('hex'),
      refresh_token: crypto.randomBytes(32).toString('hex'),
      expires_in: 3600,
      token_type: 'Bearer'
    };
  }

  /**
   * Mock: Revoke token at provider
   */
  async requestRevoke(provider, params) {
    // This is a mock implementation
    // In production, actually POST to the provider's revoke endpoint
    return true;
  }

  /**
   * List connected providers for a user
   */
  listConnectedProviders(userId) {
    const connected = [];

    for (const provider of Object.keys(this.providers)) {
      const tokenKey = `${userId}_${provider}`;
      if (this.accessTokens.has(tokenKey)) {
        const token = this.accessTokens.get(tokenKey);
        connected.push({
          provider,
          connectedAt: token.createdAt,
          expiresAt: token.expiresAt,
          isExpired: token.expiresAt < Date.now()
        });
      }
    }

    return connected;
  }

  /**
   * Disconnect provider
   */
  async disconnectProvider(userId, provider) {
    await this.revokeAccessToken(userId, provider);
    return true;
  }

  /**
   * Log audit event
   */
  logAudit(event) {
    this.auditLog.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep last 10000 events
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  /**
   * Get audit logs
   */
  getAuditLogs(filter = {}) {
    return this.auditLog.filter(log => {
      if (filter.provider && log.provider !== filter.provider) return false;
      if (filter.userId && log.userId !== filter.userId) return false;
      if (filter.type && log.type !== filter.type) return false;
      return true;
    });
  }
}

// ============================================================================
// PART 2: OAUTH API ENDPOINTS
// ============================================================================

class OAuthAPI {
  constructor(oauthManager) {
    this.manager = oauthManager;
  }

  /**
   * Endpoint: GET /api/oauth/authorize
   * Start OAuth flow
   */
  async handleStartAuth(req, res) {
    try {
      const { provider, userId, redirectUri } = req.query;

      if (!provider || !userId || !redirectUri) {
        return res.status(400).json({
          error: 'provider, userId, and redirectUri are required'
        });
      }

      const authUrl = this.manager.generateAuthorizationUrl(provider, userId, redirectUri);

      return res.status(200).json({
        authorizationUrl: authUrl
      });
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }
  }

  /**
   * Endpoint: POST /api/oauth/callback
   * Handle OAuth callback
   */
  async handleCallback(req, res) {
    try {
      const { provider, code, state, redirectUri } = req.body;

      if (!provider || !code || !state) {
        return res.status(400).json({
          error: 'provider, code, and state are required'
        });
      }

      const tokenResponse = await this.manager.exchangeCodeForToken(
        provider,
        code,
        state,
        redirectUri
      );

      return res.status(200).json({
        success: true,
        ...tokenResponse
      });
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }
  }

  /**
   * Endpoint: POST /api/oauth/refresh
   * Refresh access token
   */
  async handleRefresh(req, res) {
    try {
      const { userId, provider } = req.body;

      if (!userId || !provider) {
        return res.status(400).json({
          error: 'userId and provider are required'
        });
      }

      const tokenResponse = await this.manager.refreshAccessToken(userId, provider);

      return res.status(200).json({
        success: true,
        ...tokenResponse
      });
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }
  }

  /**
   * Endpoint: GET /api/oauth/token
   * Get valid access token
   */
  async handleGetToken(req, res) {
    try {
      const { userId, provider } = req.query;

      if (!userId || !provider) {
        return res.status(400).json({
          error: 'userId and provider are required'
        });
      }

      const tokenResponse = await this.manager.getValidAccessToken(userId, provider);

      return res.status(200).json({
        success: true,
        ...tokenResponse
      });
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }
  }

  /**
   * Endpoint: POST /api/oauth/disconnect
   * Revoke and disconnect provider
   */
  async handleDisconnect(req, res) {
    try {
      const { userId, provider } = req.body;

      if (!userId || !provider) {
        return res.status(400).json({
          error: 'userId and provider are required'
        });
      }

      await this.manager.disconnectProvider(userId, provider);

      return res.status(200).json({
        success: true,
        message: `Disconnected from ${provider}`
      });
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }
  }

  /**
   * Endpoint: GET /api/oauth/providers
   * List connected providers
   */
  async handleListProviders(req, res) {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          error: 'userId is required'
        });
      }

      const providers = this.manager.listConnectedProviders(userId);

      return res.status(200).json({
        providers,
        count: providers.length
      });
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }
  }
}

// ============================================================================
// PART 3: EXPORTS
// ============================================================================

module.exports = {
  OAuthProviderManager,
  OAuthAPI
};
