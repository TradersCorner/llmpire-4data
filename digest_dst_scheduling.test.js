// DST-aware scheduling invariants for digest
import { DateTime } from "luxon";
import { nextMondayAtEight } from "./src/digest/scheduler.js";

function expectNext({ nowISO, tz, expectedISO }) {
  const result = nextMondayAtEight({ now: new Date(nowISO), tz });
  const local = DateTime.fromJSDate(result, { zone: tz });

  if (local.weekday !== 1) {
    throw new Error(`Expected Monday in ${tz}, got weekday ${local.weekday}`);
  }
  if (!(local.hour === 8 && local.minute === 0)) {
    throw new Error(`Expected 08:00 local in ${tz}, got ${local.toISO()}`);
  }

  const expected = DateTime.fromISO(expectedISO, { zone: tz });
  if (Math.abs(local.toMillis() - expected.toMillis()) > 1) {
    throw new Error(`Expected ${expected.toISO()} in ${tz}, got ${local.toISO()}`);
  }
}

function run() {
  console.log("=== Digest DST Scheduling Tests ===\n");

  // DST start (spring forward): still fires at 08:00 local
  expectNext({
    nowISO: "2024-03-10T12:00:00.000Z", // Sunday before switch
    tz: "America/New_York",
    expectedISO: "2024-03-11T08:00:00.000",
  });
  console.log("✅ Spring forward (America/New_York) → Monday 08:00 local");

  // DST end (fall back): fires once at 08:00 local (post-shift)
  expectNext({
    nowISO: "2024-11-03T12:00:00.000Z", // Sunday before fall-back Monday
    tz: "America/New_York",
    expectedISO: "2024-11-04T08:00:00.000",
  });
  console.log("✅ Fall back (America/New_York) → Monday 08:00 local");

  // Non-DST zone
  expectNext({
    nowISO: "2024-07-05T12:00:00.000Z", // Friday UTC
    tz: "UTC",
    expectedISO: "2024-07-08T08:00:00.000",
  });
  console.log("✅ UTC zone → Monday 08:00 local");

  // Same-week Monday before 08:00 stays same day
  expectNext({
    nowISO: "2024-11-04T11:00:00.000Z", // 06:00 local (EST)
    tz: "America/New_York",
    expectedISO: "2024-11-04T08:00:00.000",
  });
  console.log("✅ Pre-window Monday keeps same-day 08:00");

  console.log("\nAll DST scheduling tests passed.");
}

run();
