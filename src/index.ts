#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { getConfig } from './config.js';
import { closeGateway } from './fabric.js';
import { buildInstructions } from './instructions.js';
import { redactTransientData } from './redact.js';
import { loadChaincodeApis, registerChaincodeResources } from './resources.js';
import { runScan } from './scan.js';
import {
  checkNetworkStatus,
  checkNetworkStatusOutputSchema,
  checkNetworkStatusSchema,
} from './tools/check-network-status.js';
import { endorseChaincode, endorseChaincodeOutputSchema, endorseChaincodeSchema } from './tools/endorse-chaincode.js';
import { getBlock, getBlockOutputSchema, getBlockSchema } from './tools/get-block.js';
import { getBlockByHash, getBlockByHashOutputSchema, getBlockByHashSchema } from './tools/get-block-by-hash.js';
import {
  getBlockchainInfo,
  getBlockchainInfoOutputSchema,
  getBlockchainInfoSchema,
} from './tools/get-blockchain-info.js';
import {
  getChaincodeEvents,
  getChaincodeEventsOutputSchema,
  getChaincodeEventsSchema,
} from './tools/get-chaincode-events.js';
import { getTransaction, getTransactionOutputSchema, getTransactionSchema } from './tools/get-transaction.js';
import { invokeChaincode, invokeChaincodeOutputSchema, invokeChaincodeSchema } from './tools/invoke-chaincode.js';
import { queryChaincode, queryChaincodeOutputSchema, queryChaincodeSchema } from './tools/query-chaincode.js';

// CLI subcommand: mcp-server-hyperledger-fabric scan <dir> — generate chaincode-api.json.
if (process.argv[2] === 'scan') {
  await runScan(process.argv.slice(3));
  process.exit(0);
}

const SERVER_INFO = { name: 'mcp-server-hyperledger-fabric', version: '0.1.0' } as const;

// Log every tool call to stderr so the agent's activity is visible in docker
// logs / dev terminal. stdout stays MCP-protocol-only (JSON-RPC).
function withLog<T, R>(name: string, fn: (params: T) => Promise<R>): (params: T) => Promise<R> {
  return async (params) => {
    const t0 = Date.now();
    const shown = redactTransientData(params, getConfig().FABRIC_LOG_TRANSIENT);
    process.stderr.write(`[mcp-server-hyperledger-fabric] ${name} <- ${safeJson(shown)}\n`);
    try {
      const out = await fn(params);
      // Business errors are returned as { isError: true } results (toMcpError),
      // not thrown — so they land here, not in the catch below.
      const status = isErrorResult(out) ? 'ERROR' : 'OK';
      process.stderr.write(
        `[mcp-server-hyperledger-fabric] ${name} ${status} ${Date.now() - t0}ms → ${summarizeResult(out)}\n`,
      );
      return out;
    } catch (err) {
      process.stderr.write(
        `[mcp-server-hyperledger-fabric] ${name} ERROR ${Date.now() - t0}ms: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      throw err;
    }
  };
}
const safeJson = (v: unknown): string => {
  try {
    const s = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
    if (!s) return '∅';
    return s.length > 400 ? `${s.slice(0, 400)}…` : s;
  } catch {
    return String(v);
  }
};

/** True when a tool returned a business error as an { isError: true } result. */
const isErrorResult = (out: unknown): boolean =>
  !!out && typeof out === 'object' && (out as { isError?: boolean }).isError === true;

/** Extract the text content of a tool result for the log line. */
const summarizeResult = (out: unknown): string => {
  if (!out || typeof out !== 'object') return safeJson(out);
  const content = (out as { content?: { text?: string }[] }).content;
  if (Array.isArray(content)) {
    const text = content
      .map((c) => c.text ?? '')
      .join(' | ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  }
  return safeJson(out);
};

function createServer(): McpServer {
  const config = getConfig();
  const readOnly = config.FABRIC_READ_ONLY;
  const chaincodes =
    config.FABRIC_CHAINCODE_API && existsSync(config.FABRIC_CHAINCODE_API)
      ? loadChaincodeApis(config.FABRIC_CHAINCODE_API).map((api) => api.chaincode)
      : [];
  const server = new McpServer(SERVER_INFO, {
    instructions: buildInstructions(config, chaincodes, readOnly),
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false },
    },
    cacheHints: { 'tools/list': { ttlMs: 300_000, cacheScope: 'public' } },
  });

  server.registerTool(
    'query_chaincode',
    {
      title: 'Query chaincode (evaluate, read-only)',
      description:
        'Evaluate a chaincode read function on Hyperledger Fabric and return its result. Use for reads, never for state changes.',
      inputSchema: queryChaincodeSchema,
      outputSchema: queryChaincodeOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    withLog('query_chaincode', queryChaincode),
  );

  if (!readOnly)
    server.registerTool(
      'invoke_chaincode',
      {
        title: 'Invoke chaincode (submit, writes state)',
        description:
          'Submit a chaincode transaction that changes state. Returns transaction ID and commit status. Use only when a state change is intended. A commit-status timeout does NOT mean the transaction failed — it may still commit; check get_transaction before retrying.',
        inputSchema: invokeChaincodeSchema,
        outputSchema: invokeChaincodeOutputSchema,
        annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      withLog('invoke_chaincode', invokeChaincode),
    );

  server.registerTool(
    'get_block',
    {
      title: 'Get block by number',
      description:
        'Read a block from the Fabric ledger by block number and return a summary (number, hashes, transactions).',
      inputSchema: getBlockSchema,
      outputSchema: getBlockOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    withLog('get_block', getBlock),
  );

  server.registerTool(
    'get_blockchain_info',
    {
      title: 'Get blockchain info',
      description:
        'Read ledger height and hashes for a channel via the Fabric Gateway REST API. Requires FABRIC_REST_URL.',
      inputSchema: getBlockchainInfoSchema,
      outputSchema: getBlockchainInfoOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    withLog('get_blockchain_info', getBlockchainInfo),
  );

  server.registerTool(
    'get_chaincode_events',
    {
      title: 'Get chaincode events',
      description: 'Read recent chaincode events from the Fabric ledger (event name, transaction, block, payload).',
      inputSchema: getChaincodeEventsSchema,
      outputSchema: getChaincodeEventsOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    withLog('get_chaincode_events', getChaincodeEvents),
  );

  server.registerTool(
    'get_transaction',
    {
      title: 'Get transaction by ID',
      description:
        'Find a transaction by its ID by scanning blocks forward from startBlock. Returns the block summary containing the transaction.',
      inputSchema: getTransactionSchema,
      outputSchema: getTransactionOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    withLog('get_transaction', getTransaction),
  );

  server.registerTool(
    'get_block_by_hash',
    {
      title: 'Get block by data hash',
      description:
        'Find a block by its data hash by scanning blocks forward from startBlock. Returns the block summary.',
      inputSchema: getBlockByHashSchema,
      outputSchema: getBlockByHashOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    withLog('get_block_by_hash', getBlockByHash),
  );

  if (!readOnly)
    server.registerTool(
      'endorse_chaincode',
      {
        title: 'Endorse chaincode (dry run, no commit)',
        description:
          'Validate a chaincode transaction by endorsing it without submitting to the orderer. Nothing is committed. Use to check a write will pass before invoking.',
        inputSchema: endorseChaincodeSchema,
        outputSchema: endorseChaincodeOutputSchema,
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      },
      withLog('endorse_chaincode', endorseChaincode),
    );

  server.registerTool(
    'check_network_status',
    {
      title: 'Check network status',
      description:
        'Check peer health: ledger height, last block, response latency. Use before a series of calls to confirm the peer is reachable.',
      inputSchema: checkNetworkStatusSchema,
      outputSchema: checkNetworkStatusOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    withLog('check_network_status', checkNetworkStatus),
  );

  // Optional: expose chaincode API descriptions (from `mcp-server-hyperledger-fabric scan`)
  // as resources, so the model can look up contract/method names.
  const apiPath = getConfig().FABRIC_CHAINCODE_API ?? 'chaincode-api';
  if (existsSync(apiPath)) {
    registerChaincodeResources(server, apiPath);
  }

  return server;
}

// Close the gRPC connection cleanly on exit (Ctrl+C / container stop)
// instead of letting the process die with a half-open channel.
async function shutdown(): Promise<void> {
  try {
    await closeGateway();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

serveStdio(createServer);
