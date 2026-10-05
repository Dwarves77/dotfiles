// run-propagation-drain.test.mjs — proves arg parsing and the DrainResult -> per_item/metrics shaping.
// Importing this module never invokes main() (IS_MAIN guard) and never touches supabase-js — this file
// exercises only the pure exports, so it needs no npm dependency (no `npm ci` required to run it).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs, shapeRunOutput, resolveArtifactTrigger, PROPAGATION_GOVERNING_FILES } from "./run-propagation-drain.mjs";
import { resolveLoopRunIdFromUpstream } from "../lib/loop-run-id.mjs";

// ── resolveArtifactTrigger (lane LOOP-B-FIRING, 2026-09-28, F50) ────────────────────────────────────

test("resolveArtifactTrigger: null triggerContext (a plain hand dispatch) resolves workflow_dispatch", () => {
  assert.equal(resolveArtifactTrigger(null), "workflow_dispatch");
});

test("resolveArtifactTrigger: a populated triggerContext (chained off Data producers/Downstream chain) resolves workflow_run", () => {
  assert.equal(
    resolveArtifactTrigger({ name: "Data producers", run_id: 123, conclusion: "success" }),
    "workflow_run",
  );
});

// ── resolveArtifactTrigger: explicit trigger override (lane LOOP-B-FIRING, F60 explicit-dispatch fallback) ──

test("resolveArtifactTrigger: an explicit trigger wins even when triggerContext is populated (the F60 fallback case: real event is workflow_dispatch, but a rebuilt triggerContext exists for loop_run_id resolution)", () => {
  assert.equal(
    resolveArtifactTrigger({ name: "Downstream chain", run_id: 5005, conclusion: "success" }, "workflow_dispatch"),
    "workflow_dispatch",
  );
});

test("resolveArtifactTrigger: an explicit trigger of workflow_run wins over a null triggerContext too", () => {
  assert.equal(resolveArtifactTrigger(null, "workflow_run"), "workflow_run");
});

test("resolveArtifactTrigger: an invalid/absent explicit trigger falls back to the triggerContext-presence rule", () => {
  assert.equal(resolveArtifactTrigger(null, null), "workflow_dispatch");
  assert.equal(resolveArtifactTrigger({ name: "X", run_id: 1, conclusion: "success" }, undefined), "workflow_run");
});

// ── parseArgs: --trigger (lane LOOP-B-FIRING, F50/F60) ───────────────────────────────────────────────

test("parseArgs: --trigger is null by default", () => {
  const r = parseArgs(["--mode", "dry"]);
  assert.equal(r.ok, true);
  assert.equal(r.trigger, null);
});

test("parseArgs: --trigger accepts workflow_run", () => {
  const r = parseArgs(["--mode", "dry", "--trigger", "workflow_run"]);
  assert.equal(r.ok, true);
  assert.equal(r.trigger, "workflow_run");
});

test("parseArgs: --trigger accepts workflow_dispatch", () => {
  const r = parseArgs(["--mode", "dry", "--trigger", "workflow_dispatch"]);
  assert.equal(r.ok, true);
  assert.equal(r.trigger, "workflow_dispatch");
});

test("parseArgs: --trigger rejects an unrecognized value", () => {
  const r = parseArgs(["--mode", "dry", "--trigger", "push"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--trigger must be/);
});

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
  assert.match(perItem[0].verdict, /dry, nothing written/);
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

// ── questions on change (lane L4-A, 2026-10-05) ─────────────────────────────────────────────────────

import { questionsOnChangeStep, questionsOnChangeMetrics } from "./run-propagation-drain.mjs";

const QOC_ENTITY = "cl:jurisdiction:aaaaaaaaaaaaaaaa";

/** A fake Supabase client for the entity-to-item read (entities, intelligence_items, entity_refs). */
function qocSb() {
  const tables = {
    entities: [{ entity_id: QOC_ENTITY, kind: "jurisdiction", canonical_name: "Fixture jurisdiction" }],
    intelligence_items: [
      { id: "a", title: "Reg a", domain: 1, item_type: "regulation", provenance_status: "verified", is_archived: false },
      { id: "b", title: "Reg b", domain: 1, item_type: "regulation", provenance_status: "verified", is_archived: false },
      { id: "gone", title: "Reg gone", domain: 1, item_type: "regulation", provenance_status: "verified", is_archived: true },
    ],
    entity_refs: ["a", "b", "gone"].map((id) => ({ ref_table: "intelligence_items", ref_id: id, entity_id: QOC_ENTITY, role: "jurisdiction" })),
  };
  return {
    from(table) {
      const filters = [];
      let range = null;
      const b = {
        select() { return b; },
        eq(c, v) { filters.push((r) => r[c] === v); return b; },
        in(c, vs) { filters.push((r) => vs.includes(r[c])); return b; },
        order() { return b; },
        range(f, t) { range = [f, t]; return b; },
        async maybeSingle() { return { data: (tables[table] || []).find((r) => filters.every((fn) => fn(r))) ?? null, error: null }; },
        then(res, rej) {
          let rows = (tables[table] || []).filter((r) => filters.every((fn) => fn(r)));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}

function qocDb() {
  const inserted = [];
  return {
    inserted,
    async readAll() { return []; },
    async guardedInsertMany(table, rows, opts) { inserted.push({ table, rows, cite: opts.cite }); return { inserted: rows.length, snapshot: "s" }; },
  };
}

const QOC_RESULT = {
  processedEvents: [{ eventId: 5, tableName: "derived_values", rowPk: "dv-1", entityId: QOC_ENTITY, changeKind: "update", occurredAt: "2026-10-05T00:00:00Z" }],
};

test("questionsOnChangeStep apply: raises the questions for the two verified, non-archived linked items through the guarded writer", async () => {
  const db = qocDb();
  const summary = await questionsOnChangeStep({ mode: "apply", result: QOC_RESULT, sb: qocSb(), db });
  assert.equal(summary.counts.items_affected, 2);
  assert.equal(summary.applied, 8);
  assert.equal(db.inserted[0].table, "integrity_flags");
  assert.match(db.inserted[0].cite.reason, /questions on change/);
});

test("questionsOnChangeStep dry: same counts, nothing written", async () => {
  const db = qocDb();
  const summary = await questionsOnChangeStep({ mode: "dry", result: QOC_RESULT, sb: qocSb(), db });
  assert.equal(db.inserted.length, 0);
  assert.equal(summary.counts.new, 8);
  assert.equal(summary.applied, 0);
});

test("questionsOnChangeStep: a drain result with no processed events does nothing", async () => {
  const db = qocDb();
  const summary = await questionsOnChangeStep({ mode: "apply", result: { processedEvents: [] }, sb: qocSb(), db });
  assert.equal(summary.counts.events_seen, 0);
  assert.equal(db.inserted.length, 0);
});

test("questions-on-change counts land in the run artifact metrics (qoc_*)", async () => {
  const summary = await questionsOnChangeStep({ mode: "dry", result: QOC_RESULT, sb: qocSb(), db: qocDb() });
  const { metrics } = shapeRunOutput(baseResult(), "/tmp/report.json", summary);
  assert.equal(metrics.qoc_events_seen, 1);
  assert.equal(metrics.qoc_events_mapped, 1);
  assert.equal(metrics.qoc_items_affected, 2);
  assert.equal(metrics.qoc_questions_raised, 8);
  assert.equal(metrics.qoc_questions_deduplicated, 0);
  assert.equal(metrics.qoc_items_capped, 0);
  assert.deepEqual(questionsOnChangeMetrics(null), {});
  assert.equal(shapeRunOutput(baseResult(), "/tmp/report.json").metrics.qoc_events_seen, undefined);
});
