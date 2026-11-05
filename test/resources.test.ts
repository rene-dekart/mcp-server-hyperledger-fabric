import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadChaincodeApis } from '../src/resources.js';

const api = {
  chaincode: 'asset-transfer',
  contracts: [{ name: 'AssetTransferContract', default: true, methods: [] }],
};

test('loadChaincodeApis reads a single file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-hl-'));
  const file = join(dir, 'chaincode-api.json');
  writeFileSync(file, JSON.stringify(api));
  try {
    const apis = loadChaincodeApis(file);
    assert.equal(apis.length, 1);
    assert.equal(apis[0].chaincode, 'asset-transfer');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadChaincodeApis reads all json files in a directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-hl-'));
  writeFileSync(join(dir, 'a.json'), JSON.stringify({ ...api, chaincode: 'a' }));
  writeFileSync(join(dir, 'b.json'), JSON.stringify({ ...api, chaincode: 'b' }));
  writeFileSync(join(dir, 'notes.txt'), 'not json');
  try {
    const apis = loadChaincodeApis(dir);
    assert.deepEqual(apis.map((a) => a.chaincode).sort(), ['a', 'b']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
