import readline from 'node:readline';
import { stdin as input, stdout as output, stderr as errorOutput } from 'node:process';
import { buildDecisionCard } from './DecisionCard.mjs';

/**
 * Decision Card CLI
 *
 * Reads NDJSON ClaimDecision records from stdin (as emitted by the VAC CLI)
 * and emits NDJSON DecisionCard records to stdout.
 *
 * Expected input shape per line:
 *   { "kind": "decision", ...ClaimDecision, evidenceSummary?: EvidenceSummary }
 *
 * Output shape per line:
 *   { "kind": "decision_card", "decisionId": string, "card": DecisionCard }
 */

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function main() {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed);
      if (!isRecord(parsed)) return;

      if (parsed.kind !== 'decision') {
        // Ignore non-decision records; this CLI is a focused projection.
        return;
      }

      const { evidenceSummary, ...decisionRest } = parsed;
      const decision = { ...decisionRest };

      // Some VAC pipelines may not include an explicit id; fall back safely.
      const decisionId = typeof decision.id === 'string' ? decision.id : null;

      const card = buildDecisionCard(decision, evidenceSummary ?? null);

      output.write(
        JSON.stringify({ kind: 'decision_card', decisionId, card }) + '\n',
      );
    } catch (err) {
      errorOutput.write(
        `[decision-card] bad line ${(err && err.message) || String(err)} ${line}\n`,
      );
    }
  });

  rl.on('close', () => {
    // No flush needed; this CLI is purely streaming.
  });
}

main();
