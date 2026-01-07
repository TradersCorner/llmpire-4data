import test from "node:test";
import assert from "node:assert/strict";

const shouldRun = process.env.V1_INTEGRATION === "1";

test(
  "bridge -> v1 integration (requires live v1 on 127.0.0.1:3000)",
  { skip: !shouldRun },
  async () => {
    const url = "http://127.0.0.1:3000/request";

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch (e) {
      assert.fail(
        `v1 is not reachable at ${url}. Start it in another terminal: npm start. Error: ${String(
          e,
        )}`,
      );
    }

    assert.ok(
      res.status >= 200 && res.status < 600,
      `Unexpected response status: ${res.status}`,
    );
  },
);
