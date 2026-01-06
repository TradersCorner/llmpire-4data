import { runNowOnce, startDigestScheduler } from "./scheduler.js";
import { startHealthServer } from "./health.js";

async function main() {
  if (process.env.DIGEST_RUN_ONCE === "true") {
    await runNowOnce();
    return;
  }

  startDigestScheduler();
  const healthServer = startHealthServer();
  
  console.log("[digest] Services started; process will run indefinitely");
  
  // Keep process alive explicitly (scheduler timeout should do this, but be defensive)
  setInterval(() => {
    // No-op keepalive
  }, 60000);
}

main().catch(err => {
  console.error(`[digest] Fatal error: ${err.message}`);
  process.exit(1);
});
