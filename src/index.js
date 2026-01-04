import http from "http";
import { intercept } from "./interceptor.js";

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/request") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      // READ DATA IN FLIGHT
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end("Invalid JSON");
        return;
      }

      intercept(payload);

      // RESPOND NORMALLY
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));

      // payload dies here
    });
  } else {
    res.statusCode = 404;
    res.end("Not found");
  }
});

server.listen(3000, () => {
  console.log("4data listening on http://localhost:3000");
});
