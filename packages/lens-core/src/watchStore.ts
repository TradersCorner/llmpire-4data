import { EvidenceFact, WatchItem, WatchMatch } from "./types.js";

export class WatchStore {
  private items: WatchItem[] = [];
  private nextId = 1;

  list() {
    return [...this.items];
  }

  add(input: Omit<WatchItem, "id" | "createdAt">): WatchItem {
    const id = `watch_${this.nextId++}`;
    const createdAt = new Date().toISOString();
    const item: WatchItem = { ...input, id, createdAt };
    this.items.push(item);
    return item;
  }

  remove(id: string) {
    const before = this.items.length;
    this.items = this.items.filter(w => w.id !== id);
    return before !== this.items.length;
  }

  matches(fact: EvidenceFact): WatchMatch[] {
    const hay = [fact.lane, fact.tag, fact.entity, fact.asset, fact.symbol, JSON.stringify(fact.payload)].join(" ").toLowerCase();
    const results: WatchMatch[] = [];
    for (const w of this.items) {
      const needle = w.value.toLowerCase();
      if (!needle) continue;
      if (hay.includes(needle)) {
        results.push({ watchId: w.id, fact });
      }
    }
    return results;
  }
}
