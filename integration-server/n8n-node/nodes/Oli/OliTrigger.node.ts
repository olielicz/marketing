import {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	NodeConnectionType,
} from 'n8n-workflow';

/**
 * OliTrigger.node.ts
 * ===================
 * n8n trigger node for real-time Oli events. Uses n8n's webhook lifecycle
 * hooks (checkExists / create / delete) wired to the SAME
 * /api/webhooks/register and /api/webhooks/:id endpoints the Zapier app's
 * new-event.js trigger uses - one outbound webhook system serves both
 * platforms without duplicated server-side logic.
 */
export class OliTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Oli Trigger',
		name: 'oliTrigger',
		icon: 'file:oli.svg',
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when an event happens in any Oli tool',
		defaults: { name: 'Oli Trigger' },
		inputs: [],
		outputs: [NodeConnectionType.Main],
		credentials: [{ name: 'oliApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Oli Tool',
				name: 'toolKey',
				type: 'options',
				options: [
					{ name: 'Any Tool', value: '*' },
					{ name: 'OliOps', value: 'oliops' },
					{ name: 'OliCommerce', value: 'olicommerce' },
					{ name: 'OliFlow', value: 'oliflow' },
					{ name: 'OliExplore', value: 'oliexplore' },
					{ name: 'Oli-Locator', value: 'oli-locator' },
					{ name: 'OliSalesTrack', value: 'olisalestrack' },
				],
				default: '*',
			},
			{
				displayName: 'Event Type',
				name: 'eventType',
				type: 'string',
				default: '*',
				description: 'e.g. contact.created, lead.assigned, sale.recorded. Use * for all events.',
			},
			{
				displayName: 'Oli User ID',
				name: 'oliUserId',
				type: 'string',
				default: '',
				required: true,
				description: 'The Oli account/user ID whose events you want to subscribe to.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				return webhookData.webhookId !== undefined;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('oliApi');
				const baseUrl = (credentials.apiBaseUrl as string).replace(/\/$/, '');
				const webhookUrl = this.getNodeWebhookUrl('default');
				const toolKey = this.getNodeParameter('toolKey') as string;
				const eventType = this.getNodeParameter('eventType') as string;
				const oliUserId = this.getNodeParameter('oliUserId') as string;

				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'oliApi', {
					method: 'POST',
					url: `${baseUrl}/api/webhooks/register`,
					body: { userId: oliUserId, url: webhookUrl, events: [eventType], toolKey },
					json: true,
				});

				const webhookData = this.getWorkflowStaticData('node');
				webhookData.webhookId = (response as { webhookId: string }).webhookId;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId === undefined) return true;

				const credentials = await this.getCredentials('oliApi');
				const baseUrl = (credentials.apiBaseUrl as string).replace(/\/$/, '');

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'oliApi', {
						method: 'DELETE',
						url: `${baseUrl}/api/webhooks/${webhookData.webhookId}`,
						json: true,
					});
				} catch {
					// Webhook may already be gone server-side; don't block deactivation.
				}
				delete webhookData.webhookId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const bodyData = this.getBodyData();
		return { workflowData: [[{ json: bodyData }]] };
	}
}
