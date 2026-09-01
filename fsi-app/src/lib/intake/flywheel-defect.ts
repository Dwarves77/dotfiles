// flywheel-defect.ts — recordFlywheelDefect, rule 16(d)'s ONE writer for "a flywheel step didn't run" (and
// for "stale-events", a related-but-distinct finding: an already-written item_forward_events row whose
// supporting claim/section has since gone away). SHARED by every rule-16 participant so a defect is
// recorded in exactly one shape everywhere it is opened.
//
// MOVED HERE (lane FIX, 2026-09-01) from mint-item.ts, where it was a private export used only by that
// file's own two mint-time post-insert try/catch blocks (rule 16a/16b). apply-staged-update.ts's
// update_item path now needs the identical shape for its own post-update discovery/extraction try/catch
// blocks (rule 16, "the forward-participation clause" — "on every mint or SUBSTANTIVE UPDATE"), so this
// is the ONE home for it — a second hand-copied definition would be exactly the drift flag-namespaces.mjs's
// own header warns a producer must never introduce: one shape, one place, every caller sees the same
// integrity_flags row structure for a flywheel-defect finding.
import type { SupabaseClient } from "@supabase/supabase-js";
import { FLYWHEEL_DEFECT_NAMESPACE, createdBy } from "@/lib/connections/flag-namespaces.mjs";

export type FlywheelDefectSubtype = "discovery" | "forward-events" | "stale-events";

const STEP_LABEL: Record<FlywheelDefectSubtype, string> = {
  discovery: "(a) connection discovery",
  "forward-events": "(b) forward-event extraction",
  "stale-events": "(b) forward-event staleness",
};

/**
 * Rule 16(d): a failure of connection discovery (16a) or forward-event extraction (16b) is a RECORDED
 * integrity_flags defect, never a silent skip. Also used for the "stale-events" finding: a substantive
 * update whose re-extraction pass found that an EXISTING item_forward_events row's supporting claim or
 * section is gone — recorded as a flag for a human/later pass to review, never an autonomous DELETE (this
 * writer never removes an existing event row itself). Best-effort: the write itself must never throw back
 * into a mint/update that already succeeded — swallowed exactly like every other post-insert/post-update
 * flag write in the two callers.
 * @param {SupabaseClient} sb
 * @param {string} itemId
 * @param {FlywheelDefectSubtype} subtype - which rule-16 step failed, or "stale-events" for a staleness finding
 * @param {string} message - the caught error's message (or, for stale-events, what's stale), verbatim
 * @param {{context?: string}} [opts] - where this ran ("mint" | "update"), named in the recorded
 *   description. Defaults to "mint" (mint-item.ts's original, unparameterized wording) so this move is a
 *   no-op for every existing mint-time call site.
 */
export async function recordFlywheelDefect(
  sb: SupabaseClient,
  itemId: string,
  subtype: FlywheelDefectSubtype,
  message: string,
  opts: { context?: string } = {}
): Promise<void> {
  const context = opts.context ?? "mint";
  const step = STEP_LABEL[subtype];
  const isStale = subtype === "stale-events";
  await sb
    .from("integrity_flags")
    .insert({
      category: "data_quality",
      subject_type: "item",
      subject_ref: itemId,
      description: `rule 16 ${step} ${isStale ? "flagged" : "failed"} at ${context} for item ${itemId}: ${message}`,
      recommended_actions: [
        isStale
          ? {
              action: "review-stale-events",
              rationale: `${step}: existing item_forward_events row(s) reference a claim or section that no longer exists — review whether the events are still valid; never auto-deleted`,
            }
          : {
              action: "investigate",
              rationale: `${step} did not run for this item — the mint/update proceeded (non-fatal by design), but the flywheel step itself never completed and must be re-run or diagnosed`,
            },
      ],
      status: "open",
      created_by: createdBy(FLYWHEEL_DEFECT_NAMESPACE, subtype),
    })
    .then(() => {}, () => {});
}
