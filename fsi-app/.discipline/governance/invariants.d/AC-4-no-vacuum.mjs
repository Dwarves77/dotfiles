// AC-4-no-vacuum: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'AC-4-no-vacuum',
    skill: 'analysis-construction-spec',
    section: '3b. The No-Vacuum Rule',
    text: 'Every item draws cross-surface direction from its documented intersection relationships; a section surfaces the cross-surface link wherever that link supplies direction.',
    anchor: 'The No-Vacuum Rule',
    exempt: {
      reason: 'SEMANTIC HALF exempt; STRUCTURAL HALF enforced. Enforced structurally: the intersection-readiness FIELDS (operational_scenario_tags, compliance_object_tags, related_items, intersection_summary) are part of the 13-field agent contract and the detect_intersections RPC consumes them (migration 021). NOT mechanizable: whether a section actually SURFACES the cross-surface link where it supplies direction is a content-quality judgment. So the fields are emitted + consumable; their directional use in prose is authoring judgment.',
    },
  };
