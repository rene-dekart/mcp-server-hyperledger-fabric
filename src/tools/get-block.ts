import type { common } from '@hyperledger/fabric-protos';
import * as z from 'zod/v4';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { blockSummary, blockSummarySchema } from './block-utils.js';
import { Name } from './chaincode-schema.js';
import { forEachWithTimeout } from './stream-utils.js';

export const getBlockSchema = z.strictObject({
  channel: Name.describe('Fabric channel name'),
  number: z.number().int().nonnegative().describe('Block number (0 = genesis)'),
  timeoutMs: z.number().int().positive().max(30000).default(9000),
});

export const getBlockOutputSchema = blockSummarySchema;

export type GetBlockParams = z.infer<typeof getBlockSchema>;

/**
 * Read a block by number via the event stream (fabric-gateway 1.x has no
 * getChannel()). EventsOptions has startBlock/checkpoint but no endBlock, so
 * open a stream at startBlock=N, take the FIRST event, close. The timeout
 * bounds the wait when N is beyond the current ledger height.
 * Return a structural summary, not the raw block, to save context.
 */
export async function getBlock(params: GetBlockParams) {
  try {
    const network = (await getGateway()).getNetwork(params.channel);
    const blocks = await network.getBlockEvents({ startBlock: BigInt(params.number) });
    let block: common.Block | undefined;
    await forEachWithTimeout(blocks, params.timeoutMs, (b) => {
      block = b;
      return true;
    });
    if (!block) throw new Error(`Block ${params.number} not available within ${params.timeoutMs}ms`);
    const summary = blockSummary(block);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  } catch (err) {
    return toMcpError(err);
  }
}
