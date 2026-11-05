import { common } from '@hyperledger/fabric-protos';
import * as z from 'zod/v4';

/** jspb: bytes in AsObject are Uint8Array or base64 string. */
export function toBytes(v: Uint8Array | string): Uint8Array {
  return v instanceof Uint8Array ? v : Buffer.from(v, 'base64');
}

export function hex(v: unknown): string | undefined {
  if (v instanceof Uint8Array) return Buffer.from(v).toString('hex');
  if (typeof v === 'string') return Buffer.from(v, 'base64').toString('hex');
  return undefined;
}

export interface BlockSummary {
  number: number | undefined;
  previousHash: string | undefined;
  dataHash: string | undefined;
  txCount: number;
  txIds: string[];
}

export const blockSummarySchema = z.object({
  number: z.number().optional(),
  previousHash: z.string().optional(),
  dataHash: z.string().optional(),
  txCount: z.number(),
  txIds: z.array(z.string()),
});

/** Header-only data hash. O(1) — no tx parsing, for hash scans. */
export function blockDataHash(block: common.Block): string | undefined {
  return hex(block.getHeader()?.getDataHash());
}

/** Structural block summary: number, hashes, txids. Saves context vs raw block. */
export function blockSummary(block: common.Block): BlockSummary {
  const obj = common.Block.toObject(false, block);
  const txIds = (obj.data?.dataList ?? [])
    .map((envBytes) => {
      const envelope = common.Envelope.deserializeBinary(toBytes(envBytes));
      const payload = common.Payload.deserializeBinary(toBytes(envelope.getPayload()));
      // jspb: Payload.getHeader() returns an object, Header.getChannelHeader() returns bytes
      const header = payload.getHeader();
      if (!header) return undefined;
      const channelHeader = common.ChannelHeader.deserializeBinary(toBytes(header.getChannelHeader()));
      return channelHeader.getTxId();
    })
    .filter(Boolean) as string[];
  return {
    number: obj.header?.number,
    previousHash: hex(obj.header?.previousHash),
    dataHash: hex(obj.header?.dataHash),
    txCount: txIds.length,
    txIds,
  };
}
