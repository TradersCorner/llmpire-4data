import { buildIdempotencyKey } from "./digestService.js";

const sentKeys = new Set();

function formatLaneSummary(lanes) {
  const entries = Object.entries(lanes || {});
  if (entries.length === 0) {
    return "(bridge unreachable or no lanes)";
  }

  return entries
    .map(([lane, meta]) => `${lane}: ${meta.count ?? 0}`)
    .join(", ");
}

export function renderDigestEmail(digest) {
  const lines = [
    "TradeScout Weekly Digest (informational-only)",
    `Window: ${digest.windowStart} → ${digest.windowEnd}`,
    "",
    `Capacity alerts seen: ${digest.capacityAlerts}`,
    `Pending requests: ${digest.pendingRequests}`,
    `Lane buckets: ${formatLaneSummary(digest.lanes)}`,
    "",
    digest.empty ? "No activity observed in this window." : "Activity observed; review counts above.",
    "",
    "This digest is informational. Do not trade or act on it without verification.",
  ];

  return lines.join("\n");
}

export async function sendDigestEmail({ to, digest, idempotencyKey, dryRun = false }) {
  const recipient = to || process.env.DIGEST_RECIPIENT || "ops@example.com";
  const key = idempotencyKey || buildIdempotencyKey();

  if (sentKeys.has(key) && !dryRun) {
    console.log(`[digest] Skipping send (idempotent): ${key}`);
    return { skipped: true, reason: "idempotent" };
  }

  const subject = `TradeScout Weekly Digest — ${digest.windowEnd.slice(0, 10)}`;
  const body = renderDigestEmail(digest);

  if (dryRun) {
    console.log(`[digest] Dry run for ${recipient} (idempotencyKey=${key})`);
    console.log(body);
    return { sent: false, dryRun: true, subject, body };
  }

  console.log(`[digest] Sending digest to ${recipient} (idempotencyKey=${key})`);
  console.log(body);

  sentKeys.add(key);
  return { sent: true, subject };
}
