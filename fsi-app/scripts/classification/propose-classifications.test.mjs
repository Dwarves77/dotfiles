// propose-classifications.test.mjs — proves the pure decision surface: arg parsing, the three flag-row
// builders (classify / drift / anomaly), item-by-source grouping, and that the reused planReflect
// (imported unmodified from propose-tags.mjs) composes correctly against this module's own createdBy
// subtype strings. Importing this module never invokes main() (IS_MAIN checks process.argv[1] against
// the test file, same posture as propose-tags.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, buildClassificationFlagRow, buildNoDerivableClassificationFlagRow, buildDriftFlagRow,
  groupItemsBySource, DRIFT_THRESHOLD_POINTS,
} from "./propose-classifications.mjs";
import { planReflect } from "../connections/propose-tags.mjs";
import { proposeSourceAxisClassification } from "../../src/lib/classification/classify-source.mjs";
import { detectDrift } from "../../src/lib/classification/routing.mjs";
import {
  AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE,
  SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE,
} from "../../src/lib/classification/flags.mjs";
import { createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────
// anomalies is ALWAYS false (D17 family 5, 2026-09-12: the anomaly detector is retired) -- --anomalies
// is still accepted for parse-compatibility but never selects a mode.

test("parseArgs: no mode flag runs classify+drift (documented default; anomalies retired)", () => {
  const r = parseArgs([]);
  assert.deepEqual(r, { execute: false, modes: { classify: true, drift: true, anomalies: false } });
});

test("parseArgs: a single mode flag narrows to exactly that mode", () => {
  const r = parseArgs(["--drift"]);
  assert.deepEqual(r.modes, { classify: false, drift: true, anomalies: false });
});

test("parseArgs: --anomalies alone is now a no-op (both other modes false, anomalies retired)", () => {
  const r = parseArgs(["--anomalies"]);
  assert.deepEqual(r.modes, { classify: false, drift: false, anomalies: false });
});

test("parseArgs: two mode flags together narrow to exactly those two (anomalies still retired even if named)", () => {
  const r = parseArgs(["--classify", "--anomalies"]);
  assert.deepEqual(r.modes, { classify: true, drift: false, anomalies: false });
});

test("parseArgs: --execute is honored alongside any mode selection", () => {
  assert.equal(parseArgs(["--execute"]).execute, true);
  assert.equal(parseArgs(["--drift", "--execute"]).execute, true);
  assert.equal(parseArgs([]).execute, false);
});

// ── buildClassificationFlagRow ───────────────────────────────────────────────────────────────────

test("buildClassificationFlagRow: applicable + advisory proposals — shape, JSON block, apply command present", () => {
  const source = { id: "src-1", name: "EFRAG", url: "https://www.efrag.org/", source_role: "standards_body" };
  const computed = proposeSourceAxisClassification(source);
  const row = buildClassificationFlagRow(source, computed);
  assert.equal(row.category, "source_issue");
  assert.equal(row.subject_type, "source");
  assert.equal(row.subject_ref, buildSubjectRef("src-1"));
  assert.equal(row.status, "open");
  assert.equal(row.created_by, createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE));
  assert.match(row.description, /PROPOSALS_JSON: \[/);
  assert.ok(row.recommended_actions.some((a) => a.includes("ratify:classification")));
  assert.ok(row.recommended_actions.some((a) => a.includes("apply-classifications.mjs")));
});

test("buildClassificationFlagRow: zero proposals: D17 family 4 part 2, delegates to buildNoDerivableClassificationFlagRow (born resolved, no 'needs manual' phrase, no apply command)", () => {
  const source = { id: "src-2", name: "Acme Freight Co", url: "https://acmefreight.example/", source_role: "vendor_corporate" };
  const computed = { proposals: [] };
  const row = buildClassificationFlagRow(source, computed);
  assert.equal(row.status, "resolved");
  assert.match(row.description, /no candidate value was derivable/);
  assert.ok(!row.description.includes("needs manual operator classification"), "the D17 phrase must be removed");
  assert.deepEqual(row.recommended_actions, []);
  assert.match(row.resolution_note, /no derivable classification from the class table or the observed output/);
});

// ── buildNoDerivableClassificationFlagRow (D17 family 4 part 2) ─────────────────────────────────

test("buildNoDerivableClassificationFlagRow: born already-resolved, distinct subtype from the proposal-bearing flag", () => {
  const row = buildNoDerivableClassificationFlagRow({ id: "src-9" }, new Date("2026-09-12T00:00:00Z"));
  assert.equal(row.status, "resolved");
  assert.equal(row.resolved_by, "propose-classifications.mjs");
  assert.notEqual(row.created_by, createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE));
  assert.equal(row.created_by, createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE));
  assert.match(row.resolution_note, /2026-09-12/);
  assert.match(row.resolution_note, /re-evaluated on the next classify run/);
});

test("buildClassificationFlagRow: PROPOSALS_JSON round-trips the exact proposals array, including advisory-only entries", () => {
  const source = { id: "src-3" };
  const proposals = [
    { field: "scope_modes", value: ["ocean"], confidence: "high", basis: "x", applicable: true },
    { field: "jurisdictions", value: ["GB"], confidence: "high", basis: "y", applicable: false },
  ];
  const row = buildClassificationFlagRow(source, { proposals });
  const m = /PROPOSALS_JSON: (\[.*\])$/s.exec(row.description);
  assert.ok(m);
  assert.deepEqual(JSON.parse(m[1]), proposals);
});

test("buildClassificationFlagRow: an advisory-only-proposal flag explains why apply-classifications.mjs will never write it, with no --execute apply command offered", () => {
  const source = { id: "src-4" };
  const proposals = [{ field: "jurisdictions", value: ["GB"], confidence: "high", basis: "x", applicable: false }];
  const row = buildClassificationFlagRow(source, { proposals });
  assert.ok(row.recommended_actions.some((a) => a.includes("no safe apply target")));
  assert.ok(!row.recommended_actions.some((a) => a.includes("--execute")), "no runnable apply command should be offered when nothing is applicable");
});

// ── buildDriftFlagRow ────────────────────────────────────────────────────────────────────────────

test("buildDriftFlagRow: names only the categories over threshold, largest first, carries the deltas JSON", () => {
  const source = { id: "src-5", name: "Some Vendor" };
  const expected = { regulations: 0, research: 0, market: 0.9, operations: 0, out_of_scope: 0.1 };
  const observed = { regulations: 0.6, research: 0, market: 0.3, operations: 0, out_of_scope: 0.1 };
  const drift = detectDrift(observed, expected, DRIFT_THRESHOLD_POINTS);
  assert.equal(drift.drifted, true);
  const row = buildDriftFlagRow(source, drift);
  assert.equal(row.category, "source_issue");
  assert.equal(row.subject_type, "source");
  assert.equal(row.created_by, createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE));
  assert.match(row.description, /regulations \(\+60\.0pp\)/);
  assert.match(row.description, /market \(\+60\.0pp\)/);
  assert.match(row.description, /DELTAS_JSON: \{/);
  assert.ok(!row.description.includes("operations ("), "a category under threshold must not be named");
});

// buildAnomalyFlagRow DELETED (D17 family 5, defect-fix-plan-2026-09-12) -- see propose-classifications.mjs's
// own file header for the retirement rationale; there is no replacement builder to test here. Any
// surviving open item-anomaly flag is retired by apply-classifications.mjs's retireAnomalyFlag, tested
// in that file's own test suite.

// ── groupItemsBySource ───────────────────────────────────────────────────────────────────────────

test("groupItemsBySource: groups by source_id, drops items with no source_id", () => {
  const items = [
    { id: "a", source_id: "s1" }, { id: "b", source_id: "s1" },
    { id: "c", source_id: "s2" }, { id: "d", source_id: null }, { id: "e" },
  ];
  const grouped = groupItemsBySource(items);
  assert.deepEqual(grouped.get("s1").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(grouped.get("s2").map((r) => r.id), ["c"]);
  assert.equal(grouped.size, 2);
});

test("groupItemsBySource: empty/undefined input -> empty map, no throw", () => {
  assert.equal(groupItemsBySource([]).size, 0);
  assert.equal(groupItemsBySource(undefined).size, 0);
});

// ── planReflect composition (reused, unmodified, from propose-tags.mjs) ────────────────────────────
// Proves this module's own createdBy subtype strings compose correctly with the generic reused
// function — NOT re-testing planReflect's own logic (propose-tags.test.mjs already does that).

test("planReflect: a fresh classification finding with no matching existing open row is a new insert", () => {
  const source = { id: "src-7" };
  const row = buildClassificationFlagRow(source, { proposals: [{ field: "scope_topics", value: ["environmental"], confidence: "medium", basis: "x", applicable: true }] });
  const plan = planReflect([], [{ subjectRef: buildSubjectRef("src-7"), row }]);
  assert.equal(plan.newRows.length, 1);
  assert.equal(plan.newRows[0].created_by, createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE));
});

test("planReflect: a drift flag and a classification flag on the SAME source do not collide (different created_by -> different dedup key)", () => {
  const source = { id: "src-8", name: "x" };
  const classifyRow = buildClassificationFlagRow(source, { proposals: [{ field: "scope_topics", value: ["fuel"], confidence: "medium", basis: "x", applicable: true }] });
  const driftRow = buildDriftFlagRow(source, { deltas: { regulations: 40, research: 0, market: 0, operations: 0, out_of_scope: 0 } });
  const existing = [{ id: "flag-classify", subject_ref: buildSubjectRef("src-8"), created_by: createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE) }];
  // This run only recomputes the DRIFT finding for src-8 (mirrors a --drift-only invocation, which
  // reflects with an EXACT createdBy match per this script's own per-subtype scoping, so the
  // classification flag's existing row is never even in `existingOpen` for a drift-only reflect call).
  const plan = planReflect(existing.filter((r) => r.created_by === createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE)), [{ subjectRef: buildSubjectRef("src-8"), row: driftRow }]);
  assert.equal(plan.newRows.length, 1);
  assert.deepEqual(plan.staleIds, [], "the classification flag must never be touched by a drift-scoped reflect call");
});
