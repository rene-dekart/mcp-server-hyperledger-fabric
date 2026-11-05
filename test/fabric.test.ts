import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadConfig, loadEnvFile } from '../src/config.js';
import { toMcpError } from '../src/errors.js';
import { isUnavailable } from '../src/fabric.js';

const baseEnv = {
  FABRIC_PEER_ENDPOINT: 'localhost:7051',
  FABRIC_TLS: 'true',
  FABRIC_MSP_ID: 'Org1MSP',
  FABRIC_CERT: 'cert.pem',
  FABRIC_KEY: 'key.pem',
  FABRIC_CHANNEL: 'mychannel',
  FABRIC_CHAINCODE: 'asset-transfer',
};

test('loadConfig parses valid env', () => {
  const cfg = loadConfig(baseEnv);
  assert.equal(cfg.FABRIC_MSP_ID, 'Org1MSP');
  assert.equal(cfg.FABRIC_TLS, true);
  assert.equal(cfg.REQUEST_TIMEOUT_MS, 30000); // default
});

test('loadConfig parses FABRIC_TLS=false as false', () => {
  const cfg = loadConfig({ ...baseEnv, FABRIC_TLS: 'false' });
  assert.equal(cfg.FABRIC_TLS, false);
});

test('loadConfig defaults FABRIC_TLS to true', () => {
  const cfg = loadConfig({ ...baseEnv, FABRIC_TLS: undefined });
  assert.equal(cfg.FABRIC_TLS, true);
});

test('loadConfig parses FABRIC_READ_ONLY', () => {
  assert.equal(loadConfig(baseEnv).FABRIC_READ_ONLY, false);
  assert.equal(loadConfig({ ...baseEnv, FABRIC_READ_ONLY: 'true' }).FABRIC_READ_ONLY, true);
  assert.equal(loadConfig({ ...baseEnv, FABRIC_READ_ONLY: 'false' }).FABRIC_READ_ONLY, false);
});

test('loadConfig rejects missing required key', () => {
  assert.throws(() => loadConfig({ ...baseEnv, FABRIC_MSP_ID: undefined }));
});

test('loadEnvFile parses KEY=VALUE, skips comments and blanks', () => {
  const file = 'env-test.tmp';
  writeFileSync(file, '# comment\n\nFABRIC_TEST_A=hello\nFABRIC_TEST_B="quoted value"\n');
  try {
    loadEnvFile(file);
    assert.equal(process.env.FABRIC_TEST_A, 'hello');
    assert.equal(process.env.FABRIC_TEST_B, 'quoted value');
  } finally {
    delete process.env.FABRIC_TEST_A;
    delete process.env.FABRIC_TEST_B;
    rmSync(file);
  }
});

test('toMcpError returns isError result', () => {
  const r = toMcpError(new Error('boom'));
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /boom/);
});

test('isUnavailable detects grpc UNAVAILABLE only', () => {
  assert.equal(isUnavailable({ code: 14 }), true); // UNAVAILABLE
  assert.equal(isUnavailable({ code: 4 }), false); // DEADLINE_EXCEEDED
  assert.equal(isUnavailable(new Error('boom')), false);
});
