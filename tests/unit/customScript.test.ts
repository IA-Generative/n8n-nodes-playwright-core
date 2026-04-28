import test from 'node:test';
import assert from 'node:assert/strict';
import { runCustomScript } from '../../nodes/playwright/customScript';

function createFakeExecuteFunctions({
    scriptCode,
    continueOnFail = false,
    mode = 'run',
}: {
    scriptCode: string;
    continueOnFail?: boolean;
    mode?: 'run' | 'manual';
}) {
    const sentMessages: unknown[][] = [];

    return {
        getNodeParameter(name: string) {
            if (name === 'scriptCode') return scriptCode;
            return undefined;
        },
        getWorkflowStaticData() {
            return {};
        },
        getWorkflowDataProxy(_itemIndex: number) {
            return {
                $json: { hello: 'world' },
            };
        },
        getMode() {
            return mode;
        },
        sendMessageToUI(...args: unknown[]) {
            sentMessages.push(args);
        },
        getWorkflow() {
            return { id: 'wf-1' };
        },
        getNode() {
            return { name: 'Playwright' };
        },
        continueOnFail() {
            return continueOnFail;
        },
        helpers: {
            normalizeItems(items: unknown[]) {
                return items.map((item) =>
                    item && typeof item === 'object' && 'json' in (item as Record<string, unknown>)
                        ? item
                        : { json: item },
                );
            },
        },
        __sentMessages: sentMessages,
    } as any;
}

test('runCustomScript returns normalized array items', async () => {
    const executeFunctions = createFakeExecuteFunctions({
        scriptCode: `
			return [
				{ json: { ok: true, title: await $page.title() } }
			];
		`,
    });

    const page = {
        async title() {
            return 'My page';
        },
    };

    const result = await runCustomScript(executeFunctions, 0, {}, page, {});

    assert.deepEqual(result, [
        {
            json: {
                ok: true,
                title: 'My page',
            },
        },
    ]);
});

test('runCustomScript exposes $browser, $page and $playwright', async () => {
    const executeFunctions = createFakeExecuteFunctions({
        scriptCode: `
			return [{
				json: {
					browserName: $browser.name,
					pageUrl: $page.url(),
					hasChromium: !!$playwright.chromium
				}
			}];
		`,
    });

    const browser = { name: 'browser-1' };
    const page = {
        url() {
            return 'https://example.com';
        },
    };
    const playwright = {
        chromium: {},
    };

    const result = await runCustomScript(executeFunctions, 0, browser, page, playwright);

    assert.deepEqual(result, [
        {
            json: {
                browserName: 'browser-1',
                pageUrl: 'https://example.com',
                hasChromium: true,
            },
        },
    ]);
});

test('runCustomScript throws when script does not return an array', async () => {
    const executeFunctions = createFakeExecuteFunctions({
        scriptCode: `
			return { json: { nope: true } };
		`,
    });

    await assert.rejects(
        () => runCustomScript(executeFunctions, 0, {}, {}, {}),
        (error: any) => {
            assert.match(error.message, /Custom script must return an array of items/);
            return true;
        },
    );
});

test('runCustomScript returns error item when continueOnFail is enabled', async () => {
    const executeFunctions = createFakeExecuteFunctions({
        scriptCode: `
			throw new Error('boom');
		`,
        continueOnFail: true,
    });

    const result = await runCustomScript(executeFunctions, 0, {}, {}, {});

    assert.deepEqual(result, [
        {
            json: {
                error: 'boom',
            },
            pairedItem: {
                item: 0,
            },
        },
    ]);
});

test('runCustomScript sends console.log to UI in manual mode', async () => {
    const executeFunctions = createFakeExecuteFunctions({
        scriptCode: `
			console.log('hello from vm');
			return [{ json: { ok: true } }];
		`,
        mode: 'manual',
    });

    const result = await runCustomScript(executeFunctions, 0, {}, {}, {});

    assert.deepEqual(result, [{ json: { ok: true } }]);
    assert.equal(executeFunctions.__sentMessages.length, 1);
    assert.equal(executeFunctions.__sentMessages[0][0], 'hello from vm');
});
