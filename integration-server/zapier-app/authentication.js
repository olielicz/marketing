/**
 * authentication.js
 * =================
 * Custom (bearer token) authentication for the Zapier Platform CLI app.
 *
 * We use "custom" auth (not OAuth2) here because the simplest, fastest
 * path to a working integration is: the Oli customer issues themselves a
 * bearer token from their Oli account (POST /api/tokens, or eventually a
 * "Generate API Token" button in the Oli dashboard) and pastes it into
 * Zapier when connecting the app. This matches how most CLI-based Zapier
 * integrations start.
 *
 * If/when you want the full OAuth2 "Sign in with Oli" consent screen
 * experience (nicer for end users, harder to build), swap `type: 'custom'`
 * for `type: 'oauth2'` and wire it to the /api/oauth/* endpoints already
 * implemented in server.js + lib/oauth.js - those endpoints are provider-
 * agnostic and can issue tokens for Zapier calling in on YOUR side too,
 * not just Oli calling out to Zapier. That's a follow-up, not a blocker.
 */

const testAuth = (z, bundle) => {
  const response = z.request({
    url: '{{bundle.authData.apiBaseUrl}}/health',
    method: 'GET'
  });

  return response.then((response) => {
    if (response.status === 401) {
      throw new Error('The API token you supplied is invalid or expired.');
    }
    return response.data;
  });
};

module.exports = {
  type: 'custom',
  test: testAuth,
  fields: [
    {
      key: 'apiBaseUrl',
      label: 'Oli API Base URL',
      type: 'string',
      required: true,
      default: 'https://api.oli.tools',
      helpText: 'The base URL of your Oli integration server. Leave as default unless you are self-hosting.'
    },
    {
      key: 'apiToken',
      label: 'Oli API Token',
      type: 'password',
      required: true,
      helpText: 'Generate this from your Oli dashboard under Settings > Integrations > API Tokens.'
    }
  ],
  connectionLabel: '{{bundle.authData.apiBaseUrl}}'
};
