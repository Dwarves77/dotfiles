// RD-5-status-is-a-cache: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-5-status-is-a-cache',
    skill: 'remediation-discipline',
    section: 'Status is a cache (gate/slot migrations ship revalidation)',
    text: 'provenance_status is a CACHE of a gate result; any migration that changes the gate (validate_item_provenance) or its inputs (item_type_required_slots, the tier model) MUST ship a corpus revalidation in the SAME change, and stored status must agree with the live gate in BOTH directions (no stale-verified, no stale-quarantined).',
    anchor: 'status is a cache',
    enforcedBy: ['audit:fsi-app/scripts/verify/substrate-agreement-audit.mjs'],
    residual: 'The audit (CI-with-secrets lane) recomputes validate_item_provenance per item and asserts agreement both ways — the live truth-teller for stale status. The meta-gate proves the file is wired (exists + skill-cited) in the secret-less pre-push. The standing rule "a gate/slot migration ships its corpus revalidation" is dispatch-time discipline carried by this skill; the audit catches a violation after the fact.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
