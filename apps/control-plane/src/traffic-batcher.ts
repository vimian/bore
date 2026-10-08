export interface TrafficEntry {
  host: string;
  ipAddress: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

export class TrafficBatcher {
  #entries = new Map<string, TrafficEntry>();
  #flushing = false;
  dropped = 0;

  constructor(private readonly persist: (entries: TrafficEntry[]) => Promise<void>) {}

  record(host: string, ipAddress: string): void {
    const key = `${host}:${ipAddress}`;
    const entry = this.#entries.get(key);
    const now = new Date().toISOString();
    if (entry) {
      entry.count += 1;
      entry.lastAt = now;
    } else if (this.#entries.size < 4096) {
      this.#entries.set(key, { host, ipAddress, count: 1, firstAt: now, lastAt: now });
    } else {
      this.dropped += 1;
    }
  }

  async flush(): Promise<void> {
    if (this.#flushing || this.#entries.size === 0) return;
    this.#flushing = true;
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    try {
      await this.persist(entries);
    } catch (error) {
      this.dropped += entries.reduce((sum, entry) => sum + entry.count, 0);
      console.error("Traffic batch persistence failed", error);
    } finally {
      this.#flushing = false;
    }
  }
}
