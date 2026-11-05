import { createHash } from 'node:crypto';

function mask(value: string): string {
  const bytes = Buffer.byteLength(value);
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 8);
  return `${bytes} bytes sha256:${hash}`;
}

export function redactTransientData(params: unknown, show: boolean): unknown {
  if (show || !params || typeof params !== 'object') return params;
  const transientData = (params as { transientData?: unknown }).transientData;
  if (!transientData || typeof transientData !== 'object') return params;
  const masked = Object.fromEntries(
    Object.entries(transientData as Record<string, unknown>).map(([key, value]) => [key, mask(String(value))]),
  );
  return { ...(params as Record<string, unknown>), transientData: masked };
}
