/**
 * triggers/new-event.js
 * ======================
 * Zapier "REST Hook" trigger: New Oli Event (instant).
 *
 * How this works with the server we built:
 *  1. When a user turns this trigger on in a Zap, Zapier calls `performSubscribe`,
 *     which calls our POST /api/webhooks/register endpoint - the SAME endpoint
 *     any other webhook consumer (Make, n8n, a customer's own server) uses.
 *  2. From then on, whenever an Oli tool emits an event via
 *     outbound.emitEvent() (see lib/webhook-bridge.js and lib/ghl-bridge.js),
 *     our server POSTs the event straight to Zapier's provided target_url.
 *     Zapier then feeds that payload into the user's Zap - instantly, no
 *     polling.
 *  3. If the user turns the Zap off, `performUnsubscribe` calls our
 *     DELETE /api/webhooks/:webhookId endpoint to stop delivery.
 *
 * `performList` is required by Zapier as a fallback/test path (used when a
 * user clicks "Test trigger" in the Zap editor) and simply returns the most
 * recent event of this type by polling our own dead-letter-free list; since
 * our server does not keep a general "recent events" feed yet, we return a
 * realistic sample so the Zap editor works, and rely on the live REST hook
 * for real usage. This is a known gap - see NOTES.md "Known Limitations".
 */

const subscribeHook = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/register`,
    method: 'POST',
    body: {
      userId: bundle.authData.oliUserId || bundle.authData.apiToken,
      url: bundle.targetUrl,
      events: [bundle.inputData.eventType || '*'],
      toolKey: bundle.inputData.toolKey || '*'
    }
  });
  return response.data; // { success, webhookId, secret }
};

const unsubscribeHook = async (z, bundle) => {
  const webhookId = bundle.subscribeData.webhookId;
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/${webhookId}`,
    method: 'DELETE'
  });
  return response.data;
};

const getEvent = (z, bundle) => {
  // bundle.cleanedRequest is the JSON body Oli's outbound webhook POSTed.
  return [bundle.cleanedRequest];
};

const performList = async (z, bundle) => {
  // Fallback sample for the "Test this step" button in the Zap editor.
  return [
    {
      id: 'evt_sample',
      type: bundle.inputData.eventType || 'contact.created',
      tool: bundle.inputData.toolKey || 'oliops',
      timestamp: new Date().toISOString(),
      data: { id: 'sample-id', email: 'sample@example.com', name: 'Sample Contact' }
    }
  ];
};

module.exports = {
  key: 'new_event',
  noun: 'Event',
  display: {
    label: 'New Event (Instant)',
    description: 'Triggers instantly when a matching event happens in any Oli tool (contact created, lead assigned, sale recorded, etc.).'
  },
  operation: {
    type: 'hook',
    inputFields: [
      {
        key: 'toolKey', label: 'Oli Tool', type: 'string', required: false,
        choices: { oliops: 'OliOps', olicommerce: 'OliCommerce', oliflow: 'OliFlow', oliexplore: 'OliExplore', 'oli-locator': 'Oli-Locator', olisalestrack: 'OliSalesTrack', '*': 'Any tool' },
        default: '*'
      },
      {
        key: 'eventType', label: 'Event Type', type: 'string', required: false,
        helpText: 'e.g. contact.created, lead.assigned, sale.recorded. Leave blank for all events.',
        default: '*'
      }
    ],
    performSubscribe: subscribeHook,
    performUnsubscribe: unsubscribeHook,
    perform: getEvent,
    performList,
    sample: {
      id: 'evt_sample', type: 'contact.created', tool: 'oliops',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { id: 'sample-id', email: 'sample@example.com', name: 'Sample Contact' }
    }
  }
};
