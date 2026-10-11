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

// ---- DATA-1 (2026-10-11): REG-1 deleted the spawn target as a "duplicate" and the wrapper exited 1 ----------------------
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("RED then GREEN: the wrapper's spawn target exists on disk and prints the summary lines parseCounts reads", () => {
  const target = fileURLToPath(new URL("../verify/remediate-orphan-sources.mjs", import.meta.url));
  assert.ok(existsSync(target), "scripts/verify/remediate-orphan-sources.mjs is the wrapper's spawn target; deleting it breaks the maintenance step");
  const src = readFileSync(target, "utf8");
  assert.match(src, /orphans to register: \$\{orphans\.length\}/);
  assert.match(src, /registered\/activated=\$\{registered\}\s+failed=\$\{failed\}/);
  assert.match(src, /DRY-RUN: \$\{Math\.min\(orphans\.length, LIMIT\)\} would be registered/);
});

test("parseCounts: the target's current dry-run line (colon form) and the older dash form both parse", () => {
  assert.deepEqual(parseCounts("orphans to register: 2\nDRY-RUN: 2 would be registered (pass --apply)\n"), { orphans_found: 2, would_register: 2 });
  assert.deepEqual(parseCounts("DRY-RUN — 4 would be registered (pass --apply)"), { would_register: 4 }); // glyph:verbatim (the older target printed the em dash form)
});
