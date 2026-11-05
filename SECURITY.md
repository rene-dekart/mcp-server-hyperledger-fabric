# Security Policy

## Reporting a Vulnerability

Do **not** open a public issue for security problems. Report privately by
emailing the maintainers (see the `author` field in `package.json`) or opening
a [private vulnerability report](https://github.com/<your-username>/mcp-server-hyperledger-fabric/security/advisories/new).

Please include:

- Affected version(s)
- Steps to reproduce
- Impact description

## What this project handles

`mcp-server-hyperledger-fabric` connects to a Hyperledger Fabric network using a real
enrollment identity. That means it reads **private keys and certificates** from
the environment. Treat the process as a credential holder.

## Hard requirements

- **Never commit** `.env`, `*.pem`, `*.key`, or any identity material. The
  `.gitignore` already excludes `.env`; keep certs outside the repo.
- **Never log** private keys, certificates, or transaction signatures. Error
  messages must not echo credential contents.
- **TLS on by default.** `FABRIC_TLS=false` is for local test-network only and
  must never be used against a real network.
- **Secrets only via environment variables.** No config file, no CLI flags, no
  hardcoded defaults.

## Trust boundary

- All tool inputs are validated with a strict zod schema before reaching the
  Fabric SDK.
- `invoke_chaincode` is marked `destructiveHint` so MCP clients surface a
  confirmation before state-changing calls.
- Business errors are returned as `{ isError: true }` results — never raw stack
  traces that could leak connection details.
