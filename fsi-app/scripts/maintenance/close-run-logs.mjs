#!/usr/bin/env node
// close-run-logs.mjs -- MAINT step for task 7.1 of the W9 brief-chain build plan, Part 7 (ADR-030 rider,
// 2026-09-12): "admin is visibility, never a gate." Run-log rows in integrity_flags are informational --
// a fleet-charter CLOSE step, a legacy remediation lane, or a citation-harvest batch already wrote its own
// summary as a flag, and nothing about that summary requires a human click to resolve. This step closes
// three named families:
//
//   1. authorship-shard-N (about 370 rows) -- created_by starting "authorship-shard-". The authorship
//      fleet charter (docs/runbooks/fleet-charters/authorship-worker.md) mandates a CLOSE step that writes
//      a run-summary flag every firing; "authorship-shard-N" is the PRE-CONSOLIDATION (before 2026-08-08)
//      12-shard charter's own created_by convention -- the charter's own STEP 1 ORIENT query still reads
//      `created_by IN ('authorship-worker','authorship-shard-0')` as historical precedent, confirming
//      these are the shards' own run logs, never a per-item question.
//   2. legacy-remediation rows whose description BEGINS with "RUN SUMMARY" -- the per-run summary a prior
//      remediation lane wrote. The per-item PARKED rows from the SAME created_by are explicitly OUT OF
//      SCOPE here (task 7.3 resolves those from their stored pools); this step only ever matches the
//      RUN SUMMARY prefix, never a bare `created_by === "legacy-remediation"` match.
//   3. citation-harvest* batch summary rows -- the per-batch report a citation-harvest run wrote. The
//      backlog counts a batch summary names are RE-DERIVED LIVE elsewhere (task 7.4's resolvers); this
//      step never carries any of that backlog forward, it only closes the informational row.
//
// THE RULE (verbatim, Part 7 spec): "A lane implements the rule in the existing resolver, widening its
// auto-adopt to the whole proposal set with the decision written into the flag's resolution_note." For a
// run log the decision is always the same: informational, closed, record kept. resolution_note is fixed:
// "run log, informational; closed under ADR-030 rider (Part 7.1)"; resolved_by is "close-run-logs". The
// row is RESOLVED, never deleted or archived -- "the record stays; the queue empties" (spec 7.1).
//
// NEVER a per-item question. `isPerItemQuestion` is a universal guard applied BEFORE any family match: a
// description ending in "?" is a question about a SPECIFIC item awaiting a SPECIFIC answer, never a run
// log, regardless of which created_by wrote it. This is deliberately checked first and applies to all
// three families equally -- a false-positive family match (e.g. a citation-harvest row that happens to ask
// a question) must never be silently closed.
//
// THE SELECTION IS PURE AND TESTED. `decideRunLogClosure({created_by, description})` is a pure function
// over exactly the two fields the rule needs, returning close/keep + the reason either way -- so the dry
// report can list every KEPT row by reason (not just count them), per the spec's own requirement: "the
// dry output lists adopt/decline counts and a ... sample per outcome." `planClosure(rows)` groups a full
// row set into `toClose`/`toKeep`, each entry carrying its own `reason`.
//
// SCOPE OF THE READ. The candidate read is narrowed to the three created_by shapes this step closes
// (`created_by ilike 'authorship-shard-%'`, `created_by = 'legacy-remediation'`, `created_by ilike
// 'citation-harvest%'`) AND `status IN ('open','in_review')` -- never a full-table scan of the 4,805 open
// integrity_flags the Part 7 spec measures corpus-wide (most of those belong to other families this step
// does not touch). A legacy-remediation PARKED row is read (it shares the created_by) but is then KEPT by
// `decideRunLogClosure`'s own RUN SUMMARY prefix check, and reported as kept-with-reason, never silently
// dropped from the report.
//
// NO LIVE VERIFICATION IN THIS SESSION [CONFIRMED per dispatch brief facts, NOT independently re-verified
// here -- no DB credentials in this worktree]. The ~370 authorship-shard count, the legacy-remediation
// RUN SUMMARY / PARKED split, and the citation-harvest batch-summary shape are read from the coordinator's
// own read-only-SQL resolver map (Part 7 brief, 2026-09-12), cited as [CONFIRMED by that map's own method]
// in this file's report; this script's own dry mode is the mechanism that re-confirms them live at
// dispatch time before any apply.
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 Part 7 task 7.1 / ADR-030 rider",
  reason:
    "Close informational run-log rows in integrity_flags (authorship-shard-N, legacy-remediation RUN " +
    "SUMMARY, citation-harvest* batch summaries) per ADR-030's rider: no queue on the admin page may " +
    "require a human click to resolve; a run log is closed by the runtime that recognizes it as one, " +
    "with the decision recorded in resolution_note. The record stays (resolved, never deleted); the " +
    "queue empties.",
});

export const RESOLVED_BY = "close-run-logs";
export const RESOLUTION_NOTE = "run log, informational; closed under ADR-030 rider (Part 7.1)";

const FLAG_COLUMNS = "id, created_by, description, status, subject_ref, category";

// ---------------------------------------------------------------------------------------------------
// Pure decision logic (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/** True when `description` is a per-item question, never a run log, regardless of created_by. Pure. */
export function isPerItemQuestion(description) {
  return String(description ?? "").trim().endsWith("?");
}

/** True when `description` (a legacy-remediation row) opens with a RUN SUMMARY marker -- the per-run
 *  report shape, distinct from the per-item PARKED rows task 7.3 handles. Pure. Word-boundary, case-
 *  insensitive so "Run summary:" / "RUN SUMMARY --" etc. all match; a bare "summary" without "RUN" first
 *  does not (never a loose contains-match on a word this common). */
export function isLegacyRemediationRunSummary(description) {
  return /^run\s+summary\b/i.test(String(description ?? "").trim());
}

/**
 * The single decision for one row: close (with which family) or keep (with why). Pure, no I/O.
 * @param {{ created_by?: string|null, description?: string|null }} row
 * @returns {{ close: boolean, family: string|null, reason: string }}
 */
export function decideRunLogClosure({ created_by, description } = {}) {
  const cb = String(created_by ?? "");
  const desc = String(description ?? "");

  // Universal guard, checked before any family match: a per-item question is never a run log.
  if (isPerItemQuestion(desc)) {
    return {
      close: false,
      family: null,
      reason: "description is a per-item question (ends with '?') -- never a run log regardless of created_by",
    };
  }

  if (cb.startsWith("authorship-shard-")) {
    return {
      close: true,
      family: "authorship-shard",
      reason: "authorship-shard run-summary write (pre-consolidation shard charter CLOSE step)",
    };
  }

  if (cb === "legacy-remediation") {
    if (isLegacyRemediationRunSummary(desc)) {
      return {
        close: true,
        family: "legacy-remediation-run-summary",
        reason: "legacy-remediation row opens with a RUN SUMMARY marker",
      };
    }
    return {
      close: false,
      family: null,
      reason: "legacy-remediation row does not open with RUN SUMMARY -- a per-item PARKED entry, task 7.3's scope, not this step's",
    };
  }

  if (cb.startsWith("citation-harvest")) {
    return {
      close: true,
      family: "citation-harvest-batch-summary",
      reason: "citation-harvest batch summary row (its backlog counts are re-derived live elsewhere, never carried forward by this close)",
    };
  }

  return {
    close: false,
    family: null,
    reason: "created_by matches none of the three run-log families this step closes (authorship-shard-*, legacy-remediation RUN SUMMARY, citation-harvest*)",
  };
}

/**
 * Partition a full candidate row set into toClose/toKeep, each entry carrying the row plus its decision.
 * Pure. `toKeep` entries are grouped by `reason` in the caller's summary so a dry report can list every
 * kept row by reason (spec requirement), not just a count.
 * @param {Array<{id:string, created_by?:string|null, description?:string|null}>} rows
 */
export function planClosure(rows) {
  const toClose = [];
  const toKeep = [];
  for (const row of rows ?? []) {
    const decision = decideRunLogClosure(row);
    const entry = { id: row.id, created_by: row.created_by, family: decision.family, reason: decision.reason };
    if (decision.close) toClose.push(entry);
    else toKeep.push(entry);
  }
  return { toClose, toKeep };
}

/** Group a list of {family|reason} entries into counts, for the summary. Pure. */
export function groupCounts(entries, keyFn) {
  const out = {};
  for (const e of entries) {
    const k = keyFn(e) ?? "(none)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readCandidates: () => Promise<Array>, closeIds: (ids:string[]) => Promise<{updated:number, snapshot:string|null}>,
 *   readRemainingOpen: () => Promise<Array> }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "close-run-logs", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readCandidates();
  const { toClose, toKeep } = planClosure(rows);

  summary.counts = {
    candidates_scanned: rows.length,
    would_close: toClose.length,
    kept: toKeep.length,
    by_family_closed: groupCounts(toClose, (e) => e.family),
    by_reason_kept: groupCounts(toKeep, (e) => e.reason),
  };
  // Full kept list (id + reason) so the dry report can name every kept row, per the spec's own
  // requirement -- never just a count. Bounded to a readable sample plus the total, mirroring the
  // 20-row-sample convention other Part 7 steps use (source-credibility-model's own review-queue sizing).
  summary.kept_sample = toKeep.slice(0, 20);
  summary.kept_total = toKeep.length;

  if (!apply) {
    summary.note =
      `DRY -- ${toClose.length} run-log row(s) would close (${JSON.stringify(summary.counts.by_family_closed)}); ` +
      `${toKeep.length} row(s) kept (${JSON.stringify(summary.counts.by_reason_kept)}). Nothing written.`;
    return summary;
  }

  const ids = toClose.map((e) => e.id);
  const res = ids.length
    ? await deps.closeIds(ids)
    : { updated: 0, snapshot: null };
  summary.applied = res.updated;
  summary.counts.write = { attempted: ids.length, updated: res.updated, snapshot: res.snapshot };

  const remaining = await deps.readRemainingOpen();
  summary.read_back = {
    remaining_open_in_families: remaining.length,
    remaining_sample: remaining.slice(0, 20).map((r) => ({ id: r.id, created_by: r.created_by })),
  };
  summary.note =
    `Closed ${res.updated}/${ids.length} run-log row(s). ${remaining.length} row(s) remain open in these ` +
    `three families (expected: kept-per-item-question rows, if any, plus a race against a concurrent writer).`;

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "close-run-logs",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readCandidates: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) =>
            q
              .in("status", ["open", "in_review"])
              .or("created_by.ilike.authorship-shard-%,created_by.eq.legacy-remediation,created_by.ilike.citation-harvest%"),
        }),
      closeIds: (ids) =>
        guardedUpdateByIds(
          "integrity_flags",
          ids,
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: RESOLUTION_NOTE },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        ),
      readRemainingOpen: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) =>
            q
              .in("status", ["open", "in_review"])
              .or("created_by.ilike.authorship-shard-%,created_by.eq.legacy-remediation,created_by.ilike.citation-harvest%"),
        }),
    }),
  });
}
