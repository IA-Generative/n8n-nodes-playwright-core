import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getAllowedProtocols,
    installProtocolGuard,
    isAllowedNavigationUrl,
    normalizeProtocol,
    resolveAndAssertAllowedUrl,
} from '../../nodes/playwright/protocols';

test('normalizeProtocol removes colon and normalizes casing', () => {
    assert.equal(normalizeProtocol(' HTTPS: '), 'https');
});

test('normalizeProtocol rejects invalid values', () => {
    assert.throws(() => normalizeProtocol('http://'), /Invalid protocol/);
});

test('getAllowedProtocols allows http and https by default', () => {
    const allowedProtocols = getAllowedProtocols();

    assert.deepEqual([...allowedProtocols], ['http', 'https']);
});

test('getAllowedProtocols adds configured protocols', () => {
    const allowedProtocols = getAllowedProtocols('["file", "FTP:"]');

    assert.deepEqual([...allowedProtocols], ['http', 'https', 'file', 'ftp']);
});

test('getAllowedProtocols removes duplicate protocols', () => {
    const allowedProtocols = getAllowedProtocols('["http", "https", "file", "file"]');

    assert.deepEqual([...allowedProtocols], ['http', 'https', 'file']);
});

test('getAllowedProtocols rejects invalid JSON', () => {
    assert.throws(
        () => getAllowedProtocols("['file']"),
        /N8N_PLAYWRIGHT_NODE_PROTOCOLS must be a valid JSON array/,
    );
});

test('getAllowedProtocols rejects non-array values', () => {
    assert.throws(
        () => getAllowedProtocols('"file"'),
        /N8N_PLAYWRIGHT_NODE_PROTOCOLS must be a JSON array/,
    );
});

test('getAllowedProtocols rejects non-string entries', () => {
    assert.throws(
        () => getAllowedProtocols('["file", 42]'),
        /N8N_PLAYWRIGHT_NODE_PROTOCOLS must contain only strings/,
    );
});

test('resolveAndAssertAllowedUrl accepts HTTP and HTTPS URLs by default', () => {
    assert.equal(
        resolveAndAssertAllowedUrl('https://example.com/path'),
        'https://example.com/path',
    );

    assert.equal(
        resolveAndAssertAllowedUrl('http://example.com/path'),
        'http://example.com/path',
    );
});

test('resolveAndAssertAllowedUrl resolves relative URLs', () => {
    assert.equal(
        resolveAndAssertAllowedUrl('/download/file.pdf', 'https://example.com/account'),
        'https://example.com/download/file.pdf',
    );
});

test('resolveAndAssertAllowedUrl rejects file URLs by default', () => {
    assert.throws(
        () => resolveAndAssertAllowedUrl('file:///etc/passwd'),
        /Protocol "file" is not allowed/,
    );
});

test('resolveAndAssertAllowedUrl accepts configured protocols', () => {
    const allowedProtocols = getAllowedProtocols('["file"]');

    assert.equal(
        resolveAndAssertAllowedUrl('file:///tmp/example.txt', undefined, allowedProtocols),
        'file:///tmp/example.txt',
    );
});

test('resolveAndAssertAllowedUrl rejects invalid URLs', () => {
    assert.throws(() => resolveAndAssertAllowedUrl('not a valid URL'), /Invalid URL/);
});

test('isAllowedNavigationUrl accepts browser internal URLs', () => {
    assert.equal(isAllowedNavigationUrl('about:blank'), true);
    assert.equal(isAllowedNavigationUrl('blob:https://example.com/file-id'), true);
    assert.equal(isAllowedNavigationUrl('data:text/plain,hello'), true);
    assert.equal(
        isAllowedNavigationUrl('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'),
        true,
    );
});

test('isAllowedNavigationUrl rejects file navigation by default', () => {
    assert.equal(isAllowedNavigationUrl('file:///etc/passwd'), false);
});

test('isAllowedNavigationUrl accepts configured navigation protocols', () => {
    const allowedProtocols = getAllowedProtocols('["file"]');

    assert.equal(isAllowedNavigationUrl('file:///tmp/example.txt', allowedProtocols), true);
});

test('installProtocolGuard blocks navigation to a forbidden protocol', async () => {
    let handler: ((route: any) => Promise<void>) | undefined;

    const context = {
        async route(_pattern: string, routeHandler: (route: any) => Promise<void>) {
            handler = routeHandler;
        },
    };

    await installProtocolGuard(context as any);

    assert.ok(handler);

    let abortedWith: string | undefined;
    let continued = false;

    await handler({
        request() {
            return {
                isNavigationRequest() {
                    return true;
                },
                url() {
                    return 'file:///etc/passwd';
                },
            };
        },
        async abort(reason: string) {
            abortedWith = reason;
        },
        async continue() {
            continued = true;
        },
    });

    assert.equal(abortedWith, 'blockedbyclient');
    assert.equal(continued, false);
});

test('installProtocolGuard allows navigation to an allowed protocol', async () => {
    let handler: ((route: any) => Promise<void>) | undefined;

    const context = {
        async route(_pattern: string, routeHandler: (route: any) => Promise<void>) {
            handler = routeHandler;
        },
    };

    await installProtocolGuard(context as any);

    assert.ok(handler);

    let aborted = false;
    let continued = false;

    await handler({
        request() {
            return {
                isNavigationRequest() {
                    return true;
                },
                url() {
                    return 'https://example.com/';
                },
            };
        },
        async abort() {
            aborted = true;
        },
        async continue() {
            continued = true;
        },
    });

    assert.equal(aborted, false);
    assert.equal(continued, true);
});

test('installProtocolGuard ignores forbidden protocols for non-navigation requests', async () => {
    let handler: ((route: any) => Promise<void>) | undefined;

    const context = {
        async route(_pattern: string, routeHandler: (route: any) => Promise<void>) {
            handler = routeHandler;
        },
    };

    await installProtocolGuard(context as any);

    assert.ok(handler);

    let aborted = false;
    let continued = false;

    await handler({
        request() {
            return {
                isNavigationRequest() {
                    return false;
                },
                url() {
                    return 'file:///etc/passwd';
                },
            };
        },
        async abort() {
            aborted = true;
        },
        async continue() {
            continued = true;
        },
    });

    assert.equal(aborted, false);
    assert.equal(continued, true);
});
