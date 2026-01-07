import readline from 'node:readline';
import { stdin as input, stdout as output, stderr as errorOutput } from 'node:process';

import { resolveFeedbackContext } from '../feedback/feedbackContext.mjs';
import { deriveAdminQueue } from './adminQueues.mjs';

/**
 * Admin Queues CLI
 *
 * Reads NDJSON ClaimDecision records (kind:"decision") from stdin and emits
 * NDJSON admin_queue records with derived queue + feedback context.
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
      if (!isRecord(parsed) || parsed.kind !== 'decision') return;

      const { bridgeHealth, ...decisionRest } = parsed;
      const decision = { ...decisionRest };

      const feedbackContext = resolveFeedbackContext(decision, bridgeHealth || undefined);
      const queue = deriveAdminQueue(decision, feedbackContext);

      const decisionId = typeof decision.id === 'string' ? decision.id : null;

      output.write(
        JSON.stringify({
          kind: 'admin_queue',
          decisionId,
          queue,
          feedbackContext,
        }) + '\n',
      );
    } catch (err) {
      errorOutput.write(
        `[admin-queues] bad line ${(err && err.message) || String(err)} ${line}\n`,
      );
    }
  });
}

main();
