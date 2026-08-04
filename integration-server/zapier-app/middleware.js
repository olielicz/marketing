/**
 * middleware.js
 * =============
 * Injects the stored bearer token into every outgoing request automatically,
 * so individual trigger/create files don't need to repeat auth headers.
 */

const includeApiToken = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.apiToken) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${bundle.authData.apiToken}`;
  }
  return request;
};

// Surface Oli's structured error messages ({ error: "..." }) as the Zapier
// error text instead of a generic "unexpected status code" message.
const handleErrors = (response, z) => {
  if (response.status >= 400) {
    const body = response.json || {};
    throw new z.errors.Error(
      body.error || `Unexpected error (HTTP ${response.status})`,
      body.error ? 'InvalidRequest' : 'UnexpectedError',
      response.status
    );
  }
  return response;
};

module.exports = { includeApiToken, handleErrors };
