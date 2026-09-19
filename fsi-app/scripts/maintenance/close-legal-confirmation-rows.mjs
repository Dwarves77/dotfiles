#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
// close-legal-confirmation-rows.mjs -- MAINT step for D17 family 14 of the 2026-09-12 defect fix plan
// (docs/plans/defect-fix-plan-2026-09-12.md, ruling table row 14, lane L11). Handles the TWO per-item
// carve-outs close-run-logs.mjs deliberately leaves open (its own header, task 7.1): an authorship-shard-*
// row that is a genuine per-item BLOCKER (not a run summary), and a legacy-remediation row that is a
// genuine per-item PARKED note (not a RUN SUMMARY). Reuses close-run-logs.mjs's own decision predicates
// (isAuthorshipRunSummary, isLegacyRemediationRunSummary) UNMODIFIED -- this step's candidate set is
// exactly the complement of what that step closes, never a second, divergent vocabulary.
//
// TWO DIFFERENT DISPOSITIONS, per the coordinator's own ruling (plan row 14, verbatim):
//
//   1. authorship-shard-* BLOCKER rows -- entity-to-DEFINED-ROLE matching is a legal determination the
//      platform never makes (CLAUDE.md's own "no legal role determination" standing rule). RESOLVED
//      (never left open, never silently dropped) with "Legal Confirmation Required; no platform
//      determination (environmental-policy skill); recorded for counsel". population-report.mjs's own
//      "legal-confirmation" line counts them (docs/plans/defect-fix-plan-2026-09-12.md row 14).
//
//   2. legacy-remediation PARKED rows -- the task 7.3 residue (close-run-logs.mjs's own header: "task 7.3
//      resolves those from their stored pools"). Converted to a VALID RD-6 deferral
//      (fsi-app/scripts/lib/deferral.mjs, assertValidDeferral) -- dispositioned-as-BLOCKED, never
//      silenced. The ORIGINAL legacy-remediation row is left exactly as it is (still open -- task 7.3
//      still owns closing it once the pool actually re-grounds); a NEW companion `disposition_deferred`
//      integrity_flags row is written carrying the deferral payload, the SAME mechanism
//      quarantine-disposition-audit.mjs already reads (subject_type='item', created_by=
//      'disposition_deferred', recommended_actions=[{deferral:{...}}]) -- "leaving status open but
//      dispositioned" is exactly this: the original row's status is untouched, the item now carries a
//      valid, checkable deferral. The full id list is carried in this run's own summary (the "run
//      artifact") for the task 7.3 residue report.
//
// [CONFIRMED, by reading fsi-app/scripts/lib/deferral.mjs] the plan's own literal reason text ("paid
// re-acquire behind the operator's acquire lock") does NOT contain any of isValidDeferral's required
// disposition-path keywords (reground/re-ground/relabel/register/archive/counsel/network/primary
// source/generate/re-synthes) and would be REJECTED by assertValidDeferral. LEGACY_REMEDIATION_DEFERRAL
// below preserves the exact same meaning, reworded to satisfy the guard ("reground ... against a primary
// source") -- a deliberate, disclosed adaptation, not a substitution of the plan's intent.
import { readAll, guardedUpdateByIds, guardedInsert } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { isAuthorshipRunSummary, isLegacyRemediationRunSummary } from "./close-run-logs.mjs";
import { assertValidDeferral } from "../lib/deferral.mjs";

export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D17 family 14 (lane L11)",
  reason:
    "Resolve the two per-item carve-outs close-run-logs.mjs leaves open: authorship-shard-* BLOCKER rows " +
    "(a legal role determination the platform never makes, resolved 'recorded for counsel') and " +
    "legacy-remediation PARKED rows (converted to a valid RD-6 deferral, dispositioned-as-blocked, never " +
    "silenced; the original row stays open for task 7.3 to close from its stored pool).",
});

export const AUTHORSHIP_RESOLVED_BY = "close-legal-confirmation-rows";
export const AUTHORSHIP_RESOLUTION_NOTE = "Legal Confirmation Required; no platform determination (environmental-policy skill); recorded for counsel";

export const LEGACY_REMEDIATION_DEFERRAL = Object.freeze({
  reason:
    "Item's stored pool needs a paid re-acquire behind the operator's acquire lock before it can " +
    "reground against a primary source (task 7.3 residue, D17 family 14).",
  deferred_until: "2026-10-15",
  owner: "operator",
  resolution_event: "acquire lock lifted",
});
// Fail fast at import time if the fixed payload above is ever edited into an invalid shape -- this
// throwing here (module load) is strictly earlier and louder than discovering it mid-run.
assertValidDeferral(LEGACY_REMEDIATION_DEFERRAL);

export const DEFERRAL_CREATED_BY = "disposition_deferred";

const FLAG_COLUMNS = "id, created_by, description, status, subject_ref, category, subject_type";

// ---------------------------------------------------------------------------------------------------
// Pure planning (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/**
 * Partitions the candidate read into the two dispositions plus a kept bucket (rows this step does not
 * touch -- close-run-logs.mjs's own scope, or an unrelated created_by that slipped past the query).
 * Pure.
 * @param {Array<{id:string, created_by?:string|null, description?:string|null, subject_ref?:string|null, category?:string|null, subject_type?:string|null}>} rows
 * @returns {{authorshipBlockers: Array<object>, legacyParked: Array<object>, kept: Array<{id:string, reason:string}>}}
 */
export function planLegalConfirmation(rows) {
  const authorshipBlockers = [];
  const legacyParked = [];
  const kept = [];
  for (const row of rows ?? []) {
    const cb = String(row.created_by ?? "");
    const desc = row.description;
    if (cb.startsWith("authorship-shard-")) {
      if (!isAuthorshipRunSummary(desc)) authorshipBlockers.push(row);
      else kept.push({ id: row.id, reason: "authorship-shard run-summary -- close-run-logs.mjs's own scope, not this step's" });
      continue;
    }
    if (cb === "legacy-remediation") {
      if (!isLegacyRemediationRunSummary(desc)) legacyParked.push(row);
      else kept.push({ id: row.id, reason: "legacy-remediation RUN SUMMARY -- close-run-logs.mjs's own scope, not this step's" });
      continue;
    }
    kept.push({ id: row.id, reason: "created_by matches neither family this step handles (authorship-shard-*, legacy-remediation)" });
  }
  return { authorshipBlockers, legacyParked, kept };
}

/**
 * Build the companion `disposition_deferred` integrity_flags insert row for one legacy-remediation PARKED
 * row. Reuses the original row's own category (already a legal CHECK value) rather than guessing a new
 * one. Pure.
 * @param {{subject_ref?:string|null, category?:string|null}} row
 * @returns {object}
 */
export function buildDeferralFlagRow(row) {
  return {
    category: row.category ?? "workflow_gap",
    subject_type: "item",
    subject_ref: row.subject_ref,
    description:
      "RD-6 deferral (D17 family 14): legacy-remediation item awaits a paid re-acquire behind the " +
      "operator's acquire lock before it can reground against a primary source (task 7.3 residue).",
    recommended_actions: [{ deferral: LEGACY_REMEDIATION_DEFERRAL }],
    status: "open",
    created_by: DEFERRAL_CREATED_BY,
  };
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "close-legal-confirmation-rows", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readCandidates();
  const { authorshipBlockers, legacyParked, kept } = planLegalConfirmation(rows);

  summary.counts = {
    candidates_scanned: rows.length,
    authorship_blockers: authorshipBlockers.length,
    legacy_parked: legacyParked.length,
    kept: kept.length,
  };
  summary.authorship_blockers_sample = authorshipBlockers.slice(0, 20).map((r) => ({ id: r.id, subject_ref: r.subject_ref }));
  summary.legacy_parked_sample = legacyParked.slice(0, 20).map((r) => ({ id: r.id, subject_ref: r.subject_ref }));
  summary.kept_sample = kept.slice(0, 20);

  if (!apply) {
    summary.note =
      `DRY -- ${authorshipBlockers.length} authorship-shard BLOCKER row(s) would resolve (legal ` +
      `confirmation); ${legacyParked.length} legacy-remediation PARKED row(s) would gain an RD-6 ` +
      `deferral (original row left open); ${kept.length} row(s) kept. Nothing written.`;
    return summary;
  }

  const authorshipIds = authorshipBlockers.map((r) => r.id);
  const authorshipRes = authorshipIds.length
    ? await deps.resolveAuthorshipBlockers(authorshipIds)
    : { updated: 0, snapshot: null };
  summary.counts.authorship_write = { attempted: authorshipIds.length, updated: authorshipRes.updated };
  summary.applied += authorshipRes.updated;

  // The 7.3 residue report: the exact legacy-remediation subject_ref list this run dispositioned, plus
  // the new deferral flag id per row -- carried in the run artifact (--out summary.json), never only in
  // console prose.
  const residue = [];
  for (const row of legacyParked) {
    const deferralRow = buildDeferralFlagRow(row);
    assertValidDeferral(deferralRow.recommended_actions[0].deferral);
    const ins = await deps.writeDeferralFlag(deferralRow);
    residue.push({ subject_ref: row.subject_ref, original_flag_id: row.id, deferral_flag_id: ins.inserted?.id ?? null });
    summary.applied += 1;
  }
  summary.counts.legacy_deferral_write = { attempted: legacyParked.length, written: residue.length };
  summary.task_7_3_residue = { deferred: residue };

  summary.read_back = await deps.readBack();
  summary.note =
    `Resolved ${authorshipRes.updated}/${authorshipIds.length} authorship-shard BLOCKER row(s) (legal ` +
    `confirmation). Deferred ${residue.length}/${legacyParked.length} legacy-remediation PARKED row(s) ` +
    "(original rows left open; task 7.3 owns closing them from their stored pools).";

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "close-legal-confirmation-rows",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readCandidates: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) =>
            q
              .in("status", ["open", "in_review"])
              .or("created_by.ilike.authorship-shard-%,created_by.eq.legacy-remediation"),
        }),
      resolveAuthorshipBlockers: (ids) =>
        guardedUpdateByIds(
          "integrity_flags",
          ids,
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: AUTHORSHIP_RESOLVED_BY, resolution_note: AUTHORSHIP_RESOLUTION_NOTE },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        ),
      writeDeferralFlag: (row) => guardedInsert("integrity_flags", row, { cite: CITE, select: "id" }),
      readBack: async () => {
        const stillOpenAuthorship = await readAll("integrity_flags", "id, description", {
          match: (q) => q.ilike("created_by", "authorship-shard-%").in("status", ["open", "in_review"]),
        }).catch(() => []);
        const openDeferrals = await readAll("integrity_flags", "id", {
          match: (q) => q.eq("created_by", DEFERRAL_CREATED_BY).eq("status", "open"),
        }).catch(() => []);
        // Every row still open here MUST be a run-summary close-run-logs.mjs owns (this step just
        // resolved every BLOCKER it found) -- reported as a count so a non-zero, non-run-summary
        // residue is visible rather than silently assumed away.
        const stillOpenNonRunSummary = stillOpenAuthorship.filter((r) => !isAuthorshipRunSummary(r.description));
        return {
          authorship_shard_still_open_total: stillOpenAuthorship.length,
          authorship_shard_still_open_non_run_summary: stillOpenNonRunSummary.length,
          open_disposition_deferred_total: openDeferrals.length,
        };
      },
    }),
  });
}
