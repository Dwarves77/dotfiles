// Drift-record shape for consistency checks.
//
// Each consistency check returns an array of drift objects (empty = passes).
// Drift kinds enumerate the failure modes a check can find.

export const DRIFT_KIND = Object.freeze({
  ORPHAN_CLAIM: 'orphan-claim',          // inventory claims X exists; X is not on disk
  MISSING_CLAIM: 'missing-claim',        // X exists on disk; inventory does not claim it
  STALE_STATUS: 'stale-status',          // inventory claims status (open/closed/etc.) that doesn't match reality
  MALFORMED: 'malformed',                // inventory entry has invalid shape (missing fields, bad format)
  SCOPE_UNMATCHED: 'scope-unmatched',    // ADR scope glob matches no actual file
  REFERENCE_DEAD: 'reference-dead',      // cross-reference points to something that doesn't exist
});

export function drift(kind, detail, location = null) {
  if (!Object.values(DRIFT_KIND).includes(kind)) {
    throw new Error(`Invalid drift kind: ${kind}. Use DRIFT_KIND.* constants.`);
  }
  if (!detail) throw new Error('drift() requires a detail message');
  return { kind, detail, location };
}

export const NO_DRIFT = [];
