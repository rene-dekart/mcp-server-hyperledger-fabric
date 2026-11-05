import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod/v4';

// z.coerce.boolean() would turn 'false' into true (Boolean('false') === true),
// so parse the string explicitly. Anything not in the false-list means TLS on.
const tlsFromEnv = (v: string | undefined): boolean =>
  v === undefined ? true : !['0', 'false', 'no', 'off'].includes(v.trim().toLowerCase());

const flagFromEnv = (v: string | undefined): boolean =>
  v !== undefined && !['0', 'false', 'no', 'off'].includes(v.trim().toLowerCase());

/** Load KEY=VALUE lines from a .env file into process.env (no override). */
export function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// Read .env from the working directory first, then the project root (one
// level up from src/ or dist/). This covers both a local run and a global
// install launched from the project dir. Existing process.env values win
// (standard dotenv behavior).
const here = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(here, '..', '.env'));

const Env = z.strictObject({
  FABRIC_PEER_ENDPOINT: z.string().min(1),
  FABRIC_CHANNEL: z.string().min(1).optional(),
  FABRIC_TLS: z.string().optional().transform(tlsFromEnv),
  FABRIC_PEER_TLS_CERT: z.string().optional(),
  FABRIC_PEER_TLS_SERVER_NAME: z.string().optional(),
  FABRIC_MSP_ID: z.string().min(1),
  FABRIC_CERT: z.string().min(1),
  FABRIC_KEY: z.string().min(1),
  FABRIC_REST_URL: z.string().url().optional(),
  FABRIC_CHAINCODE_API: z.string().optional(),
  FABRIC_READ_ONLY: z.string().optional().transform(flagFromEnv),
  FABRIC_LOG_TRANSIENT: z.string().optional().transform(flagFromEnv),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  FABRIC_DEDUP_WINDOW_MS: z.coerce.number().int().min(0).default(0),
});

export type Config = z.infer<typeof Env>;

/**
 * Parse environment. strictObject rejects unknown keys, so pick only the
 * variables this server owns before parsing.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const picked = {
    FABRIC_PEER_ENDPOINT: env.FABRIC_PEER_ENDPOINT,
    FABRIC_CHANNEL: env.FABRIC_CHANNEL,
    FABRIC_TLS: env.FABRIC_TLS,
    FABRIC_PEER_TLS_CERT: env.FABRIC_PEER_TLS_CERT,
    FABRIC_PEER_TLS_SERVER_NAME: env.FABRIC_PEER_TLS_SERVER_NAME,
    FABRIC_MSP_ID: env.FABRIC_MSP_ID,
    FABRIC_CERT: env.FABRIC_CERT,
    FABRIC_KEY: env.FABRIC_KEY,
    FABRIC_REST_URL: env.FABRIC_REST_URL,
    FABRIC_CHAINCODE_API: env.FABRIC_CHAINCODE_API,
    FABRIC_READ_ONLY: env.FABRIC_READ_ONLY,
    FABRIC_LOG_TRANSIENT: env.FABRIC_LOG_TRANSIENT,
    REQUEST_TIMEOUT_MS: env.REQUEST_TIMEOUT_MS,
    FABRIC_DEDUP_WINDOW_MS: env.FABRIC_DEDUP_WINDOW_MS,
  };
  return Env.parse(picked);
}

let _config: Config | undefined;

/** Lazy singleton: parse env once, on first access. */
export function getConfig(): Config {
  if (!_config) _config = loadConfig();
  return _config;
}
