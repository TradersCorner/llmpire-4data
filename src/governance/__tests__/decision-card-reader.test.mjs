import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readDecisionCards } from '../decisionCardReader.mjs';

function writeTmpNdjson(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-decisions-'));
  const file = path.join(dir, 'decisions.ndjson');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

test('readDecisionCards: missing source returns empty array', async () => {
  const result = await readDecisionCards({ sourcePath: 'non-existent-file.ndjson' });
  assert.deepEqual(result, []);
});

test('readDecisionCards: deterministic ordering and territory filter with cap', async () => {
  const file = writeTmpNdjson([
    JSON.stringify({ kind: 'decision_card', decisionId: 'b', card: { status: 'pending' }, territoryId: 't1' }),
    JSON.stringify({ kind: 'decision_card', decisionId: 'a', card: { status: 'verified' }, territoryId: 't1' }),
    JSON.stringify({ kind: 'decision_card', decisionId: 'c', card: { status: 'rejected' }, territoryId: 't2' }),
  ]);

  const result = await readDecisionCards({ territoryId: 't1', limit: 1, sourcePath: file });

  assert.equal(result.length, 1, 'cap should be enforced');
  assert.equal(result[0].decisionId, 'a', 'results sorted by decisionId');
  assert.equal(result[0].territoryId, 't1');
  assert.deepEqual(result[0].card.status, 'verified');
});
