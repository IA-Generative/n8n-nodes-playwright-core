import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright-core';
import { handleOperation } from '../../nodes/playwright/operations';
import { createTestServer } from '../helpers/testServer';

function createFakeExecuteFunctions(params: Record<string, unknown>) {
    return {
        getNodeParameter(name: string, _itemIndex: number, fallback?: unknown) {
            return name in params ? params[name] : fallback;
        },
        getNode() {
            return { name: 'Playwright' };
        },
        async getCredentials() {
            return {};
        },
        helpers: {},
    } as any;
}

const wsEndpoint = process.env.PLAYWRIGHT_WS_ENDPOINT || 'ws://127.0.0.1:3000';

const hostFromBrowser = process.env.PLAYWRIGHT_TEST_HOST || '172.22.0.1';

let downloadBaseUrl: string;
let closeDownloadServer: () => Promise<void>;

const testHtml = `
<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<title>Playwright Test Page</title>
	</head>
	<body>
		<h1 id="title">Integration Test Page</h1>

		<button id="action-button" onclick="document.body.setAttribute('data-clicked', 'yes')">
			Click me
		</button>

		<form id="login-form">
			<input id="username" name="username" type="text" />
			<input id="password" name="password" type="password" />
			<button id="submit" type="button" onclick="globalThis.__submitted = true">Submit</button>
		</form>
	</body>
</html>
`;

let browser: Browser;
let page: Page;

test.before(async () => {
    const server = await createTestServer();
    downloadBaseUrl = `http://${hostFromBrowser}:${server.port}`;
    closeDownloadServer = server.close;
    browser = await chromium.connect(wsEndpoint);
    const context = browser.contexts()[0] || (await browser.newContext());
    page = context.pages()[0] || (await context.newPage());
});

test.after(async () => {
    try {
        await page.close();
    } catch { }

    try {
        await browser.close();
    } catch { }
    await closeDownloadServer();
});

test('navigate returns page content and url', async () => {
    await page.setContent(testHtml);

    const executeFunctions = createFakeExecuteFunctions({});
    const result = await handleOperation('navigate', page, executeFunctions, 0);

    assert.match(String(result.json.content), /Integration Test Page/);
    assert.match(String(result.json.url), /about:blank/);
});

test('getText reads text from the page', async () => {
    await page.setContent(testHtml);

    const executeFunctions = createFakeExecuteFunctions({
        selectorType: 'css',
        selector: '#title',
    });

    const result = await handleOperation('getText', page, executeFunctions, 0);

    assert.equal(result.json.text, 'Integration Test Page');
    assert.equal(result.json.selectorType, 'css');
    assert.equal(result.json.selector, '#title');
});

test('clickElement clicks the target element', async () => {
    await page.setContent(testHtml);

    const executeFunctions = createFakeExecuteFunctions({
        selectorType: 'css',
        selector: '#action-button',
    });

    const result = await handleOperation('clickElement', page, executeFunctions, 0);

    assert.equal(result.json.success, true);

    const clicked = await page.locator('body').getAttribute('data-clicked');
    assert.equal(clicked, 'yes');
});

test('fillForm fills fields and submits the form', async () => {
    await page.setContent(testHtml);

    const executeFunctions = createFakeExecuteFunctions({
        fillFields: {
            fields: [
                { selector: '#username', valueSource: 'literal', value: 'john' },
                { selector: '#password', valueSource: 'literal', value: 'secret' },
            ],
        },
        submitForm: true,
        submitSelector: '#submit',
    });

    const result = await handleOperation('fillForm', page, executeFunctions, 0);

    assert.equal(result.json.success, true);
    assert.equal(result.json.filledFieldsCount, 2);
    assert.equal(result.json.submitted, true);

    const username = await page.locator('#username').inputValue();
    const password = await page.locator('#password').inputValue();
    const submitted = await page.evaluate(() => (globalThis as any).__submitted === true);

    assert.deepEqual(
        { username, password, submitted },
        {
            username: 'john',
            password: 'secret',
            submitted: true,
        },
    );
});

test('takeScreenshot returns binary data', async () => {
    await page.setContent(testHtml);

    const prepared: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];

    const executeFunctions = {
        getNodeParameter(name: string, _itemIndex: number, fallback?: unknown) {
            const params: Record<string, unknown> = {
                screenshotOptions: { fullPage: false },
                dataPropertyName: 'screenshot',
            };

            return name in params ? params[name] : fallback;
        },
        getNode() {
            return { name: 'Playwright' };
        },
        async getCredentials() {
            return {};
        },
        helpers: {
            async prepareBinaryData(buffer: Buffer, fileName: string, mimeType: string) {
                prepared.push({ buffer, fileName, mimeType });

                return {
                    fileName,
                    mimeType,
                    fileSize: String(buffer.length),
                };
            },
        },
    } as any;

    const result = await handleOperation('takeScreenshot', page, executeFunctions, 0);

    assert.equal(result.json.success, true);
    assert.ok(result.binary);
    assert.ok(result.binary.screenshot);
    assert.equal(result.binary.screenshot.fileName, 'screenshot');
    assert.equal(result.binary.screenshot.mimeType, 'image/png');

    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].mimeType, 'image/png');
    assert.ok(prepared[0].buffer.length > 0);
});

test('downloadFile downloads a file from a direct URL', async () => {
    const prepared: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];

    const executeFunctions = {
        getNodeParameter(name: string, _itemIndex: number, fallback?: unknown) {
            const params: Record<string, unknown> = {
                downloadSource: 'url',
                downloadUrl: `${downloadBaseUrl}/download/test.txt`,
                downloadFileName: '',
                downloadPropertyName: 'data',
            };

            return name in params ? params[name] : fallback;
        },
        getNode() {
            return { name: 'Playwright' };
        },
        async getCredentials() {
            return {};
        },
        helpers: {
            async prepareBinaryData(buffer: Buffer, fileName: string, mimeType: string) {
                prepared.push({ buffer, fileName, mimeType });

                return {
                    fileName,
                    mimeType,
                    fileSize: String(buffer.length),
                };
            },
        },
    } as any;

    await page.setContent('<html><body>download test</body></html>');

    const result = await handleOperation('downloadFile', page, executeFunctions, 0);

    assert.equal(result.json.success, true);
    assert.equal(result.json.fileName, 'test.txt');
    assert.equal(result.json.mimeType, 'text/plain');
    assert.equal(typeof result.json.size, 'number');
    assert.ok((result.json.size as number) > 0);

    assert.ok(result.binary);
    assert.ok(result.binary.data);
    assert.equal(result.binary.data.fileName, 'test.txt');
    assert.equal(result.binary.data.mimeType, 'text/plain');

    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].fileName, 'test.txt');
    assert.equal(prepared[0].mimeType, 'text/plain');
    assert.equal(prepared[0].buffer.toString('utf8'), 'hello from test file');
});

