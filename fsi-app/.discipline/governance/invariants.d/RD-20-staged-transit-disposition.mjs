// RD-20-staged-transit-disposition: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-20-staged-transit-disposition',
    skill: 'remediation-discipline',
    section: 'Section 2.1 — the intake-side sibling (staged_updates is transit-only)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'staged_updates is TRANSIT-ONLY (the intake half of no-human-finish-of-intake): a staged row resolves to MATERIALIZED (approved + materialized_at set), REJECTED-with-reason, or ROUTED-to-the-flag-resolver (an OPEN integrity_flag on the staged id — Unit 2), and MUST NOT sit in a transit state (pending / approved-unmaterialized) past the max-age. A materialization failure ages into the flag resolver, never a new species of parked approved-unmaterialized orphan (the P1#5 defect).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'staged_updates` is TRANSIT-ONLY',
    enforcedBy: ['audit:fsi-app/scripts/verify/staged-transit-audit.mjs'],
    residual: 'staged-transit-audit.mjs (CI-with-secrets / ops lane, DB creds) is the live-data truth-teller: it classifies every staged row against the REPAIRED lifecycle (migration 034 materialization_error/materialized_at + Wave-α approve-idempotency + reviewer_notes) into resolved (materialized / rejected-with-reason / routed-to-flag) vs transit (pending / approved-unmaterialized), and fails the lane on any transit row past the 72h max-age not routed to a flag. The meta-gate proves the file is git-tracked + skill-cited in the secret-less pre-push. SEQUENCING (honest): while the human-approval materialization path is still live (until the run-one-cycle orchestration removes it, Unit 0c), the live run can show a real transit backlog — the audit surfacing what the transit-only model eliminates (flag-rate is not defect-rate), driven to zero by U0c/U1; it never blocks the required pre-push. Whether a rejected row\'s reason is genuinely adequate is remediation judgment (RD-1), not mechanized (a reasonless rejected row is a reported soft finding).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
