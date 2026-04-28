import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOperation } from '../../nodes/playwright/operations';

type FilledCall = {
    selector: string;
    value?: string;
    clicked?: boolean;
};

function createFakeLocator(selector: string, calls: FilledCall[]) {
    return {
        first() {
            return this;
        },
        async fill(value: string) {
            calls.push({ selector, value });
        },
        async click() {
            calls.push({ selector, clicked: true });
        },
    };
}

function createFakePage(calls: FilledCall[]) {
    return {
        locator(selector: string) {
            return createFakeLocator(selector, calls);
        },
        url() {
            return 'https://example.com/login';
        },
    };
}

function createFakeExecuteFunctions({
    params,
    credentials,
}: {
    params: Record<string, unknown>;
    credentials?: { username?: string; password?: string };
}) {
    return {
        getNodeParameter(name: string, _itemIndex: number, fallback?: unknown) {
            return name in params ? params[name] : fallback;
        },
        async getCredentials(_name: string) {
            return credentials ?? {};
        },
        getNode() {
            return { name: 'Playwright' };
        },
        helpers: {},
    } as any;
}

test('fillForm fills literal fields and submits form', async () => {
    const calls: FilledCall[] = [];
    const page = createFakePage(calls);
    const executeFunctions = createFakeExecuteFunctions({
        params: {
            fillFields: {
                fields: [
                    { selector: '#username', valueSource: 'literal', value: 'john' },
                    { selector: '//input[@name="password"]', valueSource: 'literal', value: 'secret' },
                ],
            },
            submitForm: true,
            submitSelector: '#submit',
        },
    });

    const result = await handleOperation('fillForm', page as any, executeFunctions, 0);

    assert.equal(result.json.success, true);
    assert.equal(result.json.filledFieldsCount, 2);
    assert.equal(result.json.submitted, true);
    assert.deepEqual(result.json.fields, [
        {
            selectorType: 'css',
            selector: '#username',
            valueSource: 'literal',
        },
        {
            selectorType: 'xpath',
            selector: '//input[@name="password"]',
            valueSource: 'literal',
        },
    ]);
    assert.deepEqual(result.json.submittedWith, {
        selectorType: 'css',
        selector: '#submit',
    });

    assert.deepEqual(calls, [
        { selector: '#username', value: 'john' },
        { selector: 'xpath=//input[@name="password"]', value: 'secret' },
        { selector: '#submit', clicked: true },
    ]);
});

test('fillForm fills credential-backed fields', async () => {
    const calls: FilledCall[] = [];
    const page = createFakePage(calls);
    const executeFunctions = createFakeExecuteFunctions({
        params: {
            fillFields: {
                fields: [
                    { selector: '#username', valueSource: 'credential', credentialField: 'username' },
                    { selector: '#password', valueSource: 'credential', credentialField: 'password' },
                ],
            },
            submitForm: false,
            submitSelector: '',
        },
        credentials: {
            username: 'john',
            password: 'super-secret',
        },
    });

    const result = await handleOperation('fillForm', page as any, executeFunctions, 0);

    assert.equal(result.json.success, true);
    assert.equal(result.json.filledFieldsCount, 2);
    assert.equal(result.json.submitted, false);

    assert.deepEqual(calls, [
        { selector: '#username', value: 'john' },
        { selector: '#password', value: 'super-secret' },
    ]);
});

test('fillForm throws when no fields are provided', async () => {
    const calls: FilledCall[] = [];
    const page = createFakePage(calls);
    const executeFunctions = createFakeExecuteFunctions({
        params: {
            fillFields: { fields: [] },
            submitForm: false,
            submitSelector: '',
        },
    });

    await assert.rejects(
        () => handleOperation('fillForm', page as any, executeFunctions, 0),
        (error: any) => {
            assert.match(error.message, /At least one form field is required/);
            return true;
        },
    );
});

test('fillForm throws when submit is enabled without submit selector', async () => {
    const calls: FilledCall[] = [];
    const page = createFakePage(calls);
    const executeFunctions = createFakeExecuteFunctions({
        params: {
            fillFields: {
                fields: [{ selector: '#username', valueSource: 'literal', value: 'john' }],
            },
            submitForm: true,
            submitSelector: '   ',
        },
    });

    await assert.rejects(
        () => handleOperation('fillForm', page as any, executeFunctions, 0),
        (error: any) => {
            assert.match(error.message, /Submit selector is required/);
            return true;
        },
    );
});

test('fillForm throws when credential field is missing', async () => {
    const calls: FilledCall[] = [];
    const page = createFakePage(calls);
    const executeFunctions = createFakeExecuteFunctions({
        params: {
            fillFields: {
                fields: [{ selector: '#username', valueSource: 'credential' }],
            },
            submitForm: false,
            submitSelector: '',
        },
        credentials: {
            username: 'john',
        },
    });

    await assert.rejects(
        () => handleOperation('fillForm', page as any, executeFunctions, 0),
        (error: any) => {
            assert.match(error.message, /Credential field is required/);
            return true;
        },
    );
});

test('fillForm throws when credential value is empty', async () => {
    const calls: FilledCall[] = [];
    const page = createFakePage(calls);
    const executeFunctions = createFakeExecuteFunctions({
        params: {
            fillFields: {
                fields: [
                    { selector: '#password', valueSource: 'credential', credentialField: 'password' },
                ],
            },
            submitForm: false,
            submitSelector: '',
        },
        credentials: {
            password: '',
        },
    });

    await assert.rejects(
        () => handleOperation('fillForm', page as any, executeFunctions, 0),
        (error: any) => {
            assert.match(error.message, /Credential field "password" is empty or missing/);
            return true;
        },
    );
});
