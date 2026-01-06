// Invariant test: host/week idempotency prevents duplicate sends
import { sendDigestEmail } from "./src/digest/emailService.js";

async function run() {
  const digest = {
    windowStart: "2024-01-01T00:00:00.000Z",
    windowEnd: "2024-01-08T00:00:00.000Z",
    generatedAt: "2024-01-08T00:00:00.000Z",
    capacityAlerts: 1,
    pendingRequests: 0,
    lanes: { capacity: { count: 1 } },
    bridgeReachable: true,
    snapshotReachable: true,
    empty: false,
  };

  const key = "test-host-week-1";

  console.log("=== Digest Idempotency Test ===\n");

  console.log("1) First send (should send)");
  const first = await sendDigestEmail({ digest, idempotencyKey: key, to: "dev@example.com" });
  const firstOk = Boolean(first.sent === true && first.skipped !== true);
  console.log("   result:", first);

  console.log("\n2) Second send (same key, should skip)");
  const second = await sendDigestEmail({ digest, idempotencyKey: key, to: "dev@example.com" });
  const secondOk = Boolean(second.skipped === true && second.reason === "idempotent");
  console.log("   result:", second);

  const passed = firstOk && secondOk;
  console.log("\nResult:", passed ? "✅ idempotency enforced" : "❌ idempotency failed");
  process.exit(passed ? 0 : 1);
}

run().catch(err => {
  console.error("Test errored:", err);
  process.exit(1);
});
