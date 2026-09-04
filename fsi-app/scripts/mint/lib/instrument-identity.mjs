// instrument-identity.mjs — the ONE body for the M4 same-URL identity rule (RD-M4b, 2026-09-04). Pure,
// zero dependencies (no fs/db/network), so both mint-family layers that need "do these two rows name the
// SAME document" can import it without pulling in either layer's own I/O.
//
// WHY THIS FILE EXISTS. RD-M4 (2026-09-04, apply-mint-batch.mjs's own "M4 SAME-URL IDENTITY FIX" note)
// fixed apply-mint-batch.mjs's checkM4: a same-URL holder used to block a payload on URL alone, which
// wrongly refused five of six EU Weekly Oil Bulletin market_signal series that legitimately share one
// landing page (`source_url`) but name six distinct documents (`instrument_identifier`, ruling R-D). That
// commit's own header flagged the SAME defect class one layer up, in export-census-rows.mjs's
// `partitionExcludeHeld`: a raw `source_url` Set-membership exclusion, with no identity comparison, run
// BEFORE a payload is ever built — a census row sharing a URL with a live holder would be excluded from
// export even when the two name different documents, never reaching apply-mint-batch.mjs's own (already
// fixed) checkM4 to be correctly let through. CLAUDE.md: never two copies of one rule — this file is that
// rule's one body; apply-mint-batch.mjs and export-census-rows.mjs both import from here, never redefine.
//
// THE RULE. Two identifiers name the SAME document when: both are unlabelled (null) — fail-closed, there
// is no positive evidence they differ, so an older unlabelled row at this URL MAY be the very document the
// other side also names; or both are labelled and equal once normalized (trimmed, case-insensitive). Two
// LABELLED, DIFFERENT identifiers at the same URL are a sibling series, not a duplicate, and do NOT match.
// The asymmetry is deliberate and symmetric in caution: a labelled side against an unlabelled side still
// matches (blocks/excludes) in BOTH directions — an absent identifier is never positive evidence of a
// different document, only of a row that never recorded one.

/** Normalize an `instrument_identifier` for identity comparison: trim + lowercase; anything that is not a
 *  non-empty string (null, undefined, "", whitespace-only) normalizes to `null` ("unlabelled"). Pure. */
export function normalizeInstrumentIdentifier(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toLowerCase() : null;
}

/** THE same-URL/same-document identity rule (see this file's header for the evidence and full rationale).
 *  Pure. Two identifiers name the SAME document when: both are unlabelled (null) — fail-closed; or both
 *  are labelled and equal once normalized. Two LABELLED, DIFFERENT identifiers do NOT match — a sibling
 *  series, not a duplicate (the case ruling R-D made first-class: the EU Weekly Oil Bulletin's six series
 *  sharing one landing page). This is the ONE exported predicate every same-URL identity decision in the
 *  mint family goes through — apply-mint-batch.mjs's checkM4 and export-census-rows.mjs's
 *  partitionExcludeHeld both call this, never a local re-derivation. */
export function sameInstrumentIdentity(payloadIdentifier, holderIdentifier) {
  const p = normalizeInstrumentIdentifier(payloadIdentifier);
  const h = normalizeInstrumentIdentifier(holderIdentifier);
  if (p != null && h != null) return p === h;
  return true; // at least one side unlabelled — ambiguous, presumed the same document (fail-closed)
}
