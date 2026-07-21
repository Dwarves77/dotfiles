// @ts-check
// QUEUE-SCOPED FACT->ANALYSIS RELABEL — PURE CORE (Session B, 2026-07-20; operator GO on Session A's
// parked spec, session-log 2026-07-18 "RELABEL-MANUAL CLASS — parked, primitive-required").
//
// THE PROBLEM THIS SOLVES. A drain-queue item can sit quarantined on `fact_below_authority_floor`: a FACT
// claim grounded to a source below its item type's authority floor. The honest resolution is to relabel it
// FACT -> ANALYSIS, so the brief presents it as analysis rather than as verified fact. But a bare metadata
// flip is NOT the fix: criterion 4 requires a recognized label IN THE BRIEF'S PROSE ITSELF, so flipping
// claim_kind without inserting the prose label creates a NEW inconsistency (a customer-facing bare
// assertion whose backing metadata now silently says "analysis"). That divergence is the exact class this
// campaign exists to eliminate, which is why Session A refused to ad-hoc it and specced a primitive.
//
// WHAT THIS CORE OWNS (pure, no DB, no I/O — so the golden can prove it without a database):
//   locateOnce      strict raw case-insensitive substring locate requiring EXACTLY ONE occurrence
//   insertMarker    byte-precise pure insertion, self-verified by INVERSE-DIFF (removing the marker at the
//                   offset must reproduce the input byte-for-byte, and the length delta must be exactly
//                   the marker length) — throws otherwise, so a non-pure edit cannot reach a write
//   planRelabel     the whole per-item decision: which claims are eligible, which are honest residual, and
//                   the resulting section text — computed from stored state alone
//
// INHERITED GUARDRAILS (from scripts/phase2-analysis-relabel.mjs, the one tool that does this correctly;
// A's spec says adapt its verified-insertion pattern, and these are the parts that make it correct):
//   - claim_text is NEVER written. Not normalized, not slot-stripped, not reflowed. Editing the stored
//     fact until it matches the prose is fake certification in miniature; there is deliberately no path.
//   - A claim is eligible ONLY if its stored claim_text is already a raw substring of its section's
//     content_md occurring EXACTLY ONCE. Absent (-1) or ambiguous (-2) falls to the honest residual and is
//     never guessed at.
//   - Insertion is PURE: the marker goes immediately before the located sentence; every surrounding byte,
//     including whitespace, is unchanged. No reflow, no paraphrase, no rewriting.
//   - Idempotent: a claim whose sentence already carries the marker is skipped, not double-marked.
//
// WHAT CHANGED FROM THE REFERENCE (A's spec: "queue-scoped precondition, not the old phase2 flag"):
//   The reference hard-gated on an open `phase2_priority_review` integrity_flag from an earlier, narrower
//   program. That precondition does not fit this queue. The queue-scoped precondition (drain_worklist
//   membership) is enforced by the CLI, which owns all DB access; this core stays pure.
//
// NOT IN SCOPE, NAMED so the boundary is explicit rather than discovered later: this primitive resolves
// the `fact_below_authority_floor` class ONLY. It does NOT resolve criterion-4 `unlabeled_assertion` on a
// section that has no below-floor FACT to relabel (a bare prose assertion, or a markdown TABLE row tripping
// the binding-verb regex). Those have no claim to flip, so there is nothing for this tool to act on; they
// need the 4c judge path (relabel-unlabeled.mjs) or a prose correction. A caller asking this tool to fix
// that class gets an empty plan and an explicit reason, never a silent no-op.

import { ANALYSIS_LABELS_BY_KEY } from "./analysis-labels.mjs";

/** The marker inserted before a relabeled sentence. Display form (asterisk-emphasis + colon + one trailing
 *  space so it reads as a prefix), derived from the ONE label vocabulary — never hand-listed here. */
export const RELABEL_MARKER = `*${ANALYSIS_LABELS_BY_KEY.inference}* `;

/** Item types in the regulation family (the authority floor bites hardest here). */
export const REG_FAMILY = Object.freeze(["regulation", "directive", "standard", "guidance", "framework"]);

// DELIBERATE DIVERGENCE FROM THE REFERENCE (phase2-analysis-relabel.mjs), recorded so it is not read as an
// oversight: the reference additionally required priority CRITICAL/HIGH before treating a FACT as
// below-floor. The LIVE validator no longer agrees — `validate_item_provenance` reports
// `fact_below_authority_floor` on reg-family items at LOW priority too (verified 2026-07-20 against
// intelligence_items 5b9b05c7, priority=LOW: gate reports 3 failures, this core counts the same 3). This
// core matches the LIVE GATE rather than the reference's older, narrower premise, because the whole point
// is to resolve what the gate actually fails on. Verified on two items, both exact matches (3/3 and 18/18).
// If the gate's floor rule changes again, this is the line to re-check.

/** A claim is below the reg-family authority floor when its grounding tier is NULL or worse than T2. */
export function belowRegFloor(tier) {
  return tier == null || ![1, 2].includes(Number(tier));
}

/** Strict raw case-insensitive locate requiring EXACTLY ONE occurrence.
 *  @returns {number} byte offset in the ORIGINAL string, -1 if absent, -2 if ambiguous (2+ occurrences). */
export function locateOnce(md, claimText) {
  const hay = String(md ?? "").toLowerCase();
  const needle = String(claimText ?? "").toLowerCase();
  if (!needle) return -1;
  const first = hay.indexOf(needle);
  if (first < 0) return -1;
  if (hay.indexOf(needle, first + 1) >= 0) return -2;
  return first;
}

/** PURE-INSERTION with INVERSE-DIFF self-verification. Inserting the marker at `off` must be exactly
 *  reversible: slicing the marker back out must reproduce `md` byte-for-byte, and the length must grow by
 *  exactly the marker length. Any deviation THROWS — a non-pure edit can never reach a write.
 *  @returns {string} the new content_md */
export function insertMarker(md, off, marker = RELABEL_MARKER) {
  const src = String(md ?? "");
  if (!Number.isInteger(off) || off < 0 || off > src.length) {
    throw new Error(`insertMarker: offset ${off} out of range for length ${src.length}`);
  }
  const next = src.slice(0, off) + marker + src.slice(off);
  const back = next.slice(0, off) + next.slice(off + marker.length);
  if (back !== src) throw new Error(`diff-assert FAILED: insertion at ${off} is not a pure insertion`);
  if (next.length !== src.length + marker.length) {
    throw new Error(`diff-assert FAILED: length delta ${next.length - src.length} != marker length ${marker.length}`);
  }
  return next;
}

/** True when the sentence at `off` is already marked (idempotency guard). */
export function alreadyMarked(md, off, marker = RELABEL_MARKER) {
  const src = String(md ?? "");
  return src.slice(Math.max(0, off - marker.length), off) === marker;
}

/**
 * Plan a per-item relabel from STORED state. Pure: no DB, no clock, no I/O.
 *
 * @param {object} input
 * @param {{item_type?: string}} input.item              the item (item_type drives floor applicability)
 * @param {Array<{id: string, section_row_id: string, claim_text: string, claim_kind: string, source_tier_at_grounding: number|null}>} input.claims
 * @param {Map<string,string>|Record<string,string>} input.sections   section_row_id -> content_md
 * @param {string} [input.marker]
 * @returns {{eligible: Array<{claimId: string, sectionId: string, off: number, claimText: string}>,
 *            residual: Array<{claimId: string, reason: string}>,
 *            belowTotal: number,
 *            sectionEdits: Array<{sectionId: string, before: string, after: string, inserts: number}>,
 *            skipReason: string|null}}
 */
export function planRelabel({ item, claims, sections, marker = RELABEL_MARKER }) {
  const get = (id) => (sections instanceof Map ? sections.get(id) : sections?.[id]);
  const isReg = REG_FAMILY.includes(String(item?.item_type ?? ""));
  const eligible = [];
  const residual = [];
  let belowTotal = 0;

  if (!isReg) {
    return { eligible, residual, belowTotal, sectionEdits: [], skipReason: `item_type '${item?.item_type}' is not reg-family; the reg authority floor does not apply` };
  }

  for (const c of claims ?? []) {
    if (c.claim_kind !== "FACT") continue;
    if (!belowRegFloor(c.source_tier_at_grounding)) continue;
    belowTotal++;
    const md = get(c.section_row_id);
    if (md == null) { residual.push({ claimId: c.id, reason: "section content_md not available" }); continue; }
    const off = locateOnce(md, c.claim_text || "");
    if (off === -1) { residual.push({ claimId: c.id, reason: "claim_text is not a raw substring of the section prose (paraphrased or table-formatted)" }); continue; }
    if (off === -2) { residual.push({ claimId: c.id, reason: "claim_text occurs more than once in the section (ambiguous target)" }); continue; }
    if (alreadyMarked(md, off, marker)) { residual.push({ claimId: c.id, reason: "sentence already carries the marker (idempotent skip)" }); continue; }
    eligible.push({ claimId: c.id, sectionId: c.section_row_id, off, claimText: c.claim_text });
  }

  // Build the per-section edited text by RE-LOCATING in the mutating string (offsets shift as markers are
  // inserted, so a stale offset would corrupt the text). Each insert is diff-asserted by insertMarker.
  const bySection = new Map();
  for (const e of eligible) {
    if (!bySection.has(e.sectionId)) bySection.set(e.sectionId, []);
    bySection.get(e.sectionId).push(e);
  }
  const sectionEdits = [];
  for (const [sectionId, group] of bySection) {
    const before = get(sectionId);
    let md = before;
    let inserts = 0;
    for (const e of group) {
      const off = locateOnce(md, e.claimText || "");
      if (off < 0) throw new Error(`claim ${e.claimId} no longer uniquely locatable while mutating section ${sectionId} (off=${off})`);
      if (alreadyMarked(md, off, marker)) continue;
      md = insertMarker(md, off, marker);
      inserts++;
    }
    if (md.length !== before.length + inserts * marker.length) {
      throw new Error(`section ${sectionId}: length delta != ${inserts} markers`);
    }
    sectionEdits.push({ sectionId, before, after: md, inserts });
  }

  return { eligible, residual, belowTotal, sectionEdits, skipReason: null };
}
