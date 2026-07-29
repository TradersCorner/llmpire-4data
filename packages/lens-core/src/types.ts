export type LensMode = "assist" | "strict";
export type UpstreamName = "openai" | "anthropic";

export type UpstreamConfig = {
  name: UpstreamName;
  apiKey: string;
  model: string;
  baseUrl: string;
  version?: string; // anthropic only
};

export type RuntimeConfig = {
  port: number;
  v1StreamUrl: string;
  defaultMode: LensMode;
  defaultUpstream: UpstreamName;
  upstreams: Record<UpstreamName, UpstreamConfig>;
  token: string;
  allowedOrigins: string[];
  extensionId?: string;
  allowQueryToken: boolean;
};

export type WatchItem = {
  id: string;
  kind: "lane" | "tag" | "entity" | "asset" | "symbol" | "text";
  value: string;
  mode?: LensMode;
  createdAt: string;
};

export type WatchMatch = {
  watchId: string;
  fact: EvidenceFact;
};

export type Signal = {
  id?: string;
  ts?: string; // ISO timestamp (if present)
  lane?: string;
  tag?: string;
  entity?: string;
  asset?: string;
  symbol?: string;
  delta?: number | string;
  value?: number | string;
  [k: string]: unknown;
};

export type EvidenceFact = {
  factId: string;
  receivedAt: string; // ISO
  lane?: string;
  tag?: string;
  entity?: string;
  asset?: string;
  symbol?: string;
  payload: Signal;
};

export type EvidencePack = {
  generatedAt: string;
  stream: {
    connected: boolean;
    lastSignalAt: string | null;
    received: number;
  };
  facts: EvidenceFact[];
  changes: {
    since: string | null;
    cursor: string | null;
    items: EvidenceFact[];
  };
  watchMatches?: WatchMatch[];
};

export type LensAnswerRequest = {
  input: string;
  mode?: LensMode;
  upstream?: UpstreamName;
  maxFacts?: number;     // cap evidence included
  maxChanges?: number;   // cap change report
};

export type LensAnswerResponse = {
  answer: string;
  mode: LensMode;
  upstream: UpstreamName;
  evidence: EvidencePack;
  verification: {
    grounded: boolean;
    notes: string[];
  };
};

export type LensVerifyRequest = {
  text: string;
  mode?: LensMode;
  upstream?: UpstreamName;
  maxFacts?: number;
  maxChanges?: number;
};

export type LensVerifyResponse = {
  mode: LensMode;
  upstream: UpstreamName;
  evidence: EvidencePack;
  supportedClaims: Array<{ claim: string; factIds: string[] }>;
  unsupportedClaims: string[];
  rewrittenAnswer: string;
};
