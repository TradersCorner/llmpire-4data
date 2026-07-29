import test from "node:test";
import assert from "node:assert/strict";

const LENS = process.env.LENS_PORT ? `http://localhost:${process.env.LENS_PORT}` : "http://localhost:3001";
const TOKEN = process.env.LENS_TOKEN;

async function getJson(path) {
  const r = await fetch(LENS + path);
  assert.equal(r.ok, true, `GET ${path} failed: ${r.status}`);
  return await r.json();
}

test("health returns ok + stream stats", { skip: process.env.LENS_CI_SERVER !== "true" }, async () => {
  const j = await getJson("/health");
  assert.equal(typeof j.ok, "boolean");
  assert.equal(typeof j.lensPort, "number");
  assert.ok("received" in j, "missing received");
});

test("answer works when an upstream key exists", {
  skip: process.env.LENS_CI_SERVER !== "true" || (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) || !TOKEN
}, async () => {
  const upstream = process.env.OPENAI_API_KEY ? "openai" : "anthropic";

  const r = await fetch(LENS + "/lens/answer", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ input: "What changed recently?", mode: "assist", upstream })
  });

  assert.equal(r.ok, true, `POST /lens/answer failed: ${r.status}`);
  const j = await r.json();
  assert.equal(typeof j.answer, "string");
  assert.ok(j.evidence && Array.isArray(j.evidence.facts));
});
