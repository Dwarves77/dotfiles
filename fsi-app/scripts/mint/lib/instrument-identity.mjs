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
