// SF-1-inventory-consistency: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.
//
  // ───────────────────────────── sprint-followups-discipline ─────────────────────────────
  

export const invariant = {
    id: 'SF-1-inventory-consistency',
    skill: 'sprint-followups-discipline',
    section: 'Inventory consistency rule',
    text: 'Commits modifying docs/inventories/*.md must satisfy the consistency runner (inventories match codebase reality: no missing claims, no orphans).',
    anchor: 'Inventory consistency rule',
    enforcedBy: ['rule:014', 'consistency:C3', 'consistency:C4'],
  };
