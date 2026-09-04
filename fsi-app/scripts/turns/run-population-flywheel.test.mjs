// run-population-flywheel.test.mjs — no DB, no child processes: pure-function coverage for
// run-population-flywheel.mjs's own step ordering, dry/apply behavior, the §9 metrics shape (fake edge
// rows), the gate's accept/refuse, and arg/id extraction. The I/O-bearing step handlers (child-process
// invocations, guarded DB calls) are deliberately NOT unit-tested here — they are thin, documented calls
// into scripts already covered by their own test suites (discover-for-items.test.mjs,
// run-extraction.test.mjs, apply-extraction-output.test.mjs, tag-proposals.test.mjs,
// tag-ratification.test.mjs, derive-obligations.test.mjs); this file pins the orchestration logic that
// decides WHAT runs, in WHAT order, and WHETHER it writes — the part unique to this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  extractMintedItemIds,
  buildFlywheelPlan,
  computeCorpusOutcomes,
  checkPriorSliceConnected,
} from "./run-population-flywheel.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --check-gate needs nothing else", () => {
  const r = parseArgs(["--check-gate"]);
  assert.deepEqual(r, { ok: true, checkGate: true, harnessRunsDir: null });
});

test("parseArgs: --check-gate accepts --harness-runs-dir", () => {
  const r = parseArgs(["--check-gate", "--harness-runs-dir", "scripts/harness-runs/mint"]);
  assert.equal(r.ok, true);
  assert.equal(r.checkGate, true);
  assert.equal(r.harnessRunsDir, "scripts/harness-runs/mint");
});

test("parseArgs: --mint-run is required outside --check-gate", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mint-run/);
});

test("parseArgs: --mode defaults to dry", () => {
  const r = parseArgs(["--mint-run", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "dry");
  assert.equal(r.checkGate, false);
});

test("parseArgs: --mode must be dry or apply", () => {
  const r = parseArgs(["--mint-run", "x.json", "--mode", "bogus"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: full apply invocation round-trips", () => {
  const r = parseArgs(["--mint-run", "scripts/harness-runs/mint/mint-run-022.json", "--mode", "apply", "--harness-runs-dir", "custom/dir"]);
  assert.deepEqual(r, {
    ok: true,
    checkGate: false,
    mintRun: "scripts/harness-runs/mint/mint-run-022.json",
    mode: "apply",
    harnessRunsDir: "custom/dir",
  });
});

test("parseArgs: unknown flag is rejected (strict parsing)", () => {
  const r = parseArgs(["--mint-run", "x.json", "--bogus"]);
  assert.equal(r.ok, false);
});

// ── extractMintedItemIds ─────────────────────────────────────────────────────────────────────────────

test("extractMintedItemIds: picks minted_verified and minted_unverified item_ids only", () => {
  const artifact = {
    per_item: [
      { id: "a", outcome: "minted_verified", item_id: "item-1" },
      { id: "b", outcome: "minted_unverified", item_id: "item-2" },
      { id: "c", outcome: "not_applied_holder_conflict", holder_item_id: "item-9" },
      { id: "d", outcome: "apply_failed", item_id: "item-8" },
      { id: "e", outcome: "would_apply" }, // dry mint-run: no item_id at all
    ],
  };
  assert.deepEqual(extractMintedItemIds(artifact), ["item-1", "item-2"]);
});

test("extractMintedItemIds: dedupes and preserves per_item order", () => {
  const artifact = {
    per_item: [
      { outcome: "minted_verified", item_id: "x" },
      { outcome: "minted_unverified", item_id: "y" },
      { outcome: "minted_verified", item_id: "x" },
    ],
  };
  assert.deepEqual(extractMintedItemIds(artifact), ["x", "y"]);
});

test("extractMintedItemIds: a dry mint-run artifact (no item_id anywhere) yields []", () => {
  const artifact = { per_item: [{ outcome: "apply_ready" }, { outcome: "validation_failed" }] };
  assert.deepEqual(extractMintedItemIds(artifact), []);
});

test("extractMintedItemIds: tolerates a missing/malformed per_item", () => {
  assert.deepEqual(extractMintedItemIds({}), []);
  assert.deepEqual(extractMintedItemIds({ per_item: null }), []);
  assert.deepEqual(extractMintedItemIds(null), []);
});

// ── buildFlywheelPlan: step ordering ─────────────────────────────────────────────────────────────────

const STEP_ORDER = [
  "discovery",
  "corpus-export",
  "forward-event-extraction",
  "forward-event-apply",
  "analyze-corpus",
  "derive-obligations",
  "tag-proposals",
  "tag-ratification",
  "compute-outcomes",
  "write-outcomes",
  "record-last-turn",
];

test("buildFlywheelPlan: step order is fixed and MINT-RUNBOOK §8-shaped, in apply mode", () => {
  const plan = buildFlywheelPlan("apply", ["item-1"]);
  assert.deepEqual(plan.map((s) => s.name), STEP_ORDER);
});

test("buildFlywheelPlan: step order is identical in dry mode (same steps, different skip/write)", () => {
  const plan = buildFlywheelPlan("dry", ["item-1"]);
  assert.deepEqual(plan.map((s) => s.name), STEP_ORDER);
});

// ── buildFlywheelPlan: dry vs apply, with items ─────────────────────────────────────────────────────

test("buildFlywheelPlan: apply mode with items — every scoped step runs and writes", () => {
  const plan = buildFlywheelPlan("apply", ["item-1", "item-2"]);
  const byName = Object.fromEntries(plan.map((s) => [s.name, s]));

  for (const name of ["discovery", "forward-event-extraction", "forward-event-apply", "tag-proposals", "tag-ratification"]) {
    assert.equal(byName[name].skip, false, `${name} should not be skipped`);
    assert.equal(byName[name].willWrite, true, `${name} should write in apply mode with items`);
  }
  assert.equal(byName["corpus-export"].skip, false);
  assert.equal(byName["corpus-export"].willWrite, false, "corpus-export only ever writes a local file, never the DB");
  assert.equal(byName["analyze-corpus"].willWrite, true);
  assert.equal(byName["derive-obligations"].willWrite, true);
  assert.equal(byName["compute-outcomes"].skip, false);
  assert.equal(byName["compute-outcomes"].willWrite, false, "compute-outcomes is read-only");
  assert.equal(byName["write-outcomes"].skip, false);
  assert.equal(byName["write-outcomes"].willWrite, true);
  assert.equal(byName["record-last-turn"].skip, false);
  assert.equal(byName["record-last-turn"].willWrite, true);
});

test("buildFlywheelPlan: dry mode with items — scoped steps run previews, nothing writes", () => {
  const plan = buildFlywheelPlan("dry", ["item-1"]);
  const byName = Object.fromEntries(plan.map((s) => [s.name, s]));

  assert.equal(byName.discovery.skip, false);
  assert.equal(byName.discovery.willWrite, false);
  assert.equal(byName["corpus-export"].skip, false);
  assert.equal(byName["forward-event-extraction"].skip, false);
  assert.equal(byName["forward-event-extraction"].willWrite, false);

  // forward-event-apply has NOTHING to apply in dry mode (run-extraction wrote no events file) —
  // skipped, not merely "written=false".
  assert.equal(byName["forward-event-apply"].skip, true);
  assert.match(byName["forward-event-apply"].skipReason, /dry mode/);

  assert.equal(byName["tag-proposals"].skip, false);
  assert.equal(byName["tag-proposals"].willWrite, false);
  assert.equal(byName["tag-ratification"].skip, false);
  assert.equal(byName["tag-ratification"].willWrite, false);

  assert.equal(byName["analyze-corpus"].skip, false);
  assert.equal(byName["analyze-corpus"].willWrite, false);
  assert.equal(byName["derive-obligations"].skip, false);
  assert.equal(byName["derive-obligations"].willWrite, false);

  assert.equal(byName["compute-outcomes"].skip, false, "outcomes are still computed/reported in dry mode");

  // run-mint-batch.mjs --outcomes has no dry path at all — never invoked in dry mode.
  assert.equal(byName["write-outcomes"].skip, true);
  assert.match(byName["write-outcomes"].skipReason, /no dry\/preview path/);

  assert.equal(byName["record-last-turn"].skip, true);
});

// ── buildFlywheelPlan: zero minted items (a dry population-turn dispatch, or an all-blocked apply) ────

test("buildFlywheelPlan: apply mode with ZERO items — item-scoped steps skip cleanly, unscoped steps still run", () => {
  const plan = buildFlywheelPlan("apply", []);
  const byName = Object.fromEntries(plan.map((s) => [s.name, s]));

  for (const name of ["discovery", "corpus-export", "forward-event-extraction", "forward-event-apply", "tag-proposals", "tag-ratification"]) {
    assert.equal(byName[name].skip, true, `${name} should skip with 0 items`);
    assert.match(byName[name].skipReason, /0 minted item/);
  }
  // Unscoped steps are NOT gated on batch size.
  assert.equal(byName["analyze-corpus"].skip, false);
  assert.equal(byName["derive-obligations"].skip, false);
  // Outcomes are still computed and (in apply mode) written, honestly at zero.
  assert.equal(byName["compute-outcomes"].skip, false);
  assert.equal(byName["write-outcomes"].skip, false);
  assert.equal(byName["record-last-turn"].skip, false);
});

test("buildFlywheelPlan: every scoped step's skip flag agrees with `scoped` — never skipped for an unscoped step", () => {
  const plan = buildFlywheelPlan("apply", []);
  for (const step of plan) {
    if (!step.scoped) assert.equal(step.skip, false, `${step.name} is unscoped and must never skip on batch size`);
  }
});

// ── computeCorpusOutcomes (fake edge rows — the §9 metrics shape) ──────────────────────────────────────

test("computeCorpusOutcomes: no edges at all — every item isolated, zero discovered", () => {
  const r = computeCorpusOutcomes(["a", "b"], []);
  assert.deepEqual(r, { edges_discovered: 0, isolated_items: 2 });
});

test("computeCorpusOutcomes: a provenance_discovery edge to an outside item counts once, clears isolation for the batch endpoint only", () => {
  const edgeRows = [{ source_item_id: "a", target_item_id: "outside-1", origin: "provenance_discovery" }];
  const r = computeCorpusOutcomes(["a", "b"], edgeRows);
  assert.equal(r.edges_discovered, 1); // one endpoint (a) is in the batch
  assert.equal(r.isolated_items, 1); // b still isolated
});

test("computeCorpusOutcomes: a same-batch-internal provenance_discovery edge counts toward BOTH items (the runbook's own double-count caveat)", () => {
  const edgeRows = [{ source_item_id: "a", target_item_id: "b", origin: "provenance_discovery" }];
  const r = computeCorpusOutcomes(["a", "b"], edgeRows);
  assert.equal(r.edges_discovered, 2); // both endpoints are in the batch
  assert.equal(r.isolated_items, 0);
});

test("computeCorpusOutcomes: a non-discovery-origin edge clears isolation but never counts toward edges_discovered", () => {
  const edgeRows = [{ source_item_id: "a", target_item_id: "outside-1", origin: "entity_extraction" }];
  const r = computeCorpusOutcomes(["a", "b"], edgeRows);
  assert.equal(r.edges_discovered, 0);
  assert.equal(r.isolated_items, 1); // a is connected (any origin), b is not
});

test("computeCorpusOutcomes: empty batch — zero/zero, no crash on empty edge rows either", () => {
  assert.deepEqual(computeCorpusOutcomes([], []), { edges_discovered: 0, isolated_items: 0 });
});

test("computeCorpusOutcomes: an edge naming an id outside the batch on both ends touches nothing", () => {
  const edgeRows = [{ source_item_id: "outside-1", target_item_id: "outside-2", origin: "provenance_discovery" }];
  const r = computeCorpusOutcomes(["a"], edgeRows);
  assert.deepEqual(r, { edges_discovered: 0, isolated_items: 1 });
});

// ── checkPriorSliceConnected: THE GATE ──────────────────────────────────────────────────────────────

test("checkPriorSliceConnected: no prior artifact — never blocks", () => {
  const r = checkPriorSliceConnected(null);
  assert.equal(r.ok, true);
});

test("checkPriorSliceConnected: prior slice minted nothing — never blocks, regardless of missing metrics keys", () => {
  const artifact = { run_id: "mint-run-005", metrics: { attempted: 3, valid: 0, invalid: 3, minted: 0 } };
  const r = checkPriorSliceConnected(artifact);
  assert.equal(r.ok, true);
  assert.match(r.reason, /minted=0/);
});

test("checkPriorSliceConnected: prior slice's `minted` key entirely absent — treated as 0, never blocks", () => {
  const artifact = { run_id: "mint-run-005", metrics: { attempted: 3, valid: 3, invalid: 0 } };
  const r = checkPriorSliceConnected(artifact);
  assert.equal(r.ok, true);
});

test("checkPriorSliceConnected: prior slice minted items but outcomes never ran — REFUSES, names the fix", () => {
  const artifact = {
    run_id: "mint-run-022",
    metrics: { minted: 12, minted_verified: 10, minted_unverified: 2, db_deltas: { items: 12 } },
  };
  const r = checkPriorSliceConnected(artifact);
  assert.equal(r.ok, false);
  assert.match(r.reason, /mint-run-022/);
  assert.match(r.reason, /edges_discovered/);
  assert.match(r.reason, /forward_events_extracted/);
  assert.match(r.reason, /isolated_items/);
  assert.match(r.reason, /run-population-flywheel\.mjs --mint-run scripts\/harness-runs\/mint\/mint-run-022\.json --mode apply/);
});

test("checkPriorSliceConnected: prior slice minted items and carries only SOME of the three outcome keys — still refuses, names only what's missing", () => {
  const artifact = {
    run_id: "mint-run-023",
    metrics: { minted: 5, edges_discovered: 3, isolated_items: 1 }, // forward_events_extracted missing
  };
  const r = checkPriorSliceConnected(artifact);
  assert.equal(r.ok, false);
  assert.match(r.reason, /forward_events_extracted/);
  assert.doesNotMatch(r.reason, /missing edges_discovered/);
});

test("checkPriorSliceConnected: outcomes present (even all zero) — accepts", () => {
  const artifact = {
    run_id: "mint-run-024",
    metrics: { minted: 4, edges_discovered: 0, forward_events_extracted: 0, isolated_items: 4 },
  };
  const r = checkPriorSliceConnected(artifact);
  assert.equal(r.ok, true);
  assert.match(r.reason, /outcomes present/);
});

test("checkPriorSliceConnected: a zero outcome value is present, not missing (0 !== undefined)", () => {
  const artifact = {
    run_id: "mint-run-025",
    metrics: { minted: 1, edges_discovered: 0, forward_events_extracted: 0, isolated_items: 0 },
  };
  assert.equal(checkPriorSliceConnected(artifact).ok, true);
});
