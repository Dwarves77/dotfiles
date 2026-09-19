// RD-17-rls-credential-parity: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-17-rls-credential-parity',
    skill: 'remediation-discipline',
    section: 'Section 4 — Configuration drift (credential hygiene) / the reconciler class',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'On an RLS-enabled table a GRANT is inert unless a matching RLS POLICY also permits the (role, command) — Postgres RLS denies by default. A non-bypass role granted SELECT/INSERT/UPDATE/DELETE with NO covering permissive policy is a grant-without-policy defect (the reconciler credential that was granted but had no USING/WITH CHECK policy — the exact gap migration 169 fixed). Per (table, command, grantee), grants and policies must agree.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'credential hygiene',
    enforcedBy: ['audit:fsi-app/scripts/verify/rls-credential-parity.mjs'],
    residual: 'rls-credential-parity.mjs (CI-with-secrets lane, pg_catalog + information_schema, read-only) is LOW-FALSE-POSITIVE by scope: it flags grant-without-policy ONLY for CUSTOM application roles (e.g. reconciler), NOT anon/authenticated — those are the RLS-gated public roles whose missing-policy is the intended default-deny (flagging them would fire on every stock Supabase project; live confirmed 52+ such benign anon/authenticated defaults). The meta-gate proves wiring (file tracked + skill-cited) in the secret-less pre-push. LIVE READ-ONLY RUN 2026-07-11 (project kwrsbpiseruzbfwjpvsp): the two custom roles (reconciler, supabase_privileged_role) have ZERO grant-without-policy — mig-169\'s reconciler-cred gap is confirmed CLOSED. NAMED RESIDUAL: it does NOT judge whether an EXISTING policy\'s USING/WITH CHECK predicate is semantically correct (a covering policy clears the flag) — that is the reconcile-revalidate end-to-end proof (RD-6/reconciler dispatch), not a catalog check. Restrictive policies are excluded (they never grant). Highest-value governance rider: it makes a future re-introduction of the class (a new custom write-role granted without a policy) build-catchable.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
