<p align="center">
  <h1 align="center">mcp-server-hyperledger-fabric</h1>
  <p align="center">
    MCP server for <a href="https://www.hyperledger.org/use/fabric">Hyperledger Fabric</a> —
    let AI agents query and invoke chaincode, read blocks and events from a Fabric network.
  </p>
</p>

<p align="center">
  <a href="https://github.com/rene-dekart/mcp-server-hyperledger-fabric/actions/workflows/ci.yml"><img src="https://github.com/rene-dekart/mcp-server-hyperledger-fabric/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/mcp-server-hyperledger-fabric"><img src="https://img.shields.io/npm/v/mcp-server-hyperledger-fabric.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/mcp-server-hyperledger-fabric"><img src="https://img.shields.io/npm/dw/mcp-server-hyperledger-fabric.svg" alt="npm downloads"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/mcp-server-hyperledger-fabric.svg" alt="node compatibility"></a>
  <a href="https://www.npmjs.com/package/mcp-server-hyperledger-fabric"><img src="https://img.shields.io/npm/l/mcp-server-hyperledger-fabric.svg" alt="license"></a>
</p>

## Features

- 🔍 **Query chaincode** — evaluate read-only functions, private data supported
- ✍️ **Invoke chaincode** — submit transactions, returns txid + commit status
- 🧪 **Endorse chaincode** — dry-run a write without committing
- 📦 **Read the ledger** — blocks, transactions, chaincode events
- 🧾 **Structured output** — every tool declares an `outputSchema` and returns
  `structuredContent`, so clients validate results instead of parsing text
- 🏥 **Check peer health** — height, last block, latency (no REST required)
- 📚 **Chaincode API discovery** — `mcp-server-hyperledger-fabric scan` generates descriptions served as MCP resources
- 🐳 **Docker image** — isolated server with per-call stderr logging

## Installation

```bash
npm install -g mcp-server-hyperledger-fabric
```

Requires Node.js ≥ 20 and a Fabric 2.5+ network with the
[Gateway service](https://hyperledger-fabric.readthedocs.io/en/latest/gateway.html) enabled.

## Quickstart

### 1. Configure the network

Copy `.env.example` to `.env` in the project root and fill in your network values.
The server reads `.env` from its own directory automatically — no env vars to pass
from the MCP client:

```bash
cp .env.example .env   # fill in your network values
```

Claude Code config stays minimal:

```json
{
  "mcpServers": {
    "hyperledger": {
      "command": "mcp-server-hyperledger-fabric"
    }
  }
}
```

Existing environment variables take precedence over `.env` (standard dotenv
behavior), so you can still override per-launch if needed.

To work with several networks at once, give each one its own MCP server entry
with its own `env` block — those values override `.env`. Copy
`.mcp.example.json` to `.mcp.json` (git-ignored) and fill in the paths.

### 2. Scan your chaincodes (recommended)

The model needs to know your chaincode's contract and method names. Generate
descriptions once (see [Chaincode API scan](#chaincode-api-scan)):

```bash
mcp-server-hyperledger-fabric scan ./chaincode-typescript --name asset-transfer
# → chaincode-api/asset-transfer.json
```

The server picks up `./chaincode-api` by default — no extra config needed.

### 3. Verify

Ask the model to read something, e.g. "read asset asset1". If it finds and calls
`query_chaincode`, the server is working.

## Configuration

All configuration comes from environment variables (see `.env.example`).

| Variable                      | Required | Default           | Description                                                                                                                                                                                                                                                                     |
| ----------------------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FABRIC_PEER_ENDPOINT`        | ✅       | —                 | gRPC endpoint of the gateway peer, `host:port`                                                                                                                                                                                                                                  |
| `FABRIC_CHANNEL`              | —        | —                 | Default channel named in the server instructions sent to the client                                                                                                                                                                                                             |
| `FABRIC_TLS`                  | —        | `true`            | Use TLS. `false` is dev-only (test-network)                                                                                                                                                                                                                                     |
| `FABRIC_PEER_TLS_CERT`        | with TLS | —                 | Path to the peer's TLS CA cert (PEM)                                                                                                                                                                                                                                            |
| `FABRIC_PEER_TLS_SERVER_NAME` | —        | —                 | Override TLS server name (SSH tunnel)                                                                                                                                                                                                                                           |
| `FABRIC_MSP_ID`               | ✅       | —                 | MSP ID of the identity                                                                                                                                                                                                                                                          |
| `FABRIC_CERT`                 | ✅       | —                 | Path to the enrollment signcert (PEM)                                                                                                                                                                                                                                           |
| `FABRIC_KEY`                  | ✅       | —                 | Path to the private key (PEM)                                                                                                                                                                                                                                                   |
| `FABRIC_REST_URL`             | —        | —                 | Gateway REST API base URL (for `get_blockchain_info`)                                                                                                                                                                                                                           |
| `FABRIC_CHAINCODE_API`        | —        | `./chaincode-api` | Chaincode API descriptions (file or dir) from `mcp-server-hyperledger-fabric scan`                                                                                                                                                                                              |
| `FABRIC_READ_ONLY`            | —        | `false`           | Register only read tools; `invoke_chaincode` and `endorse_chaincode` are not exposed                                                                                                                                                                                            |
| `FABRIC_LOG_TRANSIENT`        | —        | `false`           | Log `transientData` values in full. Default: keys, byte sizes and a short hash only                                                                                                                                                                                             |
| `REQUEST_TIMEOUT_MS`          | —        | `30000`           | Deadline for each network call                                                                                                                                                                                                                                                  |
| `FABRIC_DEDUP_WINDOW_MS`      | —        | `0`               | Dedup window for `invoke_chaincode`, ms. `0` = off. When > 0, an identical write (same chaincode, method, args) within the window is not re-sent — the previous txid is returned instead, guarding against double-writes from retried invokes. In-memory, exact-args match only |

## Tools

| Tool                   | Description                                                                | Read-only        |
| ---------------------- | -------------------------------------------------------------------------- | ---------------- |
| `query_chaincode`      | Evaluate a chaincode read function (supports private data)                 | ✅               |
| `invoke_chaincode`     | Submit a transaction; returns txid + commit status (supports private data) | ❌ (destructive) |
| `endorse_chaincode`    | Dry-run a write: endorse without committing                                | ✅               |
| `get_block`            | Block summary by number (hashes, txids)                                    | ✅               |
| `get_block_by_hash`    | Find a block by its data hash (block scan)                                 | ✅               |
| `get_transaction`      | Find a transaction by ID (block scan)                                      | ✅               |
| `get_blockchain_info`  | Ledger height via Fabric Gateway REST API                                  | ✅               |
| `get_chaincode_events` | Recent chaincode events, filterable by `eventName` and `startBlock`        | ✅               |
| `check_network_status` | Peer health: height, last block, response latency                          | ✅               |

## Chaincode API scan

The model needs to know a chaincode's contract and method names to call it.
Instead of guessing, generate a machine-readable description from the chaincode
source once:

```bash
mcp-server-hyperledger-fabric scan ./chaincode-typescript --name asset-transfer
# → chaincode-api/asset-transfer.json
```

Several chaincodes? Scan each into the same directory — the server serves them all:

```bash
mcp-server-hyperledger-fabric scan ./cc-one --name cc-one
mcp-server-hyperledger-fabric scan ./cc-two --name cc-two
# → chaincode-api/cc-one.json, chaincode-api/cc-two.json
```

`--name` is the chaincode name in Fabric; if omitted, the directory name is used.
Re-run the scan whenever the chaincode changes — the server re-reads the files on
every access, no restart needed.

The scanner reads `fabric-contract-api` decorators from TypeScript source:

| Decorator             | Meaning                    |
| --------------------- | -------------------------- |
| `@Default()`          | Marks the default contract |
| `@Transaction()`      | Submit (write) method      |
| `@Transaction(false)` | Evaluate (read) method     |
| `@Returns('type')`    | Return type                |

Only `@Transaction`-marked methods are exposed by the chaincode runtime, so
helpers are skipped.

The generated `chaincode-api/*.json` files are served to the model as **MCP
resources** (`fabric://chaincode/<name>`), so it can look up contracts and methods
itself instead of guessing. The server picks up the directory from `./chaincode-api`
(or `FABRIC_CHAINCODE_API`); files are re-read on every access, so re-running the
scan applies without a restart.

Scan output goes to `chaincode-api/` by default — a directory that is git-ignored
in this repo, so generated descriptions never get committed. Use `-o <file.json>`
for a single file or `-o <dir>` for a custom directory.

## Docker (local, for logs)

The container isolates the server and prints **every tool call to stderr** — you
see what the agent invokes and with which parameters, without reading the MCP
protocol:

```
[mcp-server-hyperledger-fabric] query_chaincode <- {"channel":"mychannel","contract":"AssetContract","method":"GetAsset","args":["1"]}
[mcp-server-hyperledger-fabric] query_chaincode OK 12ms → {"assetId":"1","owner":"alice","value":100}
[mcp-server-hyperledger-fabric] invoke_chaincode ERROR 900ms → Fabric error: endorsement failed: chaincode error
```

Build and verify:

```bash
docker compose build                        # build the image
docker compose run -T --rm mcp-server-hyperledger-fabric  # one-off, MCP server over stdio
node scripts/docker-smoke.mjs               # smoke test against a real network
```

Paths are not hardcoded: `WALLET_DIR` (where the certs live) is set in your local
`.env` (git-ignored), defaulting to `./wallets` in the project folder.

Claude Code connects to the image via `docker compose run` — the compose file
carries the env file and mounts, so the client config stays path-free:

```bash
claude mcp add hyperledger -- docker compose run -T --rm mcp-server-hyperledger-fabric
```

**Logs:** while a Claude Code session is open, the container is alive in Docker
Desktop — Containers tab → `View` → `Logs` (or `docker logs <name>`). The
container is `--rm`, so it is removed when the session closes, logs included.

What gets mounted (not baked into the image — no rebuild needed on edits):

| Container path       | From                                            | What                            |
| -------------------- | ----------------------------------------------- | ------------------------------- |
| `/wallets`           | `WALLET_DIR` from `.env` (default `./wallets`)  | certs and key (ro)              |
| `/app/chaincode-api` | `CHAINCODE_API_DIR` (default `./chaincode-api`) | chaincode API descriptions (ro) |

Secrets live only in `.env` / `.env.docker` (both git-ignored) and never enter
the image. `docker compose build` is only needed when the server code changes; a
fresh chaincode scan applies without a rebuild.

## Testing against the Fabric test-network

```bash
# start the test network with the asset-transfer sample
./network.sh up createChannel -c mychannel -ca
./network.sh deployCC -ccn asset-transfer -ccp ../asset-transfer-basic/chaincode-go

# export the generated identity and TLS cert
export FABRIC_PEER_ENDPOINT=localhost:7051
export FABRIC_TLS=true
export FABRIC_PEER_TLS_CERT=$PWD/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export FABRIC_MSP_ID=Org1MSP
export FABRIC_CERT=$PWD/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/cert.pem
export FABRIC_KEY=$PWD/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/priv_sk

npm run dev
```

## Development

```bash
npm install
npm run build    # tsc → dist/
npm run lint     # Biome: lint + format + import order
npm run format   # apply Biome fixes
npm test         # node:test unit tests
npm run dev      # tsx watch
```

## Security

This server holds a real Fabric identity (private key). Read
[SECURITY.md](SECURITY.md) before deploying. Key points:

- Secrets only via environment variables — never commit `.env` or certs.
- TLS on by default; `FABRIC_TLS=false` is for local test-network only.
- All tool inputs validated with strict zod schemas.
- `invoke_chaincode` is marked destructive so clients confirm before writes.
- Business errors return `{ isError: true }` — no raw stack traces.

## License

[MIT](LICENSE)
