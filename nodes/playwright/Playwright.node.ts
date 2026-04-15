import {
	INodeType,
	INodeExecutionData,
	IExecuteFunctions,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { handleOperation } from './operations';
import { runCustomScript } from './customScript';
import { BrowserConnectionMode, BrowserType, IBrowserOptions } from './types';
import {
	closeSession,
	getOrCreateSession,
	getSessionEndpoint,
	resolveSessionKey,
} from './sessionStore';

export class Playwright implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Playwright',
		name: 'playwright',
		icon: 'file:playwright.svg',
		group: ['automation'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Automate browser actions using Playwright',
		defaults: {
			name: 'Playwright',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'playwrightBasicAuthApi',
				required: false,
				displayOptions: {
					show: {
						operation: ['fillForm'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Click Element',
						value: 'clickElement',
						description: 'Click on an element',
						action: 'Click on an element',
					},
					{
						name: 'Close Session',
						value: 'closeSession',
						description: 'Close the current browser session',
						action: 'Close the current browser session',
					},
					{
						name: 'Download File',
						value: 'downloadFile',
						description: 'Click an element or fetch a direct URL and capture the file',
						action: 'Download a file',
					},
					{
						name: 'Fill Form',
						value: 'fillForm',
						description: 'Fill one or more form fields',
						action: 'Fill one or more form fields',
					},
					{
						name: 'Get Text',
						value: 'getText',
						description: 'Get text from an element',
						action: 'Get text from an element',
					},
					{
						name: 'Navigate',
						value: 'navigate',
						description: 'Navigate to a URL',
						action: 'Navigate to a URL',
					},
					{
						name: 'Run Custom Script',
						value: 'runCustomScript',
						description: 'Execute custom JavaScript code with full Playwright API access',
						action: 'Run custom java script code',
					},
					{
						name: 'Take Screenshot',
						value: 'takeScreenshot',
						description: 'Take a screenshot of the current page',
						action: 'Take a screenshot of the current page',
					},
				],
				default: 'navigate',
			},

			{
				displayName: 'Browser',
				name: 'browser',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Firefox',
						value: 'firefox',
						description: 'Mozilla Firefox',
					},
					{
						name: 'Chrome',
						value: 'chromium',
						description: 'Google Chrome version opensource',
					},
				],
				default: 'firefox',
			},

			{
				displayName: 'Leave Session Open',
				name: 'leaveSessionOpen',
				type: 'boolean',
				default: true,
				description: 'Whether to keep the browser session open for the next Playwright node',
				displayOptions: {
					hide: {
						operation: ['closeSession'],
					},
				},
			},


			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://example.com',
				description: 'The URL to navigate to',
				displayOptions: {
					show: {
						operation: ['navigate'],
					},
				},
				required: true,
			},

			{
				displayName: 'Session ID À Fermer',
				name: 'closeSessionId',
				type: 'string',
				default: '',
				placeholder: 'Laisser vide pour fermer la session propagée',
				description:
					'ID of the session to close. Leave empty to close the session propagated from the previous node.',
				displayOptions: {
					show: {
						operation: ['closeSession'],
					},
				},
			},

			{
				displayName: 'Script Code',
				name: 'scriptCode',
				type: 'string',
				typeOptions: {
					editor: 'codeNodeEditor',
					editorLanguage: 'javaScript',
				},
				required: true,
				default: `const title = await $page.title();

return [{
    json: {
        title,
        url: $page.url()
    }
}];`,
				description:
					'JavaScript code to execute with Playwright. Access $page, $browser, $playwright, and all n8n Code node variables.',
				noDataExpression: true,
				displayOptions: {
					show: {
						operation: ['runCustomScript'],
					},
				},
			},

			{
				displayName:
					'Use <code>$page</code>, <code>$browser</code>, or <code>$playwright</code> to access Playwright. <a target="_blank" href="https://docs.n8n.io/code-examples/methods-variables-reference/">Special vars/methods</a> are available. <br><br>Debug by using <code>console.log()</code> statements and viewing their output in the browser console.',
				name: 'notice',
				type: 'notice',
				displayOptions: {
					show: {
						operation: ['runCustomScript'],
					},
				},
				default: '',
			},

			{
				displayName: 'Property Name',
				name: 'dataPropertyName',
				type: 'string',
				required: true,
				default: 'screenshot',
				description: 'Name of the binary property in which to store the screenshot data',
				displayOptions: {
					show: {
						operation: ['takeScreenshot'],
					},
				},
			},

			{
				displayName: 'Download Source',
				name: 'downloadSource',
				type: 'options',
				options: [
					{
						name: 'Element',
						value: 'element',
						description: 'Click an element and capture the downloaded file',
					},
					{
						name: 'URL',
						value: 'url',
						description: 'Fetch a file directly from a URL',
					},
				],
				default: 'element',
				description: 'Choose whether to download from a page element or a direct URL',
				displayOptions: {
					show: {
						operation: ['downloadFile'],
					},
				},
			},

			{
				displayName: 'Selector Type',
				name: 'selectorType',
				type: 'options',
				options: [
					{
						name: 'CSS Selector',
						value: 'css',
						description: 'Use CSS selector (e.g., #submit-button, .my-class)',
					},
					{
						name: 'XPath',
						value: 'xpath',
						description: 'Use XPath expression (e.g., //button[@ID="submit"])',
					},
				],
				default: 'css',
				description: 'Choose between CSS selector or XPath',
				displayOptions: {
					show: {
						operation: ['getText', 'clickElement', 'downloadFile'],
					},
					hide: {
						downloadSource: ['url'],
					},
				},
			},

			{
				displayName: 'CSS Selector',
				name: 'selector',
				type: 'string',
				default: '',
				placeholder: '#submit-button',
				description: 'CSS selector for the element (e.g., #ID, .class, button[type="submit"])',
				displayOptions: {
					show: {
						operation: ['getText', 'clickElement', 'downloadFile'],
						selectorType: ['css'],
					},
					hide: {
						downloadSource: ['url'],
					},
				},
				required: true,
			},

			{
				displayName: 'XPath',
				name: 'xpath',
				type: 'string',
				default: '',
				placeholder: '//button[@ID="submit"]',
				description:
					'XPath expression for the element (e.g., //div[@class="content"], //button[text()="Click Me"])',
				displayOptions: {
					show: {
						operation: ['getText', 'clickElement', 'downloadFile'],
						selectorType: ['xpath'],
					},
					hide: {
						downloadSource: ['url'],
					},
				},
				required: true,
			},

			{
				displayName: 'Fields',
				name: 'fillFields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Field',
				description:
					'Form fields to fill. XPath is detected automatically if the selector starts with / or (.',
				displayOptions: {
					show: {
						operation: ['fillForm'],
					},
				},
				options: [
					{
						displayName: 'Field',
						name: 'fields',
						values: [
							{
								displayName: 'Selector',
								name: 'selector',
								type: 'string',
								default: '',
								placeholder: '#username or //input[@ID="username"]',
								description: 'CSS selector or XPath expression',
								required: true,
							},
							{
								displayName: 'Value Source',
								name: 'valueSource',
								type: 'options',
								options: [
									{
										name: 'Literal',
										value: 'literal',
									},
									{
										name: 'Credential',
										value: 'credential',
									},
								],
								default: 'literal',
								description: 'Choose whether to use a literal value or a credential field',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Value to fill in the selected field',
								displayOptions: {
									show: {
										valueSource: ['literal'],
									},
								},
								required: true,
							},
							{
								displayName: 'Credential Field',
								name: 'credentialField',
								type: 'options',
								options: [
									{
										name: 'Username',
										value: 'username',
									},
									{
										name: 'Password',
										value: 'password',
									},
								],
								default: 'username',
								description: 'Credential field to use for this form input',
								displayOptions: {
									show: {
										valueSource: ['credential'],
									},
								},
								required: true,
							},
						],
					},
				],
			},
			{
				displayName: 'Submit Form',
				name: 'submitForm',
				type: 'boolean',
				default: false,
				description: 'Whether to click a submit element after filling the form',
				displayOptions: {
					show: {
						operation: ['fillForm'],
					},
				},
			},
			{
				displayName:
					"If disabled, the form will be filled only. Use the 'Click Element' operation later in the workflow if you want to submit it manually.",
				name: 'submitFormNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						operation: ['fillForm'],
						submitForm: [false],
					},
				},
			},
			{
				displayName: 'Submit Selector',
				name: 'submitSelector',
				type: 'string',
				default: '',
				placeholder: '#submit-button or //button[@type="submit"]',
				description: 'CSS selector or XPath expression of the element to click to submit the form',
				required: true,
				displayOptions: {
					show: {
						operation: ['fillForm'],
						submitForm: [true],
					},
				},
			},
			{
				displayName: 'Download URL',
				name: 'downloadUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/file.pdf',
				description: 'The direct URL of the file to download',
				displayOptions: {
					show: {
						operation: ['downloadFile'],
						downloadSource: ['url'],
					},
				},
				required: true,
			},

			{
				displayName: 'File Name',
				name: 'downloadFileName',
				type: 'string',
				default: '',
				placeholder: 'document.pdf',
				description: 'Optional file name override for the downloaded file',
				displayOptions: {
					show: {
						operation: ['downloadFile'],
						downloadSource: ['url'],
					},
				},
			},

			{
				displayName: 'Download Property Name',
				name: 'downloadPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property in which to store the downloaded file',
				displayOptions: {
					show: {
						operation: ['downloadFile'],
					},
				},
			},

			{
				displayName: 'Download Options',
				name: 'downloadOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['downloadFile'],
						downloadSource: ['element'],
					},
				},
				options: [
					{
						displayName: 'Click Timeout',
						name: 'clickTimeout',
						type: 'number',
						default: 15000,
						description: 'Maximum time to wait for the click action in milliseconds',
					},
					{
						displayName: 'Wait Timeout',
						name: 'waitTimeout',
						type: 'number',
						default: 15000,
						description:
							'Maximum time to wait for a download, popup, or navigation in milliseconds',
					},
					{
						displayName: 'Prefer Popup Page',
						name: 'preferPopupPage',
						type: 'boolean',
						default: true,
						description:
							'Whether to prioritize a newly opened page when both popup and navigation are possible',
					},
				],
			},

			{
				displayName: 'Connection Mode',
				name: 'connectionMode',
				type: 'options',
				options: [
					{
						name: 'Playwright WS',
						value: 'ws',
						description: 'Connect using a Playwright WebSocket endpoint',
					},
					{
						name: 'CDP',
						value: 'cdp',
						description: 'Connect using Chromium CDP (Chromium only)',
					},
				],
				default: 'ws',
				description: 'Choose how to connect to the remote browser',
				displayOptions: {
					hide: {
						operation: ['closeSession'],
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
						operation: ['closeSession'],
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
						operation: ['closeSession'],
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
				displayName: 'Screenshot Options',
				name: 'screenshotOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['takeScreenshot'],
					},
				},
				options: [
					{
						displayName: 'Full Page',
						name: 'fullPage',
						type: 'boolean',
						default: false,
						description: 'Whether to take a screenshot of the full scrollable page',
					},
					{
						displayName: 'Path',
						name: 'path',
						type: 'string',
						default: '',
						description: 'The file path to save the screenshot to',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;

			const playwrightMeta = items[i].json?.playwright as Record<string, unknown> | undefined;
			const propagatedSessionKey = playwrightMeta?.sessionKey as string | undefined;

			const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IBrowserOptions;
			const explicitSessionId = browserOptions.sessionId || undefined;

			const sessionKey = resolveSessionKey(explicitSessionId, propagatedSessionKey);

			try {
				if (operation === 'closeSession') {
					const closeSessionId = this.getNodeParameter('closeSessionId', i, '') as string;
					const keyToClose = resolveSessionKey(closeSessionId, propagatedSessionKey);
					const closed = await closeSession(keyToClose);

					returnData.push({
						json: {
							success: closed,
							sessionKey: keyToClose,
							message: closed ? 'Session closed' : 'No session found',
						},
						pairedItem: {
							item: i,
						},
					});

					continue;
				}

				const leaveSessionOpen = this.getNodeParameter('leaveSessionOpen', i, true) as boolean;
				const browserType = this.getNodeParameter('browser', i, 'chromium') as BrowserType;
				const rawConnectionMode = this.getNodeParameter(
					'connectionMode',
					i,
					'ws',
				) as BrowserConnectionMode;
				const connectionMode: BrowserConnectionMode =
					browserType === 'firefox' ? 'ws' : rawConnectionMode;

				const propagatedEndpoint = playwrightMeta?.browserEndpoint as string | undefined;
				const rawBrowserEndpoint = this.getNodeParameter('browserEndpoint', i, '') as string;
				const browserEndpoint =
					rawBrowserEndpoint.trim() ||
					getSessionEndpoint(sessionKey) ||
					propagatedEndpoint?.trim() ||
					'';

				const playwright = require('playwright-core');

				if (!browserEndpoint) {
					throw new NodeOperationError(
						this.getNode(),
						'Browser endpoint is required. Set it on this node or on the preceding Playwright node.',
						{ itemIndex: i },
					);
				}

				const session = await getOrCreateSession(
					playwright,
					sessionKey,
					connectionMode,
					browserEndpoint,
					browserOptions.timeout || 30000,
					browserType,
				);

				if (operation === 'navigate') {
					const url = this.getNodeParameter('url', i) as string;
					await session.page.goto(url);
				}

				let result: INodeExecutionData | INodeExecutionData[];

				if (operation === 'runCustomScript') {
					result = await runCustomScript(this, i, session.browser, session.page, playwright);
					for (const item of result as INodeExecutionData[]) {
						item.json.playwright = {
							...((item.json.playwright as object) ?? {}),
							sessionKey,
							browserEndpoint,
						};
					}
					returnData.push(...result);
				} else {
					result = await handleOperation(operation, session.page, this, i);
					(result as INodeExecutionData).json.playwright = {
						...(((result as INodeExecutionData).json.playwright as object) ?? {}),
						sessionKey,
						browserEndpoint,
					};
					returnData.push(result as INodeExecutionData);
				}

				if (!leaveSessionOpen) {
					await closeSession(sessionKey);
				}
			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
							playwright: { sessionKey },
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
