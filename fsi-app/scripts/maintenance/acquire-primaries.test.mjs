// Run: node --test scripts/maintenance/acquire-primaries.test.mjs — no DB, no network: a fake `run`
// (child-process) function stands in for the real spawnSync. See this wrapper's own header for why the
// target script is wrapped by subprocess rather than in-process import (it does real network I/O even
// in its own dry-run path).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, buildArgs } from "./acquire-primaries.mjs";

test("buildArgs: dry mode with no arg (the target script has no explicit --dry-run flag)", () => {
  assert.deepEqual(buildArgs({ mode: "dry" }), []);
});

test("buildArgs: apply mode with an --only scope", () => {
  assert.deepEqual(buildArgs({ mode: "apply", arg: "it-042,it-043" }), ["--execute", "--only=it-042,it-043"]);
});

test("dry: spawns with --dry-run, reports the manifest counts, applies 0", async () => {
  const calls = [];
  const d = {
    run: async (argv) => { calls.push(argv); return { code: 0, stdout: "ok" }; },
    readManifest: (mode) => { assert.equal(mode, "dry"); return { acquired: 3, already: 1, held: 2, exempt: 0, out: [1, 2, 3, 4, 5, 6] }; },
  };
  const s = await main({ mode: "dry", arg: "it-042" }, d);
  assert.deepEqual(calls[0], ["--only=it-042"]);
  assert.equal(s.step, "acquire-primaries");
  assert.equal(s.counts.acquired, 3);
  assert.equal(s.applied, 0, "dry never counts acquired as applied");
  assert.equal(s.read_back.manifest_items, 6);
  assert.equal(s.exitCode, 0);
});

test("apply: spawns with --execute, counts acquired as applied", async () => {
  const d = {
    run: async () => ({ code: 0, stdout: "ok" }),
    readManifest: (mode) => { assert.equal(mode, "apply"); return { acquired: 5, already: 0, held: 1, exempt: 0, out: [] }; },
  };
  const s = await main({ mode: "apply" }, d);
  assert.equal(s.applied, 5);
});

test("a non-zero exit from the target script is surfaced, never silently swallowed", async () => {
  const d = { run: async () => ({ code: 1, stdout: "boom: fatal error\n" }), readManifest: () => null };
  const s = await main({ mode: "apply" }, d);
  assert.equal(s.exitCode, 1);
  assert.ok(s.note.includes("exited 1"));
  assert.ok(s.stdout_tail.includes("boom"));
});
