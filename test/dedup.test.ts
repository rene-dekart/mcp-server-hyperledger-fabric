import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { WriteDedup } from '../src/tools/dedup.js';

test('key is stable for identical calls', () => {
  const a = WriteDedup.key({ channel: 'c', chaincode: 'cc', method: 'Create', args: ['x', '1'] });
  const b = WriteDedup.key({ channel: 'c', chaincode: 'cc', method: 'Create', args: ['x', '1'] });
  assert.equal(a, b);
});

test('key differs when args differ', () => {
  const a = WriteDedup.key({ channel: 'c', chaincode: 'cc', method: 'Create', args: ['x', '1'] });
  const b = WriteDedup.key({ channel: 'c', chaincode: 'cc', method: 'Create', args: ['x', '2'] });
  assert.notEqual(a, b);
});

test('get returns txid within window, then expires', () => {
  mock.timers.enable({ apis: ['Date'] });
  try {
    const d = new WriteDedup(1000);
    d.set('k', 'tx1');
    assert.equal(d.get('k'), 'tx1');
    mock.timers.tick(1001);
    assert.equal(d.get('k'), undefined);
  } finally {
    mock.timers.reset();
  }
});

test('disabled when window is 0', () => {
  const d = new WriteDedup(0);
  d.set('k', 'tx1');
  assert.equal(d.get('k'), undefined);
});
