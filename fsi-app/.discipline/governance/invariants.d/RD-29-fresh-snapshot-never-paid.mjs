// RD-29-fresh-snapshot-never-paid: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-29-fresh-snapshot-never-paid',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 18: Snapshot-first grounding (acquisition is locked by default)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A fresh valid snapshot MUST NOT reach the paid path. When a stored snapshot exists and the source has not changed, verification is the cheap span-match against stored text (~$0); paid acquire is reserved for missing/changed snapshots and is itself locked behind the operator flag (GROUNDING_ACQUIRE_ENABLED, default OFF).',
    anchor: 'A fresh valid snapshot MUST NOT reach the paid path',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/verify-item.test.mjs'],
    residual: 'I5. verify-item.test.mjs (decideVerify) proves snapshot+fresh+cheap-pass → verified_cheap (flip, no acquire); the only routes to needs_acquire are missing snapshot or cheap-verify FAIL; a changed source routes to stale_flag (never the paid path, never a silent pass). cheap-verify.test.mjs proves the span-match is pure ($0).',
  };
