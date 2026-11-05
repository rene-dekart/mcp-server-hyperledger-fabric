import type { Config } from './config.js';

export function buildInstructions(config: Config, chaincodes: string[], readOnly: boolean): string {
  const lines = [
    `Hyperledger Fabric gateway server for peer ${config.FABRIC_PEER_ENDPOINT}, MSP ${config.FABRIC_MSP_ID}.`,
    config.FABRIC_CHANNEL
      ? `Default channel: ${config.FABRIC_CHANNEL}. Pass it unless the user names another.`
      : 'Channel is a required argument of every ledger tool; use the one the user names.',
  ];
  if (chaincodes.length > 0) {
    lines.push(
      `Known chaincodes: ${chaincodes.join(', ')}. ` +
        'Read their contracts and methods from the resources fabric://chaincode/<name> before calling.',
    );
  }
  lines.push(
    readOnly
      ? 'Read-only mode: only reads are available.'
      : 'Read with query_chaincode. Write with invoke_chaincode (returns txid and commit status); endorse_chaincode dry-runs a write without committing.',
  );
  lines.push(
    'After an invoke commit-status timeout the transaction may still have committed: check get_transaction before retrying.',
  );
  return lines.join('\n');
}
