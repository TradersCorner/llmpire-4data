import { RuntimeConfig, UpstreamConfig, UpstreamName, LensMode } from "./types.js";

function req(name: string, v: string | undefined): string {
  if (!v || !v.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

function opt(name: string, v: string | undefined, fallback: string): string {
  return (v && v.trim()) ? v.trim() : fallback;
}

export function buildConfig(): RuntimeConfig {
  const port = Number(opt("LENS_PORT", process.env.LENS_PORT, "3001"));
  const v1StreamUrl = opt("V1_STREAM_URL", process.env.V1_STREAM_URL, "http://localhost:3000/stream");
  const token = req("LENS_TOKEN", process.env.LENS_TOKEN);
  const allowQueryToken = opt("LENS_ALLOW_QUERY_TOKEN", process.env.LENS_ALLOW_QUERY_TOKEN, "false").toLowerCase() === "true";

  const allowedOrigins = (process.env.LENS_ALLOWED_ORIGINS || "http://localhost:3000")
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const extensionId = process.env.LENS_EXTENSION_ID?.trim();
  if (extensionId) allowedOrigins.push(`chrome-extension://${extensionId}`);

  const upstreams: Record<UpstreamName, UpstreamConfig> = {
    openai: {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY?.trim() || "",
      model: opt("OPENAI_MODEL", process.env.OPENAI_MODEL, "gpt-5"),
      baseUrl: opt("OPENAI_BASE_URL", process.env.OPENAI_BASE_URL, "https://api.openai.com")
    },
    anthropic: {
      name: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY?.trim() || "",
      model: opt("ANTHROPIC_MODEL", process.env.ANTHROPIC_MODEL, "claude-sonnet-4-5"),
      version: opt("ANTHROPIC_VERSION", process.env.ANTHROPIC_VERSION, "2023-06-01"),
      baseUrl: opt("ANTHROPIC_BASE_URL", process.env.ANTHROPIC_BASE_URL, "https://api.anthropic.com")
    }
  };

  return {
    port,
    v1StreamUrl,
    defaultUpstream: opt("LENS_DEFAULT_UPSTREAM", process.env.LENS_DEFAULT_UPSTREAM, "openai") as UpstreamName,
    defaultMode: opt("LENS_MODE", process.env.LENS_MODE, "assist") as LensMode,
    upstreams,
    token,
    allowedOrigins,
    extensionId,
    allowQueryToken
  };
}

export function ensureUpstreamConfigured(cfg: RuntimeConfig, upstream: UpstreamName) {
  if (upstream === "openai") {
    req("OPENAI_API_KEY", cfg.upstreams.openai.apiKey);
    req("OPENAI_MODEL", cfg.upstreams.openai.model);
  } else {
    req("ANTHROPIC_API_KEY", cfg.upstreams.anthropic.apiKey);
    req("ANTHROPIC_MODEL", cfg.upstreams.anthropic.model);
    req("ANTHROPIC_VERSION", cfg.upstreams.anthropic.version);
  }
}
