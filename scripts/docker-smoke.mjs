#!/usr/bin/env node
// Smoke-test the dockerized MCP server over stdio — exactly how Claude Code
// talks to it. Runs against the real network, so it needs the wallet certs.
//   node scripts/docker-smoke.mjs [channel]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const channel = process.argv[2] ?? 'mychannel';
const IMAGE = 'mcp-server-hyperledger-fabric:0.1.0';
const root = process.cwd();
const api = join(root, 'chaincode-api');
const envFile = join(root, '.env.docker');

// WALLET_DIR comes from the local `.env` (git-ignored) — no hardcoded paths.
function envVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^${name}=(.*)$`));
      if (m) return m[1].trim();
    }
  } catch {}
  return undefined;
}
const wallet = envVar('WALLET_DIR');
for (const [label, p] of [
  ['wallet (WALLET_DIR in .env)', wallet],
  ['api', api],
  ['env file', envFile],
]) {
  if (!p || !existsSync(p)) {
    console.error(`missing ${label}: ${p}`);
    process.exit(1);
  }
}

const docker = spawn('docker', [
  'run',
  '-i',
  '--rm',
  '--env-file',
  envFile,
  '-v',
  `${wallet}:/wallets:ro`,
  '-v',
  `${api}:/app/chaincode-api:ro`,
  IMAGE,
]);

let id = 0;
let buf = '';
const pending = new Map();
docker.stderr.on('data', (d) => process.stderr.write(`[ctr] ${d}`));
docker.stdout.on('data', (d) => {
  buf += d;
  for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error('NON-JSON ON STDOUT (protocol corruption!):', line);
      continue;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

const send = (method, params) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    docker.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mid, method, params })}\n`);
  });

const fail = async (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  docker.kill();
  process.exit(1);
};
setTimeout(() => fail('timeout 45s'), 45000).unref();

const init = await send('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'smoke', version: '0.0.1' },
});
if (init.error || !init.result?.serverInfo?.name)
  await fail(`initialize: ${JSON.stringify(init.error ?? init.result)}`);
console.log('1/3 initialize OK —', init.result.serverInfo.name, init.result.serverInfo.version);

const res = await send('resources/list', {});
const names = res.result?.resources?.map((r) => r.uri) ?? [];
if (res.error || names.length === 0) await fail(`resources/list: ${JSON.stringify(res.error)}`);
console.log(
  `2/3 resources/list OK — ${names.length} resources: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}`,
);

const status = await send('tools/call', { name: 'check_network_status', arguments: { channel } });
const text = status.result?.content?.[0]?.text;
if (!text?.includes('"status"')) await fail(`check_network_status: ${JSON.stringify(status.error ?? text)}`);
console.log(`3/3 check_network_status OK — channel ${channel}: ${text}`);

docker.stdin.end();
console.log('SMOKE PASSED ✔');
process.exit(0);
