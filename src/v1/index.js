import http from "http";
import { intercept } from "./interceptor.js";
import { addSubscriber } from "./stream.js";

const server = http.createServer((req, res) => {
  // READ-ONLY STREAM (SSE)
  if (req.method === "GET" && req.url === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    addSubscriber(res);
    return;
  }

  // IN-FLIGHT READ ENDPOINT
  if (req.method === "POST" && req.url === "/request") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
      // still no storage  this is just the body buffer for THIS request
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end("Invalid JSON");
        return;
      }

      intercept(payload);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
    });

    return;
  }

  res.statusCode = 404;
  res.end("Not found");
});

server.listen(3000, () => {
  console.log("4data listening on http://localhost:3000");
  console.log("SSE stream:       http://localhost:3000/stream");
});
