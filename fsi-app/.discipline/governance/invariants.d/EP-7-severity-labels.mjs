// EP-7-severity-labels: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-7-severity-labels',
    skill: 'environmental-policy-and-innovation',
    section: 'Severity Labels',
    text: 'Exactly one severity label (ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE / MONITORING) where decision pressure exists; mandatory on reg/market/tech/ops formats.',
    anchor: 'Severity Labels',
    exempt: {
      reason: 'DATA-VERIFIED no clean bound exists (checked both, per the standing exemption-process rule). LIVE QUERY of 361 briefs: token-count distribution {0:75, 1:62, 2:57, 3:45, 4:40, 5:25, 6:23, 7:14, 8:12, …}. A CEILING (≤1) would false-flag 224/361 (62%) of VALID briefs — the reg format labels each S3 action, so multiple labels per brief are correct. A FLOOR (≥1) is also invalid (75 briefs correctly carry 0). No brief- or section-level scope yields a zero-false-positive bound because multiple labels per brief are valid by the format spec, and "where decision pressure exists" is irreducibly semantic. (Distinct: the item-level urgency `severity` column IS schema-enforced by migration 004 CHECK — a different vocabulary, not these labels.)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    },
  };
