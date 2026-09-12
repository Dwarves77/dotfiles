// flywheel-steps.mjs - the two per-item flywheel steps (rule 16(a) discovery, rule 16(b) forward-event
// extraction) whose real logic is non-trivial enough to duplicate by accident: extracted verbatim from
// apply-staged-update.ts's own participateInFlywheel (task 3.4, brief-chain build plan Part 3,
// 2026-09-11) so a SECOND caller (scripts/turns/apply-record-briefs.mjs, the brief-apply driver) can run
// the identical discovery re-read, the identical migration-307-era dedupe key, the identical stale-events
// detection, and the identical 23505 unique-violation handling without a second, independently-maintained
// copy of any of them - the same "one reusable writer" discipline task 1.1's link-item-entities.mjs
// already established for the entities step (see that module's own header).
//
// PURE extraction, no behavior change: apply-staged-update.ts's participateInFlywheel now calls these two
// functions instead of inlining their bodies; every existing assertion in
// apply-staged-update-forward-participation.npmtest.mjs (13 pre-existing + 3 rule-16(e) tests) still
// exercises the identical code path and still passes unchanged.
//
// WHAT STAYS OUT of this shared layer, deliberately: neither function calls recordFlywheelDefect and
// neither pushes onto a caller's own `flags` array. Those are caller-specific bookkeeping - apply-staged-
// update.ts's own `flags` string convention (`context: "update"`), or apply-record-briefs.mjs's own
// per-item outcome vocabulary (`context: "brief-apply"`) - kept out of this module so the two callers can
// label the same underlying fact differently without duplicating the fact itself. Both functions THROW on
// a real failure (never return an {ok:false} shape) - the exact posture apply-staged-update.ts's own
// try/catch blocks already relied on before this extraction, preserved so the caller's catch clause needs
// no change beyond the call site itself.
//
// compliance_deadline sync (rule 16(b)/17, DATECHAIN 2026-09-11) is NOT wrapped here: it is already a
// single call to syncComplianceDeadlineForItem(supabase, itemId) with nothing else around it, so both
// callers import that function directly - wrapping a one-line passthrough would add a name without
// removing any duplication.
import { runConnectionDiscovery, CONNECTION_SIGNATURE_COLUMNS } from "../connections/run-discovery.mjs";
import { readAndExtractForwardEvents } from "../forward-events/read-and-extract.mjs";
import { createHash } from "node:crypto";

function md5Hex(s) {
  return createHash("md5").update(String(s ?? ""), "utf8").digest("hex");
}

/** Migration 307's dedupe key: (intelligence_item_id, event_date, event_kind, md5(obligation_text),
 *  coalesce(source_claim_id, source_section_id)) - the intelligence_item_id part is implicit here (every
 *  row this scans is already scoped `.eq("intelligence_item_id", itemId)`). Mirrors apply-staged-update.ts's
 *  own (pre-extraction) forwardEventDedupeKey byte for byte. */
function forwardEventDedupeKey(row) {
  const sourceObjectId = row.source_claim_id ?? row.source_section_id ?? "";
  return `${row.event_date}|${row.event_kind}|${md5Hex(row.obligation_text)}|${sourceObjectId}`;
}

/**
 * Rule 16(a): re-run connection discovery against the item's CURRENT signature. A fresh re-read (rather
 * than trusting a caller's own in-memory row) is the only way to get an authoritative full signature when
 * a caller may have touched only SOME of the signature columns.
 * THROWS on a read/write failure - the caller's own try/catch records the defect and flags it.
 * @param {object} supabase a write-capable Supabase client
 * @param {string} itemId
 * @returns {Promise<{written: number}>}
 */
export async function runDiscoveryStep(supabase, itemId) {
  const { data: row, error: readErr } = await supabase
    .from("intelligence_items")
    .select(CONNECTION_SIGNATURE_COLUMNS)
    .eq("id", itemId)
    .single();
  if (readErr) throw new Error(`intelligence_items re-read for discovery failed: ${readErr.message}`);
  const written = await runConnectionDiscovery(supabase, itemId, row);
  return { written };
}

/**
 * Rule 16(b): re-extract forward events from the item's CURRENT grounded content, write only the events
 * not already present (the migration-307 dedupe key), and report (never delete) any EXISTING
 * item_forward_events row whose supporting claim/section has since disappeared ("stale-events").
 * THROWS on a read/write failure other than a 23505 unique-violation race, which this function treats as
 * zero-new (the dedupe key already did its job) rather than an error.
 * @param {object} supabase a write-capable Supabase client
 * @param {string} itemId
 * @returns {Promise<{attempted: number, insertedCount: number, collision: boolean,
 *   staleRows: Array<{id: string}>}>} `attempted` is how many de-duplicated-within-this-batch rows this
 *   call tried to insert (0 when nothing new was extracted); `collision` is true only when the insert hit
 *   a 23505 (a concurrent writer landing the same key first) - the caller distinguishes "nothing to do"
 *   from "raced and lost" the same way apply-staged-update.ts's own pre-extraction code did (only the
 *   latter ever produced a `forward-events:0` flag).
 */
export async function runForwardEventsStep(supabase, itemId) {
  const { events, claims, sections } = await readAndExtractForwardEvents(supabase, itemId);

  const { data: existingRows, error: existingErr } = await supabase
    .from("item_forward_events")
    .select("id, event_date, event_kind, obligation_text, source_claim_id, source_section_id")
    .eq("intelligence_item_id", itemId);
  if (existingErr) throw new Error(`item_forward_events read failed: ${existingErr.message}`);
  const existing = existingRows ?? [];

  // stale-events: an existing row's supporting claim/section is no longer among the item's CURRENT
  // FACT/GAP claims / rendered sections (re-grounding removed or reclassified it). Grounding rule 1
  // (migration 274) guarantees exactly one of source_claim_id/source_section_id is set per row.
  const currentClaimIds = new Set((claims ?? []).map((c) => c.claim_id));
  const currentSectionIds = new Set((sections ?? []).map((s) => s.section_id));
  const staleRows = existing.filter((r) =>
    r.source_claim_id
      ? !currentClaimIds.has(r.source_claim_id)
      : r.source_section_id
        ? !currentSectionIds.has(r.source_section_id)
        : false,
  );

  // dedupe against the migration-307 key: PostgREST's upsert onConflict only accepts a plain column
  // list, and the real unique index is EXPRESSION-based - not expressible that way - so idempotency is
  // done at the application layer: compute the same key the index computes, skip anything already
  // present (or repeated within this same extraction batch), and plain-INSERT only what's left.
  const existingKeys = new Set(existing.map((r) => forwardEventDedupeKey(r)));
  const seenInBatch = new Set();
  const newRows = [];
  for (const ev of events) {
    const row = { intelligence_item_id: itemId, ...ev };
    const key = forwardEventDedupeKey(row);
    if (existingKeys.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    newRows.push(row);
  }

  let insertedCount = 0;
  let collision = false;
  if (newRows.length) {
    const { error: fwdErr } = await supabase.from("item_forward_events").insert(newRows);
    if (fwdErr) {
      if (fwdErr.code === "23505") {
        collision = true;
      } else {
        throw new Error(`item_forward_events insert failed: ${fwdErr.message}`);
      }
    } else {
      insertedCount = newRows.length;
    }
  }

  return { attempted: newRows.length, insertedCount, collision, staleRows };
}
