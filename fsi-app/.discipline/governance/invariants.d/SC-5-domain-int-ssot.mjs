// SC-5-domain-int-ssot: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-5-domain-int-ssot',
    skill: 'source-credibility-model',
    section: 'Section 8: Customer-Facing Signal Sets Per Surface',
    text: 'Domain integers (1-7 surface mapping) are owned solely by src/lib/domains.ts; they MUST NOT be hardcoded outside that file.',
    anchor: 'Domain integers MUST NOT be hardcoded outside that file',
    exempt: {
      reason: 'MECHANIZABLE-VIA-REFACTOR, deferred for cost (NOT non-mechanizable). A literal scan for bare integers 1-7 is genuinely weak-signal (overwhelmingly false-positive). BUT a branded `Domain` TYPE (type-level tagging so a raw int cannot flow where a Domain is expected) is a clean mechanization — same category as SC-3\'s pgTAP half: buildable via refactor, deferred for refactor cost. Interim: domains.ts SSOT convention + code review. REVISIT: introduce a branded Domain type → then a tsc/F-check enforces it.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    },
  };
