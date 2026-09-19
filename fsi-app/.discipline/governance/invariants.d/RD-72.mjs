// RD-72: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-72',
    skill: 'remediation-discipline',
    section: 'Section 4 - category 1: batch resilience (an environment variation the platform absorbs, never a crash)',
    text: 'A live script under fsi-app/scripts/** loads the local env file only through the one loader, scripts/lib/env-file.mjs (loadLocalEnvFile: guarded, never throws, switched off by FSI_NO_ENV_FILE); a bare process.loadEnvFile anywhere else is refused, guarded or not, and a test that asserts credential-absent behaviour builds its child environment with withoutCredentials() from the same module, so a checkout that has an env file cannot hand the credentials back. An unguarded load crashes with ENOENT on every workflow dispatch (the environment is injected from secrets, no .env.local exists there); a per-script load defeats every no-credential test in the one worktree that has the file (lanes T1 and T2, 2026-09-18 and 2026-09-19). The archived, reground and scratch trees are out of scope.',
    anchor: '1. **Batch resilience**',
    enforcedBy: [
      'fitness:F48',
      'selftest:fsi-app/.discipline/fitness/functions/F48-env-file-load-guarded.test.mjs',
    ],
    residual: 'F48 is textual. A test that strips credentials by a shape the gate does not recognise (a hand-built env object with the names simply left out) passes the gate and would fail only in a checkout that has an env file; the class proof is the credential-absent tests run with a throwaway env file present (lane T2), not the gate. src/** is covered for bare loads; the historical seed scripts under supabase/seed and the archived trees are not live and stay out of scope.',
  };
