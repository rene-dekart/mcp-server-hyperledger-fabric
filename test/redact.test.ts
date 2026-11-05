import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactTransientData } from '../src/redact.js';

test('masks transientData values but keeps keys', () => {
  const out = redactTransientData(
    { channel: 'brics-chan', transientData: { amount: '1000', secret: 'abc' } },
    false,
  ) as { channel: string; transientData: Record<string, string> };
  assert.equal(out.channel, 'brics-chan');
  assert.deepEqual(Object.keys(out.transientData), ['amount', 'secret']);
  assert.match(out.transientData.amount, /^4 bytes sha256:[0-9a-f]{8}$/);
  assert.doesNotMatch(JSON.stringify(out), /1000|abc/);
});

test('keeps values when logging is enabled', () => {
  const params = { transientData: { amount: '1000' } };
  assert.equal(redactTransientData(params, true), params);
});

test('passes params without transientData through unchanged', () => {
  const params = { channel: 'brics-chan' };
  assert.equal(redactTransientData(params, false), params);
});
