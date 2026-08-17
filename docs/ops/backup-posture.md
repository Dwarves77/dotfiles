# Backup & Recovery Posture (R0.1, 2026-07-11)

## Live Supabase backup posture (tool-readable facts)
- Project `kwrsbpiseruzbfwjpvsp` ("Caro's Ledge"), region us-west-1, Postgres 15.14.1.063, status ACTIVE_HEALTHY (Management API, 2026-07-11).
- **Plan tier / PITR on-off / retention window: AMBIGUOUS from tool-readable facts.** The Management API surface available to this session does not expose plan or backup settings, and the branches endpoint errored rather than returning a clean capability answer. Per the environment-identity precedent this is NOT inferred. **Operator action requested (non-blocking): one screenshot of Supabase Dashboard → Project Settings → Database → Backups (shows plan, PITR state, retention).** This doc gets updated from that screenshot.

## Independent safety net (live as of 2026-07-11, SPLIT 2026-08-17; does not depend on the above)
- **Private repo `Dwarves77/caros-ledge-backups`** (the dotfiles repo is PUBLIC — dumps must never be stored there or in its Actions artifacts).
- **The dump is SPLIT into two lanes on two cadences** (2026-08-17). See "The split" below for the RPO each lane carries — they are NOT the same, and the difference is a deliberate accepted loss, not an oversight.
- **Nightly logical dump — the PRODUCT lane** (08:17 UTC, GitHub Actions in the private repo): `pg_dump` of schemas `public` + `supabase_migrations` (schema + data + per-table row-count manifest), **excluding `agent_run_searches` DATA** (its DDL still ships), gzipped, stored as private-repo Actions artifacts with 7-day retention. On-demand via `workflow_dispatch`.
- **Weekly pool snapshot — the POOL lane** (Sundays, same run): `agent_run_searches` data only + its own row-count/size manifest, 35-day retention.
- **Baseline restore point: TAKEN + DRILL-PROVEN** — dump `2026-07-11T1259Z` (pre-Wave-α-DDL), committed at `dumps/baseline-2026-07-11/` in the private repo. Proven in run 29153549948: full restore + per-table manifest verification passed.
- **Restore drill in every run**: the fresh dump restores into a scratch `pgvector/pgvector:pg15` service container; managed roles/extensions recreated per the live extension map (ltree/pg_trgm → public; pgcrypto/uuid-ossp → extensions); every manifest table must exist before data load; per-table row counts asserted against the manifest's EXPECTED column; `validate_item_provenance` spot-checked. A red drill means the backup is not trusted. (Two red iterations before green: a silently-failed `auth.role()` stub, then wrong extension schemas — both now fail-loud.)
  - **Exclusion asserted in both directions** (2026-08-17): the split-out table must restore at exactly 0 rows from the product lane. An `--exclude-table-data` flag that silently stopped working would otherwise pass as green while doubling the artifact it was added to shrink.
- **Pool restore drill, on the weekly path** (2026-08-17): restores the product **schema**, gates on the pool table's DDL actually being present (if the product lane ever stopped shipping it, the pool artifact is unrestorable and that surfaces here rather than as a confusing `psql` error mid-load), loads the pool data with `ON_ERROR_STOP=1`, then **asserts the pool manifest's row count**. Product *data* is deliberately not loaded — the pool restoring cleanly into an empty-but-complete schema is the stronger claim. It also spot-checks content, not just cardinality: `result_content_excerpt` must be non-empty in at least one restored row, and the longest excerpt length is logged. A pool dump that finds 0 rows fails at dump time rather than shipping an artifact that would drill green on nothing.
- **Scope**: `auth`/`storage` schemas are Supabase-managed and excluded (2 users at time of writing; recreate by invite on restore). Restore of RLS-referenced managed roles is stubbed in the drill.

## The split (2026-08-17) — two lanes, two RPOs

One table, `public.agent_run_searches` (the grounding pool), measured **173 MB of a 329 MB public
schema — 55.2% of the whole dump** (2026-08-17). It was re-dumped in full every night alongside
product data orders of magnitude smaller, which is what drove the artifact-storage quota failure
(5 consecutive reds, 08-13..08-17) and forced retention from 90 days to 7.

The pool also has a different **recovery profile** from the rest of the corpus. It is captured
content — re-fetchable in principle, expensive in practice — whereas the product tables
(`intelligence_items`, sections, provenance, `sources`) are irreplaceable synthesis. Paying a 24h
RPO for both bought nothing.

| Lane | Contents | Cadence | RPO | Artifact retention | Measured size |
|---|---|---|---|---|---|
| **Product** | `public` + `supabase_migrations`, schema + data, **minus `agent_run_searches` data** | nightly 08:17 UTC | **24h** | 7 days | 30 MB gz |
| **Pool** | `agent_run_searches` data only | Sundays (rides the same run) | **7d** | 21 days (3 generations) | 107 MB gz |

Sizes measured in run `32044695600` (2026-08-17), not estimated. The storage arithmetic is the
whole point of the split:

| | Peak artifact storage |
|---|---|
| Before — nightly combined, 7 kept | **961 MB** ← what broke the quota |
| After — product 7d + pool 21d | **532 MB** (45% cut) |

Pool retention is 21 days rather than 7 because at a weekly cadence 7-day retention would leave at
most **one** pool snapshot alive, so a single bad dump would be the only copy. Three generations
guarantees at least two live copies at all times. (A first draft used 35 days / 5 generations; that
cut only 22%, which is not enough when artifact storage is the binding constraint.)

**What the 7d pool RPO actually costs, stated plainly:** up to seven days of newly-captured pool
content can be lost. That is an accepted loss, not a rounding error — it is accepted because the
pool is re-acquirable and the product is not. If the pool ever stops being re-acquirable (a source
goes dark, a paid transport is retired), this trade needs re-deciding.

**Structure is not split, only data.** The product lane uses `--exclude-table-data`, not
`--exclude-table`, so the pool table's DDL ships nightly. A product-only restore therefore yields a
structurally complete database with an empty pool — a coherent state for the pool lane to load on
top of.

**One cron, not two.** The pool lane rides the Sunday invocation of the nightly run rather than
having its own schedule, because the pool drill needs the product lane's schema to restore
data-only rows into. A separate weekly cron would fire a run containing no product dump, so the
pool drill would be permanently skipped — a weekly backup that is never restore-tested, which is
precisely what this split must not create. The workflow's `plan` job asserts pool-implies-product
so a future edit cannot reintroduce that silent skip.

**Both lanes are drilled** (see the next section). A pool artifact nobody restores is a backup
nobody has tested, and moving 55% of the corpus onto a separate cadence is only defensible if that
cadence is provably restorable.

### Verification status of the split — `[HYPOTHESIS]` on the drills, `[CONFIRMED]` on the dumps

Stated per standing rule 14 rather than implied. Run `32044695600` (2026-08-17, manual dispatch,
`lanes=both`):

- `[CONFIRMED]` **Lane planning** — resolved `product=true pool=true`.
- `[CONFIRMED]` **The exclusion fires, loudly** — `[split-dump] PRODUCT lane: agent_run_searches data EXCLUDED (4029 live rows). Pool lane covers it at a 7d RPO.`
- `[CONFIRMED]` **Both dumps succeed** — product `schema` 93 KB + `data` 30 MB + 3-column manifest + `excluded-tables` file; pool 4029 rows / 181,428,224 bytes → 107 MB gz + pool manifest.
- `[HYPOTHESIS]` **Neither restore drill has executed yet.** Both jobs were `Skipped` because they
  depend on artifacts, and the artifact **upload** failed on the standing quota red
  (`Artifact storage quota has been hit. Usage is recalculated every 6-12 hours.`) — the same
  failure that has been red since 08-13, unrelated to the split. The drills are wired and their
  assertions are written, but **they have not been proven green.** Until a run uploads
  successfully, treat the restore path as untested-since-the-split.

The blocker is the quota recalculation lag, not the workflow. Re-dispatching does not help — it
re-confirms the lag and spends Actions minutes. The next real check is the scheduled 08:17 UTC run
once GitHub's usage counter catches up with the retention-7 cleanup.

**No silent truncation.** The product manifest carries three columns — table, LIVE row count,
EXPECTED-after-restore count — so the excluded table records what it holds live next to its
expected `0`, and the run logs what the lane did not capture. An excluded table must never look
like an empty table.

## Recovery objectives
- **RPO: 24h for product data, 7d for the grounding pool** — the split above. The nightly lane
  carries everything except `agent_run_searches`; that one table is covered weekly. (Better on both
  if PITR is confirmed on — pending the screenshot.)
- **RTO: 35 seconds measured** for schema+data restore + verification of the current corpus (drill job, run 29153549948); real-world RTO adds project provisioning + credential re-pointing (~minutes-to-an-hour, runbook steps 1–5).

## Runbook (restore to a new project)
1. Create/identify target Postgres (new Supabase project or scratch instance).
2. Download the newest `db-dump-*` artifact (or `dumps/baseline-*` for the baseline) from the private repo. **Also download the newest `pool-dump-*` artifact** — a full restore needs both lanes.
3. `gunzip`; apply `schema-*.sql` first (with `ON_ERROR_STOP=0` — managed-object noise expected on non-Supabase targets), then `data-*.sql` (`ON_ERROR_STOP=1`).
4. **Then apply `pool-*.sql`** (`ON_ERROR_STOP=1`) to restore the grounding pool. Skipping this step leaves `agent_run_searches` empty — the database is structurally complete and the product corpus is intact, but every brief's source pool is gone, so re-grounding would have nothing to read.
5. Verify with the manifests: every product table's row count matches the product manifest's EXPECTED column, `agent_run_searches` matches the **pool** manifest; spot-check `validate_item_provenance`.
6. On a Supabase target: re-link auth (invite users), re-set secrets/credentials per `fsi-app/.env.local` names, re-point Vercel env.

The two drill jobs in `.github/workflows/db-backup.yml` (private repo) are the executable form of
steps 3–5: `restore-drill` covers the product lane (steps 3 + 5), `pool-restore-drill` covers the
pool lane (steps 4 + 5).

**The pool lane can be up to 7 days behind the product lane.** On a restore, expect product rows
referencing pool rows that the newest pool snapshot does not contain. That is the split's accepted
loss showing up in practice, not a corrupt restore — the affected items re-acquire their pool on the
next capture.
