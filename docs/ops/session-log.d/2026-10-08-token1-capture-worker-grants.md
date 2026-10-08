# 2026-10-08, lane TOKEN-1 (token1-capture-worker-grants): capture_worker_fetch EXECUTE limited to service_role

## Accomplished

- New `fsi-app/supabase/migrations/363_capture_worker_fetch_grants.sql` (header NOT APPLIED; the coordinator's executor applies it): `REVOKE EXECUTE ON FUNCTION public.capture_worker_fetch(uuid[]) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`. The signature `(queue_ids uuid[])` was read from migration 256 (lines 129 to 131). The function body is untouched.
- Self-check inside the migration transaction, rolled back by a sentinel exception. Part A is a REAL call: `SET LOCAL ROLE anon`, then `authenticated`, then `PERFORM public.capture_worker_fetch(...)`, requiring `insufficient_privilege` (42501). The privilege check precedes the function body, so the denied call performs no http egress. Part B is catalog-based, NOT a call: `has_function_privilege('service_role', ..., 'EXECUTE')` true; anon and authenticated false; no `aclexplode` entry with grantee 0 (PUBLIC). Reason service_role is not called: a successful call would perform `net.http_post`.
- Static proof `363_capture_worker_fetch_grants.test.mjs` (8 tests). Red first: before the SQL file existed the test failed with ENOENT; after, `node --test` shows 8 pass, 0 fail.
- `docs/inventories/migrations.md` regenerated with `scripts/inventories/generate-migrations-inventory.mjs --write` (one added row, 324 rows).
- Runbooks that invoke the function now say it runs as service_role only (anon and authenticated refused with 42501, migration 363): the three fleet charters `authorship-worker.md`, `citation-harvest.md`, `legacy-remediation.md` under `docs/runbooks/fleet-charters/`. The brief said "the runbook"; grep found three, all edited with the same one-clause addition.

## Read and reused

- Migrations 254 and 256 (function history, exact signature, vault read), 357 and its test (header, sentinel-rollback self-check and static-test conventions), 316 (the `SET LOCAL ROLE` technique), the migrations inventory generator, F24 (`NET_EGRESS_SANCTIONED` entry for the function needs no change: the function body is unchanged).

## Decisions

- The literal in migration 256's vault seed line and in the two ledger rows that recorded 256 is the PUBLIC anon key. It is left as history by coordinator ruling; this lane neither edits 256 nor rotates the key. Closing the grant is the fix.
- Charter files may be mirrored in live scheduled-trigger bodies; this lane did not touch or read any live trigger. [HYPOTHESIS] If the live trigger bodies embed the same sentence, they differ from these files only by the added clause and no behaviour depends on it.

## NOT done

- Not applied to any database. No live check that anon is refused; that is the migration's own self-check at apply time.
- Callers that reach the function as a role other than service_role or the owner (for example an agent using a different login role) would now be refused. Nothing in src, scripts, supabase/functions, triggers or cron calls it (per the brief's finding); the charters run it from the SQL runner. [INFERRED] the runner role is the owner or service_role.

## Open items

- None blocking.
