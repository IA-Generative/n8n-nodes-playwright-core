import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filenameFromDisposition,
    filenameFromUrl,
    inferSelectorType,
    isViewerLikeUrl,
    looksLikeDownloadResponse,
    resolveUrl,
} from '../../nodes/playwright/operations';

function createFakeResponse({
    headers = {},
    url = 'https://example.com/file.pdf',
}: {
    headers?: Record<string, string>;
    url?: string;
}) {
    return {
        headers() {
            return headers;
        },
        url() {
            return url;
        },
    };
}

test('inferSelectorType returns xpath for slash-prefixed selectors', () => {
    assert.equal(inferSelectorType('//button[@type="submit"]'), 'xpath');
});

test('inferSelectorType returns xpath for parenthesis-prefixed selectors', () => {
    assert.equal(inferSelectorType('(//input)[1]'), 'xpath');
});

test('inferSelectorType returns css for regular selectors', () => {
    assert.equal(inferSelectorType('#login-form'), 'css');
});

test('filenameFromDisposition extracts plain quoted filename', () => {
    assert.equal(
        filenameFromDisposition('attachment; filename="report.pdf"'),
        'report.pdf',
    );
});

test('filenameFromDisposition extracts unquoted filename', () => {
    assert.equal(
        filenameFromDisposition('attachment; filename=report.pdf'),
        'report.pdf',
    );
});

test('filenameFromDisposition extracts utf8 filename', () => {
    assert.equal(
        filenameFromDisposition("attachment; filename*=UTF-8''rapport%20final.pdf"),
        'rapport final.pdf',
    );
});

test('filenameFromDisposition returns null when filename is missing', () => {
    assert.equal(filenameFromDisposition('inline'), null);
});

test('filenameFromUrl extracts last path segment', () => {
    assert.equal(filenameFromUrl('https://example.com/files/report.pdf'), 'report.pdf');
});

test('filenameFromUrl falls back to download for invalid url', () => {
    assert.equal(filenameFromUrl('not a valid url'), 'download');
});

test('resolveUrl resolves relative urls against base url', () => {
    assert.equal(
        resolveUrl('/files/report.pdf', 'https://example.com/account/documents'),
        'https://example.com/files/report.pdf',
    );
});

test('resolveUrl returns original value when resolution fails', () => {
    assert.equal(resolveUrl('::::', 'not-a-valid-base'), '::::');
});

test('isViewerLikeUrl detects chrome extension urls', () => {
    assert.equal(isViewerLikeUrl('chrome-extension://viewer/index.html'), true);
});

test('isViewerLikeUrl detects about blank urls', () => {
    assert.equal(isViewerLikeUrl('about:blank'), true);
});

test('isViewerLikeUrl detects blob urls', () => {
    assert.equal(isViewerLikeUrl('blob:https://example.com/1234'), true);
});

test('isViewerLikeUrl returns false for regular https urls', () => {
    assert.equal(isViewerLikeUrl('https://example.com/file.pdf'), false);
});

test('looksLikeDownloadResponse detects attachment disposition', () => {
    const response = createFakeResponse({
        headers: {
            'content-disposition': 'attachment; filename="report.pdf"',
            'content-type': 'application/octet-stream',
        },
        url: 'https://example.com/download',
    });

    assert.equal(looksLikeDownloadResponse(response as any), true);
});

test('looksLikeDownloadResponse detects pdf content type', () => {
    const response = createFakeResponse({
        headers: {
            'content-type': 'application/pdf',
        },
        url: 'https://example.com/view',
    });

    assert.equal(looksLikeDownloadResponse(response as any), true);
});

test('looksLikeDownloadResponse detects pdf url', () => {
    const response = createFakeResponse({
        headers: {
            'content-type': 'text/html',
        },
        url: 'https://example.com/report.pdf',
    });

    assert.equal(looksLikeDownloadResponse(response as any), true);
});

test('looksLikeDownloadResponse returns false for normal html response', () => {
    const response = createFakeResponse({
        headers: {
            'content-type': 'text/html',
        },
        url: 'https://example.com/dashboard',
    });

    assert.equal(looksLikeDownloadResponse(response as any), false);
});
