// review-apply-coverage-gaps.mjs — MAINT dispatch step for scripts/review/apply-coverage-gaps.mjs (Lane
// REVIEW-WIRE, 2026-09-04). docs/audits/wiring-audit-2026-09-04/B1-modules.md Gap #1 [CONFIRMED]: this
// script's own header names the maintenance step scripts/review/build-review-digests.mjs's own QUEUES[]
// already expects (`maintStep: "review-apply-coverage-gaps"`), but the step never existed in
// .github/workflows/maintenance.yml — so the queue this apply script exists to triage
// (`coverage_gap_candidates` WHERE disposition IS NULL) had zero automated caller, live at 91
// undispositioned rows [CONFIRMED, live SQL, 2026-09-04]. The ONLY place with database credentials is
// GitHub Actions — the cloud container has no egress to Supabase, the Codespace has no secrets — so a
// coordinator-invoked, DB-writing tool needs a MAINT step to actually run from, exactly the same gap
// reopen-validation-holds.mjs / tag-ratification.mjs closed for their own upstream scripts.
//
// UPSTREAM: ALL THE LOGIC ALREADY LIVES IN scripts/review/apply-coverage-gaps.mjs. This wrapper calls its
// exported `main({ rulingPath, apply })` UNMODIFIED for both the read (the group decision -> patch
// mapping, including the uniform `surface_test` payload migration 273's
// `coverage_gap_candidates_surface_test_required_check` requires, lives in
// scripts/review/lib/coverage-gaps.mjs's `patchForDecision`, imported there, not here) and the write
// (`guardedUpdateByIds`, cited there) — nothing is reimplemented here. This wrapper imports
// scripts/review/lib/coverage-gaps.mjs itself ONLY for its two plain data constants (`TABLE`,
// `SELECT_COLUMNS`) to shape the apply-mode read-back below — it calls none of that module's functions.
//
// DECIDES BY RULE (lane G6-GATES, 2026-10-05; operator ruling: no human gates). `--arg` is OPTIONAL:
//   - blank: the queue is decided by its own deterministic recommend rule over the live rows
//     (scripts/review/lib/rule-ruling.mjs builds the ruling, the SAME validator and apply mechanism a
//     ruling file uses). Groups the rule cannot decide are residue: recorded with a reason, never a guess,
//     never blocking. The summary carries `decisions` (groups and rows per decision) and `residue`
//     (groups and rows per reason).
//   - a path: that committed ruling file applies as before (the lane-verdict path), resolved relative to
//     the REPO ROOT (`resolveRulingPath`; the ratifications tree lives one level above `fsi-app/`).
// Both modes are dry by default, `--mode apply` writes. Apply renders a READ-BACK: after the write,
// re-reads every row named in the ruling (every group's `row_ids`, deduped) and reports each row's
// post-write state, the same "write, then prove it" shape every other MAINT step takes.
//
// USAGE (by hand, needs DB creds):
//   node scripts/maintenance/review-apply-coverage-gaps.mjs --mode dry
//   node scripts/maintenance/review-apply-coverage-gaps.mjs --mode apply
//   node scripts/maintenance/review-apply-coverage-gaps.mjs --mode apply --arg docs/ratifications/2026-09/coverage-gaps.ruling.json
// Normally dispatched via .github/workflows/maintenance.yml (step=review-apply-coverage-gaps).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { buildRuleRuling } from "../review/lib/rule-ruling.mjs";
import * as CoverageGaps from "../review/lib/coverage-gaps.mjs";

/** See review-apply-portal-links.mjs's own `resolveRulingPath` for the full rationale. Pure. */
export function resolveRulingPath(arg) {
  return resolve(fsiRoot(), "..", arg);
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts - `arg` is OPTIONAL (lane G6-GATES, 2026-10-05).
 *   Blank: the queue is decided by its own deterministic recommend rule (scripts/review/lib/rule-ruling.mjs),
 *   no ruling file needed. A path: that committed ruling file applies as before (the lane-verdict path).
 * @param {{ applyMain: Function, readAll: Function, readAllByIds: Function }} deps - `applyMain` is
 *   the queue's own exported `main` (which uses `readAll` itself for its filtered live-queue read);
 *   `readAllByIds` is db.mjs's chunked id-list read, used ONLY for the post-apply read-back (a single
 *   `.in("id", allIds)` GET over a full queue blew the request-line limit, Maintenance run 34045479342).
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const rulingArg = typeof arg === "string" ? arg.trim() : "";
  const summary = { step: "review-apply-coverage-gaps", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  let ruling;
  let applyOpts;
  if (rulingArg) {
    const rulingPath = resolveRulingPath(rulingArg);
    ruling = JSON.parse(readFileSync(rulingPath, "utf8"));
    applyOpts = { rulingPath, apply };
    summary.source = "ruling-file";
  } else {
    const rows = await deps.readAll(CoverageGaps.TABLE, CoverageGaps.SELECT_COLUMNS, { match: CoverageGaps.matchQueue });
    const groups = CoverageGaps.groupRows(rows);
    const built = buildRuleRuling({ module: CoverageGaps, groups, generatedAt: new Date().toISOString(), residue: CoverageGaps.RULE_RESIDUE });
    ruling = built.ruling;
    applyOpts = { ruling, apply };
    summary.source = "rule";
    summary.decisions = built.tally.decisions;
    summary.residue = built.tally.residue;
  }

  const result = await deps.applyMain(applyOpts, deps);

  summary.counts = { queue: result.queue, groups: result.results.length };
  summary.plan = result.results;

  if (!apply) {
    summary.note = `dry: ${summary.source === "rule" ? "decided by rule" : "parsed the ruling file"} for queue "${result.queue}", see plan for what --apply would do.`;
    return summary;
  }

  summary.applied = result.results.reduce((sum, r) => sum + (r.applied ?? 0), 0);

  const allIds = [...new Set(ruling.groups.flatMap((g) => g.row_ids ?? []))];
  const rows = await deps.readAllByIds(CoverageGaps.TABLE, CoverageGaps.SELECT_COLUMNS, allIds);
  summary.read_back = {
    rows_named_in_ruling: allIds.length,
    rows_now_live: rows.length,
    sample: rows.slice(0, 20).map((r) => ({ id: r.id, disposition: r.disposition })),
  };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "review-apply-coverage-gaps",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, readAllByIds, guardedUpdateByIds } = await import("../lib/db.mjs");
      const { main: applyMain } = await import("../review/apply-coverage-gaps.mjs");
      return { readAll, readAllByIds, guardedUpdateByIds, applyMain };
    },
  });
}
