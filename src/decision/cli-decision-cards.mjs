import readline from "node:readline";
import { stdin as input, stdout as output, stderr as errorOutput } from "node:process";
import { buildDecisionCard } from "./DecisionCard.mjs";
import { resolveFeedbackContext } from "../feedback/feedbackContext.mjs";
import { deriveAdminQueue } from "../admin/adminQueues.mjs";

/**
 * Decision Card CLI
 *
 * Reads NDJSON ClaimDecision records from stdin (as emitted by the VAC CLI)
 * and emits NDJSON DecisionCard records to stdout.
 *
 * Input line:
 *   { "kind": "decision", ...ClaimDecision, bridgeHealth?: any, evidenceSummary?: any }
 *
 * Output line:
 *   {
 *     "kind": "decision_card",
 *     "decisionId": string|null,
 *     "territoryId": string|null,
 *     "adminQueue": string,
 *     "card": DecisionCard
 *   }
 */

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function main() {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed);
      if (!isRecord(parsed)) return;

      if (parsed.kind !== "decision") {
        return;
      }

      const { evidenceSummary, bridgeHealth, ...decisionRest } = parsed;
      const decision = { ...decisionRest };

      const decisionId = typeof decision.id === "string" ? decision.id : null;

      // NOTE: current system uses subjectId as territoryId for GOV queues.
      // If you want "subjectId = businessId" later, you must add a real territoryId field to decisions.
      const territoryId = typeof decision.subjectId === "string" ? decision.subjectId : null;

      const feedbackContext = resolveFeedbackContext(decision, bridgeHealth || undefined);
      const adminQueue = deriveAdminQueue(decision, feedbackContext);

      const card = buildDecisionCard(decision, evidenceSummary ?? null);

      output.write(
        JSON.stringify({
          kind: "decision_card",
          decisionId,
          territoryId,
          adminQueue,
          card,
        }) + "\n",
      );
    } catch (err) {
      errorOutput.write(
        `[decision-card] bad line ${(err && err.message) || String(err)} ${line}\n`,
      );
    }
  });

  rl.on("close", () => {});

  return;
}

main();
