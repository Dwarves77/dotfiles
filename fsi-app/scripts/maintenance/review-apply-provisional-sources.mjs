// review-apply-provisional-sources.mjs — MAINT dispatch step for
// scripts/review/apply-provisional-sources.mjs (Lane REVIEW-WIRE, 2026-09-04).
// docs/audits/wiring-audit-2026-09-04/B1-modules.md Gap #1 [CONFIRMED]: this script's own header names
// the maintenance step scripts/review/build-review-digests.mjs's own QUEUES[] already expects
// (`maintStep: "review-apply-provisional-sources"`), but the step never existed in
// .github/workflows/maintenance.yml — so the queue this apply script exists to triage (`sources` WHERE
// status='provisional') had zero automated caller, live at 911 `provisional` rows [CONFIRMED, live SQL,
// 2026-09-04]. The ONLY place with database credentials is GitHub Actions — the cloud container has no
// egress to Supabase, the Codespace has no secrets — so a coordinator-invoked, DB-writing tool needs a
// MAINT step to actually run from, exactly the same gap reopen-validation-holds.mjs / tag-ratification.mjs
// closed for their own upstream scripts.
//
// UPSTREAM: ALL THE LOGIC ALREADY LIVES IN scripts/review/apply-provisional-sources.mjs. This wrapper
// calls its exported `main({ rulingPath, apply })` UNMODIFIED for both the read (the group decision ->
// patch mapping lives in scripts/review/lib/provisional-sources.mjs's `patchForDecision`, imported there,
// not here) and the write (`guardedUpdateByIds`, cited there) — nothing is reimplemented here. This
// wrapper imports scripts/review/lib/provisional-sources.mjs itself ONLY for its two plain data constants
// (`TABLE`, `SELECT_COLUMNS`) to shape the apply-mode read-back below — it calls none of that module's
// functions.
//
// WHAT THIS WRAPPER ADDS, that the CLI script does not have on its own — same shape as
// review-apply-portal-links.mjs, see that file's header for the full rationale:
//   - `--arg` IS the required ruling-file path, refused with exit 1 and no DB read at all when blank, in
//     BOTH modes (dry needs the ruling too — the "plan" IS the ruled decisions replayed against live
//     rows). Resolved relative to the REPO ROOT via `resolveRulingPath` (the ratifications tree lives one
//     level above `fsi-app/`, where this wrapper runs from).
//   - apply mode renders a READ-BACK: after the write, re-reads every row named in the ruling file (every
//     group's `row_ids`, deduped) via `sources`' own selected columns, and reports each row's post-write
//     `status`. dry mode reports the underlying script's own per-group plan unmodified (`result.results`).
//
// USAGE (by hand, needs DB creds):
//   node scripts/maintenance/review-apply-provisional-sources.mjs --mode dry --arg docs/ratifications/2026-09/provisional-sources.ruling.json
//   node scripts/maintenance/review-apply-provisional-sources.mjs --mode apply --arg docs/ratifications/2026-09/provisional-sources.ruling.json
// The ruling file comes from `node scripts/review/build-review-digests.mjs --out
// docs/ratifications/2026-09` (read-only), then an operator setting `decision` on every group.
// Normally dispatched via .github/workflows/maintenance.yml (step=review-apply-provisional-sources).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import * as ProvisionalSources from "../review/lib/provisional-sources.mjs";

/** See review-apply-portal-links.mjs's own `resolveRulingPath` for the full rationale. Pure. */
export function resolveRulingPath(arg) {
  return resolve(fsiRoot(), "..", arg);
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts - `arg` is the required ruling-file path.
 * @param {{ applyMain: Function, readAll: Function }} deps - `applyMain` is
 *   scripts/review/apply-provisional-sources.mjs's own exported `main`; `readAll` is db.mjs's readAll,
 *   used ONLY for the post-apply read-back (this wrapper never selects or writes `sources` itself).
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const rulingArg = typeof arg === "string" ? arg.trim() : "";
  const summary = { step: "review-apply-provisional-sources", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (!rulingArg) {
    summary.note =
      "REFUSED — --arg (the ruling-file path) is required in both dry and apply mode: this queue's plan " +
      "and apply both come from an operator-ruled digest, never a blanket action. No DB read attempted. " +
      "Example: --arg docs/ratifications/2026-09/provisional-sources.ruling.json (build it first with " +
      "node scripts/review/build-review-digests.mjs --out docs/ratifications/2026-09).";
    summary.exitCode = 1;
    return summary;
  }

  const rulingPath = resolveRulingPath(rulingArg);
  const result = await deps.applyMain({ rulingPath, apply }, deps);

  summary.counts = { queue: result.queue, groups: result.results.length };
  summary.plan = result.results;

  if (!apply) {
    summary.note = `dry: parsed ${rulingPath} for queue "${result.queue}" — see plan for what --apply would do.`;
    return summary;
  }

  summary.applied = result.results.reduce((sum, r) => sum + (r.applied ?? 0), 0);

  const ruling = JSON.parse(readFileSync(rulingPath, "utf8"));
  const allIds = [...new Set(ruling.groups.flatMap((g) => g.row_ids ?? []))];
  const rows = allIds.length
    ? await deps.readAll(ProvisionalSources.TABLE, ProvisionalSources.SELECT_COLUMNS, { match: (q) => q.in("id", allIds) })
    : [];
  summary.read_back = {
    rows_named_in_ruling: allIds.length,
    rows_now_live: rows.length,
    sample: rows.slice(0, 20).map((r) => ({ id: r.id, status: r.status })),
  };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "review-apply-provisional-sources",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
      const { main: applyMain } = await import("../review/apply-provisional-sources.mjs");
      return { readAll, guardedUpdateByIds, applyMain };
    },
  });
}
