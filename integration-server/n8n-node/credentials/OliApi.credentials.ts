import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * OliApi.credentials.ts
 * ======================
 * n8n credential type for the Oli integration server. Bearer token auth,
 * validated live against GET /health (a route that actually exists in
 * server.js) via the built-in credential test.
 */
export class OliApi implements ICredentialType {
	name = 'oliApi';
	displayName = 'Oli API';
	documentationUrl = 'https://github.com/olielicz/marketing/tree/main/integration-server';
	properties: INodeProperties[] = [
		{
			displayName: 'API Base URL',
			name: 'apiBaseUrl',
			type: 'string',
			default: 'https://api.oli.tools',
			description: 'Base URL of your Oli integration server. Change if self-hosting.',
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Bearer token issued via POST /api/tokens on your Oli integration server.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiBaseUrl}}',
			url: '/health',
			method: 'GET',
		},
	};
}
