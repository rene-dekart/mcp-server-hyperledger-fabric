import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { buildInstructions } from '../src/instructions.js';

const env = {
  FABRIC_PEER_ENDPOINT: 'localhost:7051',
  FABRIC_MSP_ID: 'Org1MSP',
  FABRIC_CERT: 'cert.pem',
  FABRIC_KEY: 'key.pem',
};

test('instructions name channel, MSP and chaincodes', () => {
  const text = buildInstructions(loadConfig({ ...env, FABRIC_CHANNEL: 'brics-chan' }), ['tokens', 'messages'], false);
  assert.match(text, /brics-chan/);
  assert.match(text, /Org1MSP/);
  assert.match(text, /tokens, messages/);
  assert.match(text, /fabric:\/\/chaincode\/<name>/);
  assert.match(text, /get_transaction/);
});

test('instructions omit channel and chaincodes when unset', () => {
  const text = buildInstructions(loadConfig(env), [], false);
  assert.match(text, /use the one the user names/);
  assert.doesNotMatch(text, /Known chaincodes/);
});

test('instructions reflect read-only mode', () => {
  const text = buildInstructions(loadConfig(env), [], true);
  assert.match(text, /Read-only mode/);
  assert.doesNotMatch(text, /Write with invoke_chaincode/);
});
