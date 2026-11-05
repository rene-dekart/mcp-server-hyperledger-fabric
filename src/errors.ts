import type { CallToolResult } from '@modelcontextprotocol/server';
import { isUnavailable, resetGateway } from './fabric.js';

/**
 * Business errors → { isError: true } in the result so the model gets a
 * readable diagnostic instead of a raw stack trace.
 */
export function toMcpError(err: unknown): CallToolResult {
  // A dead peer connection is cached in the gateway singleton; drop it so
  // the next call reconnects instead of failing until the server restarts.
  if (isUnavailable(err)) resetGateway();
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: 'text', text: `Fabric error: ${msg}` }] };
}
