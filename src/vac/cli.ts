import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { Claim, ClaimEvidence, ClaimDecision } from './model.js';
import { evaluateClaim } from './evaluate.js';

/**
 * VAC CLI
 *
 * Reads NDJSON from stdin with two record kinds:
 * { "kind": "claim", ...Claim }
 * { "kind": "evidence", ...ClaimEvidence }
 *
 * Emits NDJSON ClaimDecision records to stdout.
 */

interface IncomingRecordBase {
  kind: 'claim' | 'evidence';
}

type IncomingRecord = (IncomingRecordBase & Claim) | (IncomingRecordBase & ClaimEvidence);

const claims = new Map<string, Claim>();
const evidenceByClaim = new Map<string, ClaimEvidence[]>();

// Simple input limits to keep VAC CLI deterministic and pipeline-safe
const MAX_LINES = 100_000; // hard cap on NDJSON lines
const MAX_BYTES = 10 * 1024 * 1024; // ~10MB of input

let lineCount = 0;
let byteCount = 0;
let aborted = false;

function compareByCreatedThenId<A extends { createdAt: string; id: string }>(a: A, b: A): number {
  const ta = Date.parse(a.createdAt) || 0;
  const tb = Date.parse(b.createdAt) || 0;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

function sortedEvidence(list: ClaimEvidence[]): ClaimEvidence[] {
  return [...list].sort(compareByCreatedThenId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateClaimRecord(rec: unknown): Claim | null {
  if (!isRecord(rec)) return null;
  const id = rec.id;
  const subjectId = rec.subjectId;
  const type = rec.type;
  const payload = rec.payload;
  const createdAt = rec.createdAt;
  if (typeof id !== 'string' || typeof subjectId !== 'string' || typeof type !== 'string' || typeof createdAt !== 'string' || typeof payload !== 'object' || payload === null) {
    console.error('[vac] invalid claim record schema', JSON.stringify(rec));
    return null;
  }
  return rec as Claim;
}

function validateEvidenceRecord(rec: unknown): ClaimEvidence | null {
  if (!isRecord(rec)) return null;
  const id = rec.id;
  const evidenceType = rec.evidenceType;
  const source = rec.source;
  const createdAt = rec.createdAt;
  if (typeof id !== 'string' || typeof evidenceType !== 'string' || typeof source !== 'string' || typeof createdAt !== 'string') {
    console.error('[vac] invalid evidence record schema', JSON.stringify(rec));
    return null;
  }
  if (typeof rec.claimId !== 'string') {
    console.error('[vac] evidence missing claimId; skipping', JSON.stringify(rec));
    return null;
  }
  return rec as ClaimEvidence;
}

function attachEvidence(e: ClaimEvidence) {
  if (e.claimId) {
    const arr = evidenceByClaim.get(e.claimId) ?? [];
    arr.push(e);
    evidenceByClaim.set(e.claimId, arr);
  }
}

function emitDecision(d: ClaimDecision) {
  output.write(JSON.stringify({ kind: 'decision', ...d }) + '\n');
}

function processAll() {
  const orderedClaims = Array.from(claims.values()).sort(compareByCreatedThenId);
  for (const claim of orderedClaims) {
    const ev = sortedEvidence(evidenceByClaim.get(claim.id) ?? []);
    const decision = evaluateClaim(claim, ev);
    emitDecision(decision);
  }
}

function main() {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  rl.on('line', (line) => {
    if (aborted) return;

    lineCount += 1;
    byteCount += Buffer.byteLength(line, 'utf8');
    if (lineCount > MAX_LINES || byteCount > MAX_BYTES) {
      aborted = true;
      console.error('[vac] input limit exceeded; aborting run', { lineCount, byteCount });
      // non-zero exit code so pipelines can detect failure
      // eslint-disable-next-line no-undef
      if (typeof process !== 'undefined') {
        // eslint-disable-next-line no-undef
        process.exitCode = 1;
      }
      rl.close();
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as IncomingRecord;
      if (parsed.kind === 'claim') {
        const c = validateClaimRecord(parsed);
        if (c) {
          claims.set(c.id, c);
        }
      } else if (parsed.kind === 'evidence') {
        const e = validateEvidenceRecord(parsed);
        if (e) {
          attachEvidence(e);
        }
      }
    } catch (err) {
      // Log parse errors to stderr but keep stream going
      console.error('[vac] bad line', (err as Error).message, line);
    }
  });

  rl.on('close', () => {
    if (!aborted) {
      processAll();
    }
  });
}

main();
