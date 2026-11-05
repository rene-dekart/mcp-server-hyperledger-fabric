import { createHash } from 'node:crypto';

interface Entry {
  txid: string;
  at: number;
}

/**
 * Recent-write guard: remembers txids for identical write calls within a
 * window so a retried invoke doesn't hit the ledger twice.
 *
 * ponytail: in-memory only — one process, lost on restart, exact-args match
 * only. Real idempotency must live in the chaincode (check-before-create or
 * an idempotency key); this is a guard, not a guarantee.
 */
export class WriteDedup {
  private readonly entries = new Map<string, Entry>();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  /** Stable key for one write call: channel + chaincode + contract + method + args. */
  static key(p: { channel: string; chaincode: string; contract?: string; method: string; args: string[] }): string {
    return createHash('sha256')
      .update(p.channel)
      .update('\0')
      .update(p.chaincode)
      .update('\0')
      .update(p.contract ?? '')
      .update('\0')
      .update(p.method)
      .update('\0')
      .update(JSON.stringify(p.args))
      .digest('hex');
  }

  /** txid of a recent identical call within the window, or undefined. */
  get(key: string): string | undefined {
    if (this.windowMs <= 0) return undefined;
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (Date.now() - e.at > this.windowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return e.txid;
  }

  /** Remember a submitted call. No-op when dedup is disabled. */
  set(key: string, txid: string): void {
    if (this.windowMs <= 0) return;
    this.entries.set(key, { txid, at: Date.now() });
    this.prune();
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [k, e] of this.entries) {
      if (e.at < cutoff) this.entries.delete(k);
    }
  }
}
