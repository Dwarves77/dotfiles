// changelog.mjs, recordItemChange: the ONE write site for item_changelog outside a migration
// (D23 part (a), defect-fix-plan-2026-09-12.md, 2026-09-13).
//
// WHY THIS EXISTS. D23 (docs/plans/defect-fix-plan-2026-09-12.md): a regenerated brief or a
// backfilled timeline changes a live, customer-visible item with no record of the change anywhere
// on the surface (item_changelog, migration 004, sat frozen at 9 rows dated April 2026) because
// nothing in the brief-apply or timeline-backfill runtimes ever wrote to it, and migration 232's
// "What changed" feed only ever sees NEWLY MINTED items (added_date in the window), never a
// regenerated existing one. This module is the one write site both runtimes call from here on;
// migration 319 (the feed) reads what this module writes.
//
// IDEMPOTENT PER (item, field, batch). item_changelog (migration 004) carries no batch column of
// its own: `previous_value`/`new_value` exist for a value-diff change_type this table also
// records, and a full_brief/timeline change has no single before/after value, so `new_value` is
// repurposed to carry the batch identifier for exactly this change shape. A re-apply of the same
// batch (a resumed apply-record-briefs run over the same --briefs file, most concretely) finds its
// own prior row via (item_id, field, new_value) and writes nothing a second time.
//
// CLIENT SHAPE IS AN ADAPTER, NOT A RAW SUPABASE CLIENT, deliberate, not an oversight. This
// module's two callers reach the database through fundamentally different, already-established
// paths: apply-record-briefs.mjs holds a raw @supabase/supabase-js client (`sb`), while
// timeline-backfill.mjs (a scripts/maintenance/* runtime) is walled off from raw writes by
// scripts/lib/db.mjs's readClient() proxy (rule-015: `.insert()` on the read client THROWS) and
// must route every write through guardedInsert (cite + snapshot + read-back). Requiring one literal
// `.from(table)` chain shape here would force one of the two callers to fight its own db layer, so
// this module instead asks for the two operations it actually needs, `findExisting` and `insert`,
// and each caller supplies the small adapter that matches how it already talks to the database.
//
// DRY BY DEFAULT (lane-common-contract.md; the same posture scripts/lib/revalidate.mjs documents):
// `apply: true` performs the write; without it this reports what WOULD be written and touches
// nothing (the idempotency read still runs, so dry mode reports a real "already recorded" outcome,
// never a false "would write").

/** intelligence_items.severity (migration 102's canonical vocabulary, src/lib/agent/metadata-vocab.ts)
 *  → item_changelog.impact_level (migration 004 CHECK: CRITICAL | HIGH | MODERATE | LOW). */
export const IMPACT_LEVEL_BY_SEVERITY = Object.freeze({
  action_required: "HIGH",
  cost_alert: "HIGH",
  window_closing: "CRITICAL",
  competitive_edge: "MODERATE",
  monitoring: "LOW",
});
export const DEFAULT_IMPACT_LEVEL = "MODERATE";

/** Pure. Never throws on an unrecognised/absent severity; defaults honestly rather than guessing. */
export function impactLevelForSeverity(severity) {
  return IMPACT_LEVEL_BY_SEVERITY[severity] ?? DEFAULT_IMPACT_LEVEL;
}

/** item_changelog.field → item_changelog.detected_by (part (a)'s own vocabulary: "record-briefs" for
 *  a regenerated full_brief, "timeline-backfill" for a backfilled timeline addition). */
export const DETECTED_BY_BY_FIELD = Object.freeze({
  full_brief: "record-briefs",
  timeline: "timeline-backfill",
});

/** Pure. An unrecognised field still gets an honest, non-empty detected_by rather than null. */
export function detectedByForField(field) {
  return DETECTED_BY_BY_FIELD[field] ?? "record-briefs";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records one item_changelog row for a brief regeneration or a backfilled timeline addition,
 * idempotent per (itemId, field, batch). Pure decision-making plus one read plus at most one
 * write; no retries, no batching (each call is one item).
 *
 * @param {{
 *   findExisting: (args: {itemId:string, field:string, batch:string}) => Promise<boolean>,
 *   insert: (row: object) => Promise<{error?: {message?:string}|string|null}>,
 * }} client The adapter this module's header explains, NOT a raw Supabase client.
 * @param {{
 *   itemId: string,
 *   field: "full_brief" | "timeline",
 *   batch: string,
 *   severity?: string | null,
 *   note: string,
 *   apply?: boolean,
 *   changeDate?: string,
 * }} opts
 * @returns {Promise<{written: boolean, reason: string, row: object|null}>}
 */
export async function recordItemChange(client, opts) {
  const { itemId, field, batch, severity = null, note, apply = false, changeDate = todayIso() } = opts ?? {};

  if (!itemId || !field || !batch || !note) {
    return { written: false, reason: "missing itemId/field/batch/note, nothing to record", row: null };
  }

  let alreadyRecorded;
  try {
    alreadyRecorded = await client.findExisting({ itemId, field, batch });
  } catch (e) {
    return {
      written: false,
      reason: `idempotency check failed: ${e instanceof Error ? e.message : String(e)}`,
      row: null,
    };
  }
  if (alreadyRecorded) {
    return { written: false, reason: "already recorded for this item and batch", row: null };
  }

  const row = {
    item_id: itemId,
    change_date: changeDate,
    change_type: "UPDATED",
    field,
    new_value: batch,
    impact: note,
    impact_level: impactLevelForSeverity(severity),
    detected_by: detectedByForField(field),
  };

  if (!apply) {
    return { written: false, reason: "dry, would insert", row };
  }

  let insertResult;
  try {
    insertResult = await client.insert(row);
  } catch (e) {
    return { written: false, reason: `insert threw: ${e instanceof Error ? e.message : String(e)}`, row };
  }
  const insertError = insertResult?.error;
  if (insertError) {
    const msg = typeof insertError === "string" ? insertError : insertError.message ?? String(insertError);
    return { written: false, reason: `insert failed: ${msg}`, row };
  }
  return { written: true, reason: "inserted", row };
}
