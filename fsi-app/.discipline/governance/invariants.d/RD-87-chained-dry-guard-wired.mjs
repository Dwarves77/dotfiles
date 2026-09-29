// RD-87-chained-dry-guard-wired: registers F61 (lane CHAINED-DRY-GUARD, 2026-09-29) with the
// invariant-coverage meta-gate. One entry, one file; see invariants.d/README.md.

export const invariant = {
  id: 'RD-87-chained-dry-guard-wired',
  skill: 'remediation-discipline',
  section:
    'Section 4 - category 55: a workflow_run-chained firing is never an explicit dispatch, and build ' +
    'mode forces dry mechanically, not by operator vigilance',
  text:
    'Rule 16 (CLAUDE.md): build mode (system_state.scrape_cadence=\'off\') means no standing schedules, ' +
    'every runtime by explicit dispatch. A workflow_run-chained firing is NOT an explicit dispatch; ' +
    'nobody typed the inputs, it fired because an upstream workflow completed. Every workflow_run- ' +
    'triggered workflow that can reach an apply path MUST first evaluate the shared build-mode gate ' +
    '(scripts/lib/chained-dry-guard.mjs) and force dry whenever build mode is live. Concrete finding ' +
    'this codifies (live incident, lane CHAINED-DRY-GUARD, 2026-09-29): a hand-dispatched Source sweep ' +
    '(dry) chained via workflow_run into Ledger consume, whose own chained-apply step hardcoded ' +
    '--mode apply unconditionally on every workflow_run firing with no build-mode check anywhere; the ' +
    'coordinator caught the run entering that step live and cancelled it by hand. All 8 workflow_run- ' +
    'triggered workflows in this repo (ledger-consume, population-turn, corpus-turn, downstream-chain, ' +
    'propagation-drain, gate-a-rescan, fetch-drain, brief-export) carried the identical latent gap.',
  anchor:
    'A workflow_run-chained firing is never an explicit dispatch; every workflow_run-triggered ' +
    'workflow that can reach an apply path MUST first evaluate the shared build-mode gate ' +
    '(`scripts/lib/chained-dry-guard.mjs`) and force dry whenever `system_state.scrape_cadence=\'off\'` ' +
    'is live, mechanically, not by an operator catching it.',
  enforcedBy: [
    'fitness:F61',
    'selftest:fsi-app/.discipline/fitness/functions/F61-chained-dry-guard-wired.test.mjs',
    'selftest:fsi-app/scripts/lib/chained-dry-guard.test.mjs',
  ],
  residual:
    'F61 is a text-based heuristic (no YAML/shell parser is a direct dependency of this repository, ' +
    'same posture F50/F52/F60 already state for themselves): it flags a workflow_run-triggered file that ' +
    'contains a literal "apply" string but no reference to chained-dry-guard.mjs or CHAINED_FORCED_DRY. ' +
    'A file that spells the gate call or its output differently (a variable rename, a different literal ' +
    'quoting style) would not be recognized as wired; the fix is to keep the two marker strings exact, ' +
    'not to loosen the check. The gate itself (readScrapeCadence) fails CLOSED to "off" on any DB read ' +
    'error, which means a genuine outage forces every chained hop to dry rather than risking an ' +
    'uncontrolled apply, the same trade-off src/lib/api/pause.ts\'s own fail-closed posture already makes ' +
    'for the product\'s own scrape gate. Proven locally (F61 clean, 20 new tests across both cuts of this ' +
    'lane); NOT yet proven to fire live on GitHub (no dispatch made, per the coordinator\'s explicit hold ' +
    'through both cuts of this lane) -- that live proof is deferred to the coordinator\'s next authorized ' +
    'dispatch.',
};
