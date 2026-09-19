// RD-4-quarantine-disposition: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-4-quarantine-disposition',
    skill: 'remediation-discipline',
    section: 'Section 2.1: Quarantine Is an Open Investigation (research-or-erase)',
    text: 'Quarantine is an OPEN INVESTIGATION, never terminal: entering quarantine enqueues research-or-erase; no item may sit live-quarantined past the dwell bound (or without an enqueue record) — it must reach a recorded disposition (recovered / archived / registered / erased).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Quarantine is an open investigation, never a terminal state',
    enforcedBy: ['audit:fsi-app/scripts/verify/quarantine-disposition-audit.mjs'],
    residual: 'The audit is the live-data truth-teller (enqueue-present + dwell-bound) that scripts/regen-quarantined.mjs must drive to zero; it runs in the CI-with-secrets / ops lane (DB creds), while the meta-gate proves the file is wired (exists + skill-cited) in the secret-less pre-push. The ENQUEUE half rides the existing set_provenance_status trigger integrity_flag (migration 115); the dwell clock is that flag\'s created_at, which resets on re-quarantine (an item re-processed restarts its disposition SLA — intended). Whether each disposition was the RIGHT one (research thorough enough, archive justified) is remediation judgment (RD-1), not mechanized.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
