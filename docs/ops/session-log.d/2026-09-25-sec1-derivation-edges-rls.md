# 2026-09-25, fix lane SEC-1: derivation_edges RLS

**Accomplished.** Closed SEC-1 (Supabase integrity-and-wiring audit): `public.derivation_edges`
(migration 285) had RLS disabled and anon/authenticated held full CRUD grants (SELECT/INSERT/UPDATE/
DELETE/TRUNCATE/REFERENCES/TRIGGER), ~24 rows. Migration 330 (`fix/sec1-derivation-edges-rls`, operator
approved verbatim in chat 2026-09-25) applied via Supabase MCP `apply_migration` to project
kwrsbpiseruzbfwjpvsp. Root cause: migration 285 enabled RLS + locked grants on the sibling
`derived_values` table but never repeated either step for `derivation_edges`, an oversight, not a
designed-open table. Fix: `REVOKE ALL ... FROM anon, authenticated` + `ENABLE ROW LEVEL SECURITY`, no
policy (deny-all), confirmed no user-facing or admin-facing reader exists (grep across `src/app`,
`src/components`, `src/app/api`); every consumer (`register-derivation.ts`'s `register_derived_value()`
RPC, `scripts/entities/backfill-derivation-edges.mjs`, `scripts/propagation/seed-derived-values.mjs`,
`scripts/turns/run-propagation-drain.mjs`) uses the service-role client, which bypasses RLS by role
membership and is unaffected.

**Re-verification (live, SELECT-only, post-apply):** `relrowsecurity=true`, `anon`/`authenticated` grant
count = 0, policy count = 0, row count = 24 (unchanged, access-control-only change, no data touched).
[CONFIRMED].

**Adversarial verifier:** `fsi-app/scripts/verify/derivation-edges-rls-adversarial-audit.mjs` added,
modeled on `prov-guard-adversarial-audit.mjs` per rule 15 (attack, not presence). As anon and
authenticated, inside `BEGIN...ROLLBACK`, attempts INSERT/UPDATE/DELETE/SELECT on `derivation_edges` and
asserts denial (SQLSTATE 42501); also asserts service_role (BYPASSRLS) still reads its own fixture row.
Self-registers into `run-data-audit-lane.mjs` via the `// data-audit: label=... hard=true` marker
(verified the marker regex matches; no manual wiring edit needed).

**Could not run live this session**, exit 2 (self-skip, by design). This session's environment has no
`SUPABASE_DB_URL`/`DATABASE_URL`/`SUPABASE_DB_PASSWORD`, no local `supabase link` artifact
(`supabase/.temp/`), and no `NEXT_PUBLIC_SUPABASE_URL`, `scripts/lib/pg-conn.mjs`'s resolution order
found no candidate. Only the Supabase MCP (API-key channel, not a direct-`pg.Client` connection) was
available, which the verifier's design deliberately does not use (it needs role-level `SET LOCAL ROLE`
inside a raw Postgres session to impersonate anon/authenticated, which PostgREST/MCP cannot do). The
verifier is execution-wired (self-registers in the data-audit lane) and will run for real in the
CI-with-secrets lane, which does carry these credentials.

**Decisions.** No SELECT policy added (deny-all) rather than mirroring `derived_values_admissible`,
since `derivation_edges` has no reader outside the service-role propagation lib, so a gated view would
be unused surface.

**Blockers.** None for landing; the adversarial proof's live pass/fail is deferred to the data-audit
lane's next CI-with-secrets run (out of this session's credential reach).

**Next steps.** PR opened, not merged (coordinator instruction). Data-audit lane's next run should be
checked for `derivation-edges-rls-adversarial` PASS; if it self-skips there too, that is a lane-credential
gap worth a separate flag, not a defect in this fix.
