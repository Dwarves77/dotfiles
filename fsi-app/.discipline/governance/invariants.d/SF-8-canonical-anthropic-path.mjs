// SF-8-canonical-anthropic-path: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-8-canonical-anthropic-path',
    skill: 'sprint-followups-discipline',
    section: 'Agent architecture (permitted routes)',
    text: 'Direct Anthropic API calls occur only in the canonical wrappers/routes (canonical-pipeline.ts + the sanctioned /api routes), never ad hoc.',
    anchor: 'Skill Load Confirmation',
    enforcedBy: ['rule:016'],
    residual: 'Anchor is a stable skill-section marker; the permitted-route invariant itself is owned by CLAUDE.md AGENT ARCHITECTURE and enforced by rule 016.',
  };
