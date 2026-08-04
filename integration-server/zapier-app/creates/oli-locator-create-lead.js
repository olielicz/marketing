const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/v1/oli-locator/create_lead`,
    method: 'POST',
    body: {
      name: bundle.inputData.name,
      phone: bundle.inputData.phone,
      email: bundle.inputData.email,
      location: bundle.inputData.location,
      service: bundle.inputData.service
    }
  });
  return response.data.lead;
};

module.exports = {
  key: 'oli_locator_create_lead',
  noun: 'Lead',
  display: { label: 'Create Lead (Oli-Locator)', description: 'Creates a new lead in Oli-Locator.' },
  operation: {
    inputFields: [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'phone', label: 'Phone', type: 'string', required: true },
      { key: 'email', label: 'Email', type: 'string', required: false },
      { key: 'location', label: 'Location', type: 'string', required: false },
      { key: 'service', label: 'Service', type: 'string', required: false }
    ],
    perform,
    sample: { id: 'sample-lead-id', name: 'Jane Doe', phone: '+15551234567', status: 'new' }
  }
};
