import { spawn } from "child_process";
import readline from "readline";

const V1_REQUEST_URL = "http://localhost:3000/request";

function log(msg, extra) {
  if (extra !== undefined) {
    console.error(`[sidekick-bridge] ${msg}`, extra);
  } else {
    console.error(`[sidekick-bridge] ${msg}`);
  }
}

function toDelta(evt) {
  const tags = ["foodtrucks", "demand:escambia"];

  if (typeof evt.field === "string" && evt.field.toLowerCase().includes("event")) {
    tags.push("events");
  }

  let signal = "business_unknown";
  if (typeof evt.delta === "number" && Number.isFinite(evt.delta)) {
    signal = evt.delta > 0 ? "business_opening" : "business_closing";
  }

  return {
    signal,
    region: "ESCAMBIA_FL",
    tags,
    source: "sidekick:foodtrucks",
    meta: {
      surface: evt.surface,
      url: evt.url,
      field: evt.field,
      anchor: evt.anchor,
      raw: evt.raw,
      geo: evt.geo,
    },
  };
}

async function forwardToV1(delta) {
  try {
    const res = await fetch(V1_REQUEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(delta),
    });
    if (!res.ok) {
      log(`v1 /request HTTP ${res.status}`);
    }
  } catch (err) {
    log("Failed to reach v1 /request", err?.message || err);
  }
}

async function main() {
  log("Starting sidekick → v1 bridge...");

  const child = spawn("npm", ["run", "sidekick:foodtrucks", "--silent"], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  child.on("exit", (code, signal) => {
    log(`sidekick process exited (code=${code}, signal=${signal || "none"})`);
  });

  const rl = readline.createInterface({ input: child.stdout });

  for await (const line of rl) {
    const trimmed = String(line).trim();
    if (!trimmed) continue;

    let evt;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      log("Skipping non-JSON line from sidekick", trimmed.slice(0, 200));
      continue;
    }

    if (!evt || typeof evt !== "object") {
      continue;
    }

    const delta = toDelta(evt);
    await forwardToV1(delta);
  }
}

main().catch((err) => {
  log("Fatal bridge error", err?.message || err);
  process.exit(1);
});
