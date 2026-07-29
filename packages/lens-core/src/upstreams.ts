import { EvidencePack, LensMode, UpstreamConfig, UpstreamName } from "./types.js";

export interface UpstreamAnswerClient {
  name: UpstreamName;
  answer(req: { prompt: string; evidence: EvidencePack; mode: LensMode }): Promise<{ answer: string }>;
}

export function buildUpstreamClient(upstream: UpstreamConfig): UpstreamAnswerClient {
  if (upstream.name === "openai") return new OpenAIClient(upstream);
  if (upstream.name === "anthropic") return new AnthropicClient(upstream);
  throw new Error(`Unsupported upstream ${upstream.name}`);
}

class OpenAIClient implements UpstreamAnswerClient {
  name = "openai" as const;
  constructor(private upstream: UpstreamConfig) {}

  async answer(req: { prompt: string; evidence: EvidencePack; mode: LensMode }): Promise<{ answer: string }> {
    const { model, apiKey, baseUrl } = this.upstream;
    if (!model) throw new Error("OpenAI model not configured");
    if (!apiKey) throw new Error("OpenAI API key not set");

    const system = "You are a lens that only answers using the provided evidence. If uncertain, say you lack evidence.";
    const evidence = req.evidence.facts
      .map(f => `- lane:${f.lane ?? ""} tag:${f.tag ?? ""} entity:${f.entity ?? ""} asset:${f.asset ?? ""} symbol:${f.symbol ?? ""} payload:${JSON.stringify(f.payload)}`)
      .join("\n");

    const prompt = `${req.prompt}\nEvidence:\n${evidence}`;

    const body = {
      model,
      input: [
        { role: "system", content: [{ type: "text", text: system }] },
        { role: "user", content: [{ type: "text", text: prompt }] }
      ],
      max_output_tokens: 512,
      temperature: 0.2
    };

    const resp = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OpenAI error ${resp.status}: ${text}`);
    }

    const json: any = await resp.json();
    const content = json.output_text
      ?? json.output?.[0]?.content?.[0]?.text
      ?? json.output?.[0]?.content?.[0]?.value
      ?? "";
    return { answer: content };
  }
}

class AnthropicClient implements UpstreamAnswerClient {
  name = "anthropic" as const;
  constructor(private upstream: UpstreamConfig) {}

  async answer(req: { prompt: string; evidence: EvidencePack; mode: LensMode }): Promise<{ answer: string }> {
    const { model, apiKey, baseUrl, version } = this.upstream;
    if (!model) throw new Error("Anthropic model not configured");
    if (!apiKey) throw new Error("Anthropic API key not set");
    if (!version) throw new Error("Anthropic version not set");

    const system = "You are a lens that only answers using the provided evidence. If uncertain, say you lack evidence.";
    const evidence = req.evidence.facts
      .map(f => `- lane:${f.lane ?? ""} tag:${f.tag ?? ""} entity:${f.entity ?? ""} asset:${f.asset ?? ""} symbol:${f.symbol ?? ""} payload:${JSON.stringify(f.payload)}`)
      .join("\n");

    const body = {
      model,
      system,
      max_tokens: 512,
      temperature: 0.2,
      messages: [
        { role: "user", content: `Question: ${req.prompt}\nEvidence:\n${evidence}` }
      ]
    };

    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": version
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Anthropic error ${resp.status}: ${text}`);
    }

    const json: any = await resp.json();
    const content = json.content?.[0]?.text ?? json.content?.[0]?.value ?? "";
    return { answer: content };
  }
}
