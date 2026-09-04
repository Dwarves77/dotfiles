// reopen-validation-holds.mjs — MAINT dispatch step for scripts/mint/reopen-validation-holds.mjs (lane
// URL-GUIL, 2026-09-03; see that file's own header for the full mechanism and why it exists). The ONLY
// place with database credentials is GitHub Actions — the cloud container has no egress to Supabase, the
// Codespace has no secrets — so a coordinator-invoked, DB-writing tool needs a MAINT step to actually run
// from, exactly the same gap `origin-class-backfill.mjs` / `tag-ratification.mjs` closed for their own
// upstream scripts.
//
// UPSTREAM: ALL THE LOGIC ALREADY LIVES IN scripts/mint/reopen-validation-holds.mjs. This wrapper calls
// its exported `main({ reasonContains, apply })` UNMODIFIED for both the selection (the pure
// `isReopenTarget` predicate, applied inside that file's own `main`) and the write (`guardedUpdate`,
// cited there) — nothing is reimplemented here. The only change made to the upstream file for this
// wrapper (see its own diff) is additive: `main()`'s dry-run return now also carries the full `targets`
// array (previously only a count), and its apply-run return now also carries `writtenIds` (the ids that
// actually wrote) — both fields existing tests for that file already tolerate (they assert individual
// fields, never a full-object shape), so its CLI and its own test suite are unaffected.
//
// WHAT THIS WRAPPER ADDS, that the CLI script does not have on its own:
//   - `--arg` IS the required `--reason-contains` scope (this dispatch's one input, per
//     .github/workflows/maintenance.yml's convention) — refused with exit 1 and no DB read at all when
//     blank, mirroring the exact refusal scripts/mint/reopen-validation-holds.mjs's own `main()` already
//     enforces, one layer earlier so an empty `arg` never even reaches it. A blanket reopen is exactly
//     what that tool's header forbids; this wrapper does not get to relax that by construction.
//   - dry mode renders a full per-row PLAN (row id, hold_reason, and a truncated `notes` head — the held
//     evidence JSON can be long; the plan previews it, never dumps it whole) instead of only a count.
//   - apply mode renders a READ-BACK: after the write, re-reads exactly the rows this run touched
//     (`writtenIds`) and reports their post-write `dryrun_disposition`/`hold_reason`/notes head — the
//     same "write, then prove it" shape every other MAINT step in this runtime takes.
//
// USAGE (by hand, needs DB creds): node scripts/maintenance/reopen-validation-holds.mjs --mode dry --arg
// ungrounded_url
// Normally dispatched via .github/workflows/maintenance.yml (step=reopen-validation-holds).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";

const NOTES_HEAD_CHARS = 200;

/** Truncate `notes` to a short preview — never the full held-evidence JSON — for the plan/read-back
 *  summary. Pure. */
export function notesHead(notes) {
  if (typeof notes !== "string" || notes.length === 0) return notes ?? null;
  return notes.length > NOTES_HEAD_CHARS ? `${notes.slice(0, NOTES_HEAD_CHARS)}…` : notes;
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts - `arg` is the required --reason-contains scope.
 * @param {{ reopenMain: Function, readAll: Function }} deps - `reopenMain` is
 *   scripts/mint/reopen-validation-holds.mjs's own exported `main`; `readAll` is db.mjs's readAll, used
 *   ONLY for the post-apply read-back (this wrapper never selects or writes census_worklist itself).
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const reasonContains = typeof arg === "string" ? arg.trim() : "";
  const summary = { step: "reopen-validation-holds", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (!reasonContains) {
    summary.note =
      "REFUSED — --arg (the --reason-contains scope) is required in both dry and apply mode: a " +
      "blanket reopen is exactly what scripts/mint/reopen-validation-holds.mjs's own header forbids. " +
      "No DB read attempted. Example: --arg ungrounded_url.";
    summary.exitCode = 1;
    return summary;
  }

  const result = await deps.reopenMain({ reasonContains, apply });

  if (!apply) {
    summary.counts = { matched: result.matched };
    summary.plan = (result.targets ?? []).map((t) => ({
      id: t.id,
      hold_reason: t.hold_reason,
      notes_head: notesHead(t.notes),
    }));
    return summary;
  }

  const failures = result.failures ?? [];
  summary.counts = { matched: result.matched, written: result.written ?? 0, failed: failures.length };
  summary.applied = result.written ?? 0;
  if (failures.length) {
    summary.note = `${failures.length} of ${result.matched} matched row(s) failed to write: ${JSON.stringify(failures)}`;
    summary.exitCode = 1;
  }

  const writtenIds = result.writtenIds ?? [];
  const rows = writtenIds.length
    ? await deps.readAll("census_worklist", "id, dryrun_disposition, hold_reason, notes", {
        match: (q) => q.in("id", writtenIds),
      })
    : [];
  summary.read_back = {
    reopened_count: rows.length,
    reopened: rows.map((r) => ({
      id: r.id,
      dryrun_disposition: r.dryrun_disposition,
      hold_reason: r.hold_reason,
      notes_head: notesHead(r.notes),
    })),
  };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "reopen-validation-holds",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll } = await import("../lib/db.mjs");
      const { main: reopenMain } = await import("../mint/reopen-validation-holds.mjs");
      return { readAll, reopenMain };
    },
  });
}
