import fs from 'node:fs';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 1000;

function normalizeLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Read DecisionCard-like records for governance/moderator queues.
 *
 * Source:
 * - NDJSON file where each line is:
 *     { "kind": "decision_card", "decisionId": string|null, "card": DecisionCard, ... }
 *   pointed to by process.env.GOV_DECISION_CARDS_PATH, or an explicit sourcePath.
 *
 * Behavior:
 * - Empty-safe: missing/unreadable file => [].
 * - Optional filters: territoryId and limit.
 * - Deterministic: results sorted by decisionId (string compare).
 */
export async function readDecisionCards({ territoryId, limit, sourcePath } = {}) {
  const file = sourcePath || process.env.GOV_DECISION_CARDS_PATH;
  if (!file) return [];

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (parsed.kind !== 'decision_card' || typeof parsed.card !== 'object' || parsed.card === null) {
      continue;
    }

    const decisionId =
      typeof parsed.decisionId === 'string' && parsed.decisionId
        ? parsed.decisionId
        : null;

    const record = {
      decisionId,
      territoryId:
        parsed.territoryId ||
        parsed.card?.territoryId ||
        parsed.decision?.territoryId ||
        null,
      adminQueue: parsed.adminQueue || null,
      card: parsed.card,
      decision: parsed.decision || null,
      evidenceSummary: parsed.evidenceSummary || null,
    };

    if (territoryId) {
      if (record.territoryId !== territoryId) continue;
    }

    out.push(record);
  }

  if (out.length === 0) return out;

  out.sort((a, b) => {
    const aId = a.decisionId == null ? '' : String(a.decisionId);
    const bId = b.decisionId == null ? '' : String(b.decisionId);
    return aId.localeCompare(bId);
  });

  const effectiveLimit = normalizeLimit(limit);
  if (out.length > effectiveLimit) {
    return out.slice(0, effectiveLimit);
  }

  return out;
}
