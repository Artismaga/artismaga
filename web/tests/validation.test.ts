import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse, parseSignupMode } from '../src/client/validation.js';
test('validates untrusted response fields without assuming JSON has a known type', () => {
  assert.deepEqual(parseResponse({ message: 'Saved', user: { uid: 'test' } }), {
    message: 'Saved',
  });
  for (const value of [null, [], 'ok', { error: 123 }, { invitation: false }])
    assert.throws(() => parseResponse(value));
});
test('only supported signup policies are submitted', () => {
  assert.equal(parseSignupMode('invitation'), 'invitation');
  assert.throws(() => parseSignupMode('administrator'));
});
