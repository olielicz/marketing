/**
 * creates/oliops-create-contact.js
 * =================================
 * Zapier "Create" action: OliOps > Create Contact.
 * Calls POST {apiBaseUrl}/api/webhooks/v1/oliops/create_contact
 */

const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/v1/oliops/create_contact`,
    method: 'POST',
    body: {
      email: bundle.inputData.email,
      name: bundle.inputData.name,
      phone: bundle.inputData.phone,
      tags: bundle.inputData.tags ? bundle.inputData.tags.split(',').map(t => t.trim()) : []
    }
  });
  return response.data.contact;
};

module.exports = {
  key: 'oliops_create_contact',
  noun: 'Contact',
  display: {
    label: 'Create Contact (OliOps)',
    description: 'Creates a new contact in OliOps CRM.'
  },
  operation: {
    inputFields: [
      { key: 'email', label: 'Email', type: 'string', required: true },
      { key: 'name', label: 'Name', type: 'string', required: false },
      { key: 'phone', label: 'Phone', type: 'string', required: false },
      { key: 'tags', label: 'Tags (comma-separated)', type: 'string', required: false }
    ],
    perform,
    sample: {
      id: 'sample-contact-id',
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: '+15551234567',
      tags: ['vip'],
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  }
};
