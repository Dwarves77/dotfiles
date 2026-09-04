// review-apply-canonical-candidates.mjs — MAINT dispatch step for
// scripts/review/apply-canonical-candidates.mjs (Lane REVIEW-WIRE, 2026-09-04).
// docs/audits/wiring-audit-2026-09-04/B1-modules.md Gap #1 [CONFIRMED]: this script's own header names
// the maintenance step scripts/review/build-review-digests.mjs's own QUEUES[] already expects
// (`maintStep: "review-apply-canonical-candidates"`), but the step never existed in
// .github/workflows/maintenance.yml — so the queue this apply script exists to triage
// (`canonical_source_candidates` WHERE decision='pending') had zero automated caller. The ONLY place with
// database credentials is GitHub Actions — the cloud container has no egress to Supabase, the Codespace
// has no secrets — so a coordinator-invoked, DB-writing tool needs a MAINT step to actually run from,
// exactly the same gap reopen-validation-holds.mjs / tag-ratification.mjs closed for their own upstream
// scripts.
//
// UPSTREAM: ALL THE LOGIC ALREADY LIVES IN scripts/review/apply-canonical-candidates.mjs. This wrapper
// calls its exported `main({ rulingPath, apply })` UNMODIFIED — the group decision -> patch mapping
// (scripts/review/lib/canonical-candidates.mjs's `patchForDecision`), the two-phase "accept" resolution
// (an already-registered source repoints both `canonical_source_candidates` AND the parent
// `intelligence_items` row; an unresolvable candidate is routed to `needs_individual_review`, never
// auto-created with an invented tier — see that script's own header) and every write
// (`guardedUpdateByIds`, cited there) all run inside that file. This wrapper imports
// scripts/review/lib/canonical-candidates.mjs itself ONLY for its two plain data constants (`TABLE`,
// `SELECT_COLUMNS`) to shape the apply-mode read-back below — it calls none of that module's functions.
//
// WHAT THIS WRAPPER ADDS, that the CLI script does not have on its own — same `--arg`-as-ruling-path
// shape as review-apply-portal-links.mjs, see that file's header for the full rationale on the gate
// itself. The one difference from its three siblings: this queue's accept path writes TWO tables
// (`canonical_source_candidates` + `intelligence_items`), so the apply-mode READ-BACK follows the FK this
// script's own `SELECT_COLUMNS` already carries (`intelligence_item_id`) — after re-reading every
// candidate named in the ruling, it separately re-reads the `intelligence_items` rows any `approved`
// candidate points at, so both halves of a two-table write are proven, not just the queue table. This is
// a READ chained on a column the upstream script already selects, never a second write and never a
// re-derivation of which candidates were approved.
//
// USAGE (by hand, needs DB creds):
//   node scripts/maintenance/review-apply-canonical-candidates.mjs --mode dry --arg docs/ratifications/2026-09/canonical-candidates.ruling.json
//   node scripts/maintenance/review-apply-canonical-candidates.mjs --mode apply --arg docs/ratifications/2026-09/canonical-candidates.ruling.json
// The ruling file comes from `node scripts/review/build-review-digests.mjs --out
// docs/ratifications/2026-09` (read-only), then an operator setting `decision` on every group.
// Normally dispatched via .github/workflows/maintenance.yml (step=review-apply-canonical-candidates).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import * as CanonicalCandidates from "../review/lib/canonical-candidates.mjs";

/** See review-apply-portal-links.mjs's own `resolveRulingPath` for the full rationale. Pure. */
export function resolveRulingPath(arg) {
  return resolve(fsiRoot(), "..", arg);
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts - `arg` is the required ruling-file path.
 * @param {{ applyMain: Function, readAll: Function }} deps - `applyMain` is
 *   scripts/review/apply-canonical-candidates.mjs's own exported `main`; `readAll` is db.mjs's readAll,
 *   used ONLY for the post-apply read-back (this wrapper never selects or writes
 *   canonical_source_candidates / intelligence_items itself).
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const rulingArg = typeof arg === "string" ? arg.trim() : "";
  const summary = { step: "review-apply-canonical-candidates", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (!rulingArg) {
    summary.note =
      "REFUSED — --arg (the ruling-file path) is required in both dry and apply mode: this queue's plan " +
      "and apply both come from an operator-ruled digest, never a blanket action. No DB read attempted. " +
      "Example: --arg docs/ratifications/2026-09/canonical-candidates.ruling.json (build it first with " +
      "node scripts/review/build-review-digests.mjs --out docs/ratifications/2026-09).";
    summary.exitCode = 1;
    return summary;
  }

  const rulingPath = resolveRulingPath(rulingArg);
  const result = await deps.applyMain({ rulingPath, apply }, deps);

  summary.counts = {
    queue: result.queue,
    groups: result.results.length,
    needs_individual_review: (result.needs_individual_review ?? []).length,
  };
  summary.plan = result.results;
  summary.needs_individual_review = result.needs_individual_review ?? [];

  if (!apply) {
    summary.note = `dry: parsed ${rulingPath} for queue "${result.queue}" — see plan for what --apply would do.`;
    return summary;
  }

  summary.applied = result.results.reduce((sum, r) => sum + (r.applied ?? 0), 0);

  // Read-back columns are NOT CanonicalCandidates.SELECT_COLUMNS verbatim — that module's own list
  // (the digest/grouping read) omits `promoted_to_source_id`, the one field this queue's "accept" path
  // writes on the candidate row itself; the read-back needs it to prove the write actually landed.
  const READ_BACK_COLUMNS = "id,decision,promoted_to_source_id,intelligence_item_id";
  const ruling = JSON.parse(readFileSync(rulingPath, "utf8"));
  const allIds = [...new Set(ruling.groups.flatMap((g) => g.row_ids ?? []))];
  const rows = allIds.length
    ? await deps.readAll(CanonicalCandidates.TABLE, READ_BACK_COLUMNS, { match: (q) => q.in("id", allIds) })
    : [];
  const repointedItemIds = [...new Set(
    rows.filter((r) => r.decision === "approved" && r.intelligence_item_id).map((r) => r.intelligence_item_id)
  )];
  const items = repointedItemIds.length
    ? await deps.readAll("intelligence_items", "id, source_id, source_url", { match: (q) => q.in("id", repointedItemIds) })
    : [];
  summary.read_back = {
    candidates_named_in_ruling: allIds.length,
    candidates_now_live: rows.length,
    repointed_items_checked: items.length,
    sample_candidates: rows.slice(0, 20).map((r) => ({ id: r.id, decision: r.decision, promoted_to_source_id: r.promoted_to_source_id })),
    sample_items: items.slice(0, 20),
  };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "review-apply-canonical-candidates",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
      const { main: applyMain } = await import("../review/apply-canonical-candidates.mjs");
      return { readAll, guardedUpdateByIds, applyMain };
    },
  });
}
