import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../inject.js", import.meta.url), "utf8");
const overview = readFileSync(new URL("../../../docs/LISA_LENS_OVERVIEW.md", import.meta.url), "utf8");
const chromeRunbook = readFileSync(new URL("../../lens-core/CHROME_PROOF.md", import.meta.url), "utf8");

test("browser overlay renders upstream answers and evidence through textContent only", () => {
  assert.match(source, /element\.textContent = String\(text \?\? ""\)/);
  assert.match(source, /appendTextElement\(body, "p", data\?\.answer/);
  assert.match(source, /appendTextElement\(body, "pre", JSON\.stringify\(data\?\.evidence/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /insertAdjacentHTML|document\.write/);
});

test("operator documentation states upstream transmission and keeps Chrome proof unclaimed", () => {
  assert.match(overview, /selected prompt and evidence pack are then sent to the configured upstream provider/);
  assert.doesNotMatch(overview, /No data exfiltration|evidence stays on your machine/);
  assert.doesNotMatch(overview, /`\/v1\/\*`/);
  assert.match(chromeRunbook, /UNEXECUTED RECOVERY RUNBOOK/);
  assert.doesNotMatch(chromeRunbook, /- ✅/);
});
