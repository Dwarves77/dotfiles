// SCS-1-surface-contracts-skill-copy: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SCS-1-surface-contracts-skill-copy',
    skill: 'caros-ledge-surface-contracts',
    section: 'The one rule to remember (operator-side standalone copy of PI-5)',
    text: 'The standalone caros-ledge-surface-contracts skill is, by its own text, "the portable, operator-side copy of the same content that lives in caros-ledge-platform-intent" (PI-5): every scope decision that declines or parks a candidate MUST record a five-surface test before the decision stands. Because this is a second, independent skill FILE carrying the identical normative rule, it is a second place the rule can silently drift (weakened, narrowed, or deleted) without the PI-5 anchor/marker-baseline check in caros-ledge-platform-intent ever seeing it — the two-homes drift class (contract-version.test.mjs\'s framing) applied to skill prose instead of a stamped version.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'every scope decision that declines or parks a candidate MUST record a five-surface test',
    enforcedBy: ['selftest:fsi-app/scripts/verify/surface-contract-gate.golden.mjs'],
    residual: 'Shares PI-5\'s mechanism deliberately (same rule, two skill-file homes, one live gate) rather than inventing a parallel one — the golden fixture proof + the SESSION-C-owned live CHECK constraint (same PENDING-C status as PI-5) cover the RULE. What this invariant closes is narrower and was the actual gap: before 2026-08-10 this skill file was absent from SKILL_FILES, so ANY edit to this file — including one that silently weakened or deleted the MUST-record-five-surface-test line — passed the meta-gate with zero signal, even though the identical line in caros-ledge-platform-intent was already anchor+marker-baseline guarded. Registering the file in SKILL_FILES + this invariant\'s anchor + the marker baseline (2, live-computed) closes that blind spot: an edit here now either trips ANCHOR DRIFT (the anchor substring removed/reworded) or MARKER DRIFT (the file\'s normative-marker line count changes) and fails the meta-gate, forcing triage — mirroring, for skill-prose drift, what execution-wiring.mjs mirrors for run-vs-cited drift.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
