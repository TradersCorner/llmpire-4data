import http from "http";

setTimeout(() => {
  const req = http.get("http://127.0.0.1:3002/health-digest", (res) => {
    let body = "";
    res.on("data", chunk => body += chunk);
    res.on("end", () => {
      console.log("Health endpoint response:");
      console.log(body);
      process.exit(0);
    });
  });

  req.on("error", (err) => {
    console.error("Health check failed:", err.message);
    process.exit(1);
  });
}, 1000);
