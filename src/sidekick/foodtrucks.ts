import { SEED_URLS } from './seeds.js';
import { buildSnapshot, diffSnapshots, FieldDelta, SurfaceSnapshot } from './harvest.js';

const FLOOR_MS = 5 * 60 * 1000; // 5 minutes
const BURST_MS = 15 * 1000; // 15 seconds
const QUIET_TICKS_TO_FLOOR = 8; // 8 * 15s = ~2 minutes

interface CandidateSurface {
  url: string;
  successCount: number;
  lastSnapshot: SurfaceSnapshot | null;
}

interface WatchedSurface {
  url: string;
  fingerprint: string;
  lastSnapshot: SurfaceSnapshot | null;
  mode: 'floor' | 'burst';
  quietTicks: number;
}

interface SurfaceEvent {
  ts: string;
  lane: 'demand';
  geo: string;
  surface: string;
  url: string;
  field: string;
  anchor: string;
  prev: number | null | undefined;
  curr: number | null | undefined;
  delta: number | null;
  raw: string;
}

const candidates = new Map<string, CandidateSurface>();
const watched = new Map<string, WatchedSurface>(); // keyed by url

const knownUrls = new Set<string>();
SEED_URLS.forEach((u) => knownUrls.add(u));

const ALLOWED_HOSTS = new Set<string>(
  SEED_URLS.map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return '';
    }
  }).filter(Boolean)
);

function logInfo(msg: string, extra?: unknown) {
  if (extra !== undefined) {
    console.error(`[sidekick] ${msg}`, extra);
  } else {
    console.error(`[sidekick] ${msg}`);
  }
}

async function fetchHtml(url: string): Promise<{ html: string; contentType: string | null } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      logInfo(`HTTP ${res.status} for ${url}`);
      return null;
    }
    const contentType = res.headers.get('content-type');
    const buf = await res.text();
    return { html: buf, contentType };
  } catch (err) {
    logInfo(`Fetch failed for ${url}`, (err as Error).message);
    return null;
  }
}

function emitEvent(surface: WatchedSurface, d: FieldDelta) {
  const evt: SurfaceEvent = {
    ts: new Date().toISOString(),
    lane: 'demand',
    geo: 'Escambia County, FL',
    surface: surface.fingerprint,
    url: surface.url,
    field: d.fieldKey,
    anchor: d.anchor,
    prev: d.prev,
    curr: d.curr,
    delta: d.delta,
    raw: d.raw
  };
  // NDJSON
  process.stdout.write(JSON.stringify(evt) + '\n');
}

async function discoveryTick() {
  for (const url of SEED_URLS) {
    if (!candidates.has(url) && !watched.has(url)) {
      candidates.set(url, { url, successCount: 0, lastSnapshot: null });
    }
  }

  for (const [url, cand] of candidates) {
    const res = await fetchHtml(url);
    if (!res) continue;

    const snapshot = buildSnapshot(url, res.contentType, res.html);

    if (snapshot.fields.size === 0) {
      // numeric-bearing promotion rule: if we can't see a number, surface is not observed
      continue;
    }

    cand.successCount += 1;
    cand.lastSnapshot = snapshot;

    if (cand.successCount >= 2) {
      // Promote to watched
      const surf: WatchedSurface = {
        url,
        fingerprint: snapshot.fingerprint,
        lastSnapshot: snapshot,
        mode: 'floor',
        quietTicks: 0
      };
      watched.set(url, surf);
      candidates.delete(url);
      logInfo(`Promoted surface to watch set: ${url}`);
      scheduleNextTick(url);
    }
  }
}

async function surfaceTick(url: string) {
  const surf = watched.get(url);
  if (!surf) return;

  const res = await fetchHtml(url);
  if (!res) {
    // If we repeatedly fail, drop surface; for now, a single hard failure removes it
    logInfo(`Dropping surface after fetch failure: ${url}`);
    watched.delete(url);
    return;
  }

  const snapshot = buildSnapshot(url, res.contentType, res.html);
  const deltas = diffSnapshots(surf.lastSnapshot, snapshot);

  let anyDelta = false;
  for (const d of deltas) {
    anyDelta = true;
    emitEvent(surf, d);
  }

  surf.lastSnapshot = snapshot;

  if (anyDelta) {
    if (surf.mode === 'floor') {
      surf.mode = 'burst';
      surf.quietTicks = 0;
    } else {
      surf.quietTicks = 0;
    }
  } else if (surf.mode === 'burst') {
    surf.quietTicks += 1;
    if (surf.quietTicks >= QUIET_TICKS_TO_FLOOR) {
      surf.mode = 'floor';
      surf.quietTicks = 0;
    }
  }

  scheduleNextTick(url);
}

function scheduleNextTick(url: string) {
  const surf = watched.get(url);
  if (!surf) return;
  const delay = surf.mode === 'burst' ? BURST_MS : FLOOR_MS;
  setTimeout(() => {
    surfaceTick(url).catch((err) => logInfo(`surfaceTick error for ${url}`, (err as Error).message));
  }, delay).unref?.();
}

async function main() {
  logInfo('Sidekick food-truck watcher starting...');
  logInfo(`Seed URLs: ${SEED_URLS.length}`);

  // Initial discovery pass
  await discoveryTick();

  // Ongoing discovery loop (floor cadence)
  setInterval(() => {
    discoveryTick().catch((err) => logInfo('discoveryTick error', (err as Error).message));
  }, FLOOR_MS).unref();
}

main().catch((err) => {
  logInfo('Fatal error', (err as Error).message);
  process.exit(1);
});
