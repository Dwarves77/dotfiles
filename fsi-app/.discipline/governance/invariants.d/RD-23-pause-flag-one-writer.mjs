// RD-23-pause-flag-one-writer: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-23-pause-flag-one-writer',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 17: The pause-flag one-writer (structural enforcement, no credential, no manual step)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'system_state.global_processing_paused / scrape_cadence have EXACTLY ONE writer, enforced structurally with no credential and no manual step: (static) the F20 fitness function fails CI on any direct write to those columns in src outside the sanctioned admin route; (runtime) migration 201 — the SECURITY DEFINER RPC admin_set_pause_state declares a transaction-local marker app.pause_flag_writer, and the guard_pause_flag_writer trigger BOUNCES any flag change lacking the marker (a generic service-role UPDATE is rejected); (detection) system_state_flag_audit logs every authorized write. This REPLACES the DEAD 2a operator-credential design (which required a manual operator step).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'The pause-flag one-writer (structural enforcement, no credential, no manual step)',
    enforcedBy: [
      'fitness:F20',
      'selftest:fsi-app/.discipline/fitness/functions/F20-pause-flag-one-writer.test.mjs',
      'migration:201',
      'audit:fsi-app/scripts/verify/pause-flag-guard-proof.mjs',
    ],
    residual: 'F20 (grep-class, red-then-green in F20-...test.mjs: a direct .update/assignment/SQL-SET on the flags outside the sanctioned route is RED; reads + type annotations + the RPC caller are GREEN; a LIVE census proves the whole src tree passes — the RPC is the only writer) gates the STATIC one-writer. Migration 201 (the guard trigger + the admin_set_pause_state RPC) is the RUNTIME bounce: the bounce is proven red-then-green by pause-flag-guard-proof.mjs on a SYNTHETIC temp table in a rolled-back transaction (unmarked UPDATE raises; a marked UPDATE succeeds) — the live flag is NEVER written, including by the test. RESIDUAL (honest, same class as any GUC marker): a determined caller with raw SQL access could set the marker itself in the same transaction and bypass the trigger — but no COMMITTED code can (F20), the casual agent flip (a plain UPDATE) bounces, and every write is audited. This is structural defense-in-layers, not a cryptographic vault; it needs no human-held secret, which was the whole point.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
