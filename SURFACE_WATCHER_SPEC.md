# Surface Watcher Specification v0

## Locked Signal Space (Canonical)

- **Domain:** Public local food-truck demand
- **Geography:** Escambia County, FL
- **Indicators:** *All* publicly visible numeric demand indicators (wait/prep times, queue length, availability/slots, busy ordinals, surge/delivery fees, min order changes, review velocity, order volume counters, trending/popular counters, capacity/occupancy, sold-out/low-stock counts). No pruning at v0. If it’s numeric, public, and moves because people act — observe it.
- **Discovery:** Autonomous, ongoing. No user-provided URLs. Surfaces promoted only when ungated, fetchable, and exposing ≥1 numeric field that plausibly changes. Promotion requires at least two successful fetches.
- **Cadence:** Adaptive. Floor = 5 minutes when quiet. Burst = 15 seconds while motion is detected. Decay back to floor when stable.
- **Motion trigger (to enter burst):** Variable/any Δ detected (emit all real numeric changes; tune thresholds later). Empty is honest; mock data forbidden.
- **Memory:** Ephemeral, only enough to compute Δ over the observation window; emit → forget. No persistence, no inference.
- **Output:** Raw motion only → stream → data factory. No interpretation.

**Next steps before code:**
1) Surface Discovery spec for Escambia County food trucks: how to find observation points (listings, maps-style surfaces, event/venue/ordering previews) without static URLs, and promote only numeric-bearing, ungated surfaces.
2) Numeric Field Harvest spec: generic extractor emits `(surface_id, field_path, value, timestamp)` for every numeric field found.
3) Adaptive cadence rules (deterministic): enter burst on any observed Δ; stay in burst while changes continue; decay to 5m floor after stability.

---

## SPEC 1 — Discovery (Escambia Food-Truck Signal Space)

**Goal:** Continuously find ungated public surfaces in Escambia County, FL that expose ≥1 numeric field related to food-truck demand, without user-supplied targets.

**Discovery inputs (not URLs):**
- Category seeds: food truck, food trucks, cuisine variants (tacos, bbq, seafood, etc.)
- Geo scope: Escambia County, FL (county boundary)
- Surface classes: public listings, public ordering previews, public wait/queue pages, public event/venue pages

**Discovery loop:**
- Scan public listing environments within geo using category seeds.
- Enumerate candidate surfaces (cards/pages/previews) ephemerally.
- Eligibility (promotion gate): ungated (no login/paywall/captcha), ≥1 numeric field visible, two successful fetches separated by ≥1 cadence tick.
- Promote to observed only if gate passes; otherwise drop.
- Re-discover continuously; new trucks/events appear without config.

**Surface identity (ephemeral):**
- `surface_fingerprint = hash(normalized_visible_structure)`; exists only for Δ window; no long-term identity storage.

---

## SPEC 2 — Numeric Harvest (Maximal, Non-interpretive)

**Goal:** Capture all numeric values that plausibly change due to demand, without deciding importance.

**Extract (examples, non-exhaustive):**
- Wait/prep times (minutes, ranges)
- Availability/slots remaining; next available time (encoded as minutes)
- Pricing deltas: delivery fee, surcharge, minimum order
- Counters: orders today, queue length, tickets, attendees
- Velocity proxies: review count increments (count only)
- Occupancy indicators: numeric/ordinal mapped only when explicit

**Harvest rules:**
- Extract every numeric token with a stable visual anchor (label/context).
- Record as `(surface_fingerprint, field_path, value, observed_at)`.
- No text storage, no user identifiers, no screenshots.
- If a number disappears, emit null transition only if it was previously numeric.

**Diff & emit:**
- Compare current vs last in memory.
- Any real Δ emits (no thresholds at v0).
- Emit one event per field change.

---

## SPEC 3 — Adaptive Cadence (Deterministic)

**Goal:** Spend attention where motion exists; conserve otherwise.

**Cadence states:**
- Quiet: 5 minutes (floor)
- Burst: 15 seconds

**Triggers:**
- Enter Burst: any emitted Δ on a surface
- Stay in Burst: Δ continues within last N burst ticks (N=1)
- Decay to Quiet: no Δ for M consecutive burst ticks (M=8 ≈2 minutes at 15s)

**Scope:**
- Burst applies per surface (not global) to avoid thundering herds.

**Emission schema (raw product):**
```
{
  lane: "demand",
  geo: "Escambia County, FL",
  surface: surface_fingerprint,
  field: field_path,
  prev: number|null,
  curr: number|null,
  delta: curr - prev (if both numeric),
  observed_at
}
```

**Fail-safes:**
- Empty is valid; silence means no motion.
- Ungated check is strict; if a surface gates later, drop it.
- Determinism: same observations → same emits.
- Rollback: any persistence or mock insertion is a hard stop.

---

## 1. Commodities / Futures Price Boards

### What It Watches
Public exchange pages showing: last price, change %, volume for commodities/futures.

### Watch Cadence
- **Interval:** 60 seconds
- **Rationale:** Prices update frequently; 60s balances freshness vs noise.

### Numeric Extraction
Parse displayed values:
```
Symbol: OIL_WTI
Last: 78.45
Change: +1.2
Change %: +1.55%
Volume: 145K
```

Extract:
- `symbol` (string)
- `last_price` (number)
- `change_pct` (number)
- `volume` (number, optional)

### Diff Window
- **Y (time window):** 60 seconds (current vs previous poll)
- **State retention:** Keep last 2 snapshots only (current + previous)

### Emit Threshold
Emit delta if:
- `|change_pct| >= 0.5%` (absolute movement threshold)
- OR `first_seen` (new symbol detected)

### Lane + Schema Mapping
- **Lane:** `prices`
- **Schema:** `market_prices_v1`

```json
{
  "lane": "prices",
  "entity": "OIL_WTI",
  "delta": 1.55,
  "direction": "up",
  "last_price": 78.45,
  "volume": 145000,
  "timestamp": "2026-01-06T12:34:56Z",
  "source": "exchange_board",
  "window": "60s"
}
```

### Forget Policy
- **Retention:** 2 snapshots (120 seconds max)
- **Reset:** Clear state on service restart
- **No backfill**

---

## 2. Sports Odds Boards (Public Pages)

### What It Watches
Public odds tables showing: spreads, totals, moneylines for upcoming events.

### Watch Cadence
- **Interval:** 30 seconds
- **Rationale:** Odds shift rapidly near event time; 30s catches meaningful movement.

### Numeric Extraction
Parse displayed odds:
```
Event: DAL vs PHI
Spread: DAL -3.5 (-110)
Total: 48.5 (O -115 / U -105)
Moneyline: DAL -165 / PHI +145
```

Extract:
- `event_id` (string)
- `spread_line` (number)
- `spread_odds` (number, optional)
- `total_line` (number)
- `moneyline_favorite` (number)
- `moneyline_underdog` (number)

### Diff Window
- **Y (time window):** 30 seconds (current vs previous poll)
- **State retention:** Keep last 2 snapshots only

### Emit Threshold
Emit delta if:
- Spread line moves `>= 0.5 points`
- Total line moves `>= 0.5 points`
- Moneyline shifts `>= 10` (e.g., -165 → -155)
- OR `first_seen` (new event listed)

### Lane + Schema Mapping
- **Lane:** `prices` (subcategory: `sports_odds`)
- **Schema:** `sports_odds_v1` (new, define separately)

```json
{
  "lane": "prices",
  "category": "sports_odds",
  "entity": "DAL_vs_PHI",
  "metric": "spread",
  "delta": -0.5,
  "direction": "down",
  "current_value": -3.5,
  "previous_value": -3.0,
  "timestamp": "2026-01-06T12:34:56Z",
  "source": "odds_board",
  "window": "30s"
}
```

### Forget Policy
- **Retention:** 2 snapshots (60 seconds max)
- **Event cleanup:** Drop events once completed/final
- **No backfill**

---

## 3. Economic Release Calendars (Public)

### What It Watches
Public calendars listing: release name, scheduled time, actual value (once published), consensus, previous.

### Watch Cadence
- **Interval:** 300 seconds (5 minutes)
- **Rationale:** Releases are discrete, bursty; high-frequency polling unnecessary.

### Numeric Extraction
Parse calendar entry:
```
Release: CPI (YoY)
Time: 2026-01-06 08:30 EST
Consensus: 3.2%
Previous: 3.1%
Actual: 3.4% (once published)
```

Extract:
- `release_id` (string)
- `actual_value` (number, null until published)
- `consensus_value` (number)
- `previous_value` (number)

### Diff Window
- **Y (time window):** State change (null → value)
- **State retention:** Keep unreleased events for 24 hours; drop after publish

### Emit Threshold
Emit delta if:
- `actual_value` transitions from `null` → `number` (release published)
- AND `|actual - consensus| >= 0.1` (meaningful surprise)

### Lane + Schema Mapping
- **Lane:** `info`
- **Schema:** `economic_release_v1` (new, define separately)

```json
{
  "lane": "info",
  "entity": "CPI_YOY",
  "delta": 0.2,
  "direction": "up",
  "actual": 3.4,
  "consensus": 3.2,
  "previous": 3.1,
  "timestamp": "2026-01-06T08:30:00Z",
  "source": "economic_calendar",
  "window": "release"
}
```

### Forget Policy
- **Retention:** Drop published releases after 60 seconds
- **Pre-release:** Keep for 24 hours max (ignore stale)
- **No backfill**

---

## 4. Government Statistics Tables (Live Updates)

### What It Watches
Public tables with numeric cells that update periodically (e.g., EIA inventories, USDA production).

### Watch Cadence
- **Interval:** 600 seconds (10 minutes)
- **Rationale:** Updates are infrequent; 10min minimizes noise.

### Numeric Extraction
Parse table structure:
```
Table: Weekly Petroleum Inventories
Row: Crude Oil
Column: Total Stocks (million barrels)
Value: 448.2
```

Extract:
- `table_id` (string)
- `row_key` (string)
- `col_key` (string)
- `value` (number)
- `unit` (string, optional)

### Diff Window
- **Y (time window):** 10 minutes (current vs previous poll)
- **State retention:** Keep last 2 snapshots only

### Emit Threshold
Emit delta if:
- `|value_delta| >= 1.0%` (percentage change threshold)
- OR `first_seen` (new row/column detected)

### Lane + Schema Mapping
- **Lane:** `capacity` or `info` (depends on table type)
- **Schema:** `government_stats_v1` (new, define separately)

```json
{
  "lane": "capacity",
  "entity": "CRUDE_OIL_STOCKS",
  "delta": -2.1,
  "direction": "down",
  "current_value": 448.2,
  "previous_value": 450.3,
  "unit": "million_barrels",
  "timestamp": "2026-01-06T12:34:56Z",
  "source": "eia_table",
  "window": "10m"
}
```

### Forget Policy
- **Retention:** 2 snapshots (20 minutes max)
- **No backfill**

---

## 5. Exchange Summary / Quote Tables

### What It Watches
Public summary pages showing: index values, market breadth, sector performance, volume.

### Watch Cadence
- **Interval:** 60 seconds
- **Rationale:** Summaries update continuously during market hours; 60s is sufficient.

### Numeric Extraction
Parse summary metrics:
```
Index: S&P 500
Value: 4785.23
Change: +12.45 (+0.26%)
Volume: 3.2B
Breadth: 312 / 188 (adv/dec)
```

Extract:
- `metric_id` (string)
- `value` (number)
- `change_pct` (number)
- `volume` (number, optional)
- `breadth_ratio` (number, optional)

### Diff Window
- **Y (time window):** 60 seconds (current vs previous poll)
- **State retention:** Keep last 2 snapshots only

### Emit Threshold
Emit delta if:
- `|change_pct| >= 0.25%` (meaningful index move)
- OR breadth flips (e.g., 60% adv → 60% dec)
- OR `first_seen` (new metric tracked)

### Lane + Schema Mapping
- **Lane:** `prices`
- **Schema:** `market_summary_v1` (new, define separately)

```json
{
  "lane": "prices",
  "entity": "SPX",
  "delta": 0.26,
  "direction": "up",
  "current_value": 4785.23,
  "volume": 3200000000,
  "timestamp": "2026-01-06T12:34:56Z",
  "source": "exchange_summary",
  "window": "60s"
}
```

### Forget Policy
- **Retention:** 2 snapshots (120 seconds max)
- **No backfill**

---

## Watcher Implementation Pattern (Generic)

All watchers follow this deterministic pattern:

```javascript
class SurfaceWatcher {
  constructor(config) {
    this.config = config; // { url, cadence, threshold, lane, schema }
    this.state = { current: null, previous: null };
  }

  async poll() {
    const snapshot = await this.fetchAndExtract();
    this.state.previous = this.state.current;
    this.state.current = snapshot;
    
    const deltas = this.diff(this.state.previous, this.state.current);
    const signals = deltas
      .filter(d => this.meetsThreshold(d))
      .map(d => this.toSignal(d));
    
    signals.forEach(s => this.emit(s));
  }

  diff(prev, curr) {
    // Deterministic numeric diff; no inference
    if (!prev) return curr.map(v => ({ ...v, delta: null, direction: 'new' }));
    // Compare by key; emit deltas
  }

  meetsThreshold(delta) {
    return Math.abs(delta.value) >= this.config.threshold;
  }

  toSignal(delta) {
    return {
      lane: this.config.lane,
      entity: delta.key,
      delta: delta.value,
      direction: delta.value > 0 ? 'up' : delta.value < 0 ? 'down' : 'flat',
      timestamp: new Date().toISOString(),
      source: this.config.source,
      window: this.config.cadence
    };
  }

  emit(signal) {
    // Send to LISA validation → stream
  }
}
```

---

## Legal + Ethical Compliance

All surfaces:
- ✅ Publicly accessible (no authentication)
- ✅ No scraping terms violation (public display pages)
- ✅ Transformed deltas emitted (not raw republishing)
- ✅ No commercial API dependencies
- ✅ No user PII or private data

---

## Status

- **Spec:** Complete
- **Watchers:** Not yet implemented
- **Schemas:** Need definition for sports_odds_v1, economic_release_v1, government_stats_v1, market_summary_v1
- **Next:** Implement one watcher (commodities) as proof; tune threshold; extend to others

**Lock:** This spec is binding for autonomous surface watching. No capability expansion beyond these 5 surfaces without contract review.
