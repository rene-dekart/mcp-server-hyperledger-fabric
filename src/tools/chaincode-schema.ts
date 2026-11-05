import * as z from 'zod/v4';

export const Name = z.string().regex(/^[a-zA-Z0-9._-]+$/);

/** Shared params for chaincode calls: query, invoke, endorse. */
export const chaincodeCallSchema = z.strictObject({
  channel: Name.describe('Fabric channel name'),
  chaincode: Name.describe('Chaincode name'),
  method: z.string().min(1).max(200).describe('Chaincode function, e.g. GetAsset'),
  args: z.array(z.string()).max(20).default([]).describe('String args; JSON-encode objects'),
  contract: Name.optional().describe('Contract name within chaincode (optional)'),
  transientData: z.record(z.string(), z.string()).optional().describe('Private data, not recorded on the ledger'),
});
