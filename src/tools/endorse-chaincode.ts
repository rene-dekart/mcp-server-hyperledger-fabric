import { TextDecoder } from 'node:util';
import * as z from 'zod/v4';
import { toMcpError } from '../errors.js';
import { getGateway } from '../fabric.js';
import { chaincodeCallSchema } from './chaincode-schema.js';

export const endorseChaincodeSchema = chaincodeCallSchema;

export const endorseChaincodeOutputSchema = z.object({
  transactionId: z.string(),
  result: z.string().describe('Endorsement result, decoded as UTF-8; nothing was committed'),
});

export type EndorseChaincodeParams = z.infer<typeof chaincodeCallSchema>;

/**
 * Dry run: endorse a proposal without submitting to the orderer. Validates the
 * transaction (endorsement policy, args, state) and returns the result, but
 * nothing is committed. Use before a real invoke to check it will pass.
 */
export async function endorseChaincode(params: EndorseChaincodeParams) {
  try {
    const network = (await getGateway()).getNetwork(params.channel);
    const contract = network.getContract(params.chaincode, params.contract);
    const proposal = contract.newProposal(params.method, {
      arguments: params.args,
      transientData: params.transientData,
    });
    const transaction = await proposal.endorse();
    const out = {
      transactionId: transaction.getTransactionId(),
      result: new TextDecoder().decode(transaction.getResult()),
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  } catch (err) {
    return toMcpError(err);
  }
}
