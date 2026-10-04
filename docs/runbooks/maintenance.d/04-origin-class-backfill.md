## 4. `origin-class-backfill`

**Purpose**: stamp `intelligence_items.origin_class` from `item_type` + `sources.tier`, per
`docs/plans/wo19-origin-class-backfill-mapping.md` section 2/section 4.

**Upstream**: no script implemented this before this lane (`grep -rn origin_class fsi-app/scripts`
finds only consumers). The rule table is transcribed 1:1 into
`fsi-app/scripts/maintenance/lib/origin-class-map.mjs` (`originClassFor`, pinned cell-by-cell against
the plan's table in its own test), imported unmodified by the wrapper.

**Ruling**: R-E (finish-plan-2026-09-02 section 1) - "origin_class backfill mapping ... accept".

**Dispatch**: `mode=dry` groups every `origin_class IS NULL` row by the origin_class it would resolve
to (plus `no_source_id_stays_null` / `no_rule_stays_null` counts - `item_type='tool'` is deliberately
unmapped, per the plan's own flagged row awaiting a separate ruling). `mode=apply` requires
`arg=R-E-accepted`; writes through `guardedUpdateByIds` per origin_class group, idempotent
(`WHERE origin_class IS NULL`, re-checked per chunk via `applyMatch`).

**Artifact / read back**: `summary.json`'s `read_back.by_origin_class` - confirm against
`SELECT origin_class, count(*) FROM intelligence_items GROUP BY origin_class`.

**Re-measured live (lane RULINGS-EXEC, read-only SQL, project kwrsbpiseruzbfwjpvsp, 2026-09-05)**: the
audit's own section 2 flagged this step's outcome as unverified this window. `intelligence_items.origin_class`
distribution today: `official` 1384, NULL **1222**, `community-corroborated` 80, `verified` 54, `partner`
15, `community` 11 (2766 total). The R-E mapping DID apply at some point (the audit is correct that the
runbook narrative implies it): population growth since the last apply (the corpus grew past 1,410 items
after that pass) produced the ~1,000 new NULL rows on file today, not a failed apply - every one of the
new rows minted since is a fresh candidate this step has never seen. Confirmed by driving the ACTUAL
`main()` above (unmodified) with a live snapshot of every NULL-`origin_class` row + its source's tier
instead of a fixture: `null_candidates` 1222, `no_source_id_stays_null` 12, `no_rule_stays_null` 31,
`would_classify` 1179 (`official` 1173, `community-corroborated` 6). R-E's mapping is already accepted
(no new ruling needed) - this is a straight re-dispatch. Coordinator dispatch to close this backlog:
`maintenance`, `mode=dry, step=origin-class-backfill` (confirm the 1179/43 split against live before
applying), then `mode=apply, step=origin-class-backfill, arg=R-E-accepted` - expected read-back
`origin_class_not_null_total` ≈ 2723 (1384 + 1179 + 80 + 54 + 15 + 11), NULL remainder ≈ 43.

---

