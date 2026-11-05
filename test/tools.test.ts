import assert from 'node:assert/strict';
import { test } from 'node:test';
import { common } from '@hyperledger/fabric-protos';
import { blockDataHash } from '../src/tools/block-utils.js';
import { checkNetworkStatusSchema } from '../src/tools/check-network-status.js';
import { getChaincodeEventsSchema } from '../src/tools/get-chaincode-events.js';

const baseEvents = {
  channel: 'mychannel',
  chaincode: 'asset-transfer',
};

test('getChaincodeEventsSchema accepts eventName filter', () => {
  const p = getChaincodeEventsSchema.parse({ ...baseEvents, eventName: 'AssetCreated' });
  assert.equal(p.eventName, 'AssetCreated');
});

test('getChaincodeEventsSchema rejects bad eventName', () => {
  assert.throws(() => getChaincodeEventsSchema.parse({ ...baseEvents, eventName: 'bad name!' }));
});

test('getChaincodeEventsSchema defaults limit to 10', () => {
  const p = getChaincodeEventsSchema.parse(baseEvents);
  assert.equal(p.limit, 10);
});

test('checkNetworkStatusSchema parses valid channel', () => {
  const p = checkNetworkStatusSchema.parse({ channel: 'mychannel' });
  assert.equal(p.channel, 'mychannel');
  assert.equal(p.timeoutMs, 9000); // default
});

test('checkNetworkStatusSchema rejects bad channel', () => {
  assert.throws(() => checkNetworkStatusSchema.parse({ channel: 'bad channel!' }));
});

test('blockDataHash reads header hash without parsing txs', () => {
  const block = new common.Block();
  const header = new common.BlockHeader();
  header.setDataHash(Buffer.from('aabb', 'hex'));
  block.setHeader(header);
  assert.equal(blockDataHash(block), 'aabb');
});
