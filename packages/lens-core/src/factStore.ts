import { EvidenceFact, Signal } from "./types.js";

export class FactStore {
  private facts: EvidenceFact[] = [];
  private maxFacts: number;
  private received = 0;
  private connected = false;
  private lastSignalAt: string | null = null;
  private listeners: Array<(fact: EvidenceFact) => void> = [];

  constructor(maxFacts = 1000) {
    this.maxFacts = maxFacts;
  }

  setConnected(v: boolean) {
    this.connected = v;
  }

  onFact(fn: (fact: EvidenceFact) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(f => f !== fn);
    };
  }

  stats() {
    return {
      connected: this.connected,
      received: this.received,
      lastSignalAt: this.lastSignalAt
    };
  }

  recent(max: number) {
    return this.facts.slice(-max);
  }

  ingest(signal: Signal) {
    this.received += 1;
    const receivedAt = new Date().toISOString();
    this.lastSignalAt = receivedAt;

    const fact: EvidenceFact = {
      factId: this.makeFactId(signal, receivedAt),
      receivedAt,
      lane: typeof signal.lane === "string" ? signal.lane : undefined,
      tag: typeof signal.tag === "string" ? signal.tag : undefined,
      entity: typeof signal.entity === "string" ? signal.entity : undefined,
      asset: typeof signal.asset === "string" ? signal.asset : undefined,
      symbol: typeof signal.symbol === "string" ? signal.symbol : undefined,
      payload: signal
    };

    this.facts.push(fact);
    if (this.facts.length > this.maxFacts) {
      this.facts.splice(0, this.facts.length - this.maxFacts);
    }
    for (const fn of this.listeners) fn(fact);
    return fact;
  }

  // Very simple relevance: token match on entity/asset/symbol/tag/lane
  selectRelevant(query: string, max: number): EvidenceFact[] {
    const tokens = query
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);

    if (tokens.length === 0) return this.facts.slice(-max);

    const scored = this.facts.map(f => {
      const hay = [
        f.lane, f.tag, f.entity, f.asset, f.symbol
      ].filter(Boolean).join(" ").toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 1;
      }
      return { f, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const picked = scored.filter(x => x.score > 0).slice(0, max).map(x => x.f);
    return picked.length ? picked : this.facts.slice(-max);
  }

  // Change report since cursor (non-mutating, per-caller state)
  getChanges(opts: { since?: string | null; max?: number }) {
    const since = opts.since ?? null;
    const max = opts.max ?? 100;
    const idx = since ? this.facts.findIndex(f => f.factId === since) : -1;
    const start = idx >= 0 ? idx + 1 : Math.max(0, this.facts.length - max);
    const items = this.facts.slice(start).slice(-max);
    const cursor = items.length ? items[items.length - 1].factId : since;
    return { since, cursor, items };
  }

  private makeFactId(signal: Signal, receivedAt: string) {
    const key = [
      signal.lane ?? "",
      signal.tag ?? "",
      signal.entity ?? "",
      signal.asset ?? "",
      signal.symbol ?? "",
      String(signal.delta ?? ""),
      String(signal.value ?? "")
    ].join("|");
    // Deterministic-enough without external deps
    const hash = this.simpleHash(key);
    return `fact_${hash}_${receivedAt.replace(/[:.]/g, "")}`;
  }

  private simpleHash(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
}
