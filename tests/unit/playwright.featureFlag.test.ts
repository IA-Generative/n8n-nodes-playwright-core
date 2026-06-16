import test from 'node:test';
import assert from 'node:assert/strict';
import { Playwright } from '../../nodes/playwright/Playwright.node';

const environmentVariable = 'N8N_PLAYWRIGHT_NODE_CUSTOM_SCRIPT_ENABLED';
const originalValue = process.env[environmentVariable];

test.afterEach(() => {
    if (originalValue === undefined) {
        delete process.env[environmentVariable];
        return;
    }

    process.env[environmentVariable] = originalValue;
});

test('custom script operation and fields are hidden when the feature flag is disabled', () => {
    delete process.env[environmentVariable];

    const node = new Playwright();
    const operationProperty = node.description.properties.find(
        (property) => property.name === 'operation',
    );

    assert.ok(operationProperty);
    assert.equal(operationProperty.type, 'options');

    const operationValues =
        operationProperty.options?.flatMap((option) =>
            'value' in option ? [option.value] : [],
        ) ?? [];

    assert.equal(operationValues.includes('runCustomScript'), false);
    assert.equal(
        node.description.properties.some((property) => property.name === 'scriptCode'),
        false,
    );
    assert.equal(
        node.description.properties.some((property) => property.name === 'notice'),
        false,
    );
});

test('custom script operation and fields are visible when the feature flag is enabled', () => {
    process.env[environmentVariable] = 'true';

    const node = new Playwright();
    const operationProperty = node.description.properties.find(
        (property) => property.name === 'operation',
    );

    assert.ok(operationProperty);
    assert.equal(operationProperty.type, 'options');

    const operationValues =
        operationProperty.options?.flatMap((option) =>
            'value' in option ? [option.value] : [],
        ) ?? [];

    assert.equal(operationValues.includes('runCustomScript'), true);
    assert.equal(
        node.description.properties.some((property) => property.name === 'scriptCode'),
        true,
    );
    assert.equal(
        node.description.properties.some((property) => property.name === 'notice'),
        true,
    );
});
