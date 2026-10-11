#!/usr/bin/env node

import { readAll, guardedUpdate } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from '../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

loadLocalEnvFile();

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
    // `targets` (added for the MAINT dispatch wrapper, scripts/maintenance/reopen-validation-holds.mjs —
    // it renders these as the per-row plan rather than re-deriving the selection itself) carries the
    // full matched rows; the CLI's own console output above stays the truncated human-facing view.
    return { mode: "dry-run", matched: targets.length, targets };
  }
  if (!targets.length) {
    console.log("[reopen-validation-holds] nothing to write.");
    return { mode: "apply", matched: 0, written: 0, writtenIds: [] };
  }

  const nowIso = new Date().toISOString();
  let written = 0;
  const writtenIds = []; // ids that actually wrote — lets a caller (e.g. the MAINT wrapper) read back
                          // exactly the rows this run touched, without re-deriving the match itself.
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
      writtenIds.push(t.id);
    } catch (e) {
      failures.push({ id: t.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  console.log(`[reopen-validation-holds] written=${written} of matched=${targets.length}${failures.length ? `; FAILED: ${JSON.stringify(failures)}` : ""}`);
  if (failures.length) process.exitCode = 1;
  return { mode: "apply", matched: targets.length, written, writtenIds, failures };
}

function usage() {
  return "Usage: node scripts/mint/reopen-validation-holds.mjs --reason-contains <substring> [--apply]";
}

if (isMainModule(import.meta.url)) {
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
