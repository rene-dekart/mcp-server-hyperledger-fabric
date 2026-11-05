import * as z from 'zod/v4';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { type BlockSummary, blockSummary, blockSummarySchema } from './block-utils.js';
import { Name } from './chaincode-schema.js';
import { forEachWithTimeout } from './stream-utils.js';

export const getTransactionSchema = z.strictObject({
  channel: Name.describe('Fabric channel name'),
  txid: z.string().min(1).max(200).describe('Transaction ID to find'),
  startBlock: z.number().int().nonnegative().default(0).describe('Scan from this block'),
  maxBlocks: z.number().int().positive().max(10000).default(1000).describe('Scan at most this many blocks'),
  timeoutMs: z.number().int().positive().max(30000).default(15000),
});

export const getTransactionOutputSchema = z.object({
  found: z.boolean(),
  scanned: z.number().optional(),
  txid: z.string().optional(),
  ...blockSummarySchema.partial().shape,
});

export type GetTransactionParams = z.infer<typeof getTransactionSchema>;

/**
 * Find a transaction by ID. qscc GetTransactionByID returns the transaction
 * envelope but not its block number, so scan the block stream forward from
 * startBlock to locate the block. Bound the scan with maxBlocks and a timeout
 * — the ledger only grows, and the stream would otherwise wait forever for
 * blocks that never come.
 */
export async function getTransaction(params: GetTransactionParams) {
  try {
    const network = (await getGateway()).getNetwork(params.channel);
    const blocks = await network.getBlockEvents({ startBlock: BigInt(params.startBlock) });
    let found: BlockSummary | undefined;
    let scanned = 0;
    await forEachWithTimeout(blocks, params.timeoutMs, (block) => {
      const summary = blockSummary(block);
      scanned++;
      if (summary.txIds.includes(params.txid)) {
        found = summary;
        return true;
      }
      return scanned >= params.maxBlocks;
    });
    const out = found ? { found: true, ...found } : { found: false, scanned, txid: params.txid };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  } catch (err) {
    return toMcpError(err);
  }
}
