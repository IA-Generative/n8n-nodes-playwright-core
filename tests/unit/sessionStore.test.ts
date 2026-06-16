import test from 'node:test';
import assert from 'node:assert/strict';
import {
	closeSession,
	getOrCreateSession,
	getSessionEndpoint,
	resolveSessionKey,
} from '../../nodes/playwright/sessionStore';

function createFakePage(closed = false) {
	return {
		isClosed() {
			return closed;
		},
	};
}

function createFakeContext({
	pages = [createFakePage(false)],
	isClosed = false,
}: {
	pages?: Array<{ isClosed: () => boolean }>;
	isClosed?: boolean;
} = {}) {
	const routeCalls: Array<{
		url: string;
		handler: (...args: any[]) => Promise<void>;
	}> = [];

	return {
		pages() {
			return pages;
		},
		async newPage() {
			const page = createFakePage(false);
			pages.push(page);
			return page;
		},
		async route(url: string, handler: (...args: any[]) => Promise<void>) {
			routeCalls.push({ url, handler });
		},
		isClosed() {
			return isClosed;
		},
		getRouteCalls() {
			return routeCalls;
		},
	};
}

function createFakeBrowser({
	contexts,
	isConnected = true,
}: {
	contexts?: Array<ReturnType<typeof createFakeContext>>;
	isConnected?: boolean;
} = {}) {
	const handlers = new Map<string, () => void>();
	const browserContexts = contexts ?? [createFakeContext()];
	const newContextCalls: Array<Record<string, unknown> | undefined> = [];
	let closed = false;

	return {
		contexts() {
			return browserContexts;
		},
		async newContext(options?: Record<string, unknown>) {
			newContextCalls.push(options);

			const context = createFakeContext();
			browserContexts.push(context);

			return context;
		},
		on(event: string, handler: () => void) {
			handlers.set(event, handler);
		},
		isConnected() {
			return isConnected && !closed;
		},
		async close() {
			closed = true;
		},
		emit(event: string) {
			const handler = handlers.get(event);

			if (handler) {
				handler();
			}
		},
		getNewContextCalls() {
			return newContextCalls;
		},
	};
}

function createFakePlaywright(browser: ReturnType<typeof createFakeBrowser>) {
	return {
		chromium: {
			async connect(_endpoint: string, _options: { timeout: number }) {
				return browser;
			},
		},
		firefox: {
			async connect(_endpoint: string, _options: { timeout: number }) {
				return browser;
			},
		},
	};
}

test('resolveSessionKey returns explicit session id first', () => {
	const result = resolveSessionKey('my-session', 'propagated-session');

	assert.equal(result, 'my-session');
});

test('resolveSessionKey falls back to propagated session id', () => {
	const result = resolveSessionKey('   ', 'propagated-session');

	assert.equal(result, 'propagated-session');
});

test('resolveSessionKey generates a value when both ids are empty', () => {
	const result = resolveSessionKey('', '');

	assert.equal(typeof result, 'string');
	assert.ok(result.length > 0);
});

test('getOrCreateSession creates a new session and stores endpoint', async () => {
	const context = createFakeContext();
	const browser = createFakeBrowser({ contexts: [context] });
	const playwright = createFakePlaywright(browser);

	const session = await getOrCreateSession(
		playwright as any,
		'session-a',
		'ws://playwright:3000',
		30000,
		'chromium',
	);

	assert.equal(session.endpoint, 'ws://playwright:3000');
	assert.equal(session.ignoreHTTPSErrors, false);
	assert.equal(getSessionEndpoint('session-a'), 'ws://playwright:3000');
	assert.ok(session.browser);
	assert.ok(session.context);
	assert.ok(session.page);
	assert.equal(context.getRouteCalls().length, 1);
	assert.equal(context.getRouteCalls()[0].url, '**/*');

	await closeSession('session-a');
});

test('getOrCreateSession passes ignoreHTTPSErrors to the new browser context', async () => {
	const browser = createFakeBrowser();
	const playwright = createFakePlaywright(browser);

	const session = await getOrCreateSession(
		playwright as any,
		'session-tls-enabled',
		'ws://playwright:3000',
		30000,
		'chromium',
		undefined,
		true,
	);

	assert.equal(session.ignoreHTTPSErrors, true);
	assert.deepEqual(browser.getNewContextCalls(), [
		{
			ignoreHTTPSErrors: true,
		},
	]);

	await closeSession('session-tls-enabled');
});

test('getOrCreateSession passes an explicit false value to the new browser context', async () => {
	const browser = createFakeBrowser();
	const playwright = createFakePlaywright(browser);

	const session = await getOrCreateSession(
		playwright as any,
		'session-tls-disabled',
		'ws://playwright:3000',
		30000,
		'chromium',
		undefined,
		false,
	);

	assert.equal(session.ignoreHTTPSErrors, false);
	assert.deepEqual(browser.getNewContextCalls(), [
		{
			ignoreHTTPSErrors: false,
		},
	]);

	await closeSession('session-tls-disabled');
});

test('getOrCreateSession reuses existing usable session', async () => {
	const browser = createFakeBrowser();
	const playwright = createFakePlaywright(browser);

	const first = await getOrCreateSession(
		playwright as any,
		'session-b',
		'ws://playwright:3000',
		30000,
		'chromium',
		undefined,
		true,
	);

	const context = browser.contexts().at(-1);

	assert.ok(context);

	const second = await getOrCreateSession(
		playwright as any,
		'session-b',
		'ws://playwright:3000',
		30000,
		'chromium',
	);

	assert.equal(second.browser, first.browser);
	assert.equal(second.context, first.context);
	assert.equal(second.page, first.page);
	assert.equal(second.ignoreHTTPSErrors, true);
	assert.equal(browser.getNewContextCalls().length, 1);
	assert.equal(context.getRouteCalls().length, 1);

	await closeSession('session-b');
});

test('getOrCreateSession rejects conflicting TLS options for an existing session', async () => {
	const browser = createFakeBrowser();
	const playwright = createFakePlaywright(browser);

	await getOrCreateSession(
		playwright as any,
		'session-tls-conflict',
		'ws://playwright:3000',
		30000,
		'chromium',
		undefined,
		true,
	);

	await assert.rejects(
		() =>
			getOrCreateSession(
				playwright as any,
				'session-tls-conflict',
				'ws://playwright:3000',
				30000,
				'chromium',
				undefined,
				false,
			),
		/session-tls-conflict.*ignoreHTTPSErrors=true/,
	);

	await closeSession('session-tls-conflict');
});

test('closeSession returns false when session does not exist', async () => {
	const result = await closeSession('missing-session');

	assert.equal(result, false);
});

test('closeSession closes and removes an existing session', async () => {
	const browser = createFakeBrowser();
	const playwright = createFakePlaywright(browser);

	await getOrCreateSession(
		playwright as any,
		'session-c',
		'ws://playwright:3000',
		30000,
		'chromium',
	);

	assert.equal(getSessionEndpoint('session-c'), 'ws://playwright:3000');

	const closed = await closeSession('session-c');

	assert.equal(closed, true);
	assert.equal(getSessionEndpoint('session-c'), undefined);
});

test('session is removed from store when browser disconnects', async () => {
	const browser = createFakeBrowser();
	const playwright = createFakePlaywright(browser);

	await getOrCreateSession(
		playwright as any,
		'session-d',
		'ws://playwright:3000',
		30000,
		'chromium',
	);

	assert.equal(getSessionEndpoint('session-d'), 'ws://playwright:3000');

	browser.emit('disconnected');

	assert.equal(getSessionEndpoint('session-d'), undefined);
});
