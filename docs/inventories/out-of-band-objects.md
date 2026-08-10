# Out-of-Band DB Objects — ledgered inventory

**Created 2026-07-11** (Wave-α Track B8, records-truth). Live objects that exist in the DB
(`kwrsbpiseruzbfwjpvsp`) but are NOT recorded by any migration file. Registered here as explicit, ledgered
objects so the live-vs-disk delta is documented rather than silent. Evidence: full-system-audit
`X-register.md` §3(c)/(f) (live census vs `CREATE POLICY`/`CREATE TABLE` grep over all 165 migration files).

## Tables — the 4 `_pre_phase5` tables (out-of-band; the ONLY out-of-band tables live)

Created by a direct-SQL pre-Phase-5 snapshot that no migration records. They are backup snapshots of the
tables Phase 5 restructured; the rollback window is effectively closed.

| Table | Origin | Disposition |
|---|---|---|
| `intelligence_items_pre_phase5` | pre-Phase-5 snapshot (direct SQL) | Registered. Drop candidate — Track E (operator window). |
| `item_supersessions_pre_phase5` | pre-Phase-5 snapshot (direct SQL) | Registered. Drop candidate — Track E. |
| `pending_jurisdiction_review_pre_phase5` | pre-Phase-5 snapshot (direct SQL) | Registered. Drop candidate — Track E. |
| `ingest_rejections_pre_phase5` | pre-Phase-5 snapshot (direct SQL) | Registered. Drop candidate — Track E. |

(CODE-5b F4 + DB-3 F17: capture-migration or drop; the rollback window is closed. Registering them here is
the "documentation migration" half; the drop is a separate Track-E operator-window decision.)

## Policies — 7 out-of-band policies on the mig-009 capture tables

RLS was enabled + policied on the three mig-009 capture-only tables by direct SQL that no migration records.
These names appear in NO migration file (grep over all 165). Registered as legitimate live objects.

| Table | Policy | cmd |
|---|---|---|
| `intelligence_summaries` | `summaries_read_authenticated` | SELECT |
| `intelligence_summaries` | `summaries_update_service` | UPDATE |
| `intelligence_summaries` | `summaries_write_service` | INSERT |
| `intelligence_changes` | `changes_read_authenticated` | SELECT |
| `intelligence_changes` | `changes_write_service` | INSERT |
| `sector_contexts` | `sector_contexts_read_authenticated` | SELECT |
| `sector_contexts` | `sector_contexts_write_service` | INSERT |

Disposition: registered as-is. If a future replay-support ADR (CODE-5b F2) lands, fold these into a
capture migration alongside the mig-009 tables; until then this inventory is their authoritative ledger.

## Related records-truth notes (Wave-α Track B8)

- **Ledger repair 107–134** (migration 170): the 15 applied-but-unledgered versions
  (107,108,109,110,111,112,115,118,128,129,130,131,132,133,134) are recorded into
  `supabase_migrations.schema_migrations` — see `migrations.md` rows + `track-b-proofs.md` B8.
- **mig-158** is APPLIED + LEDGERED (the "AUTHOR-ONLY/HELD" framing in older notes is stale — X headline 2).
- **mig-099** ruling = APPLY (Track B7) — restores the tier-opinion review policies + closes
  `source_tier_opinions`' zero-policy state.
- **090 view security_invoker**: live is CLEAN (repaired out-of-band); disk 090 still encodes the definer-view
  regression → a fresh replay reintroduces it. Replay-hazard, tracked (CODE-5b F5); not fixed here.

## gate-a-health cache surface (registered 2026-08-10)

Dashboard-created, live-only (no migration records them): table `gate_a_health_cache` (singleton payload +
computed_at), functions `gate_a_health_compute()` and `gate_a_health_refresh()` (cache writer), and the
`gate_a_health()` reader RPC's 30-minute staleness gate wiring. The pg_cron job that fed the cache
(`gate-a-health-refresh`, jobid 1, `*/10 * * * *` — the only cron job that ever existed live) was
UNSCHEDULED 2026-08-10 by operator ruling; `cron.job` is now empty (read-back verified). On-demand refresh
and re-schedule SQL: [runtime-clock-inventory-2026-08-10](../audits/runtime-clock-inventory-2026-08-10.md).
Disposition: acceptable as a live-only cache surface while dormant; if it graduates to a load-bearing
product path, capture in a migration (two-track policy).

## Related

- [migrations](./migrations.md) — the applied-migration ledger this inventory complements (records-truth corrections there)
- [multi-tenant-foundation-followups-2026-05-15](../ops/multi-tenant-foundation-followups-2026-05-15.md) — the pre-Phase-5 restructure that produced the `_pre_phase5` snapshots
