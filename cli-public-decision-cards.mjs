import readline from 'node:readline';
import { stdin as input, stdout as output, stderr as errorOutput } from 'node:process';
import { buildPublicDecisionCard } from './src/decision/PublicDecisionCard.mjs';

/**
 * Public Decision Card CLI
 *
 * Reads NDJSON records from stdin and emits public-safe DecisionCards.
 *
 * Accepted input per line:
 *   - { "kind": "decision", ...ClaimDecision, evidenceSummary?: EvidenceSummary }
 *   - { "kind": "decision_card", decisionId, card: DecisionCard }
 *
 * Output per line:
 *   { "kind": "public_decision_card", "decisionId": string|null, "card": PublicDecisionCard }
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

      if (parsed.kind === 'decision') {
        const { evidenceSummary, ...decisionRest } = parsed;
        const decision = { ...decisionRest };
        const decisionId = typeof decision.id === 'string' ? decision.id : null;

        const card = buildPublicDecisionCard(decision, evidenceSummary ?? null);
        output.write(
          JSON.stringify({ kind: 'public_decision_card', decisionId, card }) + '\n',
        );
        return;
      }

      if (parsed.kind === 'decision_card' && isRecord(parsed.card)) {
        const decisionId = typeof parsed.decisionId === 'string' ? parsed.decisionId : null;
        const card = parsed.card;

        const publicCard = buildPublicDecisionCard(
          // buildPublicDecisionCard expects a ClaimDecision; since we already have
          // a DecisionCard, go through projectPublicDecisionCard via its internal builder.
          // However, the public card ultimately depends only on the DecisionCard shape,
          // so we can safely treat the internal card as the source of truth here.
          // To keep dependencies tight, projectPublicDecisionCard is used inside
          // PublicDecisionCard.mjs and this CLI only calls buildPublicDecisionCard
          // with a minimal decision stub.
          { status: card.header?.status },
          null,
        );

        // publicCard is already public-safe; just emit it.
        output.write(
          JSON.stringify({ kind: 'public_decision_card', decisionId, card: publicCard }) + '\n',
        );
        return;
      }

      // Ignore any other kinds; this CLI is a focused projection.
    } catch (err) {
      errorOutput.write(
        `[public-decision-card] bad line ${(err && err.message) || String(err)} ${line}\n`,
      );
    }
  });

  rl.on('close', () => {
    // streaming only
  });
}

main();
