// SF-11-secrets-registered: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-11-secrets-registered',
    skill: 'sprint-followups-discipline',
    section: 'Secrets-topology consistency (a referenced credential must be a registered credential)',
    text: 'Every GitHub Actions secret a workflow references (secrets.X in .github/workflows/*) MUST be a REGISTERED secret in the secrets registry (WORKFLOW_SECRETS). An unregistered/invented workflow secret reference — the R0.2 defect where secrets.PROBE_SECRET named a secret that never existed and resolved to empty — is a build failure. This is the inventory-consistency class (SF-1 sibling) applied to the credential surface: referenced == registered.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'a referenced credential must be a registered credential',
    enforcedBy: ['selftest:fsi-app/.discipline/governance/secrets-reference-audit.test.mjs'],
    residual: 'secrets-reference-audit.mjs is FILESYSTEM-PURE (scans workflow YAML + the registry; no secrets/DB), so it runs in BOTH the required discipline suite (via the red-then-green .test.mjs, auto-globbed governance/*.test.mjs) AND the meta-gate itself (runSecretsReferenceAudit is called in runInvariantCoverage → an unregistered reference literally fails the meta-gate). The registry (secrets-registry.mjs WORKFLOW_SECRETS) is kept EQUAL to the live GitHub store (verified 2026-07-12 via gh secret list). SCOPE (honest): it enforces the GitHub-Actions vault only (the vault this repo\'s workflows read); Vercel-runtime + local-.env credentials are DOCUMENTED in the TOPOLOGY + docs/ops/secrets-topology.md but not diffed (no in-repo manifest to diff Vercel env against — that would need the Vercel API). VALUES never appear anywhere — names + wiring only.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
