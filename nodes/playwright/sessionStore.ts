import { randomUUID } from 'crypto';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { BrowserType } from './types';

type PlaywrightModule = typeof import('playwright-core');

type ProxyConfig = {
	server: string;
	bypass?: string;
};

interface IStoredSession {
	browser: Browser;
	context: BrowserContext;
	page: Page;
	endpoint: string;
	proxySignature: string;
	ignoreHTTPSErrors: boolean;
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
	proxyTargetUrl?: string,
	ignoreHTTPSErrors?: boolean,
): Promise<IStoredSession> {
	const existingSession = sessions.get(sessionKey);

	if (
		existingSession &&
		isSessionUsable(existingSession) &&
		existingSession.endpoint === browserEndpoint
	) {
		if (
			ignoreHTTPSErrors !== undefined &&
			existingSession.ignoreHTTPSErrors !== ignoreHTTPSErrors
		) {
			throw new Error(
				`Session "${sessionKey}" already exists with ignoreHTTPSErrors=${existingSession.ignoreHTTPSErrors}. Close the session or use a different session ID.`,
			);
		}

		existingSession.page = await ensurePage(existingSession.context, existingSession.page);

		return existingSession;
	}

	if (existingSession) {
		sessions.delete(sessionKey);

		try {
			await existingSession.browser.close();
		} catch { }
	}

	const proxy = resolveProxyFromEnv(proxyTargetUrl);
	const proxySignature = getProxySignature(proxy);

	const browser = await connectToBrowser(playwright, browserType, browserEndpoint, timeout);

	browser.on('disconnected', () => {
		sessions.delete(sessionKey);
	});

	const context = await createContext(browser, proxy, ignoreHTTPSErrors);
	const page = context.pages()[0] || (await context.newPage());

	const session: IStoredSession = {
		browser,
		context,
		page,
		endpoint: browserEndpoint,
		proxySignature,
		ignoreHTTPSErrors: ignoreHTTPSErrors ?? false,
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

async function createContext(
	browser: Browser,
	proxy: ProxyConfig | undefined,
	ignoreHTTPSErrors?: boolean,
): Promise<BrowserContext> {
	if (proxy || ignoreHTTPSErrors !== undefined) {
		return browser.newContext({
			...(proxy ? { proxy } : {}),
			...(ignoreHTTPSErrors !== undefined ? { ignoreHTTPSErrors } : {}),
		});
	}

	return browser.contexts()[0] || (await browser.newContext());
}

function resolveProxyFromEnv(proxyTargetUrl?: string): ProxyConfig | undefined {
	const allProxy = getEnvValue('all_proxy', 'ALL_PROXY');

	if (allProxy) {
		return buildProxyConfig(allProxy);
	}

	const protocol = getUrlProtocol(proxyTargetUrl);
	const httpProxy = getEnvValue('http_proxy', 'HTTP_PROXY');
	const httpsProxy = getEnvValue('https_proxy', 'HTTPS_PROXY');

	if (protocol === 'http:' && httpProxy) {
		return buildProxyConfig(httpProxy);
	}

	if (protocol === 'https:' && httpsProxy) {
		return buildProxyConfig(httpsProxy);
	}

	const fallbackProxy = httpsProxy || httpProxy;

	if (!fallbackProxy) {
		return undefined;
	}

	return buildProxyConfig(fallbackProxy);
}

function buildProxyConfig(server: string): ProxyConfig {
	const bypass = getEnvValue('no_proxy', 'NO_PROXY');

	return {
		server,
		...(bypass ? { bypass } : {}),
	};
}

function getUrlProtocol(rawUrl?: string): string | undefined {
	if (!rawUrl) {
		return undefined;
	}

	try {
		return new URL(rawUrl).protocol;
	} catch {
		return undefined;
	}
}

function getEnvValue(...names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name]?.trim();

		if (value) {
			return value;
		}
	}

	return undefined;
}

function getProxySignature(proxy: ProxyConfig | undefined): string {
	if (!proxy) {
		return '';
	}

	return `${proxy.server}|${proxy.bypass ?? ''}`;
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

async function ensurePage(context: BrowserContext, page: Page): Promise<Page> {
	if (!page.isClosed()) {
		return page;
	}

	const existingPage = context.pages()[0];

	if (existingPage && !existingPage.isClosed()) {
		return existingPage;
	}

	return context.newPage();
}
