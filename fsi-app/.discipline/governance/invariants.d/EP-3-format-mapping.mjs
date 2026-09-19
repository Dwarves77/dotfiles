// EP-3-format-mapping: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-3-format-mapping',
    skill: 'environmental-policy-and-innovation',
    section: 'Format Mapping',
    text: 'Each item_type maps to exactly one of the five brief formats (reg-family→Regulatory Fact; technology→Technology Profile; regional_data→Operations; market_signal/initiative→Market Signal; research_finding→Research Summary).',
    anchor: 'Format Mapping',
    enforcedBy: ['audit:fsi-app/scripts/verify/routing.mjs'],
    residual: 'routing.mjs checks the STORED brief format vs item_type over data; the in-code mapping SSOT is src/lib/domains.ts.',
  };
