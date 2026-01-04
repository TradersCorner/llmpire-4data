// Reference CLI consumer for 4data v1 SSE stream.
// This is NOT a feature; it exists to demonstrate the consumer contract.

import http from "http";

function connect() {
  const req = http.request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/stream",
      method: "GET",
      headers: {
        Accept: "text/event-stream"
      }
    },
    res => {
      res.setEncoding("utf8");

      let buffer = "";
      let currentEvent = null;

      res.on("data", chunk => {
        buffer += chunk;

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trimEnd();

          if (!line) {
            if (currentEvent && currentEvent.type && currentEvent.data) {
              handleEvent(currentEvent.type, currentEvent.data);
            }
            currentEvent = null;
            continue;
          }

          if (line.startsWith("event: ")) {
            currentEvent = currentEvent || {};
            currentEvent.type = line.slice("event: ".length).trim();
          } else if (line.startsWith("data: ")) {
            currentEvent = currentEvent || {};
            const json = line.slice("data: ".length);
            try {
              currentEvent.data = JSON.parse(json);
            } catch {
              currentEvent.data = json;
            }
          }
        }
      });

      res.on("end", () => {
        console.log("[watch] stream ended; reconnecting in 1s");
        setTimeout(connect, 1000);
      });
    }
  );

  req.on("error", err => {
    console.error("[watch] connection error:", err.message);
    setTimeout(connect, 1000);
  });

  req.end();
}

function handleEvent(type, data) {
  if (type === "hello") {
    console.log("[watch] connected at", new Date(data.connectedAt).toISOString());
    return;
  }

  if (type === "state_update") {
    console.log("[watch] STATE UPDATE", {
      region: data.region,
      signal: data.signal,
      expiresAt: new Date(data.expiresAt).toISOString()
    });
    return;
  }

  if (type === "state_expired") {
    console.log("[watch] STATE EXPIRED at", new Date(data.expiredAt).toISOString());
    return;
  }

  console.log(`[watch] event: ${type}`, data);
}

connect();
