// RD-21-generation-pause-split: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-21-generation-pause-split',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 15: The generation pause split (pause is prohibition, dormancy is schedule)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Generation pause is SPLIT by a single pure primitive evaluateGenerationPause(scrape, caller): emergencyPaused (global_processing_paused) is a HARD stop for EVERY caller (the operator stop is inviolable, no caller identity overrides it); cadence===off is DORMANT and halts AUTONOMOUS generation only — an F16-signed manual caller (manual-intake-run) proceeds. The fetch gate isGloballyPaused is unchanged; downstream integrity gates (data-audit-block, daily-cap, floors, judge) bind every caller. This is why the manual-intake path can GROUND (not only MINT) in the dormant pre-launch state.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'The generation pause split (pause is prohibition, dormancy is schedule)',
    enforcedBy: ['selftest:fsi-app/src/lib/api/generation-pause.npmtest.mjs'],
    residual: 'generation-pause.npmtest.mjs proves the split red-then-green (7/7): the signed manual caller PASSES cadence-off (dormancy is a schedule), and is BLOCKED under emergencyPaused (the operator stop is inviolable — no caller identity overrides it); autonomous/unsigned callers stay gated by cadence-off; everyone runs when a cadence is set and no emergency. The STOP-FLAG-WRITE half — that no agent may ALTER global_processing_paused/scrape_cadence by a direct write — is a SEPARATE mechanical leg, now RD-23 (pause-flag-has-one-writer): the F20 fitness function (static one-writer) + the migration-201 guard trigger + admin_set_pause_state RPC (runtime bounce of any unmarked write) + the audit table. This REPLACES the DEAD 2a operator-credential design (which required a manual operator step to provision a login role/secret — human intervention as a fix, ruled dead 2026-07-12).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
