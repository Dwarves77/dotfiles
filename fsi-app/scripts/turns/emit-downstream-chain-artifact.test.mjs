// Tests for emit-downstream-chain-artifact.mjs (lane M3, 2026-09-19). node:test + node:assert/strict,
// node: builtins + relative imports only (portable, no-npm glob).
// Run: node --test scripts/turns/emit-downstream-chain-artifact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRunArtifact } from "../lib/run-artifact.mjs";
import { readStepSummary, buildArtifact, termMetrics, termNeedMetrics, STEPS } from "./emit-downstream-chain-artifact.mjs";
import { resolveLoopRunIdFromUpstream } from "../lib/loop-run-id.mjs";

// The harness ledger export is the repo's REAL committed file by default (lane GATE-9), so a fixture test that
// writes artifacts into a temp dir must pin the ledger it resolves against; "absent" is the file-path
// behaviour these fixtures exercise (an artifact is trusted on its own fields when no export is present).
const LEDGER_NONE = { present: false, capturedAt: null, rows: [] };

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "downstream-chain-artifact-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readStepSummary: a missing summary.json (step never ran) -> ran:false, exitCode:null, no crash", () => {
  withTmpDir((dir) => {
    const got = readStepSummary(dir, "tier-opinions");
    assert.deepEqual(got, { step: "tier-opinions", ran: false, exitCode: null, summary: null, pathRel: null });
  });
});

test("readStepSummary: a real summary.json with exitCode:0 -> ran:true, exitCode:0", () => {
  withTmpDir((dir) => {
    mkdirSync(join(dir, "tier-opinions"), { recursive: true });
    writeFileSync(join(dir, "tier-opinions", "summary.json"), JSON.stringify({ exitCode: 0, wrote: 3 }));
    const got = readStepSummary(dir, "tier-opinions");
    assert.equal(got.ran, true);
    assert.equal(got.exitCode, 0);
    assert.deepEqual(got.summary, { exitCode: 0, wrote: 3 });
    assert.ok(got.pathRel);
  });
});

test("readStepSummary: a nonzero exitCode is read back honestly", () => {
  withTmpDir((dir) => {
    mkdirSync(join(dir, "derive-obligations"), { recursive: true });
    writeFileSync(join(dir, "derive-obligations", "summary.json"), JSON.stringify({ exitCode: 1, error: "boom" }));
    const got = readStepSummary(dir, "derive-obligations");
    assert.equal(got.exitCode, 1);
  });
});

test("readStepSummary: unparseable JSON -> ran:true, exitCode:null, never throws", () => {
  withTmpDir((dir) => {
    mkdirSync(join(dir, "tag-proposals"), { recursive: true });
    writeFileSync(join(dir, "tag-proposals", "summary.json"), "{not json");
    const got = readStepSummary(dir, "tag-proposals");
    assert.equal(got.ran, true);
    assert.equal(got.exitCode, null);
  });
});

function fourCleanSteps() {
  return STEPS.map((step) => ({ step, ran: true, exitCode: 0, summary: { exitCode: 0 }, pathRel: `x/${step}/summary.json` }));
}

test("buildArtifact: all steps clean -> per_item all 'clean', metrics.steps_nonzero_exit=0, validateRunArtifact-clean", () => {
  const artifact = buildArtifact({
    runId: "downstream-chain-run-001",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "apply",
    skip: false,
    skipReason: "",
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    stepResults: fourCleanSteps(),
  });
  assert.equal(artifact.metrics.steps_run, STEPS.length);
  assert.equal(artifact.metrics.steps_nonzero_exit, 0);
  assert.ok(artifact.per_item.every((p) => p.outcome === "clean"));
  assert.deepEqual(artifact.defects_found, []);
  assert.equal(artifact.config.upstream_name, "Population turn");
  assert.equal(artifact.config.upstream_run_id, "12345");
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: a skipped (no-op) dispatch -> every step 'skipped', a non-empty full_trace_refs fallback, still validateRunArtifact-clean", () => {
  const artifact = buildArtifact({
    runId: "downstream-chain-run-002",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "apply",
    skip: true,
    skipReason: "upstream run 999 (Corpus turn) concluded failure, not success -- no-op",
    upstreamName: "Corpus turn",
    upstreamRunId: "999",
    stepResults: STEPS.map((step) => ({ step, ran: false, exitCode: null, summary: null, pathRel: null })),
  });
  assert.ok(artifact.per_item.every((p) => p.outcome === "skipped"));
  assert.equal(artifact.config.skip, true);
  assert.match(artifact.config.skip_reason, /concluded failure/);
  assert.ok(artifact.full_trace_refs.length > 0, "full_trace_refs must be non-empty even on a fully-skipped run");
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: one step nonzero exit -> that step 'nonzero_exit', a defect recorded naming it, others unaffected", () => {
  const steps = fourCleanSteps();
  steps[STEPS.indexOf("derive-obligations")] = { step: "derive-obligations", ran: true, exitCode: 1, summary: { exitCode: 1, error: "db timeout" }, pathRel: "x/derive-obligations/summary.json" };
  const artifact = buildArtifact({
    runId: "downstream-chain-run-003",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "apply",
    skip: false,
    skipReason: "",
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    stepResults: steps,
  });
  assert.equal(artifact.metrics.steps_nonzero_exit, 1);
  assert.equal(artifact.per_item.find((p) => p.id === "derive-obligations").outcome, "nonzero_exit");
  assert.equal(artifact.per_item.find((p) => p.id === "tier-opinions").outcome, "clean");
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, new RegExp(`1 of ${STEPS.length}`));
  assert.match(artifact.defects_found[0].root_cause, /derive-obligations: exitCode=1/);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("STEPS: the maintenance-step names this family always runs, in the workflow's own order", () => {
  assert.deepEqual(STEPS, ["tier-opinions", "recompute-tiers", "derive-obligations", "tag-proposals", "term-recurrence", "raise-term-needs", "apply-classifications"]);
});

// ── loop_run_id (lane M3b, 2026-09-20) ──────────────────────────────────────────────────────────────

test("buildArtifact: loopRunId defaults to null when the caller passes nothing", () => {
  const artifact = buildArtifact({
    runId: "downstream-chain-run-004",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "apply",
    skip: false,
    skipReason: "",
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    stepResults: fourCleanSteps(),
  });
  assert.equal(artifact.config.loop_run_id, null);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: a loopRunId passed by the caller is recorded verbatim on config.loop_run_id", () => {
  const artifact = buildArtifact({
    runId: "downstream-chain-run-005",
    harnessVersion: "sha256:0000000000000000",
    startedAt: new Date().toISOString(),
    mode: "apply",
    skip: false,
    skipReason: "",
    upstreamName: "Population turn",
    upstreamRunId: "12345",
    stepResults: fourCleanSteps(),
    loopRunId: "loop-run-abc-123",
  });
  assert.equal(artifact.config.loop_run_id, "loop-run-abc-123");
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("resolveLoopRunIdFromUpstream fixture: an upstream mint artifact with a matching github_run_id resolves its own loop_run_id; a different run id resolves null", () => {
  withTmpDir((fsiRoot) => {
    const mintDir = join(fsiRoot, "scripts", "harness-runs", "mint");
    mkdirSync(mintDir, { recursive: true });
    writeFileSync(
      join(mintDir, "mint-run-001.json"),
      JSON.stringify({
        harness_family: "mint",
        harness_version: "sha256:0000000000000000",
        run_id: "mint-run-001",
        started_at: new Date().toISOString(),
        config: { github_run_id: "111", loop_run_id: "loop-x" },
        inputs_ref: ["x"],
        per_item: [],
        metrics: {},
        defects_found: [],
        full_trace_refs: ["x"],
        proposer_notes: "test fixture",
      }, null, 2) + "\n",
      "utf8"
    );

    const matched = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Population turn",
      upstreamRunId: "111",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(matched, "loop-x");

    const unmatched = resolveLoopRunIdFromUpstream({
      explicit: null,
      upstreamName: "Population turn",
      upstreamRunId: "999",
      fsiRoot,
      ledger: LEDGER_NONE,
    });
    assert.equal(unmatched, null);
  });
});

// ── term-recurrence counts (lane G5-TERMS, 2026-10-06): detected per detector, proposed, adopted ─────────

const TERM_SUMMARY = {
  step: "term-recurrence",
  mode: "dry",
  exitCode: 0,
  counts: {
    detected_by_detector: { "entity-link": 6, "theme-candidate": 3, "scenario-tag": 3, "compliance-object": 3, "brief-terms": 1 },
    terms_total: 5, proposed: 3, adopted: 2, newly_adopted: 2, notes: ["tables_absent"],
  },
};

test("buildArtifact: metrics.terms carries detected per detector, proposed and adopted from the term-recurrence summary", () => {
  const steps = fourCleanSteps().map((r) => (r.step === "term-recurrence" ? { ...r, summary: TERM_SUMMARY } : r));
  const artifact = buildArtifact({
    runId: "downstream-chain-run-006", harnessVersion: "sha256:0000000000000000", startedAt: new Date().toISOString(),
    mode: "dry", skip: false, skipReason: "", upstreamName: "Population turn", upstreamRunId: "1", stepResults: steps,
  });
  assert.deepEqual(artifact.metrics.terms, {
    mode: "dry",
    detected_by_detector: TERM_SUMMARY.counts.detected_by_detector,
    terms_total: 5, proposed: 3, adopted: 2, newly_adopted: 2, notes: ["tables_absent"],
  });
  assert.ok(artifact.per_item.some((p) => p.id === "term-recurrence" && p.outcome === "clean"));
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("termMetrics: null when the step never ran or left no counts", () => {
  assert.equal(termMetrics(STEPS.map((step) => ({ step, ran: false, exitCode: null, summary: null, pathRel: null }))), null);
  assert.equal(termMetrics([{ step: "term-recurrence", ran: true, exitCode: 0, summary: { exitCode: 0 }, pathRel: "x" }]), null);
});

test("buildArtifact: a skipped chain records metrics.terms null and stays valid", () => {
  const artifact = buildArtifact({
    runId: "downstream-chain-run-007", harnessVersion: "sha256:0000000000000000", startedAt: new Date().toISOString(),
    mode: "dry", skip: true, skipReason: "no-op", upstreamName: "Corpus turn", upstreamRunId: "2",
    stepResults: STEPS.map((step) => ({ step, ran: false, exitCode: null, summary: null, pathRel: null })),
  });
  assert.equal(artifact.metrics.terms, null);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

// ── raise-term-needs counts (lane G5-NEED, 2026-10-07): needs raised, closed, CELEX targets ──────────────

const NEED_SUMMARY = {
  step: "raise-term-needs",
  mode: "dry",
  exitCode: 0,
  counts: {
    adopted_terms: 4, terms_with_holding: 1, term_needs: 3, lineage_celex_targets: 2, lineage_non_celex_needs: 1,
    open_needs_before: 2, would_insert: 2, would_resolve: 1, unchanged: 1, notes: [],
  },
};

test("buildArtifact: metrics.term_needs carries needs raised, closed and the CELEX targets from the raise-term-needs summary", () => {
  const steps = fourCleanSteps().map((r) => (r.step === "raise-term-needs" ? { ...r, summary: NEED_SUMMARY } : r));
  const artifact = buildArtifact({
    runId: "downstream-chain-run-008", harnessVersion: "sha256:0000000000000000", startedAt: new Date().toISOString(),
    mode: "dry", skip: false, skipReason: "", upstreamName: "Population turn", upstreamRunId: "1", stepResults: steps,
  });
  assert.deepEqual(artifact.metrics.term_needs, {
    mode: "dry", adopted_terms: 4, terms_with_holding: 1, term_needs: 3, lineage_celex_targets: 2, lineage_non_celex_needs: 1,
    would_insert: 2, would_resolve: 1, unchanged: 1, notes: [],
  });
  assert.ok(artifact.per_item.some((p) => p.id === "raise-term-needs" && p.outcome === "clean"));
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("termNeedMetrics: null when the step never ran or left no counts; a skipped chain records null", () => {
  assert.equal(termNeedMetrics(STEPS.map((step) => ({ step, ran: false, exitCode: null, summary: null, pathRel: null }))), null);
  assert.equal(termNeedMetrics([{ step: "raise-term-needs", ran: true, exitCode: 0, summary: { exitCode: 0 }, pathRel: "x" }]), null);
});
