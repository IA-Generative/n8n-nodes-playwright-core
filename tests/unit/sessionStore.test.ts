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
	return {
		pages() {
			return pages;
		},
		async newPage() {
			const page = createFakePage(false);
			pages.push(page);
			return page;
		},
		isClosed() {
			return isClosed;
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
	let closed = false;

	return {
		contexts() {
			return browserContexts;
		},
		async newContext() {
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
			if (handler) handler();
		},
	};
}

function createFakePlaywright(browser: ReturnType<typeof createFakeBrowser>) {
	return {
		chromium: {
			async connect(endpoint: string, options: { timeout: number }) {
				return browser;
			},
		},
		firefox: {
			async connect(endpoint: string, options: { timeout: number }) {
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
	const browser = createFakeBrowser();
	const playwright = createFakePlaywright(browser);

	const session = await getOrCreateSession(
		playwright as any,
		'session-a',
		'ws://playwright:3000',
		30000,
		'chromium',
	);

	assert.equal(session.endpoint, 'ws://playwright:3000');
	assert.equal(getSessionEndpoint('session-a'), 'ws://playwright:3000');
	assert.ok(session.browser);
	assert.ok(session.context);
	assert.ok(session.page);

	await closeSession('session-a');
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
	);

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

	await closeSession('session-b');
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
