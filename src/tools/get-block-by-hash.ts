import { common } from '@hyperledger/fabric-protos';
import * as z from 'zod/v4';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { type BlockSummary, blockDataHash, blockSummary, blockSummarySchema } from './block-utils.js';
import { Name } from './chaincode-schema.js';
import { forEachWithTimeout } from './stream-utils.js';

export const getBlockByHashSchema = z.strictObject({
  channel: Name.describe('Fabric channel name'),
  hash: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .describe('Block data hash (hex, 64 chars)'),
  startBlock: z.number().int().nonnegative().default(0).describe('Scan from this block'),
  maxBlocks: z.number().int().positive().max(10000).default(1000).describe('Scan at most this many blocks'),
  timeoutMs: z.number().int().positive().max(30000).default(15000),
});

export const getBlockByHashOutputSchema = z.object({
  found: z.boolean(),
  scanned: z.number().optional(),
  hash: z.string().optional(),
  ...blockSummarySchema.partial().shape,
});

export type GetBlockByHashParams = z.infer<typeof getBlockByHashSchema>;

/**
 * Find a block by its data hash. Try qscc GetBlockByHash first (O(1)); fall
 * back to a block scan if the gateway blocks system chaincodes or the hash is
 * not found. The scan compares header hashes only (O(1) per block) and parses
 * the full block just for the match.
 */
export async function getBlockByHash(params: GetBlockByHashParams) {
  try {
    const network = (await getGateway()).getNetwork(params.channel);

    try {
      const blockBytes = await network.getContract('qscc').evaluate('GetBlockByHash', {
        arguments: [params.channel, params.hash],
      });
      const block = common.Block.deserializeBinary(blockBytes);
      const out = { found: true, ...blockSummary(block) };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    } catch {
      // qscc blocked or hash not found — fall through to the scan
    }

    const blocks = await network.getBlockEvents({ startBlock: BigInt(params.startBlock) });
    const target = params.hash.toLowerCase();
    let found: BlockSummary | undefined;
    let scanned = 0;
    await forEachWithTimeout(blocks, params.timeoutMs, (block) => {
      scanned++;
      if (blockDataHash(block)?.toLowerCase() === target) {
        found = blockSummary(block); // full parse only for the match
        return true;
      }
      return scanned >= params.maxBlocks;
    });
    const out = found ? { found: true, ...found } : { found: false, scanned, hash: params.hash };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  } catch (err) {
    return toMcpError(err);
  }
}
