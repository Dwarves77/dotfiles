// @ts-check
// SLOT ENFORCEMENT AT SYNTHESIS (Wave-α C1; CODE-1 F-01 criterion-5 half). Pure core for the
// synthesiseAndWriteBrief slot contract, DI so it is red-then-green node-testable:
//
//   1. buildSlotDirective(slots)   — inject the item_type's REQUIRED SLOTS (read from the DB table
//      item_type_required_slots at generation time) into the synthesis user prompt, for ALL 12 item
//      types. The static SYSTEM_PROMPT covers the reg-family slots only; the 7 non-reg types had ZERO
//      slot language anywhere in generation — `missing_required_slot` was deterministic for them
//      (generate slot-blind → ground → quarantine → paid re-research over the same slot-blind prompt).
//   2. uncoveredSlots(body, slots) — the post-synthesis pre-gate: which required slots does the brief
//      prose cover NEITHER with topical content NOR with an explicit GAP statement? Deliberately the
//      SAME lenient keyword heuristic as grounding's slot-forcing `proseCovers` (canonical-pipeline
//      `uncovered` builder) so synthesis and grounding agree on "the prose speaks to this slot at
//      all". It catches TOTAL omissions cheaply; the DB validator (validate_item_provenance
//      criterion-5, claims-based) remains the hard gate — this never replaces it.
//   3. buildSlotRetryFeedback(uncovered) — the ONE corrective-retry feedback block. Fail after the
//      retry → the caller returns an honest named failure (never silent pass-through).
//   4. slotCacheGet/slotCachePut — sane in-process cache for the per-type slot rows (the table is 48
//      rows and changes only by operator spec decision; TTL-bounded so a spec change lands without a
//      process restart).

/** @typedef {{ slot_key: string, description?: string|null }} SlotRow */

/** Prompt block naming EVERY required slot for this item_type. Empty string when no slots. @param {SlotRow[]} slots */
export function buildSlotDirective(slots) {
  if (!slots || !slots.length) return "";
  const lines = slots.map((s) => `- ${s.slot_key}: ${s.description || s.slot_key}`);
  return `\nREQUIRED SLOTS (item_type contract — the provenance gate fails the brief on any silent omission): cover EACH of the following IN THE PROSE with at least one cited FACT statement OR an explicit GAP statement ("Specific [value] not available from primary sources as of [date]"). Never leave one silently unaddressed:\n${lines.join("\n")}`;
}

// Want-word extraction — IDENTICAL shape to grounding's slot-forcing proseCovers (description-or-key,
// 4+ letter words), so the two pre-gates agree on what "the prose speaks to the slot" means.
/** @param {SlotRow} s */
function wantWords(s) {
  return new Set(String(s.description || s.slot_key).toLowerCase().match(/[a-z]{4,}/g) || []);
}

/** Does the brief prose cover the slot — topical sentence hit OR explicit GAP naming? Pure.
 * @param {string} body @param {SlotRow} slot */
export function slotCovered(body, slot) {
  const text = String(body || "").toLowerCase();
  // Explicit GAP forms: the bracketed slot key ("[effective_date] not available …") or the slot key itself.
  if (text.includes(`[${slot.slot_key.toLowerCase()}]`) || text.includes(slot.slot_key.toLowerCase().replace(/_/g, " "))) return true;
  const want = wantWords(slot);
  if (!want.size) return true; // a slot with no extractable keywords cannot be checked — never false-fail
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.some((sent) => sent && [...want].some((w) => sent.includes(w)));
}

/** The required slots the brief covers NEITHER topically NOR as an explicit GAP. Pure.
 * @param {string} body @param {SlotRow[]} slots @returns {SlotRow[]} */
export function uncoveredSlots(body, slots) {
  return (slots || []).filter((s) => !slotCovered(body, s));
}

/** Corrective feedback appended to the synthesis user prompt for the ONE retry. @param {SlotRow[]} uncovered */
export function buildSlotRetryFeedback(uncovered) {
  const lines = uncovered.map((s) => `- ${s.slot_key}: ${s.description || s.slot_key}`);
  return `\n\nCORRECTIVE RETRY — your previous draft left the following REQUIRED SLOT(S) completely unaddressed. For EACH one, either state it as a cited FACT (verbatim-groundable in a SOURCE block) or emit the explicit GAP form ("Specific [value] not available from primary sources as of [date]"). Do not omit any of them again:\n${lines.join("\n")}`;
}

// ── in-process slot cache (per item_type, TTL-bounded) ──
export const DEFAULT_SLOT_TTL_MS = 10 * 60 * 1000; // 10 min — spec changes land without a restart

/** @param {Map<string, {slots: SlotRow[], fetchedAtMs: number}>} store @param {string} itemType
 * @param {number} nowMs @param {number} [ttlMs] @returns {SlotRow[]|null} fresh slots or null */
export function slotCacheGet(store, itemType, nowMs, ttlMs = DEFAULT_SLOT_TTL_MS) {
  const e = store?.get(itemType);
  return e && (nowMs - e.fetchedAtMs) < ttlMs ? e.slots : null;
}

/** @param {Map<string, {slots: SlotRow[], fetchedAtMs: number}>} store @param {string} itemType
 * @param {SlotRow[]} slots @param {number} nowMs */
export function slotCachePut(store, itemType, slots, nowMs) {
  store?.set(itemType, { slots, fetchedAtMs: nowMs });
  return slots;
}
