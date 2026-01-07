import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function extractImportsFromPublicCli() {
  const src = read('cli-public-decision-cards.mjs');
  const re = /from '([^']+)'/g;
  const imports = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    imports.add(m[1]);
  }
  return Array.from(imports).sort();
}

test('Public Decision CLI: only depends on PublicDecisionCard projection (no internal VAC copy maps)', () => {
  const imports = extractImportsFromPublicCli();

  // The CLI is allowed to use node built-ins and PublicDecisionCard only.
  const forbidden = imports.filter((imp) => imp.includes('reasonCopy') || imp.includes('VAC_REASON_COPY_V1'));

  assert.deepEqual(
    forbidden,
    [],
    `Public decision CLI must not import internal VAC copy maps; found: ${forbidden.join(', ')}`,
  );
});
