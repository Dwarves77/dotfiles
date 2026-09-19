#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
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
//
// D17 FAMILY 14 ADDENDUM (2026-09-13, lane L11b): the first apply left 30 gate-a-verifier-sweep rows open;
// the batch-003 export showed 24 of those items are ARCHIVED, not still quarantined -- the finding's own
// premise ("this item is quarantined") is equally moot for an archived item, just for a different reason
// than "verified". A SECOND closing rule: a per-item flag whose subject item has is_archived=true resolves
// with "item archived on <date>; finding moot", counted in its own dry-output bucket (still_open now names
// only genuinely LIVE quarantined items). Deviation disclosed: the plan's own wording is "<archived_at or
// updated_at>" -- [CONFIRMED, migration 001_schema.sql / 004_source_trust_framework.sql] intelligence_items
// carries no archived_at column at all (only is_archived boolean + archive_reason text); this resolver
// therefore always falls through to updated_at for the dated per-item note. The read/compute stays generic
// (prefers archived_at when present) so a future migration adding that column needs no change here.
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

/** Pure: the fixed resolution_note for a resolved-because-verified row, dated. */
export function buildResolutionNote(todayIso) {
  return `item verified on ${todayIso}; finding superseded`;
}

/** Pure: the resolution_note for a resolved-because-archived row (D17 family 14 addendum). */
export function buildArchivedResolutionNote(dateIso) {
  return `item archived on ${dateIso}; finding moot`;
}

/**
 * Pure: the day-precision ISO date to name in an archived row's resolution note. Prefers `archived_at`
 * when the caller's state carries one (a future schema could add it); intelligence_items today does not,
 * so this falls through to `updated_at` -- [CONFIRMED] no archived_at column exists on that table
 * (migration 001_schema.sql / 004_source_trust_framework.sql). Never invents a date: an unparseable or
 * absent value returns null and the caller names it explicitly rather than guessing.
 * @param {{archived_at?:string|null, updated_at?:string|null}|null} state
 * @returns {string|null}
 */
export function archivedDateIso(state) {
  const raw = state?.archived_at ?? state?.updated_at ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Partition candidate rows into resolve-now-verified (subject item is verified), resolve-now-archived
 * (subject item is is_archived=true -- D17 family 14 addendum), or stay-open (anything else -- still
 * live-quarantined, or a state this step does not recognize as a resolution). Pure. `itemStateByItem`'s
 * values may be a bare provenance_status string (back-compat with the pre-addendum call shape, used
 * unchanged by the tests written against family 14's first pass) or a
 * `{provenance_status, is_archived, archived_at, updated_at}` object.
 * @param {Array<{id:string, subject_ref?:string|null, created_by?:string|null}>} rows
 * @param {Record<string, string|object|null>} itemStateByItem - item id -> provenance_status | state object
 * @returns {{toResolve: Array<object>, toResolveArchived: Array<object>, stillOpen: Array<object>}}
 */
export function planClosure(rows, itemStateByItem) {
  const toResolve = [];
  const toResolveArchived = [];
  const stillOpen = [];
  for (const row of rows ?? []) {
    const itemId = row.subject_ref;
    const raw = itemId ? itemStateByItem?.[itemId] : undefined;
    const state = typeof raw === "string" ? { provenance_status: raw } : raw ?? null;
    const entry = { id: row.id, item_id: itemId, created_by: row.created_by, provenance_status: state?.provenance_status ?? null };
    if (state?.provenance_status === "verified") {
      toResolve.push(entry);
    } else if (state?.is_archived === true) {
      toResolveArchived.push({ ...entry, archived_date: archivedDateIso(state) });
    } else {
      stillOpen.push(entry);
    }
  }
  return { toResolve, toResolveArchived, stillOpen };
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
  const itemStateByItem = {};
  for (const id of itemIds) itemStateByItem[id] = await deps.readItemState(id);

  const { toResolve, toResolveArchived, stillOpen } = planClosure(rows, itemStateByItem);
  const stillOpenItemIds = [...new Set(stillOpen.map((r) => r.item_id).filter(Boolean))];

  summary.counts = {
    candidates_scanned: rows.length,
    distinct_items: itemIds.length,
    would_resolve: toResolve.length,
    // D17 family 14 addendum: its own dry-output bucket, distinct from the verified-item count above.
    would_resolve_archived: toResolveArchived.length,
    still_open: stillOpen.length,
    still_open_distinct_items: stillOpenItemIds.length,
  };
  summary.resolve_sample = toResolve.slice(0, 20);
  summary.resolve_archived_sample = toResolveArchived.slice(0, 20);
  summary.still_open_sample = stillOpen.slice(0, 20);
  // The full still-open item id list, every run (dry AND apply) -- this is the "feed to the next
  // brief-export batch" artifact the correction's own ruling names, never truncated to the 20-row sample.
  // After the family 14 addendum this list names only genuinely LIVE quarantined items (archived items no
  // longer appear here -- their flags resolve as moot instead).
  summary.still_open_item_ids = stillOpenItemIds;

  if (!apply) {
    summary.note =
      `DRY -- ${toResolve.length} row(s) would resolve (item verified); ${toResolveArchived.length} row(s) ` +
      `would resolve (item archived, finding moot); ${stillOpen.length} row(s) stay open across ` +
      `${stillOpenItemIds.length} item id(s) (still live-quarantined). Nothing written.`;
    return summary;
  }

  const note = buildResolutionNote(todayIso);
  const ids = toResolve.map((r) => r.id);
  const res = ids.length ? await deps.resolveIds(ids, note) : { updated: 0, snapshot: null };

  // D17 family 14 addendum: each archived item can carry its OWN archived/updated date, so ids are
  // grouped by the note text their own date produces (same date -> same note -> one batched write) rather
  // than sharing a single note across every row the way the verified-item write above does.
  const archivedGroups = new Map();
  for (const entry of toResolveArchived) {
    const archivedNote = buildArchivedResolutionNote(entry.archived_date ?? "an unrecorded date");
    if (!archivedGroups.has(archivedNote)) archivedGroups.set(archivedNote, []);
    archivedGroups.get(archivedNote).push(entry.id);
  }
  let archivedUpdated = 0;
  const archivedWrites = [];
  for (const [archivedNote, groupIds] of archivedGroups) {
    const r = await deps.resolveIds(groupIds, archivedNote);
    archivedUpdated += r.updated;
    archivedWrites.push({ ids: groupIds, note: archivedNote, updated: r.updated, snapshot: r.snapshot });
  }

  summary.applied = res.updated + archivedUpdated;
  summary.counts.write = { attempted: ids.length, updated: res.updated, snapshot: res.snapshot };
  summary.counts.write_archived = { attempted: toResolveArchived.length, updated: archivedUpdated, groups: archivedWrites.length };

  const remaining = await deps.readRemainingOpen();
  summary.read_back = {
    remaining_open: remaining.length,
    remaining_sample: remaining.slice(0, 20).map((r) => ({ id: r.id, subject_ref: r.subject_ref })),
  };
  summary.note =
    `Resolved ${res.updated}/${ids.length} row(s) (item verified; finding superseded) and ` +
    `${archivedUpdated}/${toResolveArchived.length} row(s) (item archived; finding moot). ` +
    `${stillOpen.length} row(s) remain open across ${stillOpenItemIds.length} item id(s) -- feed ` +
    "still_open_item_ids to the next brief-export batch.";

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
      // D17 family 14 addendum: reads is_archived + updated_at alongside provenance_status so planClosure
      // can resolve an archived item's finding as moot, not just a verified item's as superseded.
      // intelligence_items carries no archived_at column [CONFIRMED against the migrations] -- see this
      // file's header for the disclosed fallback to updated_at.
      readItemState: async (itemId) => {
        const rows = await readAll("intelligence_items", "provenance_status, is_archived, updated_at", {
          match: (q) => q.eq("id", itemId),
        });
        const row = rows[0] ?? null;
        return row
          ? { provenance_status: row.provenance_status ?? null, is_archived: row.is_archived === true, updated_at: row.updated_at ?? null }
          : null;
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
