## 2026-10-07, lane s8c-count-membership: membership gate on the two count RPCs (migration 361, NOT APPLIED)

Buildout plan Stage 8 ("membership checks on the two count functions"); system map section 14. Fixture-proven only: no database, no network, nothing applied.

### Verify first (the brief's stop condition)
- [CONFIRMED] Migration 077 does NOT cover them. 077 lists ten functions taking p_org_id (`_workspace_active_items`, the six `get_workspace_intelligence*`, `get_market_intel_items`, `get_research_items`, `get_operations_items`) plus `get_workspace_members`; none is a count RPC. The two functions are `get_surface_counts(p_org_id, p_surface)` and `get_all_surface_counts(p_org_id)`, defined by migration 148, which post-dates 077, as LANGUAGE sql SECURITY DEFINER with no `_assert_org_membership` call and no `auth.uid()`.
- [CONFIRMED] No later migration redefines either (grep of the migration tree: 149 and 269 mention them in prose, 160 only pins their search_path). `src/lib/data.ts` (PERF-10 comment) records the same fact, read live by pg_get_functiondef.
- [CONFIRMED] Both grant EXECUTE to PUBLIC by default (148 grants nothing), so a signed-in user or the anon key can call either with another org's id. What leaks is that org's `workspace_item_overrides` folded into the tally (priority overrides, archive state).

### Accomplished
- `fsi-app/supabase/migrations/361_count_rpc_membership.sql` (NOT APPLIED): both functions replaced as plpgsql, STABLE, SECURITY DEFINER, `SET search_path = public, extensions, pg_temp` (migration 160's pin, restated because CREATE OR REPLACE resets function settings). The gate is `PERFORM public._assert_org_membership(p_org_id)` from 077 (raises 42501 for non-member and for no auth.uid(); service role bypasses). It refuses by RAISE, never by an empty bundle. The counting SQL is unchanged from 148.
- One deliberate difference: `get_surface_counts` with a NULL org is allowed for the service role only. `getPublicSurfaceCounts` (PERF-10) passes NULL on purpose for the public platform-wide masthead read, and the 077 helper raises on NULL even for the service role, which would have broken /regulations, /market, /operations and /research mastheads.
- `361_count_rpc_membership.test.mjs` (14 tests, builtins only): baseline that 148 has no gate; header and NOT APPLIED; preconditions; signature, language, STABLE, SECURITY DEFINER and pinned search_path; gate precedes the query; NULL-org branch; refusal is a RAISE; counting SQL equals 148 modulo comments, whitespace and the INTO wrapper; no GRANT or REVOKE or data write; self-check carries every attack.
- Migration self-check (rule 15, attack not presence), run at apply time in a rolled-back sub-transaction with simulated JWT claims (`set_config('request.jwt.claims', ..., true)`): REFUSED are a random user on a random org (both functions), an authenticated caller with a NULL org (get_surface_counts), an unauthenticated caller (both), and a real member on an org they do not belong to (both, when a second org exists); ACCEPTED are the service role on a random org (both), the service role with a NULL org (get_surface_counts), and a real member on their own org (both). The member cases read a live org_memberships row and self-skip with a NOTICE when none exists; no fixture row is written (migration 311's inline proof inserted memberships, hit the profiles FK and was unappliable).
- `docs/inventories/migrations.md` regenerated with its generator (one row added).

### Red then green
- Red: test file written first; `node --test` failed with ENOENT on `361_count_rpc_membership.sql`. Green after the migration: 14 pass, 0 fail.
- Mutation: replacing `PERFORM public._assert_org_membership(p_org_id);` with `NULL;` in the migration made the suite fail (13 pass, 1 fail); restored, 14 pass.

### Read and reused
Read: COMMON.md, s8c.md, CLAUDE.md, lane-common-contract.md, system-map-2026-10-04.md section 14, buildout-plan Stage 8, migrations 077 (in full), 148 (in full), 160 header, 269 and 149 mentions, 311 and 316 (the JWT-simulation technique and the FK lesson), 356 and 357 test and self-check shape; callers: `supabase-server.ts` (fetchSurfaceCounts, fetchPublicSurfaceCounts, runSurfaceCountsRpc), `data.ts` (getSurfaceCounts, getPublicSurfaceCounts), `dashboard/surface-coverage.ts`, `api/health/surfaces/route.ts`. All callers use `getServiceSupabase()`, so the service-role bypass keeps them working. Reused: `public._assert_org_membership` (077), the 148 counting SQL verbatim, the 160 search_path pin, the 357 self-check and static-test pattern, `generate-migrations-inventory.mjs`. Nothing new beside them. The sprint-followups skill was loaded (hook); no Stage 8 followups file exists, so no OBS entries were covered or surfaced.

### Decisions
- Reuse the 077 helper rather than a second membership check; raise rather than return zero rows (a zero bundle is a plausible count and would render as one).
- NULL org on get_surface_counts: service role only (see above). get_all_surface_counts keeps 077 semantics (NULL raises 22023); no caller passes NULL.
- Grants untouched.

### NOT done
- Not applied; the coordinator applies it (two-track policy: schema DDL via the Supabase CLI). [CLOSED: PR 1013]
- No live adversarial script under `scripts/verify/` (outside the write set); the in-migration self-check is the attack. A continuous data-audit-lane version, like `spec09-org-rls-adversarial-audit.mjs`, would need a write-set expansion.
- The self-check member cases are skipped when the target has no org_memberships row; the NOTICE at the end says which ran. [NOT-WORK: fact, no action]
- The migration SQL itself has not been executed (no database); only the static test ran. Whether plpgsql accepts the `WITH ... SELECT ... INTO v_result` shape is [INFERRED] from PostgreSQL's documented INTO placement, and the apply-time self-check is the first execution. [CLOSED: PR 1013]

### Open items
- Coordinator to apply 361 and read the `migration 361 OK` NOTICE (it states whether the member cases ran). [CLOSED: PR 1013]
