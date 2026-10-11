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
