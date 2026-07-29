import assert from "node:assert/strict";
import test from "node:test";
import { buildConfig } from "../dist/config.js";

test("query-string tokens are disabled by default and require an explicit opt in", () => {
  const priorToken = process.env.LENS_TOKEN;
  const priorQueryToken = process.env.LENS_ALLOW_QUERY_TOKEN;
  process.env.LENS_TOKEN = "synthetic-test-token";
  delete process.env.LENS_ALLOW_QUERY_TOKEN;

  try {
    assert.equal(buildConfig().allowQueryToken, false);
    process.env.LENS_ALLOW_QUERY_TOKEN = "true";
    assert.equal(buildConfig().allowQueryToken, true);
  } finally {
    if (priorToken === undefined) delete process.env.LENS_TOKEN;
    else process.env.LENS_TOKEN = priorToken;
    if (priorQueryToken === undefined) delete process.env.LENS_ALLOW_QUERY_TOKEN;
    else process.env.LENS_ALLOW_QUERY_TOKEN = priorQueryToken;
  }
});
