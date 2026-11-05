import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as grpc from '@grpc/grpc-js';
import { connect, type Gateway, type Identity, signers } from '@hyperledger/fabric-gateway';
import { getConfig } from './config.js';

let gateway: Gateway | undefined;
let grpcClient: grpc.Client | undefined;

function reset(): void {
  gateway?.close();
  grpcClient?.close();
  gateway = undefined;
  grpcClient = undefined;
}

/** True when the peer connection is gone (peer restarted, network down). */
export function isUnavailable(err: unknown): boolean {
  return (err as { code?: number })?.code === grpc.status.UNAVAILABLE;
}

/** Drop the cached connection so the next call reconnects. */
export function resetGateway(): void {
  reset();
}

/**
 * Lazy singleton: a Gateway is expensive to build, so create it once and
 * reuse it across tool calls.
 */
export async function getGateway(): Promise<Gateway> {
  if (gateway) return gateway;
  const config = getConfig();

  // 1) TLS credentials for the gRPC channel to the peer
  let creds: grpc.ChannelCredentials;
  if (config.FABRIC_TLS) {
    if (!config.FABRIC_PEER_TLS_CERT) {
      throw new Error('FABRIC_PEER_TLS_CERT is required when FABRIC_TLS=true');
    }
    creds = grpc.credentials.createSsl(readFileSync(config.FABRIC_PEER_TLS_CERT));
  } else {
    creds = grpc.credentials.createInsecure(); // dev (test-network) only, never prod
  }

  // 2) With an SSH tunnel the endpoint is localhost while the peer cert is
  //    issued to the real hostname — override the name used for TLS checks.
  const channelOptions = config.FABRIC_PEER_TLS_SERVER_NAME
    ? { 'grpc.ssl_target_name_override': config.FABRIC_PEER_TLS_SERVER_NAME }
    : undefined;
  grpcClient = new grpc.Client(config.FABRIC_PEER_ENDPOINT, creds, channelOptions);

  // 3) In-memory identity: mspId + PEM cert as UTF-8 bytes
  const identity: Identity = {
    mspId: config.FABRIC_MSP_ID,
    credentials: new TextEncoder().encode(readFileSync(config.FABRIC_CERT, 'utf8')),
  };

  // 4) Signer from the private key (PEM → KeyObject)
  const signer = signers.newPrivateKeySigner(createPrivateKey(readFileSync(config.FABRIC_KEY, 'utf8')));

  // 5) Deadline on every outbound call — a hung peer must not block the server
  const deadline = () => ({ deadline: Date.now() + config.REQUEST_TIMEOUT_MS });
  gateway = connect({
    client: grpcClient,
    identity,
    signer,
    evaluateOptions: deadline,
    endorseOptions: deadline,
    submitOptions: deadline,
    commitStatusOptions: deadline,
  });
  return gateway;
}

export async function closeGateway(): Promise<void> {
  reset();
}
