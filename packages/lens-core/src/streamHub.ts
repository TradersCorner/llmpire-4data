import EventSource from "eventsource";
import { FactStore } from "./factStore.js";

export class StreamHub {
  private factStore: FactStore;
  private streamUrl: string;
  private apiKey?: string;
  private es: EventSource | null = null;
  private reconnectMs: number;

  constructor(opts: { factStore: FactStore; streamUrl: string; apiKey?: string; reconnectMs?: number }) {
    this.factStore = opts.factStore;
    this.streamUrl = opts.streamUrl;
    this.apiKey = opts.apiKey;
    this.reconnectMs = opts.reconnectMs ?? 3000;
  }

  start() {
    this.connect();
  }

  stop() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.factStore.setConnected(false);
  }

  private connect() {
    this.es = new EventSource(this.streamUrl, {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined
    });

    this.es.onopen = () => {
      this.factStore.setConnected(true);
    };

    this.es.onerror = () => {
      this.factStore.setConnected(false);
      this.scheduleReconnect();
    };

    this.es.onmessage = (evt: any) => {
      try {
        const payload = JSON.parse(evt.data);
        this.factStore.ingest(payload);
      } catch (err) {
        // swallow and keep going
      }
    };
  }

  private scheduleReconnect() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    setTimeout(() => this.connect(), this.reconnectMs);
  }
}
