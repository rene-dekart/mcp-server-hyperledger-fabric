import { TextDecoder } from 'node:util';
import * as z from 'zod/v4';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { Name } from './chaincode-schema.js';
import { forEachWithTimeout } from './stream-utils.js';

export const getChaincodeEventsSchema = z.strictObject({
  channel: Name.describe('Fabric channel name'),
  chaincode: Name.describe('Chaincode name'),
  eventName: Name.optional().describe('Filter by exact event name'),
  startBlock: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(100).default(10),
  timeoutMs: z.number().int().positive().max(30000).default(9000),
});

export const getChaincodeEventsOutputSchema = z.object({
  events: z.array(
    z.object({
      eventName: z.string(),
      txId: z.string(),
      blockNumber: z.number(),
      payload: z.string().describe('Event payload, decoded as UTF-8'),
    }),
  ),
});

export type GetChaincodeEventsParams = z.infer<typeof getChaincodeEventsSchema>;

/**
 * Chaincode events via the gateway-native stream. Enforce a limit, a timeout
 * and an unconditional close() so the stream never hangs. On timeout the
 * collected events are returned (partial results) instead of being thrown
 * away with the CANCELLED error.
 */
export async function getChaincodeEvents(params: GetChaincodeEventsParams) {
  try {
    const network = (await getGateway()).getNetwork(params.channel);
    const events = await network.getChaincodeEvents(
      params.chaincode,
      params.startBlock === undefined ? undefined : { startBlock: BigInt(params.startBlock) },
    );
    const out: unknown[] = [];
    await forEachWithTimeout(events, params.timeoutMs, (event) => {
      if (params.eventName && event.eventName !== params.eventName) return false;
      out.push({
        eventName: event.eventName,
        txId: event.transactionId,
        blockNumber: Number(event.blockNumber),
        payload: new TextDecoder().decode(event.payload),
      });
      return out.length >= params.limit;
    });
    const result = { events: out as { eventName: string; txId: string; blockNumber: number; payload: string }[] };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  } catch (err) {
    return toMcpError(err);
  }
}
