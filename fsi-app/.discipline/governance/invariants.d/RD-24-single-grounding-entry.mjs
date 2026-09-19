// RD-24-single-grounding-entry: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.
//
  // ── Snapshot-first grounding (snapshot-first rebuild PR-2, operator ruling 2026-07-13) ──
  

export const invariant = {
    id: 'RD-24-single-grounding-entry',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 18: Snapshot-first grounding (acquisition is locked by default)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Grounding acquisition (external fetch + model to produce/verify a brief) has EXACTLY ONE entry: the durable workflow over the canonical pipeline, reached through the snapshot-first verify-item entry point. No other production file may directly invoke generateBriefWorkflow / generateBrief / groundBrief — a direct call re-creates the old bypass path (block4-retroground-runner + the deleted standalone runners) that spent $65 unattributed in July.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Grounding acquisition has exactly one entry point',
    enforcedBy: ['fitness:F21', 'selftest:fsi-app/.discipline/fitness/functions/F21-single-grounding-entry.test.mjs'],
    residual: 'F21 (grep-class, red-then-green: a direct generateBriefWorkflow/generateBrief(/groundBrief( reference outside the sanctioned set — canonical-pipeline, generate-brief workflow, run-intake-cycle, the two start-routes, verify-item — is RED; comments + regenerateBrief() + overrides are GREEN; a LIVE scan of 297 src files passes). Scope mirrors F15/F16 (production path only); one-off scripts are held at the commit layer (rule 016) + the runner deletion.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
