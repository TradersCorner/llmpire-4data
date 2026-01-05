# Regional Capacity Signal — v1 Contract

**Purpose**: Derived, aggregated operational signal (no raw data, no identifiers, non-replayable). Answers one question: how much did capacity conditions change in this region during this window?

## Envelope
- `product`: `regional_capacity_signal`
- `region`: string (e.g., `PGC`)
- `window`: enum (`1m`, `5m`, `15m`, `1h`)
- `generatedAt`: ISO-8601, minute precision (never per-event timestamps)
- `windowStart` / `windowEnd`: ISO-8601, minute precision (optional provenance)
- `source`: `4data-bridge` (optional provenance)

## Counts
- `counts.capacity_tightening`: integer >= 0
- `counts.capacity_opening`: integer >= 0

## Derivatives
- `net_state`: enum (`tightening`, `opening`, `flat`)
  - `tightening` if tightening > opening
  - `opening` if opening > tightening
  - `flat` if tightening == opening (and both > 0) — confidence must be <= 0.5 in this case
- `volatility`: enum (`low`, `moderate`, `high`, `unknown`) — reserve `unknown`; v1 need not emit it
- `confidence`: float 0–1, heuristic and monotonic with total signal volume (e.g., `min(1, total/5)`, adjusted downward when `flat`)

## Discard rules
- Drop window if both counts are 0
- Cap total events per window (e.g., max 50) before computing derivatives

## Prohibitions
- No raw event payloads
- No per-event timestamps
- No identifiers or user metadata
- No replayable timelines

## Safety/intent
- Derived data only; not access resale
- Observational, not prescriptive; no scoring or ranking
- Ephemeral source: underlying signals expire; this product is the only persisted artifact if you choose to store it

## Example
```
{
  "product": "regional_capacity_signal",
  "region": "PGC",
  "window": "5m",
  "generatedAt": "2026-01-05T02:10:00Z",
  "counts": {
    "capacity_tightening": 2,
    "capacity_opening": 1
  },
  "net_state": "tightening",
  "volatility": "moderate",
  "confidence": 0.83
}
```
