import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PlaywrightBasicAuthApi implements ICredentialType {
	name = 'playwrightBasicAuthApi';
	displayName = 'Playwright Basic Auth API';

	properties: INodeProperties[] = [
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
	];
}