import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readFeedbackContexts } from '../feedbackContextReader.mjs';

function writeTmpNdjson(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-fb-'));
  const file = path.join(dir, 'admin-queues.ndjson');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

test('readFeedbackContexts: empty decisionIds returns empty Map', async () => {
  const result = await readFeedbackContexts([]);
  assert.equal(result.size, 0);
});

test('readFeedbackContexts: filters by decisionIds and sorts keys', async () => {
  const file = writeTmpNdjson([
    JSON.stringify({ kind: 'admin_queue', decisionId: 'b', feedbackContext: { suggestedAction: 'refresh' } }),
    JSON.stringify({ kind: 'admin_queue', decisionId: 'a', feedbackContext: { suggestedAction: 'observe' } }),
    JSON.stringify({ kind: 'other', decisionId: 'c', feedbackContext: { suggestedAction: 'ignore' } }),
  ]);

  const result = await readFeedbackContexts(['b', 'a'], { sourcePath: file });

  assert.equal(result.size, 2);
  const keys = Array.from(result.keys());
  assert.deepEqual(keys, ['a', 'b'], 'keys are sorted deterministically');
  assert.equal(result.get('a').suggestedAction, 'observe');
  assert.equal(result.get('b').suggestedAction, 'refresh');
});
