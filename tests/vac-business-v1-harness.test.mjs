import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Resolve the tsx CLI so we invoke the same runtime the scripts use
const tsxBin = require.resolve('tsx/cli');

function runVacCliWithInput(ndjson, extraEnv = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [tsxBin, 'src/vac/cli.ts'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          VAC_RULESET_VERSION: 'vac-business-v1',
          VAC_INGESTION_HEALTH: 'green',
          ...extraEnv,
        },
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => rejectRun(err));

    child.on('close', (code) => {
      resolveRun({ code, stdout, stderr });
    });

    child.stdin.write(ndjson);
    child.stdin.end();
  });
}

test('vac-business-v1: requires multi-domain corroboration with fresh evidence', async () => {
  const claim = {
    kind: 'claim',
    id: 'c1',
    subjectId: 'biz-1',
    type: 'business_website',
    payload: {
      businessName: 'My Truck',
      website: 'https://mytruck.example',
      phone: '555-1234',
      addressLine1: '123 Main St',
      city: 'Pensacola',
      region: 'FL',
    },
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  // Strong match from the business website itself
  const evWebsite = {
    kind: 'evidence',
    id: 'e1',
    claimId: 'c1',
    subjectId: 'biz-1',
    evidenceType: 'website_probe',
    source: 'probe:web',
    website: 'https://mytruck.example',
    nameCandidate: 'My Truck',
    phoneCandidate: '555-1234',
    addressCandidate: '123 Main St',
    nameMatchScore: 0.95,
    phoneMatchScore: 0.9,
    addressMatchScore: 0.9,
    ref: 'https://mytruck.example/home',
    createdAt: '2024-02-01T00:00:00.000Z',
  };

  // Independent corroboration from a directory listing on a different domain
  const evDirectory = {
    kind: 'evidence',
    id: 'e2',
    claimId: 'c1',
    subjectId: 'biz-1',
    evidenceType: 'directory_listing',
    source: 'directory:web',
    website: 'https://mytruck.example',
    nameCandidate: 'My Truck',
    phoneCandidate: '555-1234',
    addressCandidate: '123 Main St',
    nameMatchScore: 0.92,
    phoneMatchScore: 0.9,
    addressMatchScore: 0.9,
    ref: 'https://listings.example.com/mytruck',
    createdAt: '2024-02-02T00:00:00.000Z',
  };

  const ndjson = [claim, evWebsite, evDirectory].map((r) => JSON.stringify(r)).join('\n') + '\n';

  const { code, stdout } = await runVacCliWithInput(ndjson);
  assert.equal(code, 0, `VAC CLI exited with code ${code}`);

  const decisions = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((rec) => rec.kind === 'decision');

  assert.equal(decisions.length, 1, 'expected exactly one decision');

  const d = decisions[0];
  assert.equal(d.status, 'verified', 'expected claim to be verified under v1');
  assert.equal(d.ruleSetVersion, 'vac-business-v1');

  // v1 should record multi-domain corroboration and decision metadata
  assert.ok(Array.isArray(d.reasons), 'expected reasons array');
  assert.ok(
    d.reasons.includes('multi_domain.corroboration'),
    'expected multi_domain.corroboration reason for verified decision',
  );

  assert.ok(d.decisionMeta, 'expected decisionMeta on decision');
  assert.equal(d.decisionMeta.ingestionHealth, 'green');
  assert.ok(
    typeof d.decisionMeta.evaluatedAt === 'string' && d.decisionMeta.evaluatedAt.length > 0,
    'expected evaluatedAt ISO timestamp in decisionMeta',
  );
});


test('vac-business-v1: stale-only evidence cannot keep claim verified', async () => {
  const claim = {
    kind: 'claim',
    id: 'c2',
    subjectId: 'biz-2',
    type: 'business_website',
    payload: {
      businessName: 'Old Truck',
      website: 'https://oldtruck.example',
      phone: '555-9999',
      addressLine1: '999 Old Rd',
      city: 'Pensacola',
      region: 'FL',
    },
    createdAt: '2024-10-01T00:00:00.000Z',
  };

  const evOldSite = {
    kind: 'evidence',
    id: 'e3',
    claimId: 'c2',
    subjectId: 'biz-2',
    evidenceType: 'website_probe',
    source: 'probe:web',
    website: 'https://oldtruck.example',
    nameCandidate: 'Old Truck',
    phoneCandidate: '555-9999',
    addressCandidate: '999 Old Rd',
    nameMatchScore: 0.95,
    phoneMatchScore: 0.9,
    addressMatchScore: 0.9,
    ref: 'https://oldtruck.example/home',
    createdAt: '2023-01-01T00:00:00.000Z', // very old
  };

  const evOldDirectory = {
    kind: 'evidence',
    id: 'e4',
    claimId: 'c2',
    subjectId: 'biz-2',
    evidenceType: 'directory_listing',
    source: 'directory:web',
    website: 'https://oldtruck.example',
    nameCandidate: 'Old Truck',
    phoneCandidate: '555-9999',
    addressCandidate: '999 Old Rd',
    nameMatchScore: 0.9,
    phoneMatchScore: 0.9,
    addressMatchScore: 0.9,
    ref: 'https://listings.example.com/oldtruck',
    createdAt: '2023-01-15T00:00:00.000Z', // very old
  };

  const ndjson = [claim, evOldSite, evOldDirectory].map((r) => JSON.stringify(r)).join('\n') + '\n';

  const { code, stdout } = await runVacCliWithInput(ndjson);
  assert.equal(code, 0, `VAC CLI exited with code ${code}`);

  const decisions = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((rec) => rec.kind === 'decision');

  assert.equal(decisions.length, 1, 'expected exactly one decision');

  const d = decisions[0];
  assert.notEqual(d.status, 'verified', 'expected stale-only evidence not to auto-verify');
  assert.equal(d.ruleSetVersion, 'vac-business-v1');

  assert.ok(Array.isArray(d.reasons), 'expected reasons array');
  assert.ok(
    d.reasons.includes('stale.multi_domain.evidence') ||
      d.reasons.includes('weak.evidence.for.website') ||
      d.reasons.includes('needs.refresh'),
    'expected reasons to reflect stale/weak evidence under v1',
  );
});
