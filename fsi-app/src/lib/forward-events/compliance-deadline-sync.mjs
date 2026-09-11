// compliance-deadline-sync.mjs — the canonical (and, before this lane, only) writer for
// intelligence_items.compliance_deadline (DATECHAIN lane, 2026-09-11).
//
// THE GAP THIS CLOSES. compliance_deadline had NO production writer anywhere in the codebase — its only
// writes were incidental: update_item's unrestricted `.update(proposed_changes ?? {})` in
// apply-staged-update.ts can set it if an LLM-proposed change happens to name that column, but nothing
// ever computes or intends the value. Meanwhile item_forward_events (migration 274) is the correctly
// built, source-cited extractor for exactly this kind of date — its own CHECK constraint enumerates
// 'compliance_deadline' as one of six literal event_kind values, so the table already names which of its
// rows a caller like this one should trust for this exact field. Nothing read it for that purpose before
// this module.
//
// THE RULE FOR CHOOSING THE DEADLINE (stated in code, not just here): among an item's item_forward_events
// rows with event_kind = 'compliance_deadline' and event_date on or after "today", pick the row with the
// EARLIEST event_date (the nearest future obligation-binding deadline is the one a customer needs to see —
// a later-dated row is real but not what "compliance_deadline" on the item summary means). A tie on
// event_date is broken by confidence ('high' — claim-sourced — before 'medium' — section-sourced, the same
// ranking the migration's own grounding-rule constraints establish), then by row id for determinism. Rows
// of any other event_kind (entry_into_force, review_or_report, phase_step, consultation_close, other) are
// NEVER candidates — this sync does not guess a kind from other columns.
//
// IDEMPOTENT AND NULL-SAFE. Re-running this over an unchanged corpus slice must be a no-op: if the picked
// date already matches the stored value, nothing is written. And it NEVER overwrites an existing non-null
// compliance_deadline with null — when no future compliance_deadline event exists for an item, the column
// is left exactly as it stood (a value already there might be correct and simply have no matching
// forward-event row yet; erasing it on an empty read would be a regression, not a sync).
//
// PURE CORE + ONE DB ROUND TRIP. pickComplianceDeadline is pure (input rows -> chosen date or null,
// injectable and unit-testable with no client at all). syncComplianceDeadlineForItem does the two reads +
// at-most-one write against an injected Supabase client — no model, no network beyond the DB itself, $0.

export const COMPLIANCE_DEADLINE_EVENT_KIND = "compliance_deadline";

/**
 * Pick the compliance_deadline value for one item from its already-fetched item_forward_events rows.
 * Pure. `rows` must already be filtered to this one item (the caller decides the DB filter); this
 * function additionally filters to event_kind === COMPLIANCE_DEADLINE_EVENT_KIND itself so a caller that
 * forgets the `.eq("event_kind", ...)` filter still gets the right answer, never a wrong kind's date.
 * @param {Array<{event_date: string, event_kind: string, confidence?: string, id?: string}>} rows
 * @param {string} asOfIso - "today" in YYYY-MM-DD; only event_date >= asOfIso is a candidate.
 * @returns {string|null} the chosen event_date, or null when no future compliance_deadline event exists.
 */
export function pickComplianceDeadline(rows, asOfIso) {
  const candidates = (rows ?? [])
    .filter((r) => r && r.event_kind === COMPLIANCE_DEADLINE_EVENT_KIND && typeof r.event_date === "string" && r.event_date >= asOfIso)
    .slice()
    .sort((a, b) => {
      if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
      const confRank = (c) => (c === "high" ? 0 : c === "medium" ? 1 : 2);
      const cr = confRank(a.confidence) - confRank(b.confidence);
      if (cr !== 0) return cr;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });
  return candidates.length ? candidates[0].event_date : null;
}

/**
 * Sync one item's intelligence_items.compliance_deadline from its item_forward_events rows.
 * Bounded (one item, two reads, at most one write); resumable by construction (idempotent — see header).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} itemId
 * @param {string} [asOfIso] - defaults to today (UTC date).
 * @returns {Promise<{changed: boolean, value?: string, reason?: string}>}
 */
export async function syncComplianceDeadlineForItem(sb, itemId, asOfIso = new Date().toISOString().slice(0, 10)) {
  // ONE filter server-side (intelligence_item_id) — event_kind and the future-date bound are applied by
  // pickComplianceDeadline itself (pure, already unit-proven), not repeated as a second server-side
  // filter. An item's forward-events row count is small (a phase-out schedule tops out in the dozens),
  // so reading all of an item's rows and filtering in memory costs nothing and keeps this the same
  // single-`.eq()` shape mint-item.ts's own forward-events read already uses against this table.
  const { data: eventRows, error: evErr } = await sb
    .from("item_forward_events")
    .select("id, event_date, event_kind, confidence")
    .eq("intelligence_item_id", itemId);
  if (evErr) throw new Error(`item_forward_events read failed: ${evErr.message}`);

  const picked = pickComplianceDeadline(eventRows ?? [], asOfIso);
  if (!picked) return { changed: false, reason: "no future compliance_deadline event" };

  const { data: item, error: itErr } = await sb.from("intelligence_items").select("compliance_deadline").eq("id", itemId).single();
  if (itErr) throw new Error(`intelligence_items read failed: ${itErr.message}`);
  if (item?.compliance_deadline === picked) return { changed: false, reason: "already up to date" };

  const { error: updErr } = await sb.from("intelligence_items").update({ compliance_deadline: picked }).eq("id", itemId);
  if (updErr) throw new Error(`intelligence_items update failed: ${updErr.message}`);
  return { changed: true, value: picked };
}
