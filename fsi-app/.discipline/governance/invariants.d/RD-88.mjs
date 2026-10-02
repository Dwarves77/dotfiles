// RD-88: registered by lane R6-8 (remediation plan 2026-09-30, item 6), 2026-10-01. One entry, one
// file; see invariants.d/README.md. NOTE: the coordinator's own dispatch for this lane did not name an
// id to use; this id was self-assigned as the next free RD number (highest existing was RD-87) and is
// disclosed here and in this lane's session-log entry for the coordinator to re-number if it collides
// with a concurrently-registered id.

export const invariant = {
  id: 'RD-88',
  skill: 'remediation-discipline',
  section: 'Section 4: Remediation Strategy by Category',
  text: 'Fitness function F64 (rls-admin-gate-class) proves, by attack, that CF-DATA-8\'s RLS/admin-gate shipping pattern cannot recur silently: (1) a CREATE TABLE in the migration corpus with no matching ALTER TABLE ... ENABLE ROW LEVEL SECURITY anywhere in the corpus is a violation unless the table is in a dated, reason-bearing RLS_ENABLE_ALLOWLIST entry (the eleven CF-SEC-14 tables plus one draft-table exception this lane\'s own scan found); (2) a CREATE POLICY whose CURRENT (highest-numbered) definition reads org_memberships for an owner/admin/moderator role check with no org_id tie-back anywhere in its body -- a global admin check via org membership instead of profiles.is_platform_admin -- is a violation unless the policy name is in a dated ADMIN_GATE_PREEXISTING_ALLOWLIST entry.',
  anchor: '## Section 4: Remediation Strategy by Category',
  enforcedBy: [
    'fitness:F64',
    'selftest:fsi-app/.discipline/fitness/functions/F64-rls-admin-gate-class.test.mjs',
  ],
  residual: 'Check 1 treats "ENABLE ROW LEVEL SECURITY anywhere in the corpus" as the standard, matching CF-SEC-14\'s own audit methodology, not "the same migration file" literally -- this repo\'s own convention routinely splits a table\'s DDL and its RLS setup across companion files or a much later migration, and a strict same-file reading would flag dozens of pre-build-era tables that are not CF-SEC-14-cited gaps. Check 2\'s org_id-tie-back heuristic is a textual pattern match (presence/absence of the literal token "org_id" in the policy body), not a semantic SQL parse; a legitimately-scoped policy that ties back to the target org through a differently-named column would be a false positive this check cannot see, and a future bad policy that is textually decorated with an unrelated "org_id" reference elsewhere in its body (not as a real tie-back) would be a false negative. ADMIN_GATE_PREEXISTING_ALLOWLIST\'s two entries (migration 043\'s canonical_source_candidates policies) are a disclosed, not-yet-fixed finding this lane surfaced but could not fix (outside its write set; no DB credentials in its worktree) -- flagged to the coordinator, not asserted safe.',
};
