// Run: node --test scripts/maintenance/tier-opinions.test.mjs — no DB, no deps at all (NOT RUNNABLE step).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, FINDING } from "./tier-opinions.mjs";

test("dry: reports NOT RUNNABLE, touches nothing, exits 0", async () => {
  const r = await main({ mode: "dry" });
  assert.equal(r.step, "tier-opinions");
  assert.equal(r.runnable, false);
  assert.equal(r.applied, 0);
  assert.deepEqual(r.read_back, {});
  assert.match(r.note, /^NOT RUNNABLE:/);
  assert.equal(r.exitCode, 0);
});

test("apply: same finding, exits 2 (never attempts a write)", async () => {
  const r = await main({ mode: "apply" });
  assert.equal(r.runnable, false);
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 2);
});

test("finding names the real upstream (registerCitedSources / brief generation), not a guess", () => {
  assert.match(FINDING.upstream, /registerCitedSources/);
  assert.match(FINDING.upstream, /tier-opinion-writer\.ts/);
  assert.match(FINDING.why_not_runnable, /LLM/);
});
