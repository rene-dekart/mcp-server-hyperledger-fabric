import assert from 'node:assert/strict';
import test from 'node:test';
import { checkNetworkStatusOutputSchema } from '../src/tools/check-network-status.js';
import { endorseChaincodeOutputSchema } from '../src/tools/endorse-chaincode.js';
import { getBlockOutputSchema } from '../src/tools/get-block.js';
import { getBlockByHashOutputSchema } from '../src/tools/get-block-by-hash.js';
import { getBlockchainInfoOutputSchema } from '../src/tools/get-blockchain-info.js';
import { getChaincodeEventsOutputSchema } from '../src/tools/get-chaincode-events.js';
import { getTransactionOutputSchema } from '../src/tools/get-transaction.js';
import { invokeChaincodeOutputSchema } from '../src/tools/invoke-chaincode.js';
import { queryChaincodeOutputSchema } from '../src/tools/query-chaincode.js';

/**
 * Every tool declares an outputSchema and the SDK validates structuredContent
 * against it before the result leaves the server — a mismatch turns a working
 * call into a protocol error. These are the shapes the tool code actually
 * returns, so a schema edit that stops matching them fails here first.
 */

const block = {
  number: 7,
  previousHash: 'aa',
  dataHash: 'bb',
  txCount: 1,
  txIds: ['tx1'],
};

test('query_chaincode output', () => {
  assert.equal(queryChaincodeOutputSchema.safeParse({ result: '{"a":1}' }).success, true);
});

test('invoke_chaincode output: fresh submit and dedup hit', () => {
  const fresh = { transactionId: 'tx1', blockNumber: 3, status: 'VALID', successful: true };
  const dedup = { transactionId: 'tx1', deduplicated: true, note: 'not re-sent' };
  assert.equal(invokeChaincodeOutputSchema.safeParse(fresh).success, true);
  assert.equal(invokeChaincodeOutputSchema.safeParse(dedup).success, true);
});

test('get_block output accepts a summary with and without optional hashes', () => {
  assert.equal(getBlockOutputSchema.safeParse(block).success, true);
  assert.equal(getBlockOutputSchema.safeParse({ txCount: 0, txIds: [] }).success, true);
});

test('get_blockchain_info output tolerates undocumented REST keys', () => {
  const parsed = getBlockchainInfoOutputSchema.safeParse({ height: 5, currentBlockHash: 'h', futureField: 1 });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.height, 5);
});

test('get_chaincode_events output', () => {
  const sample = { events: [{ eventName: 'AssetCreated', txId: 'tx1', blockNumber: 2, payload: '{}' }] };
  assert.equal(getChaincodeEventsOutputSchema.safeParse(sample).success, true);
  assert.equal(getChaincodeEventsOutputSchema.safeParse({ events: [] }).success, true);
});

test('get_transaction output: hit and miss', () => {
  assert.equal(getTransactionOutputSchema.safeParse({ found: true, ...block }).success, true);
  assert.equal(getTransactionOutputSchema.safeParse({ found: false, scanned: 42, txid: 'tx1' }).success, true);
});

test('get_block_by_hash output: hit and miss', () => {
  assert.equal(getBlockByHashOutputSchema.safeParse({ found: true, ...block }).success, true);
  assert.equal(getBlockByHashOutputSchema.safeParse({ found: false, scanned: 42, hash: 'cc' }).success, true);
});

test('endorse_chaincode output', () => {
  assert.equal(endorseChaincodeOutputSchema.safeParse({ transactionId: 'tx1', result: 'ok' }).success, true);
});

test('check_network_status output: online and degraded', () => {
  const online = { status: 'online', height: 8, currentBlockHash: 'h', lastBlock: block, latencyMs: 12 };
  const degraded = { status: 'degraded', height: 8, lastBlock: null, latencyMs: 9000 };
  assert.equal(checkNetworkStatusOutputSchema.safeParse(online).success, true);
  assert.equal(checkNetworkStatusOutputSchema.safeParse(degraded).success, true);
  assert.equal(checkNetworkStatusOutputSchema.safeParse({ ...online, status: 'offline' }).success, false);
});
