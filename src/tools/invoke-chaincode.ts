import { StatusCode } from '@hyperledger/fabric-gateway';
import * as z from 'zod/v4';
import { getConfig } from '../config.js';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { chaincodeCallSchema } from './chaincode-schema.js';
import { WriteDedup } from './dedup.js';

export const invokeChaincodeSchema = chaincodeCallSchema;

export const invokeChaincodeOutputSchema = z.object({
  transactionId: z.string(),
  blockNumber: z.number().optional(),
  status: z.string().optional().describe('Commit status name, e.g. VALID'),
  successful: z.boolean().optional(),
  deduplicated: z.boolean().optional(),
  note: z.string().optional(),
});

export type InvokeChaincodeParams = z.infer<typeof chaincodeCallSchema>;

/** StatusCode maps name → code; reverse lookup yields a human-readable name. */
function statusName(code: number): string {
  return Object.entries(StatusCode).find(([, v]) => v === code)?.[0] ?? String(code);
}

let dedup: WriteDedup | undefined;

/** Lazy singleton; disabled when FABRIC_DEDUP_WINDOW_MS is 0. */
function getDedup(): WriteDedup {
  if (!dedup) dedup = new WriteDedup(getConfig().FABRIC_DEDUP_WINDOW_MS);
  return dedup;
}

/**
 * Write path: submitAsync + commit status in one tool to save round trips.
 * Returns txid, block number and a human-readable status (VALID, MVCC_READ_CONFLICT, ...).
 *
 * When FABRIC_DEDUP_WINDOW_MS > 0, an identical write (same channel, chaincode,
 * contract, method, args) submitted within the window is not re-sent — the
 * previous txid is returned instead, so a retried invoke can't double-write.
 */
export async function invokeChaincode(params: InvokeChaincodeParams) {
  try {
    const dedup = getDedup();
    const key = WriteDedup.key(params);
    const cached = dedup.get(key);
    if (cached) {
      const out = {
        transactionId: cached,
        deduplicated: true,
        note: 'Identical write already submitted within the dedup window; not re-sent. Check get_transaction for commit status.',
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }

    const network = (await getGateway()).getNetwork(params.channel);
    const contract = network.getContract(params.chaincode, params.contract);
    const submitted = await contract.submitAsync(params.method, {
      arguments: params.args,
      transientData: params.transientData,
    });
    const txid = submitted.getTransactionId();
    dedup.set(key, txid); // remember before getStatus: a status timeout may still commit
    const status = await submitted.getStatus();
    const out = {
      transactionId: txid,
      blockNumber: Number(status.blockNumber), // bigint — JSON.stringify would throw
      status: statusName(status.code),
      successful: status.successful,
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  } catch (err) {
    return toMcpError(err);
  }
}
