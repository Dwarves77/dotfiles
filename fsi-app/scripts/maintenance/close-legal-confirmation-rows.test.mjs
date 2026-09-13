// close-legal-confirmation-rows.test.mjs -- dependency-injected, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planLegalConfirmation,
  buildDeferralFlagRow,
  main,
  LEGACY_REMEDIATION_DEFERRAL,
  AUTHORSHIP_RESOLVED_BY,
  AUTHORSHIP_RESOLUTION_NOTE,
  DEFERRAL_CREATED_BY,
} from "./close-legal-confirmation-rows.mjs";
import { isValidDeferral } from "../lib/deferral.mjs";

// ── the fixed deferral payload itself ───────────────────────────────────────────────────────────────

test("LEGACY_REMEDIATION_DEFERRAL is a VALID RD-6 deferral (isValidDeferral passes against a fixed 'now')", () => {
  const verdict = isValidDeferral(LEGACY_REMEDIATION_DEFERRAL, new Date("2026-09-12T00:00:00Z"));
  assert.equal(verdict.ok, true, verdict.error);
});

test("LEGACY_REMEDIATION_DEFERRAL names a disposition-path keyword the plan's own literal text lacked", () => {
  assert.match(LEGACY_REMEDIATION_DEFERRAL.reason, /reground/i);
  assert.match(LEGACY_REMEDIATION_DEFERRAL.reason, /primary source/i);
  assert.equal(LEGACY_REMEDIATION_DEFERRAL.owner, "operator");
  assert.equal(LEGACY_REMEDIATION_DEFERRAL.resolution_event, "acquire lock lifted");
  assert.equal(LEGACY_REMEDIATION_DEFERRAL.deferred_until, "2026-10-15");
});

// ── planLegalConfirmation ────────────────────────────────────────────────────────────────────────────

test("planLegalConfirmation: an authorship-shard BLOCKER (not a run summary) is a legal-confirmation candidate", () => {
  const rows = [
    { id: "a1", created_by: "authorship-shard-8", description: "AUTHORSHIP-SHARD-8 BLOCKER: item needs operator decision on role placement, novel case", subject_ref: "item-1" },
  ];
  const { authorshipBlockers, legacyParked, kept } = planLegalConfirmation(rows);
  assert.equal(authorshipBlockers.length, 1);
  assert.equal(legacyParked.length, 0);
  assert.equal(kept.length, 0);
  assert.equal(authorshipBlockers[0].id, "a1");
});

test("planLegalConfirmation: an authorship-shard RUN SUMMARY is kept (close-run-logs.mjs's own scope)", () => {
  const rows = [
    { id: "a2", created_by: "authorship-shard-3", description: "attempted 10, completed 8, parked 1, flagged 1" },
  ];
  const { authorshipBlockers, kept } = planLegalConfirmation(rows);
  assert.equal(authorshipBlockers.length, 0);
  assert.equal(kept.length, 1);
  assert.match(kept[0].reason, /close-run-logs\.mjs's own scope/);
});

test("planLegalConfirmation: a legacy-remediation PARKED row (not RUN SUMMARY) is a deferral candidate", () => {
  const rows = [
    { id: "l1", created_by: "legacy-remediation", description: "PARKED: item awaiting re-acquire", subject_ref: "item-2", category: "data_quality" },
  ];
  const { legacyParked, authorshipBlockers, kept } = planLegalConfirmation(rows);
  assert.equal(legacyParked.length, 1);
  assert.equal(authorshipBlockers.length, 0);
  assert.equal(kept.length, 0);
});

test("planLegalConfirmation: a legacy-remediation RUN SUMMARY is kept", () => {
  const rows = [{ id: "l2", created_by: "legacy-remediation", description: "RUN SUMMARY: 40 items processed" }];
  const { legacyParked, kept } = planLegalConfirmation(rows);
  assert.equal(legacyParked.length, 0);
  assert.equal(kept.length, 1);
});

test("planLegalConfirmation: an unrelated created_by is kept, unmatched", () => {
  const rows = [{ id: "x1", created_by: "some-other-writer", description: "whatever" }];
  const { kept } = planLegalConfirmation(rows);
  assert.equal(kept.length, 1);
  assert.match(kept[0].reason, /matches neither family/);
});

test("planLegalConfirmation: empty input is safe", () => {
  const r = planLegalConfirmation([]);
  assert.deepEqual(r, { authorshipBlockers: [], legacyParked: [], kept: [] });
});

// ── buildDeferralFlagRow ─────────────────────────────────────────────────────────────────────────────

test("buildDeferralFlagRow: reuses the original row's category, subject_type item, created_by disposition_deferred, status open", () => {
  const row = buildDeferralFlagRow({ subject_ref: "item-2", category: "data_quality" });
  assert.equal(row.category, "data_quality");
  assert.equal(row.subject_type, "item");
  assert.equal(row.subject_ref, "item-2");
  assert.equal(row.status, "open");
  assert.equal(row.created_by, DEFERRAL_CREATED_BY);
  assert.deepEqual(row.recommended_actions, [{ deferral: LEGACY_REMEDIATION_DEFERRAL }]);
});

test("buildDeferralFlagRow: falls back to workflow_gap when the original row carries no category", () => {
  const row = buildDeferralFlagRow({ subject_ref: "item-3" });
  assert.equal(row.category, "workflow_gap");
});

// ── main() orchestration under injected deps ────────────────────────────────────────────────────────

function fakeDeps({ rows = [] } = {}) {
  const resolvedIds = [];
  const deferralsWritten = [];
  return {
    readCandidates: async () => rows,
    resolveAuthorshipBlockers: async (ids) => { resolvedIds.push(...ids); return { updated: ids.length, snapshot: "scripts/_snapshots/fake.jsonl" }; },
    writeDeferralFlag: async (row) => { deferralsWritten.push(row); return { inserted: { id: `flag-${deferralsWritten.length}` } }; },
    readBack: async () => ({ authorship_shard_still_open_total: 0, authorship_shard_still_open_non_run_summary: 0, open_disposition_deferred_total: deferralsWritten.length }),
    _resolvedIds: () => resolvedIds,
    _deferralsWritten: () => deferralsWritten,
  };
}

test("main(dry): reports counts, writes nothing", async () => {
  const rows = [
    { id: "a1", created_by: "authorship-shard-8", description: "BLOCKER: novel case", subject_ref: "item-1" },
    { id: "l1", created_by: "legacy-remediation", description: "PARKED: item-2", subject_ref: "item-2", category: "data_quality" },
  ];
  const deps = fakeDeps({ rows });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.authorship_blockers, 1);
  assert.equal(summary.counts.legacy_parked, 1);
  assert.equal(deps._resolvedIds().length, 0);
  assert.equal(deps._deferralsWritten().length, 0);
  assert.match(summary.note, /DRY/);
});

test("main(apply): resolves authorship BLOCKER rows with the legal-confirmation note", async () => {
  const rows = [{ id: "a1", created_by: "authorship-shard-8", description: "BLOCKER: novel case", subject_ref: "item-1" }];
  const deps = fakeDeps({ rows });
  const summary = await main({ mode: "apply" }, deps);
  assert.deepEqual(deps._resolvedIds(), ["a1"]);
  assert.equal(summary.counts.authorship_write.updated, 1);
  assert.equal(summary.applied, 1);
});

test("main(apply): writes a companion disposition_deferred flag per legacy-remediation PARKED row, original row untouched", async () => {
  const rows = [
    { id: "l1", created_by: "legacy-remediation", description: "PARKED: item-2", subject_ref: "item-2", category: "data_quality" },
    { id: "l2", created_by: "legacy-remediation", description: "PARKED: item-3", subject_ref: "item-3", category: "data_quality" },
  ];
  const deps = fakeDeps({ rows });
  const summary = await main({ mode: "apply" }, deps);
  const written = deps._deferralsWritten();
  assert.equal(written.length, 2);
  assert.equal(written[0].subject_ref, "item-2");
  assert.equal(written[0].created_by, DEFERRAL_CREATED_BY);
  assert.equal(summary.task_7_3_residue.deferred.length, 2);
  assert.equal(summary.task_7_3_residue.deferred[0].subject_ref, "item-2");
  assert.equal(summary.task_7_3_residue.deferred[0].original_flag_id, "l1");
  assert.equal(summary.applied, 2);
  // the ORIGINAL legacy-remediation rows are never touched by resolveAuthorshipBlockers/closeIds --
  // nothing in fakeDeps updates them, and this step's own deps never expose a call that could.
});

test("resolution constants match the plan's exact ruling text", () => {
  assert.equal(AUTHORSHIP_RESOLVED_BY, "close-legal-confirmation-rows");
  assert.match(AUTHORSHIP_RESOLUTION_NOTE, /Legal Confirmation Required/);
  assert.match(AUTHORSHIP_RESOLUTION_NOTE, /recorded for counsel/);
});
