// run-propagation-drain.test.mjs — proves arg parsing and the DrainResult -> per_item/metrics shaping.
// Importing this module never invokes main() (IS_MAIN guard) and never touches supabase-js — this file
// exercises only the pure exports, so it needs no npm dependency (no `npm ci` required to run it).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs, shapeRunOutput, PROPAGATION_GOVERNING_FILES } from "./run-propagation-drain.mjs";
import { resolveLoopRunIdFromUpstream } from "../lib/loop-run-id.mjs";

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

// ── parseArgs: --trigger-context (lane CHAIN, 2026-09-04) ───────────────────────────────────────────

test("parseArgs: --trigger-context is null by default", () => {
  const r = parseArgs(["--mode", "dry"]);
  assert.equal(r.ok, true);
  assert.equal(r.triggerContext, null);
});

test("parseArgs: --trigger-context parses a valid JSON object", () => {
  const r = parseArgs([
    "--mode",
    "apply",
    "--trigger-context",
    JSON.stringify({ name: "Data producers", run_id: 987, conclusion: "success" }),
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.triggerContext, { name: "Data producers", run_id: 987, conclusion: "success" });
});

test("parseArgs: --trigger-context rejects malformed JSON", () => {
  const r = parseArgs(["--mode", "dry", "--trigger-context", "{not json"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--trigger-context must be valid JSON/);
});

test("parseArgs: --trigger-context rejects a non-object JSON value", () => {
  const r = parseArgs(["--mode", "dry", "--trigger-context", "[1,2]"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--trigger-context must be a JSON object/);
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

// ── loop_run_id (lane M3b, 2026-09-20) ──────────────────────────────────────────────────────────────
// main() resolves config.loop_run_id from triggerContext?.name / triggerContext?.run_id through
// resolveLoopRunIdFromUpstream, exactly the call shape proven here. main() itself needs live DB creds
// (exits 2 without them), so these tests exercise the same call construction directly rather than
// invoking main().

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "propagation-loop-run-id-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loop_run_id resolution: no trigger context (a plain hand dispatch) resolves null", () => {
  withTmpDir((fsiRoot) => {
    const triggerContext = null;
    const got = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: triggerContext?.name ?? null,
      upstreamRunId: triggerContext?.run_id != null ? String(triggerContext.run_id) : null,
      fsiRoot,
    });
    assert.equal(got, null);
  });
});

test("loop_run_id resolution: a trigger context naming Downstream chain with a matching upstream artifact resolves that artifact's own loop_run_id", () => {
  withTmpDir((fsiRoot) => {
    const dcDir = join(fsiRoot, "scripts", "harness-runs", "downstream-chain");
    mkdirSync(dcDir, { recursive: true });
    writeFileSync(
      join(dcDir, "downstream-chain-run-001.json"),
      JSON.stringify({
        harness_family: "downstream-chain",
        harness_version: "sha256:0000000000000000",
        run_id: "downstream-chain-run-001",
        started_at: new Date().toISOString(),
        config: { github_run_id: "5005", loop_run_id: "loop-x" },
        inputs_ref: ["x"],
        per_item: [],
        metrics: {},
        defects_found: [],
        full_trace_refs: ["x"],
        proposer_notes: "test fixture",
      }, null, 2) + "\n",
      "utf8"
    );

    const triggerContext = { name: "Downstream chain", run_id: 5005, conclusion: "success" };
    const matched = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: triggerContext?.name ?? null,
      upstreamRunId: triggerContext?.run_id != null ? String(triggerContext.run_id) : null,
      fsiRoot,
    });
    assert.equal(matched, "loop-x");

    const otherTriggerContext = { name: "Downstream chain", run_id: 9999, conclusion: "success" };
    const unmatched = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: otherTriggerContext?.name ?? null,
      upstreamRunId: otherTriggerContext?.run_id != null ? String(otherTriggerContext.run_id) : null,
      fsiRoot,
    });
    assert.equal(unmatched, null);
  });
});

test("loop_run_id resolution: a trigger context naming Data producers (its own loop head) resolves null", () => {
  withTmpDir((fsiRoot) => {
    const triggerContext = { name: "Data producers", run_id: 42, conclusion: "success" };
    const got = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: triggerContext?.name ?? null,
      upstreamRunId: triggerContext?.run_id != null ? String(triggerContext.run_id) : null,
      fsiRoot,
    });
    assert.equal(got, null);
  });
});
