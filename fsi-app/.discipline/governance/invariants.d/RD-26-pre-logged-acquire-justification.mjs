// RD-26-pre-logged-acquire-justification: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-26-pre-logged-acquire-justification',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 18: Snapshot-first grounding (acquisition is locked by default)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Every paid acquire MUST pre-log a justification (missing_snapshot | content_changed | cheap_verify_failed) to the ledger BEFORE the paid call, so an unjustified paid run is mechanically impossible and the spend gauge can count justification coverage.',
    anchor: 'Every paid acquire MUST pre-log a justification before it spends',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/verify-item.test.mjs'],
    residual: 'I2. verify-item.test.mjs proves the paid branch writes the cost-0 justification row BEFORE the acquire lock throws (no-snapshot + act:true + acquire OFF → justification logged, THEN GROUNDING_ACQUIRE_LOCKED). An invalid justification reason is rejected.',
  };
