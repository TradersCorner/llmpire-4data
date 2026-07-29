import express, { Request, Response, NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import { buildConfig, ensureUpstreamConfigured } from "./config.js";
import { FactStore } from "./factStore.js";
import { StreamHub } from "./streamHub.js";
import { WatchStore } from "./watchStore.js";
import { buildUpstreamClient } from "./upstreams.js";
import {
  LensAnswerRequest,
  LensAnswerResponse,
  LensVerifyRequest,
  LensVerifyResponse,
  UpstreamName
} from "./types.js";

const cfg = buildConfig();

const factStore = new FactStore(2000);
const watchStore = new WatchStore();
const streamHub = new StreamHub({ factStore, streamUrl: cfg.v1StreamUrl });
streamHub.start();

const app = express();

const corsMiddleware = cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true); // curl/cli
    if (cfg.allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
});

app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: "1mb" }));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.message === "Not allowed by CORS") return res.status(403).json({ error: "origin not allowed" });
  return res.status(500).json({ error: "internal" });
});

function extractToken(req: express.Request, allowQuery: boolean) {
  const auth = req.headers["authorization"];
  const bearer = typeof auth === "string" && auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const header = typeof req.headers["x-lens-token"] === "string" ? req.headers["x-lens-token"] as string : null;
  const query = allowQuery && typeof req.query.token === "string" ? req.query.token : null;
  return bearer || header || query || null;
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health") return next();
  const provided = extractToken(req, cfg.allowQueryToken);
  if (provided !== cfg.token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  const stats = factStore.stats();
  res.json({
    ok: true,
    lensPort: cfg.port,
    upstreamDefault: cfg.defaultUpstream,
    v1StreamUrl: cfg.v1StreamUrl,
    stream: stats,
    received: stats.received,
    connected: stats.connected
  });
});

// change report for clients polling
app.get("/changes", (req: Request, res: Response) => {
  const max = parseInt(String(req.query.max ?? "100"), 10);
  const since = typeof req.query.since === "string" ? req.query.since : undefined;
  const { cursor, items } = factStore.getChanges({ max: Number.isFinite(max) ? max : 100, since });
  res.json({ since, cursor, items });
});

// read-only facts list for operator proofs
app.get("/lens/facts", (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit ?? "10"), 10);
  const facts = factStore.recent(Number.isFinite(limit) ? limit : 10);
  res.json({ facts, stats: factStore.stats() });
});

// watch list
app.get("/lens/watch", (_req: Request, res: Response) => {
  res.json({ items: watchStore.list() });
});

app.post("/lens/watch", (req: Request, res: Response) => {
  const { kind, value, mode } = req.body || {};
  if (!kind || !value) return res.status(400).json({ error: "kind and value are required" });
  const item = watchStore.add({ kind, value, mode });
  res.json(item);
});

app.delete("/lens/watch/:id", (req: Request, res: Response) => {
  const ok = watchStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// SSE stream for status + facts + watch matches
app.get("/lens/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  const sendStatus = () => {
    res.write(`event: status\ndata: ${JSON.stringify(factStore.stats())}\n\n`);
  };

  const unsubscribe = factStore.onFact(fact => {
    res.write(`event: fact\ndata: ${JSON.stringify(fact)}\n\n`);
    const matches = watchStore.matches(fact);
    for (const m of matches) {
      res.write(`event: watch_match\ndata: ${JSON.stringify(m)}\n\n`);
    }
  });

  const hb = setInterval(sendStatus, 1000);
  sendStatus();

  req.on("close", () => {
    clearInterval(hb);
    unsubscribe();
  });
});

function buildEvidence(query: string, maxFacts: number, maxChanges: number) {
  const relevant = factStore.selectRelevant(query ?? "", maxFacts);
  const watchFacts = factStore.recent(maxFacts * 2).filter(f => watchStore.matches(f).length > 0);
  const combined: Record<string, true> = {};
  const facts = [...relevant, ...watchFacts].filter(f => {
    if (combined[f.factId]) return false;
    combined[f.factId] = true;
    return true;
  }).slice(-maxFacts);

  const changes = factStore.getChanges({ max: maxChanges, since: null });
  const watchMatches = facts.flatMap(f => watchStore.matches(f));
  return {
    generatedAt: new Date().toISOString(),
    stream: factStore.stats(),
    facts,
    changes,
    watchMatches
  } satisfies LensAnswerResponse["evidence"];
}

// question answering using evidence pack (evidence-only policy)
app.post("/lens/answer", async (req: Request, res: Response) => {
  const body = req.body as LensAnswerRequest;
  const mode = body.mode ?? cfg.defaultMode;
  const upstreamName = (body.upstream ?? cfg.defaultUpstream) as UpstreamName;
  const upstreamCfg = cfg.upstreams[upstreamName];

  try {
    ensureUpstreamConfigured(cfg, upstreamName);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "missing upstream config" });
    return;
  }

  const maxEvidence = Math.min(body.maxFacts ?? 20, 200);
  const maxChanges = Math.min(body.maxChanges ?? 50, 200);
  const evidence = buildEvidence(body.input ?? "", maxEvidence, maxChanges);

  const grounded = evidence.facts.length > 0;
  if (mode === "strict" && !grounded) {
    const response: LensAnswerResponse = {
      answer: "Insufficient evidence to answer (strict mode).",
      mode,
      upstream: upstreamName,
      evidence,
      verification: { grounded: false, notes: ["No evidence available"] }
    };
    res.json(response);
    return;
  }

  const client = buildUpstreamClient(upstreamCfg);
  try {
    const ai = await client.answer({ prompt: body.input, evidence, mode });
    const response: LensAnswerResponse = {
      answer: ai.answer,
      mode,
      upstream: upstreamName,
      evidence,
      verification: { grounded, notes: grounded ? [] : ["Answer produced without evidence"] }
    };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "unknown" });
  }
});

// verify-only endpoint to classify claims vs evidence
app.post("/lens/verify", async (req: Request, res: Response) => {
  const body = req.body as LensVerifyRequest;
  const mode = body.mode ?? cfg.defaultMode;
  const upstreamName = (body.upstream ?? cfg.defaultUpstream) as UpstreamName;

  const maxEvidence = Math.min(body.maxFacts ?? 30, 200);
  const maxChanges = Math.min(body.maxChanges ?? 50, 200);
  const evidence = buildEvidence(body.text ?? "", maxEvidence, maxChanges);

  const sentences = (body.text || "")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const supportedClaims: Array<{ claim: string; factIds: string[] }> = [];
  const unsupportedClaims: string[] = [];

  for (const sent of sentences) {
    const matches = evidence.facts.filter(f => JSON.stringify(f.payload).toLowerCase().includes(sent.toLowerCase()) || (f.entity ?? "").toLowerCase().includes(sent.toLowerCase()));
    if (matches.length) {
      supportedClaims.push({ claim: sent, factIds: matches.map(m => m.factId) });
    } else {
      unsupportedClaims.push(sent);
    }
  }

  const grounded = unsupportedClaims.length === 0;
  const rewrittenAnswer = mode === "strict" && !grounded
    ? "Unsupported claims present; refusing to verify in strict mode."
    : `Supported: ${supportedClaims.length}. Unsupported: ${unsupportedClaims.length}.`;

  const response: LensVerifyResponse = {
    mode,
    upstream: upstreamName,
    evidence,
    supportedClaims,
    unsupportedClaims,
    rewrittenAnswer
  };

  res.json(response);
});

const port = cfg.port;
app.listen(port, () => {
  console.log(`lens-core listening on :${port} upstream default ${cfg.defaultUpstream}`);
});
