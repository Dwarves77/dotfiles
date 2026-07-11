# Backup & Recovery Posture (R0.1, 2026-07-11)

## Live Supabase backup posture (tool-readable facts)
- Project `kwrsbpiseruzbfwjpvsp` ("Caro's Ledge"), region us-west-1, Postgres 15.14.1.063, status ACTIVE_HEALTHY (Management API, 2026-07-11).
- **Plan tier / PITR on-off / retention window: AMBIGUOUS from tool-readable facts.** The Management API surface available to this session does not expose plan or backup settings, and the branches endpoint errored rather than returning a clean capability answer. Per the environment-identity precedent this is NOT inferred. **Operator action requested (non-blocking): one screenshot of Supabase Dashboard → Project Settings → Database → Backups (shows plan, PITR state, retention).** This doc gets updated from that screenshot.

## Independent safety net (live as of 2026-07-11, does not depend on the above)
- **Private repo `Dwarves77/caros-ledge-backups`** (the dotfiles repo is PUBLIC — dumps must never be stored there or in its Actions artifacts).
- **Nightly logical dump** (08:17 UTC, GitHub Actions in the private repo): `pg_dump` of schemas `public` + `supabase_migrations` (schema + data + per-table row-count manifest), gzipped, stored as private-repo Actions artifacts with 90-day retention. On-demand via `workflow_dispatch`.
- **Baseline restore point**: one dump taken 2026-07-11 BEFORE any Wave-α DDL applied; also committed to the private repo under `dumps/baseline-2026-07-11/`.
- **Restore drill in every run**: the fresh dump restores into a scratch `postgres:15` service container; per-table row counts asserted against the dump-time manifest; `validate_item_provenance` presence spot-checked. A red drill means the backup is not trusted.
- **Scope**: `auth`/`storage` schemas are Supabase-managed and excluded (2 users at time of writing; recreate by invite on restore). Restore of RLS-referenced managed roles is stubbed in the drill.

## Recovery objectives
- **RPO: 24h** via the nightly dump (better if PITR is confirmed on — pending the screenshot).
- **RTO: the drill's measured restore time** — read it from the latest green `restore-drill` job in the private repo (measured, not estimated).

## Runbook (restore to a new project)
1. Create/identify target Postgres (new Supabase project or scratch instance).
2. Download the newest `db-dump-*` artifact (or `dumps/baseline-*` for the baseline) from the private repo.
3. `gunzip` both files; apply `schema-*.sql` first (with `ON_ERROR_STOP=0` — managed-object noise expected on non-Supabase targets), then `data-*.sql` (`ON_ERROR_STOP=1`).
4. Verify with the manifest: every table's row count matches; spot-check `validate_item_provenance`.
5. On a Supabase target: re-link auth (invite users), re-set secrets/credentials per `fsi-app/.env.local` names, re-point Vercel env.
The drill job in `.github/workflows/db-backup.yml` (private repo) is the executable form of steps 3–4.
