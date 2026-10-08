// Tests for emit-source-resolution-artifact.mjs (lane S1-E, 2026-10-05). node:test + node:assert/strict,
// node: builtins and relative imports only (portable, no-npm glob).
// Run: node --test scripts/turns/emit-source-resolution-artifact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRunArtifact, readRunHistory } from "../lib/run-artifact.mjs";
import { recordHarnessRun } from "../lib/record-harness-run.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { STEPS, countsFor, buildArtifact, emit } from "./emit-source-resolution-artifact.mjs";

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "source-resolution-artifact-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The summary shapes the two maintenance steps really print (resolve-provisional-sources.mjs main() and
// recompute-tiers.mjs main()), trimmed to the fields this emitter reads.
const RESOLVE_SUMMARY = {
  step: "resolve-provisional-sources",
  mode: "dry",
  counts: { promote: 7, reject: 1, worklist: 4 },
  host_verdicts: { promoted_by_verdict: 3, flags_resolved: 0 },
  bias_tags: { written: 0, discarded: 0, failed: 0 },
  applied: 0,
  exitCode: 0,
};
const RECOMPUTE_SUMMARY = {
  step: "recompute-tiers",
  mode: "dry",
  counts: {
    sources_scanned: 120,
    override_held: 2,
    scrape_cadence: "off",
    held_cadence_off: 5,
    skipped: 1,
    movements: 9,
    promotions: 6,
    demotions: 3,
  },
  applied: 0,
  exitCode: 0,
};

// recompute-trust-scores.mjs main() (lane TRUST-RET, 2026-10-07), trimmed to the fields this emitter reads.
const TRUST_SUMMARY = {
  step: "recompute-trust-scores",
  mode: "dry",
  counts: { sources_read: 130, sources_scored: 128, skipped_paused: 2 },
  applied: 0,
  exitCode: 0,
};
const SUMMARY_BY_STEP = {
  "resolve-provisional-sources": RESOLVE_SUMMARY,
  "recompute-tiers": RECOMPUTE_SUMMARY,
  "recompute-trust-scores": TRUST_SUMMARY,
};

function writeSummaries(outRoot, over = {}) {
  const set = { ...SUMMARY_BY_STEP, ...over };
  for (const [step, summary] of Object.entries(set)) {
    if (summary === null) continue;
    mkdirSync(join(outRoot, step), { recursive: true });
    writeFileSync(join(outRoot, step, "summary.json"), JSON.stringify(summary));
  }
}

test("STEPS: the three maintenance steps this family runs, in the workflow's own order", () => {
  assert.deepEqual([...STEPS], ["resolve-provisional-sources", "recompute-tiers", "recompute-trust-scores"]);
});

test("countsFor: resolve-provisional-sources reads resolved, promoted, rejected, worklisted and verdict-placed", () => {
  assert.deepEqual(countsFor("resolve-provisional-sources", RESOLVE_SUMMARY), {
    sources_resolved: 12,
    promoted: 7,
    rejected: 1,
    worklisted: 4,
    verdict_placed: 3,
    bias_tags_written: 0,
    rows_applied: 0,
  });
});

test("countsFor: recompute-tiers reads the planned or applied tier movements", () => {
  assert.deepEqual(countsFor("recompute-tiers", RECOMPUTE_SUMMARY), {
    sources_scanned: 120,
    tier_movements: 9,
    tier_promotions: 6,
    tier_demotions: 3,
    override_held: 2,
    held_cadence_off: 5,
    movements_applied: 0,
  });
});

test("countsFor: recompute-trust-scores reads the scored, held and written counts; a paused or empty summary is null, never a made-up zero", () => {
  assert.deepEqual(countsFor("recompute-trust-scores", TRUST_SUMMARY), { sources_scored: 128, skipped_paused: 2, scores_applied: 0 });
  assert.equal(countsFor("recompute-trust-scores", { ...TRUST_SUMMARY, mode: "apply", applied: 126 }).scores_applied, 126);
  const paused = { step: "recompute-trust-scores", mode: "dry", paused: true, counts: {}, applied: 0, exitCode: 0 };
  assert.deepEqual(countsFor("recompute-trust-scores", paused), { sources_scored: null, skipped_paused: null, scores_applied: 0 });
  assert.equal(countsFor("recompute-trust-scores", null), null);
});

test("countsFor: a step that never wrote a summary, or a summary missing fields, yields null, never a made-up zero", () => {
  assert.equal(countsFor("recompute-tiers", null), null);
  const partial = countsFor("resolve-provisional-sources", { counts: { promote: 2 } });
  assert.equal(partial.promoted, 2);
  assert.equal(partial.rejected, null);
  assert.equal(partial.sources_resolved, null);
  assert.equal(partial.verdict_placed, null);
});

test("buildArtifact: both steps clean -> per_item carries each step's counts, metrics roll them up, upstream recorded, validator-clean", () => {
  const artifact = buildArtifact({
    runId: "source-resolution-run-001",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "dry",
    upstreamName: "Brief apply",
    upstreamRunId: "555",
    stepResults: STEPS.map((step) => ({
      step,
      ran: true,
      exitCode: 0,
      summary: SUMMARY_BY_STEP[step],
      pathRel: `x/${step}/summary.json`,
    })),
  });
  assert.equal(artifact.harness_family, "source-resolution");
  assert.equal(artifact.upstream_run_id, "555");
  assert.equal(artifact.config.upstream_name, "Brief apply");
  assert.deepEqual(artifact.per_item.map((p) => p.outcome), ["clean", "clean", "clean"]);
  assert.equal(artifact.per_item[0].counts.promoted, 7);
  assert.equal(artifact.per_item[1].counts.tier_movements, 9);
  assert.deepEqual(artifact.per_item[2].counts, { sources_scored: 128, skipped_paused: 2, scores_applied: 0 });
  assert.equal(artifact.metrics.trust_sources_scored, 128);
  assert.equal(artifact.metrics.trust_scores_applied, 0);
  assert.equal(artifact.metrics.steps_with_summary, 3);
  assert.equal(artifact.metrics.steps_nonzero_exit, 0);
  assert.equal(artifact.metrics.sources_resolved, 12);
  assert.equal(artifact.metrics.sources_promoted, 7);
  assert.equal(artifact.metrics.verdict_placed, 3);
  assert.equal(artifact.metrics.tier_movements, 9);
  assert.deepEqual(artifact.defects_found, []);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: a hand dispatch has no upstream, so the artifact carries no upstream_run_id key at all", () => {
  const artifact = buildArtifact({
    runId: "source-resolution-run-002",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "dry",
    upstreamName: "",
    upstreamRunId: "",
    stepResults: STEPS.map((step) => ({ step, ran: false, exitCode: null, summary: null, pathRel: null })),
  });
  assert.equal("upstream_run_id" in artifact, false);
  assert.equal(artifact.config.upstream_run_id, null);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: step one failed, step two never ran -> nonzero_exit then skipped, one defect naming the step, null metrics for the unrun step", () => {
  const artifact = buildArtifact({
    runId: "source-resolution-run-003",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "apply",
    upstreamName: "Research walker",
    upstreamRunId: "777",
    stepResults: [
      { step: "resolve-provisional-sources", ran: true, exitCode: 1, summary: { exitCode: 1, error: "db timeout" }, pathRel: "x/r/summary.json" },
      { step: "recompute-tiers", ran: false, exitCode: null, summary: null, pathRel: null },
      { step: "recompute-trust-scores", ran: false, exitCode: null, summary: null, pathRel: null },
    ],
  });
  assert.deepEqual(artifact.per_item.map((p) => p.outcome), ["nonzero_exit", "skipped", "skipped"]);
  assert.equal(artifact.metrics.steps_nonzero_exit, 1);
  assert.equal(artifact.metrics.tier_movements, null);
  assert.equal(artifact.metrics.trust_sources_scored, null);
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].root_cause, /resolve-provisional-sources: exitCode=1/);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

// End to end over fixtures: both steps' summary.json on disk, the emitter writes the artifact, the trigger and
// run ids are stamped, the validator accepts it, and record-harness-run's own insert path takes it (fake client).
test("emit: a chained build-mode firing writes a validator-clean artifact with both steps' counts and the trigger fields, and record-harness-run lands it", async () => {
  const keys = ["GITHUB_EVENT_NAME", "GITHUB_RUN_ID", "CHAINED_FORCED_DRY", "GITHUB_EVENT_WORKFLOW_RUN_ID"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.GITHUB_EVENT_NAME = "workflow_run";
  process.env.GITHUB_RUN_ID = "9001";
  process.env.CHAINED_FORCED_DRY = "true";
  delete process.env.GITHUB_EVENT_WORKFLOW_RUN_ID;
  const dir = mkdtempSync(join(tmpdir(), "source-resolution-e2e-"));
  try {
    const outRoot = join(dir, "out");
    const familyDir = join(dir, "family");
    writeSummaries(outRoot);
    const { outPath } = emit({
      env: {
        SR_MODE: "dry",
        SR_STARTED_AT: "2026-10-05T10:00:00Z",
        SR_OUT_ROOT: outRoot,
        SR_UPSTREAM_NAME: "Brief apply",
        SR_UPSTREAM_RUN_ID: "555",
      },
      familyDir,
    });
    const onDisk = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(onDisk.run_id, "source-resolution-run-001");
    assert.equal(onDisk.trigger, "workflow_run_forced_dry");
    assert.equal(onDisk.upstream_run_id, "555");
    assert.equal(onDisk.config.github_run_id, "9001");
    assert.equal(onDisk.config.mode, "dry");
    assert.deepEqual(onDisk.per_item.map((p) => p.id), [...STEPS]);
    assert.equal(onDisk.per_item[0].counts.sources_resolved, 12);
    assert.equal(onDisk.per_item[1].counts.tier_movements, 9);
    assert.equal(onDisk.per_item[2].counts.sources_scored, 128);
    assert.deepEqual(validateRunArtifact(onDisk), []);
    assert.equal(readRunHistory(familyDir).invalid.length, 0);

    const inserted = [];
    const sb = { from: (table) => ({ insert: async (row) => { inserted.push({ table, row }); return { error: null }; } }) };
    const res = await recordHarnessRun(sb, onDisk, { readAllFn: async () => [] });
    assert.equal(res.ok, true);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].table, "harness_runs");
    assert.equal(inserted[0].row.harness_family, "source-resolution");
    assert.equal(inserted[0].row.trigger, "workflow_run_forced_dry");
    assert.equal(inserted[0].row.upstream_run_id, "555");
    assert.equal(inserted[0].row.github_run_id, "9001");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("emit: with a step's summary missing the run still records, the unrun step is skipped", () => {
  withTmpDir((dir) => {
    const outRoot = join(dir, "out");
    writeSummaries(outRoot, { "recompute-tiers": null });
    const { artifact } = emit({
      env: { SR_MODE: "dry", SR_OUT_ROOT: outRoot, SR_UPSTREAM_NAME: "", SR_UPSTREAM_RUN_ID: "" },
      familyDir: join(dir, "family"),
    });
    assert.deepEqual(artifact.per_item.map((p) => p.outcome), ["clean", "skipped", "clean"]);
    assert.equal(artifact.metrics.steps_with_summary, 2);
  });
});

test("governing files: the family descriptor lists the workflow and this emitter", () => {
  assert.deepEqual(GOVERNING_FILES["source-resolution"], [
    "../.github/workflows/source-resolution.yml",
    "scripts/turns/emit-source-resolution-artifact.mjs",
  ]);
});

// ── lane CHAIN-2 (2026-10-07, ADR-031): an explicit loop run id beats the on-disk resolver ───────────────
// A CI checkout holds no upstream artifact file (artifacts land only in harness_runs), so the disk resolver
// returns null for a chained firing. The workflow reads the upstream row's loop id and passes it explicitly.

test("source-resolution: emit records the explicit loop run id when the disk resolver finds nothing", () => {
  withTmpDir((dir) => {
    const { artifact } = emit({ env: { SR_MODE: "dry", SR_UPSTREAM_NAME: "Brief apply", SR_UPSTREAM_RUN_ID: "999999104", SR_LOOP_RUN_ID: "explicit-loop-id-7" }, familyDir: join(dir, "family") });
    assert.equal(artifact.config.loop_run_id, "explicit-loop-id-7");
    assert.deepEqual(validateRunArtifact(artifact), []);
  });
});

test("source-resolution: emit with no explicit loop run id and nothing on disk records null (never invented)", () => {
  withTmpDir((dir) => {
    const { artifact } = emit({ env: { SR_MODE: "dry", SR_UPSTREAM_NAME: "Brief apply", SR_UPSTREAM_RUN_ID: "999999104" }, familyDir: join(dir, "family") });
    assert.equal(artifact.config.loop_run_id, null);
  });
});
