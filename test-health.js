import http from "http";
import { getHealthStatus } from "./src/digest/scheduler.js";
import { startHealthServer } from "./src/digest/health.js";

console.log("Starting health server test...");
const server = startHealthServer();

setTimeout(async () => {
  console.log("\nQuerying health endpoint...");
  
  const req = http.get("http://127.0.0.1:3002/health-digest", (res) => {
    let body = "";
    res.on("data", chunk => body += chunk);
    res.on("end", () => {
      console.log("Response:");
      console.log(body);
      server.close();
      process.exit(0);
    });
  });
  
  req.on("error", (err) => {
    console.error("Request failed:", err.message);
    server.close();
    process.exit(1);
  });
}, 2000);
