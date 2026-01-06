import os from "os";

const BRIDGE_ORIGIN = process.env.DIGEST_BRIDGE_ORIGIN || "http://localhost:3001";
const DIGEST_WINDOW_DAYS = 7;

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(`${BRIDGE_ORIGIN}${path}`, { ...options, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`[digest] Request failed for ${path}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLaneSummary() {
  return fetchJson(`/lanes`);
}

async function fetchCapacitySnapshot() {
  return fetchJson(`/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lane: "capacity", window: "1h", intent: "digest_weekly" })
  });
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function buildIdempotencyKey(now = new Date()) {
  const { year, week } = isoWeek(now);
  return `${os.hostname()}-week-${week}-year-${year}`;
}

export async function buildDigest({ now = new Date() } = {}) {
  const windowStart = new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86_400_000);

  const [laneSummary, capacitySnapshot] = await Promise.all([
    fetchLaneSummary(),
    fetchCapacitySnapshot()
  ]);

  const capacityAlerts = capacitySnapshot?.count ?? 0;

  return {
    generatedAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    capacityAlerts,
    pendingRequests: 0,
    lanes: laneSummary?.lanes || {},
    bridgeReachable: Boolean(laneSummary),
    snapshotReachable: Boolean(capacitySnapshot),
    empty: capacityAlerts === 0,
  };
}
