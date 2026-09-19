// SF-9-generation-config-no-raw-env: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-9-generation-config-no-raw-env',
    skill: 'sprint-followups-discipline',
    section: 'Agent architecture (generation knobs)',
    text: 'Generation/grounding files do not read process.env directly; tuning knobs live in src/lib/agent/generation-config.ts as reviewable named constants.',
    anchor: 'Integration With the Standing Skill-Load Rule',
    enforcedBy: ['rule:017'],
    residual: 'Anchor is a stable skill-section marker; the no-raw-env invariant is owned by the agent-architecture contract and enforced by rule 017.',
  };
