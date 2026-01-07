import fs from 'node:fs';

/**
 * Read FeedbackContext map for given decisionIds from an NDJSON admin_queue source.
 *
 * Source:
 * - NDJSON file where each line is:
 *     { "kind": "admin_queue", "decisionId": string|null, "feedbackContext": { ... } }
 *   pointed to by process.env.GOV_ADMIN_QUEUES_PATH, or an explicit sourcePath.
 */
export async function readFeedbackContexts(decisionIds, { sourcePath } = {}) {
  if (!Array.isArray(decisionIds) || decisionIds.length === 0) {
    return new Map();
  }

  const file = sourcePath || process.env.GOV_ADMIN_QUEUES_PATH;
  if (!file) return new Map();

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return new Map();
  }

  const wanted = new Set(
    decisionIds
      .filter((id) => typeof id === 'string' && id)
      .map((id) => String(id)),
  );

  if (wanted.size === 0) return new Map();

  const latestById = new Map();

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (parsed.kind !== 'admin_queue') continue;

    const id =
      typeof parsed.decisionId === 'string' && parsed.decisionId
        ? String(parsed.decisionId)
        : null;
    if (!id || !wanted.has(id)) continue;

    if (parsed.feedbackContext && typeof parsed.feedbackContext === 'object') {
      latestById.set(id, parsed.feedbackContext);
    }
  }

  if (latestById.size === 0) return new Map();

  const sortedKeys = Array.from(latestById.keys()).sort();
  const result = new Map();
  for (const key of sortedKeys) {
    result.set(key, latestById.get(key));
  }

  return result;
}
