// run-propagation-drain.test.mjs — proves arg parsing and the DrainResult -> per_item/metrics shaping.
// Importing this module never invokes main() (IS_MAIN guard) and never touches supabase-js — this file
// exercises only the pure exports, so it needs no npm dependency (no `npm ci` required to run it).
import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, shapeRunOutput, PROPAGATION_GOVERNING_FILES } from "./run-propagation-drain.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --mode is required", () => {
  assert.equal(parseArgs([]).ok, false);
});

test("parseArgs: unknown --mode value is refused", () => {
  const r = parseArgs(["--mode", "sideways"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: a valid --mode dry parses with the default batch", () => {
  const r = parseArgs(["--mode", "dry"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "dry");
  assert.equal(r.batch, 500);
});

test("parseArgs: --mode apply with an explicit --batch parses", () => {
  const r = parseArgs(["--mode", "apply", "--batch", "50"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "apply");
  assert.equal(r.batch, 50);
});

test("parseArgs RED: a non-positive --batch is refused", () => {
  assert.equal(parseArgs(["--mode", "dry", "--batch", "0"]).ok, false);
  assert.equal(parseArgs(["--mode", "dry", "--batch", "-1"]).ok, false);
  assert.equal(parseArgs(["--mode", "dry", "--batch", "not-a-number"]).ok, false);
});

test("parseArgs: --harness-runs-dir and --out-dir pass through when given", () => {
  const r = parseArgs(["--mode", "dry", "--harness-runs-dir", "/tmp/hr", "--out-dir", "/tmp/out"]);
  assert.equal(r.ok, true);
  assert.equal(r.harnessRunsDir, "/tmp/hr");
  assert.equal(r.outDir, "/tmp/out");
});

// ── shapeRunOutput ───────────────────────────────────────────────────────────────────────────────

function baseResult(overrides = {}) {
  return {
    mode: "dry",
    queueDepthBefore: 4,
    eventsConsidered: 4,
    eventsDrained: 0,
    invalidated: 7,
    recomputed: 0,
    skippedUnknownMethod: 0,
    skippedMethodRefused: 0,
    superseded: [],
    errors: [],
    ...overrides,
  };
}

test("shapeRunOutput dry: names the counted-not-written outcome, no per_item entries for superseded (none exist)", () => {
  const { perItem, metrics } = shapeRunOutput(baseResult(), "/tmp/report.json");
  assert.equal(perItem.length, 1);
  assert.equal(perItem[0].outcome, "drained");
  assert.match(perItem[0].verdict, /dry — nothing written/);
  assert.equal(metrics.mode, "dry");
  assert.equal(metrics.queue_depth_before, 4);
  assert.equal(metrics.invalidated, 7);
  assert.equal(metrics.recomputed, 0);
});

test("shapeRunOutput apply: one per_item entry per superseded value, plus the summary row", () => {
  const result = baseResult({
    mode: "apply",
    eventsDrained: 4,
    recomputed: 2,
    superseded: [
      { from: "aaaa", to: "bbbb" },
      { from: "cccc", to: "dddd" },
    ],
  });
  const { perItem, metrics } = shapeRunOutput(result, "/tmp/report.json");
  assert.equal(perItem.length, 3); // 1 summary + 2 superseded
  assert.equal(perItem[0].outcome, "drained");
  assert.match(perItem[0].verdict, /4 event\(s\) drained/);
  assert.equal(perItem[1].outcome, "recomputed");
  assert.equal(perItem[1].id, "bbbb");
  assert.match(perItem[1].verdict, /supersedes aaaa/);
  assert.equal(metrics.mode, "apply");
  assert.equal(metrics.recomputed, 2);
});

test("shapeRunOutput: a run with errors marks the summary row 'error' and surfaces the messages", () => {
  const result = baseResult({ errors: [{ eventId: 3, message: "invalidate_dependents: boom" }] });
  const { perItem, metrics } = shapeRunOutput(result, "/tmp/report.json");
  assert.equal(perItem[0].outcome, "error");
  assert.match(perItem[0].error, /event 3: invalidate_dependents: boom/);
  assert.equal(metrics.errors, 1);
});

test("shapeRunOutput: metrics always names every standing metric key, even when zero", () => {
  const { metrics } = shapeRunOutput(baseResult(), "/tmp/report.json");
  for (const key of [
    "mode", "queue_depth_before", "events_considered", "events_drained",
    "invalidated", "recomputed", "skipped_unknown_method", "skipped_method_refused", "errors",
  ]) {
    assert.ok(key in metrics, `missing metric key: ${key}`);
  }
});

// ── PROPAGATION_GOVERNING_FILES ─────────────────────────────────────────────────────────────────

test("PROPAGATION_GOVERNING_FILES names the driver plus drain.ts and admissible-for.ts", () => {
  assert.deepEqual(PROPAGATION_GOVERNING_FILES, [
    "scripts/turns/run-propagation-drain.mjs",
    "src/lib/propagation/drain.ts",
    "src/lib/propagation/admissible-for.ts",
  ]);
});
