import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PlaywrightBasicAuthApi implements ICredentialType {
	name = 'playwrightBasicAuthApi';
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-display-name-missing-api
	displayName = 'Playwright Basic Auth';

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