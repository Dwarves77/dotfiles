// Run: node --test scripts/maintenance/remediate-orphan-sources.test.mjs — no DB, no network: a fake
// `run` (child-process) function stands in for the real spawnSync. See this wrapper's own header for
// why the target script is wrapped by subprocess rather than in-process import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, buildArgs, parseCounts } from "./remediate-orphan-sources.mjs";

test("buildArgs: dry mode with no arg", () => {
  assert.deepEqual(buildArgs({ mode: "dry" }), []);
});

test("buildArgs: apply mode with a --limit arg", () => {
  assert.deepEqual(buildArgs({ mode: "apply", arg: "50" }), ["--apply", "--limit=50"]);
});

test("parseCounts: dry-run stdout", () => {
  const stdout = "\n===== ORPHAN-SOURCE REMEDIATION (DRY-RUN) =====\norphans to register: 12\n\n  T2 regulator ...\n\nDRY-RUN — 12 would be registered (pass --apply)\n";
  assert.deepEqual(parseCounts(stdout), { orphans_found: 12, would_register: 12 });
});

test("parseCounts: apply stdout with a failure", () => {
  const stdout = "orphans to register: 3\n\nregistered/activated=2 failed=1\n";
  assert.deepEqual(parseCounts(stdout), { orphans_found: 3, registered: 2, failed: 1 });
});

test("parseCounts: unrecognized stdout returns {} without throwing", () => {
  assert.deepEqual(parseCounts("garbage\n"), {});
  assert.deepEqual(parseCounts(""), {});
});

test("dry: spawns with no flags, reports would_register, applies 0", async () => {
  const calls = [];
  const d = { run: async (argv) => { calls.push(argv); return { code: 0, stdout: "orphans to register: 5\n\nDRY-RUN — 5 would be registered (pass --apply)\n" }; } };
  const s = await main({ mode: "dry" }, d);
  assert.deepEqual(calls[0], []);
  assert.equal(s.step, "remediate-orphan-sources");
  assert.equal(s.counts.orphans_found, 5);
  assert.equal(s.applied, 0, "dry never counts as applied");
  assert.equal(s.read_back.would_register, 5);
  assert.equal(s.exitCode, 0);
});

test("apply: spawns with --apply + --limit, counts registered as applied", async () => {
  const d = { run: async () => ({ code: 0, stdout: "orphans to register: 3\n\nregistered/activated=3 failed=0\n" }) };
  const s = await main({ mode: "apply", arg: "10" }, d);
  assert.equal(s.applied, 3);
  assert.equal(s.read_back.failed, 0);
});

test("a non-zero exit from the target script is surfaced, never silently swallowed", async () => {
  const d = { run: async () => ({ code: 1, stdout: "boom: fatal error\n" }) };
  const s = await main({ mode: "apply" }, d);
  assert.equal(s.exitCode, 1);
  assert.ok(s.note.includes("exited 1"));
  assert.ok(s.stdout_tail.includes("boom"));
});
