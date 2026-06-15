import type { BrowserContext, Route } from 'playwright-core';

const DEFAULT_ALLOWED_PROTOCOLS = ['http', 'https'];

const INTERNAL_BROWSER_PROTOCOLS = new Set([
    'about',
    'blob',
    'chrome-extension',
    'data',
]);

export function normalizeProtocol(protocol: string): string {
    const normalized = protocol.trim().toLowerCase().replace(/:$/, '');

    if (!/^[a-z][a-z0-9+.-]*$/.test(normalized)) {
        throw new Error(`Invalid protocol: "${protocol}"`);
    }

    return normalized;
}

export function getAllowedProtocols(
    rawValue = process.env.N8N_PLAYWRIGHT_NODE_PROTOCOLS,
): Set<string> {
    const allowedProtocols = new Set(DEFAULT_ALLOWED_PROTOCOLS);

    if (!rawValue?.trim()) {
        return allowedProtocols;
    }

    let configuredProtocols: unknown;

    try {
        configuredProtocols = JSON.parse(rawValue);
    } catch {
        throw new Error(
            'N8N_PLAYWRIGHT_NODE_PROTOCOLS must be a valid JSON array, for example: ["file"]',
        );
    }

    if (!Array.isArray(configuredProtocols)) {
        throw new Error('N8N_PLAYWRIGHT_NODE_PROTOCOLS must be a JSON array');
    }

    for (const protocol of configuredProtocols) {
        if (typeof protocol !== 'string') {
            throw new Error('N8N_PLAYWRIGHT_NODE_PROTOCOLS must contain only strings');
        }

        allowedProtocols.add(normalizeProtocol(protocol));
    }

    return allowedProtocols;
}

export function resolveAndAssertAllowedUrl(
    rawUrl: string,
    baseUrl?: string,
    allowedProtocols = getAllowedProtocols(),
): string {
    let parsedUrl: URL;

    try {
        parsedUrl = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    } catch {
        throw new Error(`Invalid URL: "${rawUrl}"`);
    }

    const protocol = normalizeProtocol(parsedUrl.protocol);

    if (!allowedProtocols.has(protocol)) {
        throw new Error(
            `Protocol "${protocol}" is not allowed. Allowed protocols: ${[
                ...allowedProtocols,
            ].join(', ')}`,
        );
    }

    return parsedUrl.toString();
}

export function isAllowedNavigationUrl(
    rawUrl: string,
    allowedProtocols = getAllowedProtocols(),
): boolean {
    try {
        const parsedUrl = new URL(rawUrl);
        const protocol = normalizeProtocol(parsedUrl.protocol);

        return INTERNAL_BROWSER_PROTOCOLS.has(protocol) || allowedProtocols.has(protocol);
    } catch {
        return false;
    }
}

export async function installProtocolGuard(
    context: BrowserContext,
    allowedProtocols = getAllowedProtocols(),
): Promise<void> {
    await context.route('**/*', async (route: Route) => {
        const request = route.request();

        if (request.isNavigationRequest() && !isAllowedNavigationUrl(request.url(), allowedProtocols)) {
            await route.abort('blockedbyclient');
            return;
        }

        await route.continue();
    });
}
