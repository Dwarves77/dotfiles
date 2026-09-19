// EP-8-qualification-capture: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-8-qualification-capture',
    skill: 'environmental-policy-and-innovation',
    section: 'Section 8 — Qualification capture (mandatory)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'For every regulatory requirement, capture its qualifications — exceptions/carve-outs, calculation basis, defined terms (verbatim from the definitions article), and the per-year trajectory — not just the headline value; matching the workspace to a defined role or deciding an obligation attaches is a legal determination routed to counsel, never asserted.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Qualification capture (mandatory)',
    exempt: {
      reason: 'SEMANTIC generation property — same class as EP-6 (cause-effect chain) and the EP-5 lens-quality residual: whether a brief actually captures each requirement\'s exceptions / calculation basis / defined-terms / per-year trajectory, and holds the legal line, is content meaning with no low-false-positive signal. The STRUCTURAL PREREQUISITE is enforced in the pipeline: it now fetches and reads the FULL enacted text (direct-HTTP transport + raised caps + a budget-aware block builder shared by synthesis AND grounding so spans stay matchable) and CANNOT silently truncate — recordTruncation surfaces any DOWNLOAD that exceeds its cap as an integrity_flags coverage_gap (canonical-pipeline.ts + canonical-fetch.mjs {truncated,fullTextLength}). The semantic half is carried by the coverage-forcing prompt (system-prompt.ts regulatory-completeness block, synced to this skill) and PROVEN by the PPWR prove-on-one (efdb3390 quarantined→verified: 2038 ban, per-plant averaging, per-year trajectory, Art-3 defined terms captured, legal line held, zero producer-status assertions). REVISIT: a committed truncation-signal selftest would make the no-silent-truncation half enforcedBy:selftest (mechanizable, deferred for the export/extraction cost).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    },
  };
