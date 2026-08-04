# Zapier, Make, n8n Integration Guides & App Configs

**Document Purpose:** Complete configuration and implementation guides for integrating Oli tools with Zapier, Make.com, and n8n

**Updated:** August 1, 2026

---

## Table of Contents

1. [Zapier Integration](#zapier-integration)
2. [Make.com Integration](#makecom-integration)
3. [n8n Integration](#n8n-integration)
4. [Testing & Validation](#testing--validation)
5. [Troubleshooting](#troubleshooting)

---

## Zapier Integration

### 1. Register Oli on Zapier App Store

**Step 1: Create Zapier Partner Account**
- Go to https://zapier.com/app/developer
- Sign up or log in
- Go to "My Apps" → "Create" → "Create a public API"

**Step 2: Fill Basic Information**
```
App Name: Oli Tools
App Category: Business/CRM/Productivity
Branding:
  - Logo: https://oli.tools/logo-zapier-256x256.png
  - Primary Color: #667eea
  - Description: "Connect all 6 Oli tools (OliOps, OliCommerce, OliFlow, OliExplore, Oli-Locator, OliSalesTrack) to 9,000+ apps via Zapier webhooks"
```

**Step 3: Authentication Setup**
```json
{
  "type": "oauth2",
  "oauth2_config": {
    "authorizeUrl": "https://api.oli.tools/api/oauth/authorize?provider=zapier",
    "accessTokenUrl": "https://api.oli.tools/api/oauth/callback",
    "refreshTokenUrl": "https://api.oli.tools/api/oauth/refresh",
    "scope": "read:zaps write:zaps read:data write:data",
    "state": "true"
  }
}
```

**Step 4: Create Zapier Actions/Triggers**

### 2. Zapier Actions (Things Oli Can Do)

Create these 20+ actions in Zapier:

#### OliOps Actions
```yaml
- id: oliops_create_contact
  name: "Create Contact in OliOps"
  description: "Add a new contact to OliOps CRM"
  endpoint: "POST /api/webhooks/v1/oliops/create_contact"
  fields:
    - label: "Email"
      key: "email"
      type: "string"
      required: true
    - label: "Name"
      key: "name"
      type: "string"
      required: true
    - label: "Phone"
      key: "phone"
      type: "string"
    - label: "Tags"
      key: "tags"
      type: "string"
      help_text: "Comma-separated tags"

- id: oliops_send_email
  name: "Send Email via OliOps"
  description: "Send an email through OliOps"
  endpoint: "POST /api/webhooks/v1/oliops/send_email"
  fields:
    - label: "To"
      key: "to"
      type: "string"
      required: true
    - label: "Subject"
      key: "subject"
      type: "string"
      required: true
    - label: "Body"
      key: "body"
      type: "text"
      required: true

- id: oliops_create_task
  name: "Create Task in OliOps"
  description: "Create a new task or reminder"
  endpoint: "POST /api/webhooks/v1/oliops/create_task"
  fields:
    - label: "Title"
      key: "title"
      type: "string"
      required: true
    - label: "Description"
      key: "description"
      type: "text"
    - label: "Due Date"
      key: "dueDate"
      type: "string"
      format: "date"
```

#### OliCommerce Actions
```yaml
- id: olicommerce_create_contact
  name: "Create Customer in OliCommerce"
  description: "Add a customer for cart recovery campaigns"
  endpoint: "POST /api/webhooks/v1/olicommerce/create_contact"
  fields:
    - label: "Email"
      key: "email"
      type: "string"
    - label: "Phone"
      key: "phone"
      type: "string"
    - label: "Name"
      key: "name"
      type: "string"

- id: olicommerce_record_cart
  name: "Record Abandoned Cart"
  description: "Log a cart abandonment for recovery"
  endpoint: "POST /api/webhooks/v1/olicommerce/record_cart_recovery"
  fields:
    - label: "Cart ID"
      key: "cartId"
      type: "string"
      required: true
    - label: "Customer Email"
      key: "email"
      type: "string"
      required: true
    - label: "Cart Value"
      key: "cartValue"
      type: "number"
    - label: "Items"
      key: "items"
      type: "string"
      help_text: "JSON array of items"
```

#### OliFlow Actions
```yaml
- id: oliflow_trigger_workflow
  name: "Trigger Workflow"
  description: "Execute an OliFlow automation"
  endpoint: "POST /api/webhooks/v1/oliflow/trigger_workflow"
  fields:
    - label: "Workflow ID"
      key: "workflowId"
      type: "string"
      required: true
    - label: "Trigger Data"
      key: "triggerData"
      type: "string"
      help_text: "JSON object with workflow trigger variables"

- id: oliflow_create_workflow
  name: "Create Workflow"
  description: "Create a new automation in OliFlow"
  endpoint: "POST /api/webhooks/v1/oliflow/create_workflow"
  fields:
    - label: "Workflow Name"
      key: "name"
      type: "string"
      required: true
```

#### OliExplore Actions
```yaml
- id: oliexplore_publish_post
  name: "Publish Social Media Post"
  description: "Schedule post across multiple platforms"
  endpoint: "POST /api/webhooks/v1/oliexplore/publish_post"
  fields:
    - label: "Platforms"
      key: "platforms"
      type: "string"
      help_text: "facebook, instagram, x, tiktok, threads, linkedin (comma-separated)"
    - label: "Content"
      key: "content"
      type: "text"
      required: true
    - label: "Hashtags"
      key: "hashtags"
      type: "string"
      help_text: "Comma-separated hashtags"

- id: oliexplore_schedule_post
  name: "Schedule Social Post"
  description: "Queue post for scheduled publishing"
  endpoint: "POST /api/webhooks/v1/oliexplore/schedule_post"
  fields:
    - label: "Platforms"
      key: "platforms"
      type: "string"
    - label: "Content"
      key: "content"
      type: "text"
    - label: "Publish At"
      key: "scheduledAt"
      type: "string"
      format: "date-time"
```

#### Oli-Locator Actions
```yaml
- id: olilocator_create_lead
  name: "Create Lead"
  description: "Add a new lead to Oli-Locator"
  endpoint: "POST /api/webhooks/v1/oli-locator/create_lead"
  fields:
    - label: "Name"
      key: "name"
      type: "string"
      required: true
    - label: "Phone"
      key: "phone"
      type: "string"
      required: true
    - label: "Email"
      key: "email"
      type: "string"
    - label: "Location"
      key: "location"
      type: "string"
    - label: "Service"
      key: "service"
      type: "string"

- id: olilocator_assign_lead
  name: "Assign Lead to Agent"
  description: "Assign a lead to a specific agent"
  endpoint: "POST /api/webhooks/v1/oli-locator/assign_lead"
  fields:
    - label: "Lead ID"
      key: "leadId"
      type: "string"
      required: true
    - label: "Agent ID"
      key: "agentId"
      type: "string"
      required: true
```

#### OliSalesTrack Actions
```yaml
- id: olisalestrack_record_sale
  name: "Record Sale"
  description: "Log a sales transaction"
  endpoint: "POST /api/webhooks/v1/olisalestrack/record_sale"
  fields:
    - label: "Amount"
      key: "amount"
      type: "number"
      required: true
    - label: "Product ID"
      key: "productId"
      type: "string"
      required: true
    - label: "Customer ID"
      key: "customerId"
      type: "string"
    - label: "Currency"
      key: "currency"
      type: "string"
      default: "USD"

- id: olisalestrack_record_refund
  name: "Record Refund"
  description: "Log a refunded transaction"
  endpoint: "POST /api/webhooks/v1/olisalestrack/record_refund"
  fields:
    - label: "Sale ID"
      key: "saleId"
      type: "string"
      required: true
    - label: "Amount"
      key: "amount"
      type: "number"
      required: true
    - label: "Reason"
      key: "reason"
      type: "string"
```

### 3. Zapier Triggers (When to Use Oli)

Users can also set up reverse integrations - Oli webhooks trigger Zaps:

```yaml
- id: oliops_contact_created
  name: "When Contact Created in OliOps"
  description: "Trigger when a new contact is added"
  webhook_url: "https://api.oli.tools/api/webhooks/register"
  event_type: "contact.created"
  sample_data:
    id: "cont_12345"
    email: "user@example.com"
    name: "John Doe"
    createdAt: "2024-08-01T10:30:00Z"

- id: oli_lead_created
  name: "When Lead Created"
  description: "Trigger when any Oli tool creates a lead"
  webhook_url: "https://api.oli.tools/api/webhooks/register"
  event_type: "lead.created"
  sample_data:
    id: "lead_12345"
    name: "Jane Smith"
    email: "jane@example.com"
    phone: "+1-555-0100"

- id: oli_order_completed
  name: "When Order Completed"
  description: "Trigger when an order is completed"
  webhook_url: "https://api.oli.tools/api/webhooks/register"
  event_type: "order.completed"
  sample_data:
    orderId: "ord_12345"
    amount: 99.99
    currency: "USD"
    customerId: "cust_12345"
```

### 4. Zapier Testing Checklist

```
[ ] Authentication flow works
[ ] "Create Contact" action successfully creates contact
[ ] "Send Email" action delivers email
[ ] "Record Sale" action logs transaction
[ ] Sample data appears correctly in test
[ ] Error handling returns meaningful messages
[ ] Timeout handling works (30 second limit)
[ ] Retry logic on 429/503 responses
[ ] Webhook signature validation works
```

---

## Make.com Integration

### 1. Register Oli on Make App Store

**Step 1: Create Make Developer Account**
- Go to https://www.make.com/en/developers
- Sign up or log in
- Create new app

**Step 2: Fill App Details**
```json
{
  "name": "Oli Tools",
  "logo": "https://oli.tools/logo-make-256x256.png",
  "description": "Connect 6 Oli business tools to 500+ apps. Create contacts, send emails, automate workflows, manage leads, track sales, and publish social content.",
  "category": "crm",
  "authentication": {
    "type": "oauth2",
    "authorizeUrl": "https://api.oli.tools/api/oauth/authorize?provider=make",
    "tokenUrl": "https://api.oli.tools/api/oauth/callback",
    "refreshUrl": "https://api.oli.tools/api/oauth/refresh"
  }
}
```

### 2. Make Modules (Actions/Triggers)

Create modules in Make using this structure:

```javascript
// make-oliops-create-contact.js
module.exports = {
  name: "OliOps - Create Contact",
  description: "Create a new contact in OliOps CRM",
  definition: {
    display: {
      label: "Create Contact",
      description: "Add a new contact to your OliOps CRM",
      category: "CRM"
    },
    parameters: [
      {
        name: "email",
        type: "email",
        label: "Email",
        required: true,
        help: "Contact email address"
      },
      {
        name: "name",
        type: "text",
        label: "Name",
        required: true
      },
      {
        name: "phone",
        type: "text",
        label: "Phone"
      },
      {
        name: "tags",
        type: "text",
        label: "Tags",
        help: "Comma-separated list of tags"
      }
    ]
  },

  async execute(input) {
    const response = await fetch('https://api.oli.tools/api/webhooks/v1/oliops/create_contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${input.authToken}`
      },
      body: JSON.stringify({
        email: input.email,
        name: input.name,
        phone: input.phone,
        tags: input.tags ? input.tags.split(',').map(t => t.trim()) : []
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
};
```

### 3. Make Webhooks Setup

Enable reverse integration (Make triggers from Oli events):

```json
{
  "webhookUrl": "https://api.oli.tools/api/webhooks/register",
  "webhookSecret": "make_webhook_secret_env",
  "events": {
    "contact.created": "When Contact Created in OliOps",
    "lead.created": "When Lead Created",
    "order.completed": "When Order Completed",
    "workflow.triggered": "When Workflow Triggered"
  }
}
```

---

## n8n Integration

### 1. Create n8n Community Node

**Directory Structure:**
```
n8n-nodes-oli/
├── nodes/
│   ├── OliOps/
│   │   ├── OliOps.node.ts
│   │   ├── descriptions/
│   │   │   ├── CreateContactDescription.ts
│   │   │   ├── SendEmailDescription.ts
│   │   │   └── CreateTaskDescription.ts
│   │   └── methods/
│   │       └── listMethods.ts
│   ├── OliCommerce/
│   ├── OliFlow/
│   ├── OliExplore/
│   ├── OliLocator/
│   └── OliSalesTrack/
├── credentials/
│   └── OliApi.credentials.ts
├── package.json
└── README.md
```

**Step 2: Implement n8n Credentials**

```typescript
// credentials/OliApi.credentials.ts
import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class OliApi implements ICredentialType {
  name = 'oliApi';
  displayName = 'Oli API';
  properties: INodeProperties[] = [
    {
      displayName: 'API Token',
      name: 'apiToken',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'Bearer token from Oli',
    },
  ];
}
```

**Step 3: Implement OliOps Node**

```typescript
// nodes/OliOps/OliOps.node.ts
import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { createContactDescription } from './descriptions/CreateContactDescription';

export class OliOps implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OliOps',
    name: 'oliOps',
    icon: 'file:oliops.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Interact with OliOps CRM',
    defaults: {
      name: 'OliOps',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'oliApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          {
            name: 'Create Contact',
            value: 'createContact',
            description: 'Create a new contact',
            action: 'Create a contact',
          },
          {
            name: 'Send Email',
            value: 'sendEmail',
            description: 'Send an email',
            action: 'Send an email',
          },
          {
            name: 'Create Task',
            value: 'createTask',
            description: 'Create a task',
            action: 'Create a task',
          },
        ],
        default: 'createContact',
      },
      ...createContactDescription,
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;
    const credentials = await this.getCredentials('oliApi');

    for (let i = 0; i < items.length; i++) {
      try {
        let responseData;

        if (operation === 'createContact') {
          const email = this.getNodeParameter('email', i) as string;
          const name = this.getNodeParameter('name', i) as string;
          const phone = this.getNodeParameter('phone', i) as string;

          responseData = await this.helpers.httpRequest({
            method: 'POST',
            url: 'https://api.oli.tools/api/webhooks/v1/oliops/create_contact',
            headers: {
              Authorization: `Bearer ${credentials.apiToken}`,
            },
            json: {
              email,
              name,
              phone,
            },
          });
        }

        returnData.push({
          json: responseData,
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error.message,
            },
          });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error);
      }
    }

    return [returnData];
  }
}
```

**Step 4: Publish to npm**

```bash
npm publish --access public
```

Then users install via: `npm install n8n-nodes-oli`

### 2. n8n Webhook Integration

Enable Oli to trigger n8n workflows:

```json
{
  "endpoint": "/api/webhooks/register",
  "method": "POST",
  "payload": {
    "userId": "user123",
    "toolKey": "*",
    "url": "https://n8n.example.com/webhook/abc123",
    "events": ["contact.created", "lead.created", "order.completed"]
  }
}
```

---

## Testing & Validation

### Integration Tests

```javascript
// test-zapier-integration.js
const assert = require('assert');
const fetch = require('node-fetch');

const API_URL = 'https://api.oli.tools';
const BEARER_TOKEN = process.env.OLI_API_TOKEN;

async function testOliOpsCreateContact() {
  const response = await fetch(`${API_URL}/api/webhooks/v1/oliops/create_contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({
      email: 'test@example.com',
      name: 'Test User',
      phone: '+1-555-0100'
    })
  });

  assert.strictEqual(response.status, 200, 'Expected 200 status');
  const data = await response.json();
  assert.ok(data.data.contact.id, 'Contact should have ID');
  console.log('✓ OliOps Create Contact works');
}

async function testOliCommerceCartRecovery() {
  const response = await fetch(`${API_URL}/api/webhooks/v1/olicommerce/record_cart_recovery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({
      cartId: 'cart_123',
      email: 'user@example.com',
      cartValue: 99.99,
      items: [{ id: 'prod_1', qty: 2 }]
    })
  });

  assert.strictEqual(response.status, 200);
  console.log('✓ OliCommerce Cart Recovery works');
}

async function testOliFlowTrigger() {
  const response = await fetch(`${API_URL}/api/webhooks/v1/oliflow/trigger_workflow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({
      workflowId: 'wf_123',
      triggerData: { email: 'test@example.com' }
    })
  });

  assert.strictEqual(response.status, 200);
  console.log('✓ OliFlow Trigger works');
}

async function runAllTests() {
  console.log('Running integration tests...\n');
  await testOliOpsCreateContact();
  await testOliCommerceCartRecovery();
  await testOliFlowTrigger();
  console.log('\n✓ All integration tests passed!');
}

runAllTests().catch(console.error);
```

### Validation Checklist

```markdown
## Pre-Launch Validation

### Zapier Integration
- [ ] OAuth flow completes successfully
- [ ] All 20 actions tested and working
- [ ] Error messages are helpful
- [ ] Rate limiting works correctly
- [ ] Timeouts handled gracefully
- [ ] Test data appears in Zapier correctly

### Make.com Integration
- [ ] Modules appear in Make UI
- [ ] Create modules execute without errors
- [ ] Webhook triggers work bi-directionally
- [ ] Field mapping is intuitive
- [ ] Sample data is realistic

### n8n Integration
- [ ] Node installs via npm without errors
- [ ] Credentials are stored securely
- [ ] All operations execute correctly
- [ ] Webhook triggering works
- [ ] Community documentation is clear

### API & Webhooks
- [ ] All 6 tools have working webhook handlers
- [ ] Rate limiting protects against abuse
- [ ] Dead letter queue captures failures
- [ ] Retry logic works with exponential backoff
- [ ] HMAC signature validation is correct
```

---

## Troubleshooting

### Common Issues & Solutions

#### Issue: "Invalid token" error

**Cause:** Bearer token is expired or invalid

**Solution:**
```javascript
// Refresh token before retrying
const refreshResponse = await fetch('https://api.oli.tools/api/oauth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    provider: 'zapier'
  })
});
```

#### Issue: Zapier timeout (>30 seconds)

**Cause:** API is slow to respond

**Solution:**
- Add caching for frequently accessed data
- Implement async queueing (don't wait for result)
- Return 202 Accepted instead of 200 OK

#### Issue: Make webhook not triggering

**Cause:** Webhook URL incorrect or not registered

**Solution:**
```bash
# Register webhook manually
curl -X POST https://api.oli.tools/api/webhooks/register \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "toolKey": "oliops",
    "url": "https://hook.make.com/abc123",
    "events": ["contact.created"]
  }'
```

#### Issue: n8n node won't install

**Cause:** NPM package not published correctly

**Solution:**
```bash
# Check package publication
npm view n8n-nodes-oli version

# If missing, publish to npm
npm publish --access public
```

### Debug Endpoints

```bash
# Check API health
curl https://api.oli.tools/api/webhooks/health

# View recent logs
curl -H "Authorization: Bearer {token}" \
  https://api.oli.tools/api/webhooks/logs?tool=oliops&status=error

# Get webhook statistics
curl -H "Authorization: Bearer {token}" \
  https://api.oli.tools/api/webhooks/statistics
```

---

## Next Steps

1. **Submit to App Stores**
   - Zapier: https://zapier.com/app/developer/apply
   - Make: https://www.make.com/en/developers
   - n8n: Publish to npm as community node

2. **Create Video Tutorials**
   - "How to connect Oli to Zapier in 2 minutes"
   - "Automate your workflow with Oli + Make"
   - "Build n8n workflows with Oli"

3. **Set Up Support**
   - Dedicated Slack channel for integration issues
   - FAQ on Oli documentation site
   - Integration examples library

4. **Monitor Integration Usage**
   - Track which integrations are most popular
   - Collect user feedback
   - Iterate based on usage patterns

---
