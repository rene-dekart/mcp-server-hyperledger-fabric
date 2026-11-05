import * as grpc from '@grpc/grpc-js';
import type { CloseableAsyncIterable } from '@hyperledger/fabric-gateway';

/**
 * Iterate a CloseableAsyncIterable bounded by a wall-clock timeout. On timeout
 * the stream is closed (gRPC CANCELLED) and iteration stops — partial results
 * beat a hung tool. `onItem` returns true to stop early. Returns the number of
 * items seen. A real stream error (not the timeout close) is rethrown.
 */
export async function forEachWithTimeout<T>(
  iterable: CloseableAsyncIterable<T>,
  timeoutMs: number,
  onItem: (item: T) => boolean,
): Promise<number> {
  let seen = 0;
  const timer = setTimeout(() => {
    void iterable.close();
  }, timeoutMs);
  try {
    const it = iterable[Symbol.asyncIterator]();
    for (;;) {
      let next: IteratorResult<T>;
      try {
        next = await it.next();
      } catch (err) {
        // The timeout close cancels the stream (CANCELLED); anything else is
        // a real failure and must propagate.
        if ((err as { code?: number })?.code !== grpc.status.CANCELLED) throw err;
        break;
      }
      if (next.done) break;
      seen++;
      if (onItem(next.value)) break;
    }
  } finally {
    clearTimeout(timer);
    await iterable.close();
  }
  return seen;
}
