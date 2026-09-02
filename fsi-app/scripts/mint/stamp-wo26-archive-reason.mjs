#!/usr/bin/env node
// stamp-wo26-archive-reason.mjs — hygiene stamp: archive_reason = 'out_of_scope_wo26' on the WO-26
// scope-purge rows that were archived without one (Lane POP, 2026-09-01).
//
// WHY THIS EXISTS. `docs/ops/session-log.md` Addendum 28 (2026-08-21, "the operator caught a paraphrase
// wearing a ruling's clothes, and 632 customs items came out reversibly") executed the WO-26 scope purge
// under the operator's ADR-020 ruling ("Caro's Ledge is a freight-sustainability platform, first" —
// customs/transport-administration law is a PARKED FUTURE VERTICAL, archived reversibly, never deleted):
// 632 customs/transport-administration EUR-Lex items were archived, but the operation never stamped
// `archive_reason` on the rows it touched. `docs/audits/system-review-2026-09-01.md` measured the live
// consequence: "513 verified archived, 491 were archived on 2026-08-21 with archive_reason = NULL...
// [and] 456 would_mint queue rows are blocked by holders in that unstamped wave" — the mint family's
// canonical-key holder check (mint-run-006.json's M4 pre-check, "not_applied_holder_conflict") cannot
// distinguish an ALREADY-RULED-ON WO-26 exclusion from any other archived holder without a reason on the
// row, so every one of those 456 blocked census rows reads as an unexplained collision instead of an
// honest, decided scope exclusion.
//
// TARGET (Addendum 28 + system-review-2026-09-01.md's population section, re-measured LIVE by this
// script before any write — never trusted from the doc alone):
//   intelligence_items WHERE is_archived = true AND archive_reason IS NULL
//                        AND archived_date = '2026-08-21' AND provenance_status = 'verified'
//   — 491 rows expected. A live count that disagrees is REPORTED, never silently overridden by
//   EXPECTED_COUNT (this script proceeds on the live measurement either way; the mismatch is a signal
//   for a human to look, not a reason to refuse — Addendum 28's own 632-vs-491 gap is itself explained
//   there: not every one of the 632 was verified+live by 2026-09-01).
//
// WHAT THIS TOUCHES. ONLY `archive_reason` — never `is_archived`, `provenance_status`, or any other
// column. Purely descriptive metadata over an already-decided, already-executed archive; this script
// mints nothing, un-archives nothing, and re-litigates no scope decision.
//
// DRY-RUN by default (the default posture every guarded script in this repo takes); --apply writes via
// db.mjs's guarded path (cite + prior-value snapshot + read-back verification — see guardedUpdate).
// Idempotent: a second run finds 0 matching rows (archive_reason is no longer NULL on the ones already
// stamped). Rule-012: import.meta.url-relative env load, no hardcoded absolute paths.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* no .env.local in this environment — real calls will refuse in db.mjs instead */ }

export const ARCHIVE_REASON = "out_of_scope_wo26";
export const TARGET_DATE = "2026-08-21";
// docs/audits/system-review-2026-09-01.md's measured figure — a report-only expectation, not a gate.
export const EXPECTED_COUNT = 491;

export const CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "WO-26 archive-reason hygiene stamp (Lane POP, 2026-09-01, docs/ops/session-log.md Addendum 28): " +
    "the 2026-08-21 scope purge (ADR-020, 'Caro's Ledge is a freight-sustainability platform, first') " +
    "archived 632 customs/transport-administration EUR-Lex items reversibly under an operator ruling but " +
    "never stamped archive_reason on the rows it touched. This stamp adds only descriptive metadata " +
    "(archive_reason='out_of_scope_wo26') so dedup and the mint family's canonical-key holder check " +
    "(mint-run-006.json's M4 pre-check) can distinguish this already-ruled-on exclusion from any other " +
    "archive reason on the 456 would_mint census rows it currently blocks unexplained.",
});

/**
 * Pure predicate mirror of the live filter — one row's shape, no I/O — so the target definition is
 * unit-testable without a DB. The live query (applyMatch, below) expresses the identical four
 * conditions via the query builder; this function exists to let the row-selection LOGIC be tested and
 * read in isolation from the Supabase call shape.
 */
export function isWo26UnstampedRow(row) {
  return (
    row?.is_archived === true &&
    (row?.archive_reason === null || row?.archive_reason === undefined) &&
    row?.archived_date === TARGET_DATE &&
    row?.provenance_status === "verified"
  );
}

/** The guarded-write filter — identical four conditions as isWo26UnstampedRow, expressed as a query. */
function applyMatch(qb) {
  return qb
    .eq("is_archived", true)
    .is("archive_reason", null)
    .eq("archived_date", TARGET_DATE)
    .eq("provenance_status", "verified");
}

/**
 * @param {{ apply?: boolean }} [opts]
 * @returns {Promise<{ mode: "dry-run" | "apply", matched: number, written?: number }>}
 */
export async function main({ apply = false } = {}) {
  console.log(`[stamp-wo26] mode = ${apply ? "APPLY" : "DRY-RUN"}`);

  const rows = await readAll("intelligence_items", "id, is_archived, archive_reason, archived_date, provenance_status");
  const targets = rows.filter(isWo26UnstampedRow);
  console.log(`[stamp-wo26] matching rows (live): ${targets.length} (system-review-2026-09-01.md cited ${EXPECTED_COUNT})`);
  if (targets.length !== EXPECTED_COUNT) {
    console.warn(
      `[stamp-wo26] COUNT vs. DOC MISMATCH — live measurement is ${targets.length}, the audit cited ` +
      `${EXPECTED_COUNT}. Proceeding on the LIVE measurement (a live read is never overridden by a doc's ` +
      `number) — worth a human look before --apply if this session did not expect drift.`,
    );
  }
  for (const t of targets.slice(0, 10)) console.log(`   ${t.id.slice(0, 8)}`);
  if (targets.length > 10) console.log(`   … and ${targets.length - 10} more`);

  if (!apply) {
    console.log("[stamp-wo26] DRY-RUN — pass --apply to write.");
    return { mode: "dry-run", matched: targets.length };
  }
  if (!targets.length) {
    console.log("[stamp-wo26] nothing to write.");
    return { mode: "apply", matched: 0, written: 0 };
  }

  // By id, in chunks (db.mjs guardedUpdateByIds): one UPDATE over the whole wave ran past the API's
  // statement timeout on the first live apply (population-turn run #6, 2026-09-02) because
  // set_provenance_status_trg re-derives provenance per row. The four-condition match is re-applied on
  // every chunk so nothing outside the live measurement above is ever touched.
  const res = await guardedUpdateByIds(
    "intelligence_items",
    targets.map((t) => t.id),
    { archive_reason: ARCHIVE_REASON },
    { cite: CITE, select: "id, archive_reason", applyMatch },
  );
  const written = (res.rows || []).filter((r) => r.archive_reason === ARCHIVE_REASON).length;
  console.log(`[stamp-wo26] written+verified=${written} of matched=${targets.length} in ${res.chunks} chunk(s) (snapshots: ${res.snapshots.length})`);
  if (written !== targets.length) {
    console.error(`[stamp-wo26] MISMATCH — expected to stamp ${targets.length}, guardedUpdate read back ${written}`);
    process.exitCode = 1;
  }
  return { mode: "apply", matched: targets.length, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main({ apply: process.argv.includes("--apply") }).catch((e) => {
    console.error("[stamp-wo26] fatal:", e);
    process.exit(1);
  });
}
