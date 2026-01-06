import { DateTime } from "luxon";
import { buildDigest, buildIdempotencyKey } from "./digestService.js";
import { sendDigestEmail } from "./emailService.js";

const DIGEST_TZ = process.env.DIGEST_TZ || "UTC";

let schedulerState = {
  enabled: false,
  leader: false,
  nextRun: null,
  lastRun: null,
  startTime: null,
};

export function nextMondayAtEight({ now = new Date(), tz = DIGEST_TZ } = {}) {
  const local = DateTime.fromJSDate(now, { zone: tz });

  // Anchor to Monday 08:00 in the provided TZ (ISO weekday: Monday = 1)
  let candidate = local.set({ weekday: 1, hour: 8, minute: 0, second: 0, millisecond: 0 });

  // If we're past that moment, advance one week; if we're before, keep same Monday
  if (local > candidate) {
    candidate = candidate.plus({ weeks: 1 });
  }

  return candidate.toJSDate();
}

async function runDigestOnce({ force = false } = {}) {
  const now = new Date();
  const idempotencyKey = buildIdempotencyKey(now);
  const dryRun = process.env.DIGEST_DRY_RUN === "true";

  if (!force && process.env.DIGEST_LEADER !== "true") {
    console.log(`[digest] Leader flag off; skip run (${idempotencyKey})`);
    return { skipped: true, reason: "not-leader" };
  }

  const digest = await buildDigest({ now });
  const result = await sendDigestEmail({ digest, idempotencyKey, dryRun });
  schedulerState.lastRun = now.toISOString();
  return { digest, result, idempotencyKey };
}

export function startDigestScheduler() {
  if (process.env.DIGEST_LEADER !== "true") {
    console.log("[digest] Scheduler disabled (set DIGEST_LEADER=true to enable)");
    schedulerState.enabled = false;
    schedulerState.leader = false;
    return () => {};
  }

  schedulerState.enabled = true;
  schedulerState.leader = true;
  schedulerState.startTime = new Date().toISOString();

  console.log(`[digest] Scheduler timezone: ${DIGEST_TZ}`);

  let timer;

  const scheduleNext = () => {
    const now = new Date();
    const next = nextMondayAtEight({ now, tz: DIGEST_TZ });
    const delayMs = next.getTime() - now.getTime();

    const localNext = DateTime.fromJSDate(next, { zone: DIGEST_TZ });
    schedulerState.nextRun = localNext.toISO();
    console.log(`[digest] Next run at ${localNext.toISO()} (${DIGEST_TZ}) (~${Math.round(delayMs / 1000 / 60)} minutes)`);

    timer = setTimeout(async () => {
      try {
        await runDigestOnce({ force: true });
      } catch (err) {
        console.error(`[digest] Run failed: ${err.message}`);
      }
      scheduleNext();
    }, delayMs);
  };

  scheduleNext();

  return () => {
    if (timer) clearTimeout(timer);
  };
}

export async function runNowOnce() {
  return runDigestOnce({ force: true });
}

export function getHealthStatus() {
  const dryRun = process.env.DIGEST_DRY_RUN === "true";
  const startTime = schedulerState.startTime ? new Date(schedulerState.startTime) : null;
  const uptimeSeconds = startTime ? Math.floor((Date.now() - startTime.getTime()) / 1000) : 0;

  return {
    enabled: schedulerState.enabled,
    leader: schedulerState.leader,
    tz: DIGEST_TZ,
    nextRun: schedulerState.nextRun,
    lastRun: schedulerState.lastRun,
    mode: dryRun ? "dry-run" : "live",
    idempotency: "host/week",
    uptimeSeconds,
  };
}
