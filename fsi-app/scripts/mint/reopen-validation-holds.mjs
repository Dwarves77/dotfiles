#!/usr/bin/env node
// reopen-validation-holds.mjs — lane URL-GUIL, 2026-09-03. The symmetric reversal of
// apply-mint-batch.mjs's validation-failed hold-back (see resolveValidationFailedHolds there for the
// write side): re-admits a census_worklist row a mint-batch-report once held
// (dryrun_disposition='hold', hold_reason starting `validation_failed:`) back into the would_mint export
// pool, SCOPED to a hold_reason substring the caller names explicitly.
//
// NO EXISTING RE-TRY RULE — checked before writing this file: no `harness_version`/`kit_version`-keyed
// retry logic exists anywhere in scripts/mint, scripts/turns, or src/lib/intake, and export-census-rows.mjs's
// own EXPORT-HOLD held-key index (buildHeldKeyIndex/partitionExcludeHeldByKey) is a pure, in-memory,
// export-time computation over a LIVE intelligence_items read — it persists nothing to census_worklist at
// all (confirmed: that file makes no census_worklist write of any kind), so there was nothing for a
// validation-failed hold to inherit a re-try rule FROM. This script is therefore the FIRST reopen
// mechanism this table has ever had, built the minimal, honest way: it does NOT re-validate a row itself
// (that would duplicate export-census-rows.mjs's live capture and run-mint-batch.mjs's real C1-C7 gate — a
// live-fetch pipeline this guarded-write script has no business re-implementing, and re-implementing it
// here would risk a SECOND, drifting copy of the exact kind of duplication this repo's own standing rules
// warn against). It only returns a row to the would_mint pool; the population-turn's real capture+validate
// pass, next time it runs, decides the row's fate for real — exactly as it would for any other
// would_mint row, no shortcut taken. A coordinator invokes this DELIBERATELY, scoped by
// --reason-contains, immediately after landing a fix that plausibly resolves the named failure class
// (e.g. `--reason-contains ungrounded_url` after migration 300 lands) — never as a blanket, unscoped, or
// scheduled re-admission; there is no cron entry point here on purpose.
//
// WHAT THIS TOUCHES. Only rows where dryrun_disposition='hold' AND hold_reason starts with
// 'validation_failed:' AND hold_reason contains --reason-contains (case-insensitive substring — see
// isReopenTarget). Sets dryrun_disposition='would_mint', hold_reason=null (the table's own DB CHECK,
// migration 221, requires the two move together: (dryrun_disposition='hold') = (hold_reason IS NOT
// NULL)), and APPENDS a reopen marker to `notes` — the held evidence JSON apply-mint-batch.mjs's hold
// write already recorded there is never overwritten, only added to, so a row's full history (why it was
// held, when it was reopened) survives.
//
// DRY-RUN by default (the posture every guarded script in this repo takes); --apply writes through
// db.mjs's guarded path (cite + prior-value snapshot + read-back). Idempotent: a second run with the same
// --reason-contains finds 0 matching rows once the first has cleared them (dryrun_disposition is no
// longer 'hold').
//
// USAGE:
//   node scripts/mint/reopen-validation-holds.mjs --reason-contains ungrounded_url [--apply]

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const HOLD_PREFIX = "validation_failed:";

export const CITE = Object.freeze({
  skill: "record-tier-population-plan",
  reason:
    "Lane URL-GUIL (2026-09-03) reopen of validation_failed census_worklist holds (see " +
    "apply-mint-batch.mjs's resolveValidationFailedHolds for the write side this reverses): a " +
    "coordinator-invoked, reason-scoped re-admission to the would_mint export pool after a fix " +
    "plausibly resolves the named failure class. No re-validation happens here — the next " +
    "population-turn's real capture+validate pass decides the row's fate for real.",
});

/**
 * Pure predicate: does this row's hold match the reopen scope? Never matches a non-hold row, a hold not
 * carrying this lane's `validation_failed:` vocabulary, or one whose reason substring the caller did not
 * explicitly name (an empty/missing `reasonContains` matches NOTHING — this function is the one place a
 * blanket reopen is refused, mirrored by main()'s own explicit-argument requirement).
 */
export function isReopenTarget(row, reasonContains) {
  if (row?.dryrun_disposition !== "hold") return false;
  const reason = row?.hold_reason;
  if (typeof reason !== "string" || !reason.startsWith(HOLD_PREFIX)) return false;
  if (typeof reasonContains !== "string" || reasonContains.trim() === "") return false;
  return reason.toLowerCase().includes(reasonContains.toLowerCase());
}

/** Append a reopen marker to an existing `notes` value without discarding it (the held evidence JSON this
 *  lane's hold-write recorded there, per apply-mint-batch.mjs's resolveValidationFailedHolds). Pure. */
export function appendReopenNote(existingNotes, reasonContains, nowIso) {
  const marker =
    `[reopened ${nowIso}] matched --reason-contains=${JSON.stringify(reasonContains)}; re-admitted to ` +
    "would_mint — no re-validation performed here, the next population-turn pass decides for real.";
  return existingNotes ? `${existingNotes}\n\n${marker}` : marker;
}

/**
 * @param {{ reasonContains: string, apply?: boolean }} opts
 * @returns {Promise<{ mode: "dry-run" | "apply", matched: number, written?: number, failures?: object[] }>}
 */
export async function main({ reasonContains, apply = false } = {}) {
  if (!reasonContains || !reasonContains.trim()) {
    throw new Error(
      "reopen-validation-holds: --reason-contains is required (e.g. --reason-contains ungrounded_url) — " +
      "never a blanket reopen.",
    );
  }
  console.log(`[reopen-validation-holds] mode = ${apply ? "APPLY" : "DRY-RUN"}; --reason-contains=${JSON.stringify(reasonContains)}`);

  const rows = await readAll("census_worklist", "id, dryrun_disposition, hold_reason, notes");
  const targets = rows.filter((r) => isReopenTarget(r, reasonContains));
  console.log(`[reopen-validation-holds] matching held rows: ${targets.length}`);
  for (const t of targets.slice(0, 10)) console.log(`   ${t.id.slice(0, 8)}  ${t.hold_reason}`);
  if (targets.length > 10) console.log(`   … and ${targets.length - 10} more`);

  if (!apply) {
    console.log("[reopen-validation-holds] DRY-RUN — pass --apply to write.");
    return { mode: "dry-run", matched: targets.length };
  }
  if (!targets.length) {
    console.log("[reopen-validation-holds] nothing to write.");
    return { mode: "apply", matched: 0, written: 0 };
  }

  const nowIso = new Date().toISOString();
  let written = 0;
  const failures = [];
  for (const t of targets) {
    try {
      await guardedUpdate(
        "census_worklist",
        (qb) => qb.eq("id", t.id),
        { dryrun_disposition: "would_mint", hold_reason: null, notes: appendReopenNote(t.notes, reasonContains, nowIso) },
        { cite: CITE, select: "id, dryrun_disposition, hold_reason" },
      );
      written += 1;
    } catch (e) {
      failures.push({ id: t.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  console.log(`[reopen-validation-holds] written=${written} of matched=${targets.length}${failures.length ? `; FAILED: ${JSON.stringify(failures)}` : ""}`);
  if (failures.length) process.exitCode = 1;
  return { mode: "apply", matched: targets.length, written, failures };
}

function usage() {
  return "Usage: node scripts/mint/reopen-validation-holds.mjs --reason-contains <substring> [--apply]";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--reason-contains");
  const reasonContains = idx >= 0 ? args[idx + 1] : null;
  if (!reasonContains) {
    console.error(usage());
    process.exit(1);
  }
  main({ reasonContains, apply: args.includes("--apply") }).catch((e) => {
    console.error("[reopen-validation-holds] fatal:", e);
    process.exit(1);
  });
}
