import { common } from '@hyperledger/fabric-protos';
import * as z from 'zod/v4';
import { getConfig } from '../config.js';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { type BlockSummary, blockSummary, blockSummarySchema, hex } from './block-utils.js';
import { Name } from './chaincode-schema.js';

export const checkNetworkStatusSchema = z.strictObject({
  channel: Name.describe('Fabric channel name'),
  timeoutMs: z.number().int().positive().max(30000).default(9000),
});

export const checkNetworkStatusOutputSchema = z.object({
  status: z.enum(['online', 'degraded']),
  height: z.number(),
  currentBlockHash: z.string().optional(),
  lastBlock: blockSummarySchema.nullable(),
  latencyMs: z.number(),
});

export type CheckNetworkStatusParams = z.infer<typeof checkNetworkStatusSchema>;

/**
 * Peer health: ledger height + last block + response latency. Height comes
 * from qscc GetChainInfo (works without FABRIC_REST_URL); falls back to the
 * REST chaininfo endpoint when qscc is blocked. The last block is read via
 * the event stream with a timeout, so a lagging peer degrades instead of
 * hanging the call.
 */
export async function checkNetworkStatus(params: CheckNetworkStatusParams) {
  const t0 = Date.now();
  try {
    const network = (await getGateway()).getNetwork(params.channel);

    // 1) Ledger height — qscc first (no REST needed), REST as fallback.
    let height: number;
    let currentBlockHash: string | undefined;
    try {
      const infoBytes = await network.getContract('qscc').evaluate('GetChainInfo', { arguments: [params.channel] });
      const info = common.BlockchainInfo.deserializeBinary(infoBytes);
      height = info.getHeight();
      currentBlockHash = hex(info.getCurrentblockhash());
    } catch (qsccErr) {
      const rest = await restChainInfo(params.channel);
      if (rest === undefined) throw qsccErr;
      height = rest.height;
      currentBlockHash = rest.currentBlockHash;
    }

    // 2) Last block (height-1) via the event stream. If it does not arrive in
    //    time (peer lagging), report height + latency anyway as 'degraded'.
    let lastBlock: BlockSummary | null = null;
    try {
      const blocks = await network.getBlockEvents({ startBlock: BigInt(height - 1) });
      const timer = setTimeout(() => {
        void blocks.close();
      }, params.timeoutMs);
      try {
        const first = await blocks[Symbol.asyncIterator]().next();
        if (!first.done) lastBlock = blockSummary(first.value);
      } finally {
        clearTimeout(timer);
        await blocks.close();
      }
    } catch {
      // last block unavailable — height + latency still tell the story
    }

    const out = {
      status: lastBlock === null ? ('degraded' as const) : ('online' as const),
      height,
      currentBlockHash,
      lastBlock,
      latencyMs: Date.now() - t0,
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  } catch (err) {
    return toMcpError(err);
  }
}

/** REST chaininfo fallback (same endpoint as get_blockchain_info). */
async function restChainInfo(
  channel: string,
): Promise<{ height: number; currentBlockHash: string | undefined } | undefined> {
  const config = getConfig();
  if (!config.FABRIC_REST_URL) return undefined;
  const res = await fetch(`${config.FABRIC_REST_URL}/fabric/v1/chaininfo`, {
    headers: { channel },
    signal: AbortSignal.timeout(config.REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  return { height: data.height, currentBlockHash: data.currentBlockHash };
}
