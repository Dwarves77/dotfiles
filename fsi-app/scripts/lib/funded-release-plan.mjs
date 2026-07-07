// @ts-check
// FUNDED-PASS RELEASE/DELETION PLAN — pure helpers (standing dispatch item 1, binding 3b, 2026-07-06;
// dedup-loser premise SUPERSEDED same day — d5ee6ab8 struck, only the CSRD CELEX pair stands).
//
// The funded pass (loader context) JUDGES + READS + PROPOSES a plan; a pure-node applier re-verifies LIVE and
// does every write with byte-compare read-back (destructive ops re-check eligibility at APPLY time, never from
// plan/snapshot state — the byte-compare analog for deletes).
//
// THE DELETION MOAT — three-bucket instrument identity + live gates. A held dup-loser is deleted ONLY when:
//   (i)   instrument identity is IDENTIFIER-EXACT (same instrument_identifier, CELEX-class, OR canonical-URL
//         identical = same document). TOPICAL/package/title similarity is NEVER sufficient (the d5ee6ab8
//         case: "same Fit-for-55 package" ≠ instrument identity). A conflicting-identifier pairing is
//         AMBIGUOUS → surfaced to integrity_flags, never deleted.
//   (ii)  the survivor is provenance_status=verified WITH primary grounding at/above its floor (live).
//   (iii) the loser carries NO live counsel / seek-more hold (a held item is ineligible regardless of pairing).
//   (iv)  (applier) snapshot-before-delete + read-back the row is gone.
// The pure gate takes the live facts (survivorHasPrimaryGrounding, loserHasHold) as inputs so it stays
// red-then-green testable; the applier computes those from fresh reads and is the binding gate.

/** Canonical URL compare (scheme/host/trailing-punct-insensitive) — the extracted-identifier path. @param {string|null|undefined} u */
export function normUrl(u) {
  return !u ? "" : String(u).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#]+$/, "").trim();
}

/**
 * Three-bucket instrument-identity classifier. Pure.
 *  - "identifier-exact": same non-empty instrument_identifier, OR identical canonical URL (same document).
 *  - "ambiguous": both carry an instrument_identifier but they CONFLICT (e.g. same URL, different declared
 *    instrument) — surface for review, never auto-delete.
 *  - "topical": no identifier linkage at all (only title/package similarity would connect them) — never delete.
 * @returns {"identifier-exact"|"ambiguous"|"topical"}
 */
export function instrumentIdentityBucket(survivor, loser) {
  if (!survivor || !loser) return "topical";
  const si = survivor.instrument_identifier, li = loser.instrument_identifier;
  const bothInstr = !!si && !!li;
  const instrEqual = bothInstr && String(si) === String(li);
  const instrConflict = bothInstr && String(si) !== String(li);
  const urlEqual = !!normUrl(survivor.source_url) && normUrl(survivor.source_url) === normUrl(loser.source_url);
  if (instrConflict) return "ambiguous";        // conflicting declared identity — do not auto-delete
  if (instrEqual || urlEqual) return "identifier-exact";
  return "topical";
}

/**
 * The full deletion gate. Pure — the applier passes LIVE facts.
 * @param {{ survivor: object, loser: object, survivorHasPrimaryGrounding: boolean, loserHasHold: boolean }} args
 * @returns {{ ok: boolean, bucket: string, reason: string }}
 */
export function isDeletableLoser({ survivor, loser, survivorHasPrimaryGrounding, loserHasHold }) {
  if (!survivor || !loser) return { ok: false, bucket: "topical", reason: "missing survivor or loser row" };
  if (survivor.id === loser.id) return { ok: false, bucket: "topical", reason: "survivor and loser are the same item" };
  const bucket = instrumentIdentityBucket(survivor, loser);
  if (bucket === "topical") return { ok: false, bucket, reason: "TOPICAL only (no instrument_identifier / canonical-URL identity) — package or title similarity is NEVER sufficient; refuse" };
  if (bucket === "ambiguous") return { ok: false, bucket, reason: "AMBIGUOUS (conflicting declared instrument identity) — surface to integrity_flags for review; do not delete" };
  // identifier-exact — now the live gates:
  if (survivor.provenance_status !== "verified") return { ok: false, bucket, reason: `survivor is not verified (${survivor.provenance_status}) — a loser is deleted only on a VERIFIED survivor release` };
  if (!survivorHasPrimaryGrounding) return { ok: false, bucket, reason: "survivor lacks primary grounding at/above its floor — refuse" };
  if (loser.is_archived) return { ok: false, bucket, reason: "loser is already archived — nothing to delete" };
  if (loser.provenance_status === "verified") return { ok: false, bucket, reason: "loser is VERIFIED — it is not a held dup-loser; refuse" };
  if (loserHasHold) return { ok: false, bucket, reason: "loser carries a live counsel/seek-more hold — a held item is ineligible regardless of pairing; refuse" };
  return { ok: true, bucket, reason: "identifier-exact duplicate of a verified survivor with primary grounding; loser not verified, not archived, no live hold" };
}

/**
 * OPERATOR-RULED value-delete gate — a SECOND deletion class BESIDE the dedup-identity gate
 * (isDeletableLoser), which stands unchanged. Here the AUTHORIZATION is Jason's explicit ruled list
 * (the "Kansas precedent"): a mis-typed / no-value / shell item Jason has NAMED for deletion. Unlike the
 * dedup gate this does NOT require a verified survivor or identifier identity — the ruling IS the
 * authority — but it still refuses anything not on the ruled list, anything already archived, and any
 * call missing a ruling reference. The applier still snapshots + read-back-verifies the row is gone + logs
 * the ruling reference (the byte-compare analog for a delete = confirm absence).
 * @param {{ item: object, ruledIds: Set<string>|string[], ruling: string }} args
 * @returns {{ ok: boolean, reason: string }}
 */
export function isOperatorValueDeletable({ item, ruledIds, ruling }) {
  if (!item || !item.id) return { ok: false, reason: "no item row" };
  const ruled = ruledIds instanceof Set ? ruledIds : new Set(ruledIds || []);
  const key = item.legacy_id || String(item.id).slice(0, 8);
  if (!ruled.has(item.id) && !ruled.has(item.legacy_id)) return { ok: false, reason: `${key} is NOT on the operator-ruled delete list — the ruling is the only authorization; refuse` };
  if (item.is_archived) return { ok: false, reason: `${key} is already archived — nothing to delete` };
  if (!ruling || !String(ruling).trim()) return { ok: false, reason: "no ruling reference recorded — an operator value-delete MUST cite the ruling; refuse" };
  return { ok: true, reason: `operator-ruled value-delete (${ruling})` };
}

/**
 * Assemble the plan. Loader context calls this AFTER the paid loop with the items that flipped to verified;
 * for a survivor it passes its candidate loser rows (already url/instrument-filtered) + the live facts. The
 * applier RE-VERIFIES live, so this classification is advisory (transparency in the plan file).
 * @param {Array<{ itemId: string, itemKey: string, survivor: object|null, deferredFlagIds: string[],
 *   loserCandidates?: Array<{ row: object, loserHasHold: boolean }>, survivorHasPrimaryGrounding?: boolean }>} flipped
 * @returns {{ releases: Array, deletionProposals: Array, ambiguous: Array, skipped: Array }}
 */
export function buildReleaseDeletionPlan(flipped) {
  const releases = [], deletionProposals = [], ambiguous = [], skipped = [];
  for (const f of flipped || []) {
    for (const flagId of f.deferredFlagIds || []) releases.push({ flagId, itemId: f.itemId, itemKey: f.itemKey });
    if (!f.survivor) continue;
    for (const cand of f.loserCandidates || []) {
      const loser = cand.row;
      const v = isDeletableLoser({ survivor: f.survivor, loser, survivorHasPrimaryGrounding: !!f.survivorHasPrimaryGrounding, loserHasHold: !!cand.loserHasHold });
      const key = loser.legacy_id || String(loser.id).slice(0, 8);
      const rec = { loserId: loser.id, loserKey: key, survivorId: f.survivor.id, survivorKey: f.itemKey, bucket: v.bucket, reason: v.reason };
      if (v.ok) deletionProposals.push(rec);
      else if (v.bucket === "ambiguous") ambiguous.push(rec);
      else skipped.push(rec);
    }
  }
  return { releases, deletionProposals, ambiguous, skipped };
}

/** Applier-side schema validation — reject the WHOLE plan if any entry is malformed. Pure. */
export function validateReleaseDeletionPlan(plan) {
  const violations = [];
  if (!plan || typeof plan !== "object") return { ok: false, violations: ["plan is not an object"] };
  if (!Array.isArray(plan.releases)) violations.push("plan.releases is not an array");
  if (!Array.isArray(plan.deletionProposals)) violations.push("plan.deletionProposals is not an array");
  for (const [i, r] of (plan.releases || []).entries())
    if (!r || typeof r.flagId !== "string" || typeof r.itemId !== "string") violations.push(`release #${i}: missing flagId/itemId`);
  for (const [i, d] of (plan.deletionProposals || []).entries()) {
    if (!d || typeof d.loserId !== "string" || typeof d.survivorId !== "string") violations.push(`deletion #${i}: missing loserId/survivorId`);
    if (d && d.loserId && d.loserId === d.survivorId) violations.push(`deletion #${i}: loserId === survivorId (would delete the survivor)`);
  }
  return { ok: violations.length === 0, violations };
}
