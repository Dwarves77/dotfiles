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
  hasRecoverableMintedIds,
  resolveMintedItemIds,
  buildFlywheelPlan,
  computeCorpusOutcomes,
  checkPriorSliceConnected,
  checkAllSlicesConnected,
  selectBacklogArtifacts,
  formatBacklogReport,
  runFlywheelForOneArtifact,
  DEFAULT_BACKLOG_MAX_ARTIFACTS,
} from "./run-population-flywheel.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --check-gate needs nothing else", () => {
  const r = parseArgs(["--check-gate"]);
  assert.deepEqual(r, { ok: true, checkGate: true, backlog: false, harnessRunsDir: null });
});

test("parseArgs: --check-gate accepts --harness-runs-dir", () => {
  const r = parseArgs(["--check-gate", "--harness-runs-dir", "scripts/harness-runs/mint"]);
  assert.equal(r.ok, true);
  assert.equal(r.checkGate, true);
  assert.equal(r.harnessRunsDir, "scripts/harness-runs/mint");
});

test("parseArgs: --mint-run is required outside --check-gate/--backlog", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mint-run/);
});

test("parseArgs: --mode defaults to dry", () => {
  const r = parseArgs(["--mint-run", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "dry");
  assert.equal(r.checkGate, false);
  assert.equal(r.backlog, false);
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
    backlog: false,
    mintRun: "scripts/harness-runs/mint/mint-run-022.json",
    mode: "apply",
    harnessRunsDir: "custom/dir",
  });
});

test("parseArgs: unknown flag is rejected (strict parsing)", () => {
  const r = parseArgs(["--mint-run", "x.json", "--bogus"]);
  assert.equal(r.ok, false);
});

// ── parseArgs: --backlog ─────────────────────────────────────────────────────────────────────────────

test("parseArgs: --backlog defaults to mode=dry and DEFAULT_BACKLOG_MAX_ARTIFACTS", () => {
  const r = parseArgs(["--backlog"]);
  assert.deepEqual(r, {
    ok: true,
    checkGate: false,
    backlog: true,
    mode: "dry",
    maxArtifacts: DEFAULT_BACKLOG_MAX_ARTIFACTS,
    harnessRunsDir: null,
  });
});

test("parseArgs: --backlog full apply invocation round-trips", () => {
  const r = parseArgs(["--backlog", "--mode", "apply", "--harness-runs-dir", "custom/dir", "--max-artifacts", "5"]);
  assert.deepEqual(r, {
    ok: true,
    checkGate: false,
    backlog: true,
    mode: "apply",
    maxArtifacts: 5,
    harnessRunsDir: "custom/dir",
  });
});

test("parseArgs: --backlog rejects --mint-run alongside it", () => {
  const r = parseArgs(["--backlog", "--mint-run", "x.json"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mint-run/);
});

test("parseArgs: --backlog and --check-gate are mutually exclusive", () => {
  const r = parseArgs(["--backlog", "--check-gate"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /mutually exclusive/);
});

test("parseArgs: --backlog --max-artifacts must be a positive integer", () => {
  for (const bad of ["0", "-1", "1.5", "abc", ""]) {
    const r = parseArgs(["--backlog", "--max-artifacts", bad]);
    assert.equal(r.ok, false, `--max-artifacts ${JSON.stringify(bad)} should be rejected`);
    assert.match(r.error, /--max-artifacts/);
  }
});

test("parseArgs: --backlog --mode must still be dry or apply", () => {
  const r = parseArgs(["--backlog", "--mode", "bogus"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
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

test("extractMintedItemIds: also recognizes the retired 'minted_verified_first_pass' outcome (mint-run-004/006 on this checkout)", () => {
  const artifact = {
    per_item: [
      { outcome: "minted_verified_first_pass", item_id: "legacy-1" },
      { outcome: "not_minted_existing_item", item_id: "legacy-2" }, // NOT newly minted this run — excluded
    ],
  };
  assert.deepEqual(extractMintedItemIds(artifact), ["legacy-1"]);
});

// ── hasRecoverableMintedIds ──────────────────────────────────────────────────────────────────────────

test("hasRecoverableMintedIds: metrics.minted absent/0 — trivially true, nothing to recover", () => {
  assert.equal(hasRecoverableMintedIds({ metrics: { minted: 0 } }), true);
  assert.equal(hasRecoverableMintedIds({ metrics: {} }), true);
  assert.equal(hasRecoverableMintedIds({}), true);
});

test("hasRecoverableMintedIds: minted > 0 with real item ids in per_item — true", () => {
  const artifact = {
    metrics: { minted: 2 },
    per_item: [
      { outcome: "minted_verified", item_id: "a" },
      { outcome: "minted_verified", item_id: "b" },
    ],
  };
  assert.equal(hasRecoverableMintedIds(artifact), true);
});

test("hasRecoverableMintedIds: minted > 0 but per_item has NO item_id anywhere (mint-run-001's own shape) — false", () => {
  const artifact = {
    metrics: { minted: 6 },
    per_item: [
      { id: "32006R1692", outcome: "minted", verdict: "..." },
      { id: "32009L0123", outcome: "minted", verdict: "..." },
    ],
  };
  assert.equal(hasRecoverableMintedIds(artifact), false);
});

test("hasRecoverableMintedIds: minted > 0, outcome carries no recognized 'minted*' value with an id (mint-run-005's own shape) — false", () => {
  const artifact = {
    metrics: { minted: 5 },
    per_item: [{ outcome: "minted_validator_pass" }, { outcome: "holder_conflict" }],
  };
  assert.equal(hasRecoverableMintedIds(artifact), false);
});

// ── resolveMintedItemIds: pre-item_id artifacts with canonical_instrument_key (CELEX) ────────────────

test("resolveMintedItemIds: modern path — per_item.item_id present, no DB query needed", async () => {
  const artifact = {
    per_item: [
      { outcome: "minted_verified", item_id: "uuid-1" },
      { outcome: "minted_unverified", item_id: "uuid-2" },
    ],
  };
  const db = { readAll: () => { throw new Error("should not query DB for modern path"); } };
  const result = await resolveMintedItemIds(artifact, db);
  assert.deepEqual(result.ids, ["uuid-1", "uuid-2"]);
  assert.equal(result.idsResolvedByKey, 0);
  assert.deepEqual(result.unresolved, []);
});

test("resolveMintedItemIds: pre-item_id path via per_item.id as canonical_instrument_key (mint-run-001 shape)", async () => {
  // Fixture from mint-run-001: per_item.id carries CELEX, no item_id field
  const artifact = {
    per_item: [
      { id: "32006R1692", outcome: "minted", verdict: "valid" },
      { id: "32009L0123", outcome: "minted", verdict: "valid" },
    ],
  };

  // Mock DB: pre-fetch returns the canonical_instrument_key batch
  // When .in("canonical_instrument_key", ["32006R1692", "32009L0123"]) is called,
  // we return both matches
  let calledWithKeys = [];
  const db = {
    readAll: async (table, columns, options) => {
      if (table !== "intelligence_items") throw new Error("unexpected table");
      // The resolver batches all CELEX keys and calls readAll with .in()
      // We can't easily inspect the match function, so we just return all our test data
      calledWithKeys.push(columns);
      // Return both items that correspond to the CELEX keys in the artifact
      return [
        { id: "uuid-36c92d72", canonical_instrument_key: "32006R1692" },
        { id: "uuid-bfae9c86", canonical_instrument_key: "32009L0123" },
      ];
    },
  };

  const result = await resolveMintedItemIds(artifact, db);
  assert.equal(result.ids.length, 2, `Expected 2 resolved ids, got ${result.ids.length}`);
  assert.equal(result.idsResolvedByKey, 2, `Expected idsResolvedByKey=2, got ${result.idsResolvedByKey}`);
  assert.deepEqual(result.unresolved, [], `Expected no unresolved, got ${JSON.stringify(result.unresolved)}`);
});

test("resolveMintedItemIds: ambiguous resolution (2+ items match) — reported unresolved", async () => {
  const artifact = {
    per_item: [
      { id: "ambig-key", outcome: "minted", verdict: "valid" },
    ],
  };

  const db = {
    readAll: async (table, columns, options) => {
      if (table === "intelligence_items") {
        // The .in("canonical_instrument_key", ["ambig-key"]) returns 2 matches
        return [
          { id: "uuid-a", canonical_instrument_key: "ambig-key" },
          { id: "uuid-b", canonical_instrument_key: "ambig-key" },
        ];
      }
      return [];
    },
  };

  const result = await resolveMintedItemIds(artifact, db);
  assert.equal(result.ids.length, 0, `Expected 0 resolved ids, got ${result.ids.length}`);
  assert.equal(result.unresolved.length, 1, `Expected 1 unresolved, got ${result.unresolved.length}`);
  assert.equal(result.unresolved[0].attemptedKey, "canonical_instrument_key");
  assert.equal(result.unresolved[0].matchCount, 2);
});

test("resolveMintedItemIds: zero resolution (no items match) — reported unresolved", async () => {
  const artifact = {
    per_item: [
      { id: "nomatch", outcome: "minted", verdict: "valid" },
    ],
  };

  const db = {
    readAll: async (table, columns, options) => {
      if (table === "intelligence_items") {
        // The .in("canonical_instrument_key", ["nomatch"]) returns 0 matches
        return [];
      }
      return [];
    },
  };

  const result = await resolveMintedItemIds(artifact, db);
  assert.equal(result.ids.length, 0, `Expected 0 resolved ids, got ${result.ids.length}`);
  assert.equal(result.unresolved.length, 1, `Expected 1 unresolved, got ${result.unresolved.length}`);
  assert.equal(result.unresolved[0].attemptedKey, null, `Expected attemptedKey=null, got ${result.unresolved[0].attemptedKey}`);
  assert.equal(result.unresolved[0].matchCount, 0);
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

// ── checkAllSlicesConnected: THE GATE, WIDENED — every artifact, not only the newest ───────────────────

const CONNECTED = (runId, minted = 3) => ({
  run_id: runId,
  metrics: { minted, edges_discovered: 1, forward_events_extracted: 1, isolated_items: 0 },
});
// missing all 3 outcome keys; per_item carries exactly `minted` minted_verified rows, matching
// metrics.minted, so extractMintedItemIds(...).length agrees with the fixture's own `minted` param.
const STALE = (runId, minted = 3) => ({
  run_id: runId,
  metrics: { minted },
  per_item: Array.from({ length: minted }, (_, i) => ({ outcome: "minted_verified", item_id: `${runId}-item-${i}` })),
});
const DRY = (runId) => ({ run_id: runId, metrics: { attempted: 3, valid: 0, invalid: 3 } }); // minted absent
// mint-run-001/mint-run-005's own shape: metrics.minted > 0 but no per_item entry carries an item_id at
// all (pre-item_id-field schema) — hasRecoverableMintedIds is false for these, unlike DRY (minted absent).
const UNRECOVERABLE = (runId, minted = 6) => ({
  run_id: runId,
  metrics: { minted },
  per_item: Array.from({ length: minted }, (_, i) => ({ id: `celex-${i}`, outcome: "minted" })),
});

test("checkAllSlicesConnected: no artifacts at all — never blocks", () => {
  const r = checkAllSlicesConnected([]);
  assert.equal(r.ok, true);
  assert.match(r.reason, /nothing to gate/);
});

test("checkAllSlicesConnected: all connected — accepts, names the count", () => {
  const r = checkAllSlicesConnected([CONNECTED("mint-run-001"), CONNECTED("mint-run-002"), DRY("mint-run-003")]);
  assert.equal(r.ok, true);
  assert.match(r.reason, /3 mint-run artifact\(s\) checked/);
});

test("checkAllSlicesConnected: THE DEFECT reproduced — one stale artifact in the middle, masked by a newer dry one, is still caught", () => {
  // Exactly BOILER-2's shape: mint-run-017..022 stale (apply batches), mint-run-023 a dry R-D preview
  // sorted newest. The OLD single-newest gate read only 023 and said "nothing to connect." This one must
  // refuse, naming the stale run even though a dry run comes after it in the list.
  const runs = [CONNECTED("mint-run-016"), STALE("mint-run-017", 177), DRY("mint-run-023")];
  const r = checkAllSlicesConnected(runs);
  assert.equal(r.ok, false);
  assert.match(r.reason, /mint-run-017/);
  assert.doesNotMatch(r.reason, /mint-run-016/);
  assert.doesNotMatch(r.reason, /mint-run-023/);
});

test("checkAllSlicesConnected: several stale artifacts — names every one and every fix command", () => {
  const runs = [STALE("mint-run-017", 177), STALE("mint-run-018", 168), CONNECTED("mint-run-019"), STALE("mint-run-020", 152)];
  const r = checkAllSlicesConnected(runs);
  assert.equal(r.ok, false);
  assert.match(r.reason, /3 of 4 mint-run artifact\(s\)/);
  for (const runId of ["mint-run-017", "mint-run-018", "mint-run-020"]) {
    assert.match(r.reason, new RegExp(runId));
    assert.match(r.reason, new RegExp(`--mint-run scripts/harness-runs/mint/${runId}\\.json --mode apply`));
  }
  assert.doesNotMatch(r.reason, /mint-run-019/);
});

test("checkAllSlicesConnected: names the backlog dispatch as the preferred fix", () => {
  const r = checkAllSlicesConnected([STALE("mint-run-017", 177)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /flywheel_backlog=true/);
  assert.match(r.reason, /--backlog --mode apply/);
});

test("checkAllSlicesConnected: dry artifacts never count, however many of them there are", () => {
  const r = checkAllSlicesConnected([DRY("mint-run-001"), DRY("mint-run-002"), DRY("mint-run-003")]);
  assert.equal(r.ok, true);
});

// ── checkAllSlicesConnected: unrecoverable artifacts (no item_id at all) ────────────────────────────────

test("checkAllSlicesConnected: an unrecoverable artifact still refuses, but is named separately from the auto-fixable ones", () => {
  const r = checkAllSlicesConnected([STALE("mint-run-017", 5), UNRECOVERABLE("mint-run-001", 6)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /mint-run-001/);
  assert.match(r.reason, /mint-run-017/);
  assert.match(r.reason, /CANNOT be auto-connected/);
  assert.match(r.reason, /manual\/operator resolution/);
  // The per-run FIX command block must offer the real fix for mint-run-017, but never a command that
  // would refuse when run against mint-run-001.
  assert.match(r.reason, /--mint-run scripts\/harness-runs\/mint\/mint-run-017\.json --mode apply/);
  assert.doesNotMatch(r.reason, /--mint-run scripts\/harness-runs\/mint\/mint-run-001\.json --mode apply/);
});

test("checkAllSlicesConnected: an artifact that is ENTIRELY unrecoverable artifacts still refuses (no false green)", () => {
  const r = checkAllSlicesConnected([UNRECOVERABLE("mint-run-001", 6), UNRECOVERABLE("mint-run-005", 5)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /2 of 2 mint-run artifact\(s\)/);
  assert.match(r.reason, /mint-run-001/);
  assert.match(r.reason, /mint-run-005/);
});

// ── selectBacklogArtifacts ───────────────────────────────────────────────────────────────────────────

function withStartedAt(artifact, iso) {
  return { ...artifact, started_at: iso };
}

test("selectBacklogArtifacts: no stale artifacts — empty selection", () => {
  const runs = [
    withStartedAt(CONNECTED("mint-run-001"), "2026-09-01T00:00:00Z"),
    withStartedAt(DRY("mint-run-002"), "2026-09-02T00:00:00Z"),
  ];
  const r = selectBacklogArtifacts(runs, 5);
  assert.deepEqual(r, { staleTotal: 0, staleTotalItems: 0, selected: [], selectedItems: 0, remaining: 0, unrecoverable: [] });
});

test("selectBacklogArtifacts: selects oldest-first and caps at maxArtifacts, honestly reporting the remainder", () => {
  const runs = [
    withStartedAt(STALE("mint-run-020", 10), "2026-09-04T02:00:00Z"),
    withStartedAt(STALE("mint-run-017", 5), "2026-09-03T20:00:00Z"),
    withStartedAt(STALE("mint-run-019", 7), "2026-09-03T23:00:00Z"),
    withStartedAt(STALE("mint-run-018", 3), "2026-09-03T21:00:00Z"),
  ];
  const r = selectBacklogArtifacts(runs, 2);
  assert.equal(r.staleTotal, 4);
  assert.equal(r.staleTotalItems, 25);
  assert.deepEqual(r.selected.map((s) => s.runId), ["mint-run-017", "mint-run-018"]);
  assert.equal(r.selectedItems, 8);
  assert.equal(r.remaining, 2);
});

test("selectBacklogArtifacts: a dry artifact anywhere in the list is never selected", () => {
  const runs = [
    withStartedAt(STALE("mint-run-017", 5), "2026-09-03T20:00:00Z"),
    withStartedAt(DRY("mint-run-023"), "2026-09-04T01:41:32Z"),
  ];
  const r = selectBacklogArtifacts(runs, 5);
  assert.deepEqual(r.selected.map((s) => s.runId), ["mint-run-017"]);
});

test("selectBacklogArtifacts: an unrecoverable artifact is NEVER selected, is reported separately, and does not consume the maxArtifacts budget", () => {
  const runs = [
    withStartedAt(STALE("mint-run-017", 5), "2026-09-03T20:00:00Z"),
    withStartedAt(STALE("mint-run-018", 3), "2026-09-03T21:00:00Z"),
    withStartedAt(UNRECOVERABLE("mint-run-001", 6), "2026-09-01T00:00:00Z"), // oldest of all three
  ];
  const r = selectBacklogArtifacts(runs, 1);
  // mint-run-001 is the OLDEST — proof this doesn't stall selection at the artifact it can never fix.
  assert.deepEqual(r.selected.map((s) => s.runId), ["mint-run-017"]);
  assert.deepEqual(r.unrecoverable, [{ runId: "mint-run-001", minted: 6 }]);
  assert.equal(r.staleTotal, 2, "staleTotal counts only auto-connectable artifacts");
  assert.equal(r.remaining, 1);
});

test("selectBacklogArtifacts: every stale artifact is unrecoverable — empty selection, all reported, never a false green", () => {
  const runs = [
    withStartedAt(UNRECOVERABLE("mint-run-001", 6), "2026-09-01T00:00:00Z"),
    withStartedAt(UNRECOVERABLE("mint-run-005", 5), "2026-09-02T00:00:00Z"),
  ];
  const r = selectBacklogArtifacts(runs, 5);
  assert.deepEqual(r.selected, []);
  assert.equal(r.staleTotal, 0);
  assert.equal(r.unrecoverable.length, 2);
});

test("selectBacklogArtifacts: an invalid maxArtifacts falls back to DEFAULT_BACKLOG_MAX_ARTIFACTS", () => {
  const runs = Array.from({ length: DEFAULT_BACKLOG_MAX_ARTIFACTS + 3 }, (_, i) =>
    withStartedAt(STALE(`mint-run-${String(i).padStart(3, "0")}`, 1), `2026-09-0${(i % 9) + 1}T00:00:00Z`),
  );
  const r = selectBacklogArtifacts(runs, 0);
  assert.equal(r.selected.length, DEFAULT_BACKLOG_MAX_ARTIFACTS);
});

test("selectBacklogArtifacts: itemCount matches extractMintedItemIds, not metrics.minted", () => {
  // A stale artifact whose per_item disagrees with its own metrics.minted count — itemCount must come
  // from the same source THE GATE's fix command actually operates on (per_item), not the summary number.
  const artifact = {
    run_id: "mint-run-030",
    metrics: { minted: 99 }, // deliberately wrong/stale summary number
    per_item: [
      { outcome: "minted_verified", item_id: "a" },
      { outcome: "minted_unverified", item_id: "b" },
      { outcome: "apply_failed", item_id: "c" },
    ],
  };
  const r = selectBacklogArtifacts([artifact], 5);
  assert.equal(r.selected[0].itemCount, 2);
});

// ── formatBacklogReport ──────────────────────────────────────────────────────────────────────────────

test("formatBacklogReport: zero stale — the clear-backlog message", () => {
  const msg = formatBacklogReport(selectBacklogArtifacts([], 5));
  assert.match(msg, /0 stale mint-run artifact/);
});

test("formatBacklogReport: lists every selected artifact and its item count, and names the remainder", () => {
  const runs = [
    withStartedAt(STALE("mint-run-017", 5), "2026-09-03T20:00:00Z"),
    withStartedAt(STALE("mint-run-018", 3), "2026-09-03T21:00:00Z"),
    withStartedAt(STALE("mint-run-019", 7), "2026-09-03T23:00:00Z"),
  ];
  const msg = formatBacklogReport(selectBacklogArtifacts(runs, 2));
  assert.match(msg, /3 stale mint-run artifact\(s\) found \(15 item\(s\) total/);
  assert.match(msg, /mint-run-017: 5 minted item\(s\)/);
  assert.match(msg, /mint-run-018: 3 minted item\(s\)/);
  assert.doesNotMatch(msg, /mint-run-019: 7/);
  assert.match(msg, /1 more stale artifact\(s\) not selected/);
});

test("formatBacklogReport: no remainder note when every stale artifact was selected", () => {
  const runs = [withStartedAt(STALE("mint-run-017", 5), "2026-09-03T20:00:00Z")];
  const msg = formatBacklogReport(selectBacklogArtifacts(runs, 5));
  assert.doesNotMatch(msg, /not selected/);
});

test("formatBacklogReport: names unrecoverable artifacts distinctly, alongside a normal selection", () => {
  const runs = [
    withStartedAt(STALE("mint-run-017", 5), "2026-09-03T20:00:00Z"),
    withStartedAt(UNRECOVERABLE("mint-run-001", 6), "2026-09-01T00:00:00Z"),
  ];
  const msg = formatBacklogReport(selectBacklogArtifacts(runs, 5));
  assert.match(msg, /mint-run-017: 5 minted item\(s\)/);
  assert.match(msg, /1 additional stale artifact\(s\) CANNOT be auto-connected/);
  assert.match(msg, /mint-run-001: metrics\.minted=6, no recoverable item id/);
});

test("formatBacklogReport: unrecoverable-only backlog — still names them even though staleTotal is 0", () => {
  const runs = [withStartedAt(UNRECOVERABLE("mint-run-001", 6), "2026-09-01T00:00:00Z")];
  const msg = formatBacklogReport(selectBacklogArtifacts(runs, 5));
  assert.match(msg, /0 stale mint-run artifact/);
  assert.match(msg, /1 additional stale artifact\(s\) CANNOT be auto-connected/);
});

// ── runFlywheelForOneArtifact: the pre-I/O safety-net guard (throws before any step, any child process,
// any DB call — testable without mocking) ───────────────────────────────────────────────────────────────

test("runFlywheelForOneArtifact: refuses BEFORE any I/O when the artifact has no recoverable item ids", async () => {
  const artifact = UNRECOVERABLE("mint-run-001", 6);
  await assert.rejects(
    () =>
      runFlywheelForOneArtifact({
        mintRunPath: "scripts/harness-runs/mint/mint-run-001.json",
        artifact,
        mode: "apply",
        harnessRunsDir: "scripts/harness-runs/mint",
        db: {}, // never touched — the guard throws first
        startedAt: new Date().toISOString(),
      }),
    /no item id could be recovered/,
  );
});

// A negative counterpart ("a normal artifact does NOT hit this guard") is deliberately NOT exercised by
// calling runFlywheelForOneArtifact directly — past the guard it spawns REAL child processes
// (scripts/connections/analyze-corpus.mjs etc., per buildFlywheelPlan's own unscoped steps), exactly the
// I/O this file's own header says stays out of this suite. hasRecoverableMintedIds' own tests above
// already pin the guard's predicate directly (true for the normal/DRY-fixture case, false only for
// UNRECOVERABLE) — the guard here is a one-line `if (!hasRecoverableMintedIds(artifact)) throw`, so that
// coverage already proves it does not fire on the normal case.
