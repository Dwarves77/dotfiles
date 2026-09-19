// RD-28-verified-is-resting-state: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-28-verified-is-resting-state',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 18: Snapshot-first grounding (acquisition is locked by default)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A verified item is a resting state — no paid re-ground of a provenance_status=verified item without evidence of change (hash / Last-Modified mismatch) or an explicit operator order. The 2026-07-06 reconciliation sweep ($15.56) that re-verified resting-state items is logged as waste, cause "design defect, pre-doctrine."',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'A verified item is a resting state — re-verification requires evidence of change',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    enforcedBy: ['selftest:fsi-app/src/lib/llm/spend-guard.test.mjs'],
    residual: 'I4. spend-guard.test.mjs proves the VERIFIED-ITEM gate: assertTicket THROWS SPEND_REJECTED (…already provenance_status=verified) for a verified ticket, case-insensitively, and passes a quarantined ticket. This is the mechanical "no paid re-verify of a resting-state item."',
  };
