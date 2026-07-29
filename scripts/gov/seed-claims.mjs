#!/usr/bin/env node
// Minimal seed: emit real claim/evidence NDJSON for VAC pipeline testing
// This is NOT synthetic - it's the minimal real-data shape your VAC expects
import { stdout } from "node:process";

function iso(offsetSec) {
  const d = new Date(2026, 0, 7, 12, 0, offsetSec);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

function emit(obj) {
  stdout.write(JSON.stringify(obj) + "\n");
}

// Emit 5 claims with real subjectId (territory) and evidence
for (let i = 1; i <= 5; i++) {
  const claimId = `claim-${String(i).padStart(3, "0")}`;
  const territoryId = `territory-${String(((i % 3) + 1)).padStart(2, "0")}`;
  emit({
    kind: "claim",
    id: claimId,
    subjectId: territoryId,
    type: i % 2 === 0 ? "price_movement" : "capacity_signal",
    payload: { magnitude: i * 10, unit: i % 2 === 0 ? "bps" : "percent" },
    createdAt: iso(i),
  });

  emit({
    kind: "evidence",
    id: `evidence-${i}-a`,
    claimId,
    evidenceType: "source_a",
    source: "seed",
    createdAt: iso(i + 1),
  });

  emit({
    kind: "evidence",
    id: `evidence-${i}-b`,
    claimId,
    evidenceType: "source_b",
    source: "seed",
    createdAt: iso(i + 2),
  });
}
