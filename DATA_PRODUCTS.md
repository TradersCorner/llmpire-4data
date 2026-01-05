# Data Products Catalog

## Overview
This catalog indexes derived data products generated from ephemeral v1 signals. All products listed here adhere to strict safety posture: no raw access resale, no identifiers, no replayable timelines, no surveillance.

## Active Products

### Regional Capacity Signal
- **Status**: v1 (stable)
- **Type**: Aggregated operational signal
- **Contract**: [regional_capacity_signal.v1.md](data-products/regional_capacity_signal.v1.md)
- **One-pager**: [REGIONAL_CAPACITY_SIGNAL_ONE_PAGER.md](data-products/REGIONAL_CAPACITY_SIGNAL_ONE_PAGER.md)
- **Description**: Windowed aggregation of capacity tightening/opening events with derived volatility and confidence metrics
- **Update cadence**: On-demand (forge-generated per request)
- **SLA**: Best effort; no historical backfill

## Versioning Rules
- **v1 (stable)**: Contract frozen; breaking changes require v2
- **v2+ (additive)**: New fields allowed; existing fields immutable
- **Deprecation**: Minimum 90-day notice; consumers notified via changelog

## Product Lifecycle
1. **Draft**: Contract under review, not yet production
2. **Stable**: Contract locked, forge operational, documented
3. **Deprecated**: Sunset announced, consumers migrating
4. **Archived**: No longer emitted; historical reference only

## Safety Guarantees (all products)
- No raw event payloads
- No per-event timestamps (minute precision max)
- No user identifiers or personal data
- Non-replayable by design (windowing + aggregation)
- Observational only; no scoring, ranking, or recommendations

## Future Products (reserved)
- LLM-ready training inputs (v1 TBD)
- Market/behavioral indicators (v1 TBD)

## Changelog
- **2026-01-05**: Regional Capacity Signal v1 added (initial catalog entry)
