// RD-93: registered by lane SEC-4 (2026-10-08, privilege census follow-up). One entry, one file; see invariants.d/README.md.
// NOTE: the lane brief named the fitness function F69 and did not name an invariant id. F69 was already taken on master
// (F69-model-id-literal, RD-92), and the fitness manifest refuses a duplicate id, so the function is F70; this invariant
// id was self-assigned as the next free RD number (highest existing was RD-92). Disclosed here and in the lane's
// session-log entry for the coordinator to re-number if it collides with a concurrently-registered id.

export const invariant = {
  id: 'RD-93-definer-hygiene',
  skill: 'remediation-discipline',
  section: 'Section 4: Remediation Strategy by Category',
  text: 'Fitness function F70 (definer-hygiene) proves, by attack, that the SECURITY DEFINER privilege class closed by migration 371 cannot recur silently: every CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER in a migration numbered 371 or higher must, in the same file, carry a REVOKE EXECUTE ON FUNCTION <name> ... FROM PUBLIC (a revoke naming only anon or authenticated does not count) and a pinned search_path (SET search_path in the header or tail, or an ALTER FUNCTION ... SET search_path). A violation names the file, the function and which of the two is missing. Migrations below 371 are out of scope by number, not by allowlist: migration 371 repairs every definer they define at apply time from pg_proc and attacks each class (A and E service_role only, B trigger functions nobody, C anon, authenticated and service_role, D authenticated and service_role) as the refused and the intended role in a block that always rolls back.',
  anchor: '## Section 4: Remediation Strategy by Category',
  enforcedBy: [
    'fitness:F70',
    'selftest:fsi-app/.discipline/fitness/functions/F70-definer-hygiene.test.mjs',
    'selftest:fsi-app/supabase/migrations/371_definer_hygiene.test.mjs',
  ],
  residual: 'F70 is a lexical scan of the migration text (the posture F64 and F69 use): it cannot see a function created by a DO block EXECUTE or one created out of band, and a REVOKE built from a dynamic string does not count; migration 371 asserts the live catalog for every function that exists at apply time, but nothing re-asserts it after a later out-of-band CREATE. It checks that the default PUBLIC grant is gone and the path is pinned, not that the GRANT that follows is the right one: which roles hold EXECUTE is a per-function decision (the five classes in migration 371). The class table in migration 371 and its completeness test cover the definers the tree defined below 371; a later definer is covered by F70 itself.',
};
