import { randomUUID } from 'crypto';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { BrowserType } from './types';

type PlaywrightModule = typeof import('playwright-core');

interface IStoredSession {
	browser: Browser;
	context: BrowserContext;
	page: Page;
	endpoint: string;
}

const sessions = new Map<string, IStoredSession>();

export function resolveSessionKey(
	explicitSessionId: string | undefined,
	propagatedSessionKey: string | undefined,
): string {
	const trimmedExplicit = explicitSessionId?.trim();
	if (trimmedExplicit) return trimmedExplicit;

	const trimmedPropagated = propagatedSessionKey?.trim();
	if (trimmedPropagated) return trimmedPropagated;

	return randomUUID();
}

export async function getOrCreateSession(
	playwright: PlaywrightModule,
	sessionKey: string,
	browserEndpoint: string,
	timeout: number,
	browserType: BrowserType = 'chromium',
): Promise<IStoredSession> {
	const existingSession = sessions.get(sessionKey);

	if (existingSession && isSessionUsable(existingSession)) {
		existingSession.page = await ensurePage(
			existingSession.browser,
			existingSession.context,
			existingSession.page,
		);
		return existingSession;
	}

	if (existingSession) {
		sessions.delete(sessionKey);
	}

	const browser = await connectToBrowser(playwright, browserType, browserEndpoint, timeout);

	browser.on('disconnected', () => {
		sessions.delete(sessionKey);
	});

	const context = browser.contexts()[0] || (await browser.newContext());
	const page = context.pages()[0] || (await context.newPage());

	const session: IStoredSession = {
		browser,
		context,
		page,
		endpoint: browserEndpoint,
	};

	sessions.set(sessionKey, session);

	return session;
}

export function getSessionEndpoint(sessionKey: string): string | undefined {
	return sessions.get(sessionKey)?.endpoint;
}

export async function closeSession(sessionKey: string): Promise<boolean> {
	const session = sessions.get(sessionKey);

	if (!session) {
		return false;
	}

	sessions.delete(sessionKey);

	try {
		await session.browser.close();
	} catch {
		return false;
	}

	return true;
}

async function connectToBrowser(
	playwright: PlaywrightModule,
	browserType: BrowserType,
	browserEndpoint: string,
	timeout: number,
): Promise<Browser> {
	const playwrightBrowser = playwright[browserType];
	return playwrightBrowser.connect(browserEndpoint, { timeout });
}

function isSessionUsable(session: IStoredSession): boolean {
	const browserIsConnected =
		typeof session.browser.isConnected === 'function' ? session.browser.isConnected() : true;

	const contextIsClosed =
		typeof (session.context as BrowserContext & { isClosed?: () => boolean }).isClosed ===
			'function'
			? (session.context as BrowserContext & { isClosed: () => boolean }).isClosed()
			: false;

	return browserIsConnected && !contextIsClosed;
}

async function ensurePage(browser: Browser, context: BrowserContext, page: Page): Promise<Page> {
	if (!page.isClosed()) {
		return page;
	}

	const freshContext = browser.contexts()[0] || context || (await browser.newContext());
	const existingPage = freshContext.pages()[0];

	if (existingPage && !existingPage.isClosed()) {
		return existingPage;
	}

	return freshContext.newPage();
}
