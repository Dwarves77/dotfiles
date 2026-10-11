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
const DETECTED_BY_BY_FIELD = Object.freeze({
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
