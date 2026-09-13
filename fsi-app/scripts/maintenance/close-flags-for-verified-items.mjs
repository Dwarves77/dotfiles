#!/usr/bin/env node
// close-flags-for-verified-items.mjs -- MAINT step for D17 family 14's CORRECTED gate-a-verifier-sweep
// disposition (docs/plans/defect-fix-plan-2026-09-12.md, "Correction to the Family 14 ruling", coordinator
// directive 2026-09-12, lane L11).
//
// THE CORRECTION. The lane's first pass wrongly guessed `gate-a-verifier-sweep` was a run-log family and
// added a [HYPOTHESIS] fixture vocabulary to close-run-logs.mjs's allowlist. Live SQL over the 37 open
// rows [CONFIRMED by the coordinator] found they are PER-ITEM findings, two shapes:
//   "Item <title> has no full_brief at all (NULL/empty) while quarantined; a structural authoring gap"
//   "<title>: two of three Gate A orphans fixed this pass; the remaining orphan is <named>"
// Never a run summary. That guess is reverted (close-run-logs.mjs is back to its original three
// families); this script is the real resolver.
//
// THE RULE: every open, item-subject integrity_flags row whose created_by is in the named per-item-family
// list (PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES, gate-a-verifier-sweep the first entry) is checked against
// its own subject item's CURRENT provenance_status. A finding about a quarantined item's Gate A state is
// superseded the moment the item is verified (the finding's own premise -- "quarantined" -- no longer
// holds); resolved with resolution_note "item verified on <date>; finding superseded". A row whose item
// is still quarantined stays open (the finding is still live) and its item id is listed in this run's own
// summary (both dry and apply) so the coordinator can feed the still-open set into the next brief-export
// batch -- these are exactly the items D1's re-grounding path (export-corpus-for-extraction.mjs's
// --ids scope, task 6.2d) exists to reach.
//
// Guarded writes; idempotent (a resolved row drops out of the next run's own candidate read, so a second
// run with no newly-verified items changes nothing).
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D17 family 14 correction (lane L11)",
  reason:
    "Resolve per-item integrity_flags findings (gate-a-verifier-sweep and any future family named in " +
    "PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES) once their subject item is verified -- the finding's own " +
    "quarantined-item premise no longer holds. A row whose item is still quarantined stays open and is " +
    "listed for the next brief-export batch. The record stays (resolved, never deleted); the queue " +
    "empties only as items are actually re-grounded.",
});

// Named list, extensible -- gate-a-verifier-sweep is the first (and, as of this correction, only)
// entry; a future per-item family with the SAME "superseded once the item verifies" shape is added here,
// never as a second, divergent script.
export const PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES = Object.freeze(["gate-a-verifier-sweep"]);

export const RESOLVED_BY = "close-flags-for-verified-items";

const FLAG_COLUMNS = "id, created_by, description, status, subject_ref, category, subject_type";

// ---------------------------------------------------------------------------------------------------
// Pure planning (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/** Pure: the fixed resolution_note for a resolved row, dated. */
export function buildResolutionNote(todayIso) {
  return `item verified on ${todayIso}; finding superseded`;
}

/**
 * Partition candidate rows into resolve-now (subject item is verified) vs stay-open (anything else --
 * still quarantined, or a provenance_status this step does not recognize as a resolution). Pure.
 * @param {Array<{id:string, subject_ref?:string|null, created_by?:string|null}>} rows
 * @param {Record<string, string|null>} provenanceStatusByItem - item id -> provenance_status
 * @returns {{toResolve: Array<object>, stillOpen: Array<object>}}
 */
export function planClosure(rows, provenanceStatusByItem) {
  const toResolve = [];
  const stillOpen = [];
  for (const row of rows ?? []) {
    const itemId = row.subject_ref;
    const status = itemId ? (provenanceStatusByItem?.[itemId] ?? null) : null;
    const entry = { id: row.id, item_id: itemId, created_by: row.created_by, provenance_status: status };
    if (status === "verified") toResolve.push(entry);
    else stillOpen.push(entry);
  }
  return { toResolve, stillOpen };
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const todayIso = deps.todayIso ?? new Date().toISOString().slice(0, 10);
  const summary = { step: "close-flags-for-verified-items", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readCandidates();
  const itemIds = [...new Set(rows.map((r) => r.subject_ref).filter(Boolean))];
  const provenanceStatusByItem = {};
  for (const id of itemIds) provenanceStatusByItem[id] = await deps.readItemProvenanceStatus(id);

  const { toResolve, stillOpen } = planClosure(rows, provenanceStatusByItem);
  const stillOpenItemIds = [...new Set(stillOpen.map((r) => r.item_id).filter(Boolean))];

  summary.counts = {
    candidates_scanned: rows.length,
    distinct_items: itemIds.length,
    would_resolve: toResolve.length,
    still_open: stillOpen.length,
    still_open_distinct_items: stillOpenItemIds.length,
  };
  summary.resolve_sample = toResolve.slice(0, 20);
  summary.still_open_sample = stillOpen.slice(0, 20);
  // The full still-open item id list, every run (dry AND apply) -- this is the "feed to the next
  // brief-export batch" artifact the correction's own ruling names, never truncated to the 20-row sample.
  summary.still_open_item_ids = stillOpenItemIds;

  if (!apply) {
    summary.note =
      `DRY -- ${toResolve.length} row(s) would resolve (item verified); ${stillOpen.length} row(s) stay ` +
      `open across ${stillOpenItemIds.length} item id(s) (still quarantined). Nothing written.`;
    return summary;
  }

  const note = buildResolutionNote(todayIso);
  const ids = toResolve.map((r) => r.id);
  const res = ids.length ? await deps.resolveIds(ids, note) : { updated: 0, snapshot: null };
  summary.applied = res.updated;
  summary.counts.write = { attempted: ids.length, updated: res.updated, snapshot: res.snapshot };

  const remaining = await deps.readRemainingOpen();
  summary.read_back = {
    remaining_open: remaining.length,
    remaining_sample: remaining.slice(0, 20).map((r) => ({ id: r.id, subject_ref: r.subject_ref })),
  };
  summary.note =
    `Resolved ${res.updated}/${ids.length} row(s) (item verified; finding superseded). ${stillOpen.length} ` +
    `row(s) remain open across ${stillOpenItemIds.length} item id(s) -- feed still_open_item_ids to the ` +
    "next brief-export batch.";

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "close-flags-for-verified-items",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readCandidates: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) =>
            q
              .eq("subject_type", "item")
              .in("created_by", PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES)
              .in("status", ["open", "in_review"]),
        }),
      readItemProvenanceStatus: async (itemId) => {
        const rows = await readAll("intelligence_items", "provenance_status", { match: (q) => q.eq("id", itemId) });
        return rows[0]?.provenance_status ?? null;
      },
      resolveIds: (ids, note) =>
        guardedUpdateByIds(
          "integrity_flags",
          ids,
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: note },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        ),
      readRemainingOpen: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) =>
            q
              .eq("subject_type", "item")
              .in("created_by", PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES)
              .in("status", ["open", "in_review"]),
        }),
    }),
  });
}
