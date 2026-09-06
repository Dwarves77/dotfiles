// Run: node --test scripts/maintenance/refetch-capped.test.mjs — no DB, no network: a fake `run` stands
// in for the real spawnSync. See this wrapper's own header for the GUARD-1 gate and why the target
// script is wrapped by subprocess rather than in-process import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./refetch-capped.mjs";

test("dry (BUILD): always runs, no gate, reports the worklist populations", async () => {
  const calls = [];
  const d = {
    run: async (argv) => { calls.push(argv); return { code: 0, stdout: "ok" }; },
    readArtifact: (mode) => { assert.equal(mode, "dry"); return { populations: { legacy_40k: 105, corroborator_60k: 15, primary_600k: 1 }, raw_counts: {}, expected: {} }; },
  };
  const s = await main({ mode: "dry" }, d);
  assert.deepEqual(calls[0], []);
  assert.equal(s.exitCode, 0);
  assert.equal(s.read_back.worklist_rows, 121);
  assert.equal(s.applied, 0);
});

test("apply without the GUARD-1 token: refuses, spawns nothing", async () => {
  let spawned = false;
  const d = { run: async () => { spawned = true; return { code: 0, stdout: "" }; } };
  const s = await main({ mode: "apply" }, d);
  assert.equal(spawned, false, "no subprocess spawned when the gate refuses");
  assert.equal(s.exitCode, 1);
  assert.ok(s.note.includes("GUARD-1-accepted"));
});

test("apply with the wrong token: still refuses", async () => {
  const d = { run: async () => ({ code: 0, stdout: "" }) };
  const s = await main({ mode: "apply", arg: "guard-1-accepted" }, d); // case-sensitive, exact match required
  assert.equal(s.exitCode, 1);
});

test("apply with GUARD-1-accepted: spawns --execute, reports replace/held counts", async () => {
  const calls = [];
  const d = {
    run: async (argv) => { calls.push(argv); return { code: 0, stdout: "ok" }; },
    readArtifact: (mode) => { assert.equal(mode, "apply"); return { populations: {}, raw_counts: {}, replaced: 118, held: 3, regroundRecommended: 40, flagsResolved: 12 }; },
  };
  const s = await main({ mode: "apply", arg: "GUARD-1-accepted" }, d);
  assert.deepEqual(calls[0], ["--execute"]);
  assert.equal(s.applied, 118);
  assert.equal(s.read_back.held, 3);
  assert.equal(s.read_back.flags_resolved, 12);
});

test("a non-zero exit from the target script is surfaced", async () => {
  const d = { run: async () => ({ code: 2, stdout: "REFUSE: system_state.global_processing_paused" }), readArtifact: () => null };
  const s = await main({ mode: "apply", arg: "GUARD-1-accepted" }, d);
  assert.equal(s.exitCode, 1);
  assert.ok(s.stdout_tail.includes("global_processing_paused"));
});
