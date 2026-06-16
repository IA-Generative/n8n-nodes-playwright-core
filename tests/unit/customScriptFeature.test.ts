import test from 'node:test';
import assert from 'node:assert/strict';
import { isCustomScriptEnabled } from '../../nodes/playwright/customScriptFeature';

test('custom script is disabled when the environment variable is missing', () => {
    assert.equal(isCustomScriptEnabled(undefined), false);
});

test('custom script is disabled when the environment variable is empty', () => {
    assert.equal(isCustomScriptEnabled(''), false);
});

test('custom script is enabled only when the value is true', () => {
    assert.equal(isCustomScriptEnabled('true'), true);
    assert.equal(isCustomScriptEnabled('TRUE'), true);
    assert.equal(isCustomScriptEnabled(' true '), true);
});

test('custom script is disabled for any other value', () => {
    assert.equal(isCustomScriptEnabled('false'), false);
    assert.equal(isCustomScriptEnabled('1'), false);
    assert.equal(isCustomScriptEnabled('yes'), false);
});
