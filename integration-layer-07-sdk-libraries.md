# Oli Integration SDKs & Libraries

**Document Purpose:** Complete SDKs and client libraries for developers integrating with Oli tools

**Available Languages:** JavaScript/Node.js, Python, PHP, Go, Java

---

## Table of Contents

1. [JavaScript/Node.js SDK](#javascriptnodejs-sdk)
2. [Python SDK](#python-sdk)
3. [PHP SDK](#php-sdk)
4. [Go SDK](#go-sdk)
5. [Installation & Setup](#installation--setup)
6. [Examples](#examples)

---

## JavaScript/Node.js SDK

### Installation

```bash
npm install @oli/sdk
# or
yarn add @oli/sdk
```

### Usage

```javascript
const OliSDK = require('@oli/sdk');

// Initialize client
const oli = new OliSDK.Client({
  apiToken: 'your-api-token',
  baseUrl: 'https://api.oli.tools'
});

// Create contact in OliOps
const contact = await oli.oliops.createContact({
  email: 'john@example.com',
  name: 'John Doe',
  phone: '+1-555-0100',
  tags: ['vip', 'customer']
});

// Trigger OliFlow workflow
const execution = await oli.oliflow.triggerWorkflow({
  workflowId: 'wf_abc123',
  triggerData: { customerId: contact.id }
});

// Create lead in Oli-Locator
const lead = await oli.oliLocator.createLead({
  name: 'Jane Smith',
  phone: '+1-555-0200',
  email: 'jane@example.com',
  location: 'New York, NY',
  service: 'plumbing'
});

// Record sale in OliSalesTrack
const sale = await oli.oliSalesTrack.recordSale({
  amount: 299.99,
  productId: 'prod_xyz',
  customerId: contact.id,
  currency: 'USD'
});

// Listen for outbound webhooks
oli.webhooks.on('contact.created', (event) => {
  console.log('New contact created:', event.data);
});

// Register webhook
const webhookId = await oli.webhooks.register({
  url: 'https://your-app.com/webhooks/oli',
  events: ['contact.created', 'lead.assigned'],
  toolKey: '*'
});
```

### Full API Reference

```javascript
// OliOps Methods
await oli.oliops.createContact(data)
await oli.oliops.updateContact(contactId, updates)
await oli.oliops.sendEmail(emailData)
await oli.oliops.createTask(taskData)
await oli.oliops.logEvent(eventData)

// OliCommerce Methods
await oli.olicommerce.createContact(data)
await oli.olicommerce.recordCartRecovery(cartData)
await oli.olicommerce.syncStore(storeData)

// OliFlow Methods
await oli.oliflow.triggerWorkflow(data)
await oli.oliflow.createWorkflow(workflowData)
await oli.oliflow.getWorkflowHistory(workflowId)

// OliExplore Methods
await oli.oliexplore.publishPost(postData)
await oli.oliexplore.schedulePost(postData)
await oli.oliexplore.fetchPosts(platform, limit)

// Oli-Locator Methods
await oli.oliLocator.createLead(leadData)
await oli.oliLocator.updateLead(leadId, updates)
await oli.oliLocator.assignLead(leadId, agentId)
await oli.oliLocator.getLeads(filter)

// OliSalesTrack Methods
await oli.oliSalesTrack.recordSale(saleData)
await oli.oliSalesTrack.recordRefund(refundData)
await oli.oliSalesTrack.getRevenueReport(filter)

// Webhook Methods
await oli.webhooks.register(webhookConfig)
await oli.webhooks.list(userId)
await oli.webhooks.update(webhookId, updates)
await oli.webhooks.delete(webhookId)
await oli.webhooks.on(eventType, callback)

// OAuth Methods
const authUrl = oli.oauth.generateAuthorizationUrl('zapier')
const token = await oli.oauth.exchangeCodeForToken(provider, code)
const refreshed = await oli.oauth.refreshAccessToken(provider)
```

### Source Code

```bash
# GitHub Repository
https://github.com/olielicz/sdk-js

# NPM Package
https://www.npmjs.com/package/@oli/sdk
```

---

## Python SDK

### Installation

```bash
pip install oli-sdk
# or
pip install -U oli-sdk
```

### Usage

```python
from oli_sdk import OliClient

# Initialize client
client = OliClient(
    api_token='your-api-token',
    base_url='https://api.oli.tools'
)

# Create contact
contact = client.oliops.create_contact(
    email='john@example.com',
    name='John Doe',
    phone='+1-555-0100',
    tags=['vip']
)

# Trigger workflow
execution = client.oliflow.trigger_workflow(
    workflow_id='wf_abc123',
    trigger_data={'customer_id': contact['id']}
)

# Create lead
lead = client.oli_locator.create_lead(
    name='Jane Smith',
    phone='+1-555-0200',
    email='jane@example.com',
    location='New York, NY',
    service='plumbing'
)

# Record sale
sale = client.oli_salestrack.record_sale(
    amount=299.99,
    product_id='prod_xyz',
    customer_id=contact['id'],
    currency='USD'
)

# Register webhook
webhook_id = client.webhooks.register(
    url='https://your-app.com/webhooks/oli',
    events=['contact.created', 'lead.assigned'],
    tool_key='*'
)

# Listen for events
@client.webhooks.on_event('contact.created')
def handle_contact_created(event):
    print(f"New contact: {event['data']}")
```

### Full API Reference

```python
# OliOps
client.oliops.create_contact(email, name, phone, tags)
client.oliops.update_contact(contact_id, updates)
client.oliops.send_email(to, subject, body, from_addr)
client.oliops.create_task(title, description, due_date, assignee)

# OliCommerce
client.olicommerce.create_contact(email, phone, name)
client.olicommerce.record_cart_recovery(cart_id, email, cart_value, items)

# OliFlow
client.oliflow.trigger_workflow(workflow_id, trigger_data)
client.oliflow.create_workflow(name, trigger, actions)

# OliExplore
client.oliexplore.publish_post(platforms, content, hashtags)
client.oliexplore.schedule_post(platforms, content, scheduled_at)

# Oli-Locator
client.oli_locator.create_lead(name, phone, email, location, service)
client.oli_locator.update_lead(lead_id, updates)
client.oli_locator.assign_lead(lead_id, agent_id)

# OliSalesTrack
client.oli_salestrack.record_sale(amount, product_id, customer_id, currency)
client.oli_salestrack.record_refund(sale_id, amount, reason)

# Webhooks
client.webhooks.register(url, events, tool_key)
client.webhooks.list(user_id, tool_key)
client.webhooks.delete(webhook_id)
```

### Source Code

```bash
# GitHub Repository
https://github.com/olielicz/sdk-python

# PyPI Package
https://pypi.org/project/oli-sdk/
```

---

## PHP SDK

### Installation

```bash
composer require olielicz/sdk-php
```

### Usage

```php
<?php

use OliSDK\Client;

// Initialize client
$client = new Client([
    'apiToken' => 'your-api-token',
    'baseUrl' => 'https://api.oli.tools'
]);

// Create contact
$contact = $client->oliops()->createContact([
    'email' => 'john@example.com',
    'name' => 'John Doe',
    'phone' => '+1-555-0100',
    'tags' => ['vip', 'customer']
]);

// Trigger workflow
$execution = $client->oliflow()->triggerWorkflow([
    'workflowId' => 'wf_abc123',
    'triggerData' => ['customerId' => $contact['id']]
]);

// Create lead
$lead = $client->oliLocator()->createLead([
    'name' => 'Jane Smith',
    'phone' => '+1-555-0200',
    'email' => 'jane@example.com',
    'location' => 'New York, NY',
    'service' => 'plumbing'
]);

// Record sale
$sale = $client->oliSalesTrack()->recordSale([
    'amount' => 299.99,
    'productId' => 'prod_xyz',
    'customerId' => $contact['id'],
    'currency' => 'USD'
]);

// Register webhook
$webhookId = $client->webhooks()->register([
    'url' => 'https://your-app.com/webhooks/oli',
    'events' => ['contact.created', 'lead.assigned'],
    'toolKey' => '*'
]);

// Handle incoming webhook
$payload = json_decode(file_get_contents('php://input'), true);
$client->webhooks()->validate($payload);

switch ($payload['type']) {
    case 'contact.created':
        handleNewContact($payload['data']);
        break;
    case 'lead.created':
        handleNewLead($payload['data']);
        break;
}
```

### Full API Reference

```php
// OliOps
$client->oliops()->createContact($data)
$client->oliops()->updateContact($contactId, $updates)
$client->oliops()->sendEmail($data)
$client->oliops()->createTask($data)

// OliCommerce
$client->olicommerce()->createContact($data)
$client->olicommerce()->recordCartRecovery($data)

// OliFlow
$client->oliflow()->triggerWorkflow($data)
$client->oliflow()->createWorkflow($data)

// OliExplore
$client->oliexplore()->publishPost($data)
$client->oliexplore()->schedulePost($data)

// Oli-Locator
$client->oliLocator()->createLead($data)
$client->oliLocator()->updateLead($leadId, $updates)
$client->oliLocator()->assignLead($leadId, $agentId)

// OliSalesTrack
$client->oliSalesTrack()->recordSale($data)
$client->oliSalesTrack()->recordRefund($data)

// Webhooks
$client->webhooks()->register($config)
$client->webhooks()->list($userId)
$client->webhooks()->delete($webhookId)
$client->webhooks()->validate($payload)
```

### Source Code

```bash
# GitHub Repository
https://github.com/olielicz/sdk-php

# Packagist Package
https://packagist.org/packages/olielicz/sdk-php
```

---

## Go SDK

### Installation

```bash
go get github.com/olielicz/sdk-go
```

### Usage

```go
package main

import (
    "fmt"
    oli "github.com/olielicz/sdk-go"
)

func main() {
    // Initialize client
    client := oli.NewClient(&oli.Config{
        APIToken: "your-api-token",
        BaseURL:  "https://api.oli.tools",
    })

    // Create contact
    contact, err := client.OliOps.CreateContact(&oli.ContactData{
        Email: "john@example.com",
        Name:  "John Doe",
        Phone: "+1-555-0100",
        Tags:  []string{"vip"},
    })
    if err != nil {
        fmt.Println("Error:", err)
        return
    }

    // Trigger workflow
    execution, err := client.OliFlow.TriggerWorkflow(&oli.WorkflowTrigger{
        WorkflowID: "wf_abc123",
        TriggerData: map[string]interface{}{
            "customerId": contact.ID,
        },
    })

    // Create lead
    lead, err := client.OliLocator.CreateLead(&oli.LeadData{
        Name:     "Jane Smith",
        Phone:    "+1-555-0200",
        Email:    "jane@example.com",
        Location: "New York, NY",
        Service:  "plumbing",
    })

    // Record sale
    sale, err := client.OliSalesTrack.RecordSale(&oli.SaleData{
        Amount:     299.99,
        ProductID:  "prod_xyz",
        CustomerID: contact.ID,
        Currency:   "USD",
    })

    // Register webhook
    webhookID, err := client.Webhooks.Register(&oli.WebhookConfig{
        URL:     "https://your-app.com/webhooks/oli",
        Events:  []string{"contact.created", "lead.assigned"},
        ToolKey: "*",
    })

    fmt.Println("Contact:", contact)
    fmt.Println("Lead:", lead)
    fmt.Println("Sale:", sale)
    fmt.Println("Webhook ID:", webhookID)
}
```

### Source Code

```bash
# GitHub Repository
https://github.com/olielicz/sdk-go

# Go Package
go get github.com/olielicz/sdk-go@latest
```

---

## Java SDK

### Installation

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.olielicz</groupId>
    <artifactId>oli-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Usage

```java
import com.olielicz.sdk.*;

public class OliExample {
    public static void main(String[] args) throws Exception {
        // Initialize client
        OliClient client = new OliClient.Builder()
            .apiToken("your-api-token")
            .baseUrl("https://api.oli.tools")
            .build();

        // Create contact
        Contact contact = client.oliops().createContact(
            ContactData.builder()
                .email("john@example.com")
                .name("John Doe")
                .phone("+1-555-0100")
                .tags(Arrays.asList("vip"))
                .build()
        );

        // Trigger workflow
        WorkflowExecution execution = client.oliflow().triggerWorkflow(
            WorkflowTrigger.builder()
                .workflowId("wf_abc123")
                .triggerData(Map.of("customerId", contact.getId()))
                .build()
        );

        // Create lead
        Lead lead = client.oliLocator().createLead(
            LeadData.builder()
                .name("Jane Smith")
                .phone("+1-555-0200")
                .email("jane@example.com")
                .location("New York, NY")
                .service("plumbing")
                .build()
        );

        // Record sale
        Sale sale = client.oliSalesTrack().recordSale(
            SaleData.builder()
                .amount(299.99)
                .productId("prod_xyz")
                .customerId(contact.getId())
                .currency("USD")
                .build()
        );

        System.out.println("Contact: " + contact);
        System.out.println("Lead: " + lead);
        System.out.println("Sale: " + sale);
    }
}
```

### Source Code

```bash
# GitHub Repository
https://github.com/olielicz/sdk-java

# Maven Central
https://mvnrepository.com/artifact/com.olielicz/oli-sdk
```

---

## Installation & Setup

### Prerequisites

- API token from Oli (obtain from dashboard)
- Supported runtime: Node.js 14+, Python 3.7+, PHP 7.4+, Go 1.16+, Java 8+

### Environment Variables

```bash
export OLI_API_TOKEN="your-api-token"
export OLI_BASE_URL="https://api.oli.tools"
```

### Error Handling

All SDKs follow consistent error handling patterns:

```javascript
// JavaScript
try {
    const contact = await oli.oliops.createContact(data);
} catch (error) {
    if (error.code === 'AUTHENTICATION_ERROR') {
        console.error('Invalid API token');
    } else if (error.code === 'RATE_LIMITED') {
        console.error('Rate limited - retry in', error.retryAfter, 'seconds');
    } else if (error.code === 'VALIDATION_ERROR') {
        console.error('Validation failed:', error.details);
    } else {
        console.error('Unexpected error:', error.message);
    }
}
```

### Retry Logic

All SDKs include automatic retry logic:

```javascript
// Automatically retries with exponential backoff
// Max 3 attempts, up to 5 seconds between retries
const contact = await oli.oliops.createContact(data);
```

---

## Examples

### Example 1: Auto-sync CRM Contacts to Oli-Locator

```javascript
const OliSDK = require('@oli/sdk');

async function syncContactsToOli(contacts) {
    const oli = new OliSDK.Client({ apiToken: process.env.OLI_API_TOKEN });

    for (const contact of contacts) {
        try {
            const lead = await oli.oliLocator.createLead({
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                location: contact.city,
                service: contact.category
            });

            console.log(`✓ Created lead: ${lead.id}`);
        } catch (error) {
            console.error(`✗ Failed for ${contact.name}: ${error.message}`);
        }
    }
}
```

### Example 2: Create Zap in Zapier via SDK

```python
from oli_sdk import OliClient

client = OliClient(api_token='your-token')

# When new contact created in CRM
# Create contact in OliOps
# Record in OliSalesTrack
# Trigger OliFlow workflow

contact = client.oliops.create_contact(
    email='lead@example.com',
    name='New Lead',
)

sale = client.oli_salestrack.record_sale(
    amount=0,  # placeholder
    product_id='inquiry',
    customer_id=contact['id']
)

workflow = client.oliflow.trigger_workflow(
    workflow_id='wf_lead_followup',
    trigger_data={'contactId': contact['id']}
)
```

### Example 3: Webhook Handler in Node.js/Express

```javascript
const express = require('express');
const OliSDK = require('@oli/sdk');

const app = express();
app.use(express.json());

const oli = new OliSDK.Client({ apiToken: process.env.OLI_API_TOKEN });

app.post('/webhooks/oli', async (req, res) => {
    try {
        const event = req.body;

        // Verify webhook signature
        if (!OliSDK.verifyWebhookSignature(event, req.headers['x-oli-signature'])) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Handle different event types
        switch (event.type) {
            case 'contact.created':
                await handleContactCreated(event.data);
                break;

            case 'lead.created':
                await handleLeadCreated(event.data);
                break;

            case 'order.completed':
                await handleOrderCompleted(event.data);
                break;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

async function handleContactCreated(contact) {
    console.log('New contact:', contact);
    // Your business logic here
}

async function handleLeadCreated(lead) {
    console.log('New lead:', lead);
    // Your business logic here
}

async function handleOrderCompleted(order) {
    console.log('Order completed:', order);
    // Your business logic here
}

app.listen(3000, () => console.log('Webhook server listening on :3000'));
```

---

## Support & Documentation

- **Documentation:** https://docs.oli.tools/sdk
- **Issues:** https://github.com/olielicz/sdk-{lang}/issues
- **Email:** sdk-support@oli.tools
- **Slack:** #sdk-support (community)

---

