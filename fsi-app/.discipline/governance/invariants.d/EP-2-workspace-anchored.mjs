// EP-2-workspace-anchored: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-2-workspace-anchored',
    skill: 'environmental-policy-and-innovation',
    section: 'The Workspace-Anchored Rule',
    text: 'Output never names the workspace, company, or any person; anchoring is by role/operation/vertical/mode in generic terms.',
    anchor: 'The Workspace-Anchored Rule (mandatory, never violated)',
    enforcedBy: ['audit:fsi-app/scripts/verify/no-names.mjs'],
    residual: 'Runs over STORED briefs (data lane); a newly generated brief is checked on the next audit run, not at generation instant.',
  };
