// apply-record-briefs.test.mjs - the PURE plan-builder coverage for the brief-apply driver (task 3.4,
// brief-chain build plan Part 3, 2026-09-11). Covers exactly what the brief's own gate names: order,
// skip-on-stale-hash, and the per-item outcome vocabulary - never the I/O-bearing per-item executor
// (applyOneEntry), which calls the live canonical-pipeline.ts functions (sectionBrief/groundBrief/
// growSources call svc() internally and accept no injected client, so they cannot be driven by a fake
// client the way generateBriefFromInjected's own tests do - the same "not unit-tested directly" posture
// run-population-flywheel.mjs's own step handlers/runFlywheelForOneArtifact already carry, per that
// module's own test file header).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  buildApplyPlan,
  APPLY_STEP_ORDER,
  ENTITIES_MODULE_NOT_PRESENT,
  DEFAULT_HARNESS_RUNS_DIR,
  importLinkItemEntities,
} from "./apply-record-briefs.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --briefs is required", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--briefs/);
});

test("parseArgs: dry is the default (no --execute)", () => {
  const r = parseArgs(["--briefs", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.execute, false);
  assert.equal(r.limit, null);
  assert.equal(r.afterId, null);
  assert.equal(r.allowBriefOverwrite, false);
  assert.equal(r.harnessRunsDir, null);
});

test("parseArgs: --execute, --limit, --after-id, --allow-brief-overwrite, --harness-runs-dir all thread through", () => {
  const r = parseArgs([
    "--briefs", "x.json",
    "--execute",
    "--limit", "5",
    "--after-id", "11111111-1111-1111-1111-111111111111",
    "--allow-brief-overwrite",
    "--harness-runs-dir", "scripts/tmp/brief-apply",
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.execute, true);
  assert.equal(r.limit, 5);
  assert.equal(r.afterId, "11111111-1111-1111-1111-111111111111");
  assert.equal(r.allowBriefOverwrite, true);
  assert.equal(r.harnessRunsDir, "scripts/tmp/brief-apply");
});

test("parseArgs: --limit must be a non-negative integer", () => {
  const r = parseArgs(["--briefs", "x.json", "--limit", "-1"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--limit/);
});

test("parseArgs: --limit rejects a non-numeric string", () => {
  const r = parseArgs(["--briefs", "x.json", "--limit", "five"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--limit/);
});

test("parseArgs: --limit 0 is valid (process nothing this dispatch)", () => {
  const r = parseArgs(["--briefs", "x.json", "--limit", "0"]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, 0);
});

test("parseArgs: --help short-circuits without requiring --briefs", () => {
  const r = parseArgs(["--help"]);
  assert.equal(r.ok, true);
  assert.equal(r.help, true);
});

test("parseArgs: an unknown flag is a hard error (strict:true)", () => {
  const r = parseArgs(["--briefs", "x.json", "--bogus"]);
  assert.equal(r.ok, false);
});

// ── APPLY_STEP_ORDER - the per-item outcome vocabulary's own step namespace ─────────────────────────────

test("APPLY_STEP_ORDER: the exact 8-step order the module header documents", () => {
  assert.deepEqual(APPLY_STEP_ORDER, [
    "generate",
    "section",
    "ground",
    "grow",
    "discovery",
    "forward-events",
    "compliance-deadline",
    "entities",
  ]);
});

test("ENTITIES_MODULE_NOT_PRESENT: the exact named skip outcome the pre-flight note requires", () => {
  assert.equal(ENTITIES_MODULE_NOT_PRESENT, "entities: module not present on this branch");
});

test("DEFAULT_HARNESS_RUNS_DIR: resolves under scripts/harness-runs/brief-apply", () => {
  assert.match(DEFAULT_HARNESS_RUNS_DIR.replaceAll("\\", "/"), /scripts\/harness-runs\/brief-apply$/);
});

// ── entities pre-flight: lane/w9-part1-2026-09-11's src/lib/entities/link-item-entities.mjs is NOT on
// this branch (see the module's own PRE-FLIGHT header note) - importLinkItemEntities() must degrade to a
// named skip, not throw, so this lane builds and tests green now and gains the real link the moment Part
// 1 merges (same test, real skip-to-real-import flip, no code change needed here). If this test starts
// failing because it returns a function, Part 1 has merged - update this assertion, do not delete it. ────

test("importLinkItemEntities: returns null (named skip) when Part 1's module is not present on this branch", async () => {
  const fn = await importLinkItemEntities();
  assert.equal(fn, null);
});

// ── buildApplyPlan: order ───────────────────────────────────────────────────────────────────────────────

function entry(id, hash = "h") {
  return { item_id: id, source_pool_hash: hash, body: "body", metadata: {}, claims: [] };
}

test("buildApplyPlan: preserves file entry order with no --limit/--after-id", () => {
  const entries = [entry("a"), entry("b"), entry("c")];
  const plan = buildApplyPlan(entries, {});
  assert.deepEqual(plan.map((p) => p.itemId), ["a", "b", "c"]);
});

test("buildApplyPlan: --limit caps the plan to the first N entries, in file order", () => {
  const entries = [entry("a"), entry("b"), entry("c")];
  const plan = buildApplyPlan(entries, { limit: 2 });
  assert.deepEqual(plan.map((p) => p.itemId), ["a", "b"]);
});

test("buildApplyPlan: --limit 0 selects nothing", () => {
  const entries = [entry("a"), entry("b")];
  const plan = buildApplyPlan(entries, { limit: 0 });
  assert.deepEqual(plan, []);
});

test("buildApplyPlan: --after-id resumes strictly AFTER the named item, in file order", () => {
  const entries = [entry("a"), entry("b"), entry("c"), entry("d")];
  const plan = buildApplyPlan(entries, { afterId: "b" });
  assert.deepEqual(plan.map((p) => p.itemId), ["c", "d"]);
});

test("buildApplyPlan: --after-id naming an id not in the file leaves the plan unchanged (never guesses)", () => {
  const entries = [entry("a"), entry("b")];
  const plan = buildApplyPlan(entries, { afterId: "does-not-exist" });
  assert.deepEqual(plan.map((p) => p.itemId), ["a", "b"]);
});

test("buildApplyPlan: --after-id and --limit compose (resume, then cap)", () => {
  const entries = [entry("a"), entry("b"), entry("c"), entry("d")];
  const plan = buildApplyPlan(entries, { afterId: "a", limit: 2 });
  assert.deepEqual(plan.map((p) => p.itemId), ["b", "c"]);
});

// ── buildApplyPlan: skip-on-stale-hash ────────────────────────────────────────────────────────────────

test("buildApplyPlan: a matching current hash is not skipped, and carries the full step order", () => {
  const entries = [entry("a", "hash-a")];
  const plan = buildApplyPlan(entries, { currentHashByItemId: { a: "hash-a" } });
  assert.equal(plan[0].skip, false);
  assert.equal(plan[0].skipReason, null);
  assert.deepEqual(plan[0].steps, APPLY_STEP_ORDER);
});

test("buildApplyPlan: a mismatched current hash is skipped, naming BOTH hashes in the reason, with zero steps", () => {
  const entries = [entry("a", "hash-stale")];
  const plan = buildApplyPlan(entries, { currentHashByItemId: { a: "hash-current" } });
  assert.equal(plan[0].skip, true);
  assert.match(plan[0].skipReason, /stale pool/);
  assert.match(plan[0].skipReason, /hash-stale/);
  assert.match(plan[0].skipReason, /hash-current/);
  assert.deepEqual(plan[0].steps, []);
});

test("buildApplyPlan: an item id absent from currentHashByItemId is NOT treated as stale (never guesses a verdict it cannot support)", () => {
  const entries = [entry("a", "hash-a")];
  const plan = buildApplyPlan(entries, { currentHashByItemId: {} });
  assert.equal(plan[0].skip, false);
  assert.deepEqual(plan[0].steps, APPLY_STEP_ORDER);
});

test("buildApplyPlan: a mixed batch skips only the stale entry, in file order, the rest proceed", () => {
  const entries = [entry("a", "match"), entry("b", "stale"), entry("c", "match")];
  const plan = buildApplyPlan(entries, {
    currentHashByItemId: { a: "match", b: "current", c: "match" },
  });
  assert.deepEqual(
    plan.map((p) => ({ id: p.itemId, skip: p.skip })),
    [
      { id: "a", skip: false },
      { id: "b", skip: true },
      { id: "c", skip: false },
    ],
  );
});

test("buildApplyPlan: an empty entries array plans nothing", () => {
  assert.deepEqual(buildApplyPlan([], {}), []);
});

test("buildApplyPlan: each planned entry retains the original entry object (the executor's own input)", () => {
  const e = entry("a", "hash-a");
  const plan = buildApplyPlan([e], { currentHashByItemId: { a: "hash-a" } });
  assert.equal(plan[0].entry, e);
});
