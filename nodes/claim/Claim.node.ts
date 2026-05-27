import {
	INodeType,
	INodeExecutionData,
	IExecuteFunctions,
	INodeTypeDescription,
} from 'n8n-workflow';
import {
	handleClaimCreateInstance,
	handleRenewClaim,
	handleReleaseClaim,
} from './operations';


export class Claim implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Claim',
		name: 'claim',
		icon: 'file:claim.svg',
		group: ['automation'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Allow to claim an instance with claim-controller',
		defaults: {
			name: 'Claim',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create Instance',
						value: 'claimCreateInstance',
						description: 'Create a remote Playwright instance from a claim controller',
						action: 'Create a claimed playwright instance',
					},
					{
						name: 'Renew Claim',
						value: 'renewClaim',
						description: 'Extend the TTL of an existing claim',
						action: 'Renew a claim TTL',
					},
					{
						name: 'Release Claim',
						value: 'releaseClaim',
						description: 'Release (close) an existing claim',
						action: 'Release a claim',
					},
				],
				default: 'claimCreateInstance',
			},
			{
				displayName: 'Claim Controller URL',
				name: 'claimControllerUrl',
				type: 'string',
				default: '',
				placeholder: 'http://claim-controller:8080',
				description: 'Base URL of the claim controller',
				displayOptions: {
					show: {
						operation: ['claimCreateInstance', 'renewClaim', 'releaseClaim'],
					},
				},
				required: true,
			},
			{
				displayName: 'Claim ID',
				name: 'claimId',
				type: 'string',
				default: '',
				placeholder: '={{ $json.claimId }}',
				description: 'ID of the claim to renew or release (propagated from a previous Claim node)',
				displayOptions: {
					show: {
						operation: ['renewClaim', 'releaseClaim'],
					},
				},
				required: true,
			},
			{
				displayName: 'TTL',
				name: 'claimTtl',
				type: 'string',
				default: '3m',
				description: 'Time to live for the claim (e.g. 3m, 10m)',
				displayOptions: {
					show: {
						operation: ['claimCreateInstance', 'renewClaim'],
					},
				},
				required: true,
			},
			{
				displayName: 'Claim Timeout',
				name: 'claimTimeout',
				type: 'number',
				default: 120000,
				description: 'Maximum time to wait for the claim controller response in milliseconds',
				displayOptions: {
					show: {
						operation: ['claimCreateInstance', 'renewClaim', 'releaseClaim'],
					},
				},
			},

			{
				displayName: 'Browser Endpoint',
				name: 'browserEndpoint',
				type: 'string',
				default: '',
				placeholder: 'ws://playwright:3000 (hérité du noeud précédent si vide)',
				description:
					'Remote browser endpoint used when a new session is created. Leave empty to reuse the endpoint from the previous Playwright node.',
				displayOptions: {
					hide: {
						operation: ['claimCreateInstance', 'renewClaim', 'releaseClaim'],
					},
				},
			},

			{
				displayName: 'Browser Connection Options',
				name: 'browserOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					hide: {
						operation: ['claimCreateInstance', 'renewClaim', 'releaseClaim'],
					},
				},
				options: [
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						default: 30000,
						description: 'Connection timeout in milliseconds',
					},
					{
						displayName: 'Session ID',
						name: 'sessionId',
						type: 'string',
						default: '',
						placeholder: 'ma-session-custom',
						description:
							'Custom session identifier. Leave empty to reuse the session propagated from the previous node, or to generate a new UUID automatically.',
					},
				],
			},

			{
				displayName:
					'If the previous node is not a Playwright node, you must manually set the "Session ID" field in "Browser Connection Options" using the "sessionKey" returned by an earlier Playwright node.This is required to keep using the same Playwright session.',
				name: 'helpfulInformation',
				type: 'notice',
				default: '',
				displayOptions: {
					hide: {
						operation: ['claimCreateInstance', 'renewClaim', 'releaseClaim'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				if (operation === 'claimCreateInstance') {
					returnData.push(await handleClaimCreateInstance(this, i));
					continue;
				}

				if (operation === 'renewClaim') {
					returnData.push(await handleRenewClaim(this, i));
					continue;
				}

				if (operation === 'releaseClaim') {
					returnData.push(await handleReleaseClaim(this, i));
					continue;
				}

			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}

				throw error;
			}
		}

		return [returnData];
	}
}
