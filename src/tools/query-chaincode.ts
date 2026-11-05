import { TextDecoder } from 'node:util';
import * as z from 'zod/v4';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { chaincodeCallSchema } from './chaincode-schema.js';

export const queryChaincodeSchema = chaincodeCallSchema;

export const queryChaincodeOutputSchema = z.object({
  result: z.string().describe('Raw chaincode result, decoded as UTF-8'),
});

export type QueryChaincodeParams = z.infer<typeof chaincodeCallSchema>;

/** Read-only: evaluate never changes state. Supports transientData for private data. */
export async function queryChaincode(params: QueryChaincodeParams) {
  try {
    const network = (await getGateway()).getNetwork(params.channel);
    const contract = network.getContract(params.chaincode, params.contract);
    const result = await contract.evaluate(params.method, {
      arguments: params.args,
      transientData: params.transientData,
    });
    const text = new TextDecoder().decode(result);
    return {
      content: [{ type: 'text' as const, text }],
      structuredContent: { result: text },
    };
  } catch (err) {
    return toMcpError(err);
  }
}
