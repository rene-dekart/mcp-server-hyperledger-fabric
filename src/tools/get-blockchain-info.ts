import * as z from 'zod/v4';
import { getConfig } from '../config.js';
import { toMcpError } from '../errors.js';
import { Name } from './chaincode-schema.js';

export const getBlockchainInfoSchema = z.strictObject({
  channel: Name.describe('Fabric channel name'),
});

export const getBlockchainInfoOutputSchema = z.looseObject({
  height: z.number().optional(),
  currentBlockHash: z.string().optional(),
  previousBlockHash: z.string().optional(),
});

export type GetBlockchainInfoParams = z.infer<typeof getBlockchainInfoSchema>;

/**
 * Ledger height via the Fabric Gateway REST API (HLF 2.5+,
 * chaincode.gateway.enableGatewayService). The SDK exposes no channel height,
 * and REST is cleaner than calling qscc.
 */
export async function getBlockchainInfo(params: GetBlockchainInfoParams) {
  const config = getConfig();
  if (!config.FABRIC_REST_URL) {
    return {
      isError: true as const,
      content: [
        {
          type: 'text' as const,
          text: 'FABRIC_REST_URL not set — enable gateway service on peer (chaincode.gateway.enableGatewayService: true)',
        },
      ],
    };
  }
  try {
    const res = await fetch(`${config.FABRIC_REST_URL}/fabric/v1/chaininfo`, {
      headers: { channel: params.channel },
      signal: AbortSignal.timeout(config.REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        isError: true as const,
        content: [{ type: 'text' as const, text: `chaininfo failed: ${res.status} ${await res.text()}` }],
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  } catch (err) {
    return toMcpError(err);
  }
}
