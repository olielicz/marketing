import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

/**
 * Oli.node.ts
 * ============
 * n8n action node covering all 6 Oli tools via the resource/operation
 * pattern. Every operation below maps 1:1 to a route that exists in
 * server.js - nothing here calls an endpoint that isn't implemented.
 *
 * Resources match the tool keys used by lib/webhook-bridge.js exactly
 * (oliops, olicommerce, oliflow, oliexplore, oli-locator, olisalestrack)
 * so this node and the Zapier app stay consistent with the server.
 */
export class Oli implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Oli',
		name: 'oli',
		icon: 'file:oli.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Interact with OliOps, OliCommerce, OliFlow, OliExplore, Oli-Locator, and OliSalesTrack',
		defaults: { name: 'Oli' },
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [{ name: 'oliApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'OliOps (CRM)', value: 'oliops' },
					{ name: 'OliCommerce', value: 'olicommerce' },
					{ name: 'OliFlow', value: 'oliflow' },
					{ name: 'OliExplore', value: 'oliexplore' },
					{ name: 'Oli-Locator', value: 'oli-locator' },
					{ name: 'OliSalesTrack', value: 'olisalestrack' },
				],
				default: 'oliops',
			},

			// ---- OliOps operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['oliops'] } },
				options: [
					{ name: 'Create Contact', value: 'create_contact', action: 'Create a contact' },
					{ name: 'Update Contact', value: 'update_contact', action: 'Update a contact' },
					{ name: 'Create Task', value: 'create_task', action: 'Create a task' },
					{ name: 'Send Email', value: 'send_email', action: 'Send an email' },
				],
				default: 'create_contact',
			},
			// ---- OliCommerce operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['olicommerce'] } },
				options: [
					{ name: 'Create Contact', value: 'create_contact', action: 'Create a contact' },
					{ name: 'Record Cart Recovery', value: 'record_cart_recovery', action: 'Record a cart recovery' },
					{ name: 'Sync Store', value: 'sync_store', action: 'Sync a store' },
				],
				default: 'record_cart_recovery',
			},
			// ---- OliFlow operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['oliflow'] } },
				options: [
					{ name: 'Trigger Workflow', value: 'trigger_workflow', action: 'Trigger a workflow' },
					{ name: 'Create Workflow', value: 'create_workflow', action: 'Create a workflow' },
					{ name: 'Get Workflow History', value: 'get_workflow_history', action: 'Get workflow history' },
				],
				default: 'trigger_workflow',
			},
			// ---- OliExplore operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['oliexplore'] } },
				options: [
					{ name: 'Publish Post', value: 'publish_post', action: 'Publish a post' },
					{ name: 'Schedule Post', value: 'schedule_post', action: 'Schedule a post' },
					{ name: 'Fetch Posts', value: 'fetch_posts', action: 'Fetch posts' },
				],
				default: 'publish_post',
			},
			// ---- Oli-Locator operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['oli-locator'] } },
				options: [
					{ name: 'Create Lead', value: 'create_lead', action: 'Create a lead' },
					{ name: 'Update Lead', value: 'update_lead', action: 'Update a lead' },
					{ name: 'Assign Lead', value: 'assign_lead', action: 'Assign a lead' },
					{ name: 'Get Leads', value: 'get_leads', action: 'Get leads' },
				],
				default: 'create_lead',
			},
			// ---- OliSalesTrack operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['olisalestrack'] } },
				options: [
					{ name: 'Record Sale', value: 'record_sale', action: 'Record a sale' },
					{ name: 'Record Refund', value: 'record_refund', action: 'Record a refund' },
					{ name: 'Get Revenue Report', value: 'get_revenue_report', action: 'Get a revenue report' },
				],
				default: 'record_sale',
			},

			// Generic JSON body field - keeps this node maintainable without
			// hand-writing dozens of per-operation input fields up front.
			// Trade-off documented in n8n-node/NOTES.md.
			{
				displayName: 'Fields (JSON)',
				name: 'fieldsJson',
				type: 'json',
				default: '{}',
				description:
					'The action payload as JSON. Field names must match the Oli API for the selected operation (see integration-layer-04-openapi-spec.yaml). Example for oliops/create_contact: {"email": "jane@example.com", "name": "Jane Doe"}',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('oliApi');
		const baseUrl = (credentials.apiBaseUrl as string).replace(/\/$/, '');

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;
			const fieldsJsonRaw = this.getNodeParameter('fieldsJson', i) as string;

			let body: Record<string, unknown>;
			try {
				body = typeof fieldsJsonRaw === 'string' ? JSON.parse(fieldsJsonRaw) : (fieldsJsonRaw as Record<string, unknown>);
			} catch (err) {
				throw new NodeOperationError(this.getNode(), `Fields (JSON) is not valid JSON: ${(err as Error).message}`, { itemIndex: i });
			}

			try {
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'oliApi', {
					method: 'POST',
					url: `${baseUrl}/api/webhooks/v1/${resource}/${operation}`,
					body,
					json: true,
				});
				returnData.push({ json: response as Record<string, unknown>, pairedItem: { item: i } });
			} catch (err) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (err as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw err;
			}
		}

		return [returnData];
	}
}
