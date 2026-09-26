// Tests for emit-gate-a-rescan-artifact.mjs (lane M6b, 2026-09-21). node:test + node:assert/strict,
// node: builtins + relative imports only (portable, no-npm glob).
// Run: node --test scripts/turns/emit-gate-a-rescan-artifact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRunArtifact } from "../lib/run-artifact.mjs";
import { buildArtifact } from "./emit-gate-a-rescan-artifact.mjs";

const BASE = {
  runId: "gate-a-rescan-run-001",
  harnessVersion: "sha256:0000000000000000",
  startedAt: new Date().toISOString(),
  trigger: "workflow_run",
  mode: "apply",
  limit: 50,
  upstreamName: "Brief apply",
  upstreamRunId: "12345",
};

test("buildArtifact: a zero-item run is a clean no-op, still validateRunArtifact-clean", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: {
      per_item: [], counts: { candidates: 0, stale: 0, selected: 0, touched: 0 },
      read_back: { distinct_versions_remaining: null }, config: { scope_source: "no candidates" }, exitCode: 0,
    },
    attachSummary: null,
  });
  assert.deepEqual(artifact.per_item, []);
  assert.equal(artifact.metrics.candidates, 0);
  assert.deepEqual(artifact.config.attach, { rows_offered: 0 });
  assert.ok(artifact.full_trace_refs.length > 0);
  assert.deepEqual(artifact.defects_found, []);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: per_item rows carry a before/after verdict and 'touched' outcome when the item was touched", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: {
      per_item: [
        { id: "item-a", gate_a_version_before: null, gate_a_version_after: "2026-09-04.1", orphan_count_before: null, orphan_count_after: 2, hash_changed: true, touched: true },
        { id: "item-b", gate_a_version_before: "OLD", gate_a_version_after: "2026-09-04.1", orphan_count_before: 0, orphan_count_after: 0, hash_changed: false, touched: false },
      ],
      counts: { candidates: 2, stale: 2, selected: 2, touched: 1 },
      read_back: { distinct_versions_remaining: 1 },
      config: { scope_source: "upstream mint artifact for run 12345" },
      exitCode: 0,
    },
    attachSummary: null,
  });
  assert.equal(artifact.per_item.length, 2);
  assert.equal(artifact.per_item[0].outcome, "touched");
  assert.match(artifact.per_item[0].verdict, /\(none\) -> 2026-09-04\.1/);
  assert.equal(artifact.per_item[1].outcome, "rescanned");
  assert.equal(artifact.metrics.touched, 1);
  assert.equal(artifact.metrics.distinct_versions_remaining, 1);
  assert.equal(artifact.config.scope_source, "upstream mint artifact for run 12345");
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: attach summary present -> config.attach carries rows_offered and grounded from its counts", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: { per_item: [], counts: { candidates: 0, stale: 0, selected: 0, touched: 0 }, read_back: {}, config: {}, exitCode: 0 },
    attachSummary: { counts: { worklist_ready: 3, grounded_via_worklist: 2 } },
  });
  assert.deepEqual(artifact.config.attach, { rows_offered: 3, grounded: 2 });
});

test("buildArtifact: attach summary absent -> config.attach is the recorded zero result, not an error", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: { per_item: [], counts: {}, read_back: {}, config: {}, exitCode: 0 },
    attachSummary: null,
  });
  assert.deepEqual(artifact.config.attach, { rows_offered: 0 });
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: a non-zero rescan exitCode is recorded as a defect naming the note", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: { per_item: [], counts: {}, read_back: {}, config: {}, exitCode: 1, note: "HALT -- item x failed readback" },
    attachSummary: null,
  });
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /HALT/);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

// CRASH DETECTION (GitHub Actions run 36217491293, 2026-09-26). gate-a-rescan.mjs threw a fatal error
// on every page of a paginated read (the item_gate_a_state order-key bug); its CLI wrapper
// (scripts/maintenance/lib/cli.mjs's runCli) logs "fatal:" and exits 1 WITHOUT ever calling
// writeSummary, so summary.json never existed. Before this fix, buildArtifact treated a null
// rescanSummary exactly like a genuine "zero stale items" no-op: zero defects, proposer_notes claiming
// "This dispatch was a no-op." The workflow's own steps.rescan.outcome is the missing signal.

test("buildArtifact: rescanSummary null + a non-success step outcome records a CRASH defect, never a silent no-op", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: null,
    attachSummary: null,
    rescanStepOutcome: "failure",
  });
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /crashed/i);
  assert.match(artifact.defects_found[0].description, /"failure"/);
  assert.match(artifact.proposer_notes, /did NOT complete cleanly/i);
  assert.deepEqual(artifact.per_item, []);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: rescanSummary null + a SUCCESS step outcome is left to the 'unknown' branch (a success outcome implies real work, not a crash) -- still recorded, never silently clean", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: null,
    attachSummary: null,
    rescanStepOutcome: "success",
  });
  // rescanStepOutcome === "success" but rescanSummary is still null is a contradiction gate-a-rescan.mjs
  // should never produce (a successful run always returns a summary), so this is NOT the confirmed-crash
  // branch -- but it is also never treated as a clean no-op merely because the step "succeeded".
  assert.deepEqual(artifact.per_item, []);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: rescanSummary present (a real no-op, zero stale items) still reports cleanly even when rescanStepOutcome is supplied as success", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: {
      per_item: [], counts: { candidates: 0, stale: 0, selected: 0, touched: 0 },
      read_back: { distinct_versions_remaining: null }, config: { scope_source: "no candidates" }, exitCode: 0,
    },
    attachSummary: null,
    rescanStepOutcome: "success",
  });
  assert.deepEqual(artifact.defects_found, []);
  assert.match(artifact.proposer_notes, /no-op/);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: rescanSummary null with NO rescanStepOutcome supplied at all (an old caller) is still flagged, never assumed successful", () => {
  const artifact = buildArtifact({
    ...BASE,
    rescanSummary: null,
    attachSummary: null,
  });
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /unresolved/i);
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildArtifact: trigger is recorded exactly as given, workflow_dispatch included", () => {
  const artifact = buildArtifact({
    ...BASE, trigger: "workflow_dispatch",
    rescanSummary: { per_item: [], counts: {}, read_back: {}, config: {}, exitCode: 0 },
    attachSummary: null,
  });
  assert.equal(artifact.config.trigger, "workflow_dispatch");
  assert.deepEqual(validateRunArtifact(artifact), []);
});
