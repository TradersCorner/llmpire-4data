# Regional Capacity Signal — One Pager

## What it is
- Derived, aggregated operational signal (not access resale)
- Answers one question: how much did capacity conditions change in a region during a window?
- Built from ephemeral v1 signals; no raw events, no identifiers, no replay

## Safety posture
- Minute precision timestamps only; non-replayable
- Windowed aggregation; empty windows dropped; caps on total events
- No raw payloads, no per-event timestamps, no user data
- Observational, not prescriptive; flat-state confidence explicitly capped

## Core fields (see contract for full detail)
- product: regional_capacity_signal
- region: string
- window: 1m | 5m | 15m | 1h
- counts: capacity_tightening, capacity_opening
- net_state: tightening | opening | flat
- volatility: low | moderate | high | unknown (reserved)
- confidence: 0–1 heuristic, dampened when flat
- generatedAt: ISO-8601 (minute precision)

## What you can do with it
- Operational awareness: quantify tightening/opening frequency
- Volatility indicators: low/moderate/high at regional level
- Inputs to staffing/dispatch heuristics
- Feed into LLMs or BI safely (already de-identified and non-replayable)

## What it explicitly does NOT do
- No raw event resale, no access resale
- No identifiers, no per-event timestamps, no behavioral profiling
- No scoring or recommendations; it is observational only

## How it is produced
- Source: 4data v1 SSE (ephemeral) via bridge
- Forge applies contract rules: aggregate → discard empty/capped → derive fields → emit artifact

## Versioning and guarantees
- Contract: regional_capacity_signal.v1 (locked)
- Breaking changes require new major version
- v1 guarantees non-replayability, no identifiers, and discard rules

## Quick example
{
  "product": "regional_capacity_signal",
  "region": "PGC",
  "window": "5m",
  "generatedAt": "2026-01-05T02:10:00Z",
  "counts": { "capacity_tightening": 2, "capacity_opening": 1 },
  "net_state": "tightening",
  "volatility": "moderate",
  "confidence": 0.83
}
