// RD-90-actions-artifact-budget: registered by lane R22 (ACTIONS-STORAGE-AND-DOCS-ONLY-PUSH, 2026-10-01).
// Renumbered from a self-assigned RD-86 to RD-90 per coordinator correction, 2026-10-02: RD-86 was
// already taken (workflow-run-chain-depth, lane LOOP-B-FIRING) and invariants on master already run to
// RD-87, with lane R6-8 holding RD-88 and RD-89. RD-90 is the coordinator-assigned id.

export const invariant = {
  id: 'RD-90-actions-artifact-budget',
  skill: 'remediation-discipline',
  section:
    "Section 4 — category 37: A perf number in CI carries a ratchet, a target, and dated evidence (a number with no citation is a guess wearing a measurement's clothes)",  // glyph:verbatim (must match the skill heading's own em dash byte-for-byte, same convention invariants.d/README.md documents for every carried-over anchor/section field)
  text:
    'EXTENDS category 37 from perf numbers to GitHub Actions artifact storage: a retention-days value ' +
    'and an upload path are budget numbers too, and were asserted only in prose (lane briefs, workflow ' +
    'comments), never mechanically held to a ceiling. [CONFIRMED 2026-10-01, gh api ' +
    'repos/Dwarves77/dotfiles/actions/artifacts --paginate] the coordinator measured 311 artifacts, 6.2 ' +
    'GB, every one from September, every one of 13 workflows uploading its whole ' +
    'fsi-app/scripts/_snapshots/ tree (guarded-write row snapshots, regenerable machine evidence per ' +
    'CLAUDE.md rule 5) at a 90-day retention; the coordinator\'s own cleanup deleted 290 artifacts older ' +
    'than 3 days, landing at 0.43 GB. No gate held retention-days to any ceiling, and no gate stopped a ' +
    'workflow from uploading gitignored scratch. F68 (actions-artifact-budget) closes both: every ' +
    'actions/upload-artifact step across .github/workflows/*.yml must set retention-days <= 7 when it ' +
    'sets one at all, and its path: value must never contain _snapshots or scripts/tmp anywhere, inline ' +
    'or inside a block scalar.',
  anchor:
    "### Section 4 — category 37: A perf number in CI carries a ratchet, a target, and dated evidence (a number with no citation is a guess wearing a measurement's clothes)",  // glyph:verbatim (must match the skill heading's own em dash byte-for-byte, same convention invariants.d/README.md documents for every carried-over anchor/section field)
  enforcedBy: [
    'fitness:F68',
    'selftest:fsi-app/.discipline/fitness/functions/F68-actions-artifact-budget.test.mjs',
  ],
  residual:
    'F68 is a line-based, indentation-based text scan of every .github/workflows/*.yml file (the same ' +
    'posture F52/F54 already use; no YAML parser is a direct dependency of this repository), not a real ' +
    'parser: it assumes this repo\'s own 2-space block-style indentation and the `uses:` / `with:` / ' +
    '`path:` / `retention-days:` shapes every workflow here uses today. It checks the budget NUMBERS ' +
    '(retention-days, forbidden path substrings) mechanically; it does not, and cannot from static text, ' +
    'verify the REAL per-run artifact SIZE a workflow uploads, that is docs/runbooks/fleet-budget-' +
    'control.md\'s job (a runbook entry read back via gh api, not a CI gate), the same split category 37 ' +
    'already draws between F37\'s shape check and a live re-measurement lane for perf numbers.',
};
