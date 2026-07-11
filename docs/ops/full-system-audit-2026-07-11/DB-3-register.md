# DB-3 Register — Ops & Governance Tables (Full-System Audit 2026-07-11)

Agent: DB-3. Baseline: master `71bcbd4` (branch audit/full-system-2026-07-11).
DB: Supabase `kwrsbpiseruzbfwjpvsp`, READ-ONLY throughout (SELECT / information_schema / pg_catalog only).
Scope (manifest section B): 18 tables + 2 views. Protocol: 7-step per table (counts, per-column stats + vocab
drift, FK both ways, dead columns, unreachable rows, constraint/trigger/RLS vs code, full dump <500 rows with
bulk text as length+left80) + special deliverables (a)-(e).

All row counts reconciled against manifest section B exactly (audit-start counts) except one legitimate live
delta noted inline (integrity_flags dated-drift rows created 2026-07-11 during the audit window: counts still
sum to 1,385 at scan time).

---

## Special deliverable (a) — Migration history vs disk

**Disk** (`fsi-app/supabase/migrations/`): 165 files, numbered 001–163 with number-gaps 008, 012, 014, 078,
095, 096, 127 (never existed), and duplicate-numbered files `006_multi_tenant.sql` + `006_rls_multi_tenant.sql`,
`007_community_layer.sql` + `007_full_brief.sql` + `007_rls_community.sql`.

**Ledger** (`supabase_migrations.schema_migrations`): 141 entries — versions 001–162 (with the same 7 number
gaps PLUS 099, 107, 108, 109, 110, 111, 112, 115, 118, 128, 129, 130, 131, 132, 133, 134 missing), plus one
timestamped entry `20260711032524 reconciler_integrity_flags_insert`.

### Applied but NOT on disk (by version)
- `20260711032524_reconciler_integrity_flags_insert` — name-and-content matches disk file
  `163_reconciler_integrity_flags_insert.sql` (single `CREATE POLICY integrity_flags_reconciler_insert`;
  policy verified present in pg_policies with roles={reconciler}, cmd=INSERT). **This is the known mig-163
  out-of-band precedent (ledgered 2026-07-11). No finding beyond the precedent.**

### On disk but NOT in ledger — 17 files, probed individually
| Mig | Objects probed | Verdict |
|---|---|---|
| 099_tier_opinion_review_state | `source_tier_opinions.dismissed_at/dismissed_by/dismissed_reason` → **0 of 3 columns exist**; DB `get_tier_opinion_disagreements` does NOT reference `dismissed` (= still the 091 version, len 1301) | **NEVER APPLIED** (F2) |
| 107_intelligence_items_trajectory_points | `intelligence_items.trajectory_points` exists | applied, unledgered |
| 108_market_intel_rpc_trajectory_payload | fn `get_market_intel_items` exists | applied, unledgered |
| 109_region_dimension_coverage | table exists (30 rows, DB-1 scope) | applied, unledgered |
| 110_callout_columns_and_rpc_extension | 4/4 columns exist (`what_it_changes` etc.) | applied, unledgered |
| 111_workspace_overrides_dismissed_at | `workspace_item_overrides.dismissed_at` exists | applied, unledgered |
| 112_provenance_invariant_schema | `intelligence_items.provenance_status` exists | applied, unledgered |
| 115_set_provenance_status_trigger | 3/3 triggers exist | applied, unledgered |
| 118_provenance_flip_binding | `stamp_prov_origin_trg` + policy `intelligence_items_reconciler_update` exist | applied, unledgered |
| 128_research_finding_slot_ledger_fix | live slot descriptions match 128's UPDATE text verbatim (`decision_relevance`, `does_not_resolve`) | applied, unledgered |
| 129/130/131_market/technology/operations_required_slots | slot rows present per type (market 8, tech 12, regional_data 4; 48 rows / 12 item_types total) | applied, unledgered |
| 132_operations_slot_gap_satisfiable | `cost_baseline`/`feasibility_choice` descriptions match 132's UPDATE text | applied, unledgered |
| 133_get_technology_items_rpc | fn exists | applied, unledgered |
| 134_fix_research_technology_rpc_columns | fn `get_research_items` exists | applied, unledgered |

**Findings:**
- **F1 (breaks-doctrine).** 15 migrations in the 107–134 band are APPLIED but ABSENT from
  `supabase_migrations.schema_migrations` — out-of-band applies beyond the known mig-163 precedent. The
  2026-07-07 ledger repair covered 136–157 only; the 107–134 band (and none of it) was never repaired. The
  ledger is not a trustworthy applied-state record for this band. *Next action:* one ledger-repair entry batch
  (INSERT the 15 versions) in an operator DDL window, mirroring the 136–157 repair.
- **F2 (breaks-doctrine).** `099_tier_opinion_review_state.sql` sits on disk, unledgered AND genuinely
  unapplied: its 3 columns are missing and the DB still holds the 091 version of
  `get_tier_opinion_disagreements` (mig 160 then pinned search_path on that old version). Any future
  tier-opinion review UI coded against 099's contract breaks at runtime. Coupled context: `source_tier_opinions`
  is empty (0 rows, DB-2 scope) and source-level corroboration is deliberately sealed. *Next action:* explicit
  decision row — apply 099 in a DDL window or move the file to an archive/not-applied folder; do not leave a
  half-true migration dir.
- **F20 (cosmetic).** Dup-numbered files (006 x2, 007 x3) have single ledger entries per version — the extra
  same-numbered files' applied state is unrecorded by design of the old numbering. Number gaps
  008/012/014/078/095/096/127 never existed. *Next action:* none required; note in migrations inventory.

---

## Special deliverable (b) — integrity_flags taxonomy (1,385 rows)

### category x status x created_by (26 combos, sums to 1,385)
| category | status | created_by | n | first→last |
|---|---|---|---|---|
| data_quality | resolved | set_provenance_status_trigger | 374 | 06-01→07-11 |
| data_quality | open | skill-conformance-audit | 240 | 06-07 |
| data_quality | open | disposition_deferred | 162 | 06-18→07-11 |
| data_quality | open | set_provenance_status_trigger | 161 | 05-30→07-11 |
| data_integrity | open | seed-fallback-trigger | 105 | 05-28→07-11 |
| data_quality | resolved | surface-visibility-audit | 52 | 07-08 |
| data_quality | resolved | skill-conformance-audit | 50 | 06-07 |
| data_quality | resolved | disposition_deferred | 40 | 06-18→07-03 |
| source_issue | open | null-tier-host | 35 | 07-04→07-11 |
| source_issue | open | exhaustion_record | 26 | 07-07 |
| data_quality | open | completeness-exposure | 25 | 07-06 |
| data_quality | open | skill-conformance-semantic | 21 | 06-07 |
| data_quality | resolved | completeness-exposure | 20 | 07-06 |
| data_quality | open | phase2_priority_review | 19 | 06-12→06-20 |
| source_issue | open | error-body-gate | 13 | 07-06→07-11 |
| data_integrity | open | b-audit-2026-05-29 | 11 | 05-29 |
| data_quality | open | phase2_analysis_relabel | 9 | 06-26→06-27 |
| data_integrity | resolved | b-audit-2026-05-29 | 5 | 05-29 |
| data_integrity | resolved | surface-visibility-audit | 4 | 07-08 |
| source_issue | open | cited-host-gate | 3 | 07-11 |
| data_integrity | resolved | data-audit-lane | 3 | 06-22→07-08 |
| coverage_gap | open | truncation-guard | 2 | 06-23→06-26 |
| data_quality | open | reconciliation-remediation-2026-07-10 | 2 | 07-11 |
| data_integrity | open | register-step-gap | 1 | 07-07 |
| data_quality | open | entity-gate-2026-06-01 | 1 | 06-11 |
| source_issue | open | 4d-hold-record | 1 | 07-07 |

Totals: **open 837 / resolved 548 / in_review 0 / archived 0** (two of the four CHECK-allowed statuses have
never been used). Categories used: 4 of 7 allowed (design_drift, surface_concern, workflow_gap never used).
subject_type: item 1,240 / surface 105 / source 36 / system 4 (all 5 allowed except... `jurisdiction` never used).

### Open-flag age distribution (837 open)
- <7d: 220 · 7–30d: 174 · 30–60d: 443 · >60d: 0. The 30–60d mass is dominated by the 2026-06-07
  skill-conformance baseline (240+21 open) and the 06-18 deferral batch — a known DB-driven redo backlog.

### Deferral payloads (created_by='disposition_deferred', 202 rows: 162 open / 40 resolved)
Payload lives at `recommended_actions[0].deferral` with keys `owner` / `reason` / `resolution_event` /
`deferred_until`.
- **Shape-valid (all 4 keys present): 201/202.** Owner is "operator (Jason)" throughout; reasons are one of two
  class-reason templates (network-stable Phase-3 grounding lane block; renewed variants).
- **Malformed: 1** — `409eae23-fbb6-4592-88c4-c6e980b8c359` (open, item `ff4064ab…`): description still says
  "Lane-#4 deferral (→2026-07-02) … self-resurrects" but `recommended_actions` was overwritten with
  `[{"action":"erased_full_brief","rationale":"re-research failed grounding twice; ungroundable/fabricated
  content removed"}]` — the deferral payload is gone and the flag is arguably complete-but-unresolved (**F4**).
- **Date validity (open rows with payload, n=161): 114 future-dated (through 2026-10-31), 47 EXPIRED** — all 47
  carry `deferred_until = 2026-07-02` and were never renewed. The 2026-07-11 renewal pass resolved 40 expired
  rows as "superseded: expired deferral renewed with fresh class-reason payload (clock re-set 2026-07-11)" but
  left these 47 expired-and-open (**F3, breaks-doctrine** — the deferral ledger's "self-resurrect by the clock"
  contract lapsed 9 days ago for 47 items). Resolved rows: 21 future / 19 expired-at-resolution (fine).
- *Next action (F3/F4):* renew-or-execute pass over the 47 expired open deferrals (same script as the 07-11
  renewal), and manually adjudicate 409eae23 (restore payload or resolve as erased).

### Other integrity_flags checks
- **F10 (dead-weight/hygiene).** 62 item-type flags reference `subject_ref` UUIDs no longer in
  `intelligence_items` (deleted items): 56 open (48 set_provenance_status_trigger, 5 disposition_deferred,
  3 skill-conformance-audit) + 6 resolved. Open flags on deleted subjects are permanently unactionable.
  *Next:* sweep-resolve with note "subject deleted". (subject_ref is TEXT by design — no FK; 0 non-UUID refs.)
- **F12 (cosmetic).** Resolution provenance gap: 254 resolved rows have `resolved_by` NULL (95 of those also
  have no `resolution_note`). Other resolvers: migration_139_backfill 198, set_provenance_status_trigger 73,
  reconciliation-remediation-2026-07-10 17, fabrication-recheck 5, step2b 1. *Next:* have resolve paths always
  stamp resolved_by (route `api/admin/integrity-flags/[id]/resolve` exists — verify it stamps).
- **F11 (cosmetic, doc drift).** CHECK allows 7 categories incl. `workflow_gap` (mig 050); fsi-app doctrine
  (`.claude/CLAUDE.md` "Integrity flags — agent contract") documents only 6. *Next:* one-line doc fix.
- Constraint/trigger/RLS vs code: CHECKs enforce status/category/subject_type; RLS = org-admin read/update +
  service_role ALL + reconciler SELECT (mig 118) + reconciler INSERT (mig 163) — matches the moat-guard design;
  no triggers ON this table (the writer trigger lives on intelligence_items).

---

## Special deliverable (c) — the 4 `*_pre_phase5` backup tables

| Table | Rows | Max timestamp (frozen?) | Delta vs live twin |
|---|---|---|---|
| intelligence_items_pre_phase5 | 655 | created 2026-05-11, updated 2026-05-15 → **frozen** | live 653; 5 pre5 ids deleted from live, 3 live ids new |
| pending_jurisdiction_review_pre_phase5 | 107 | flagged 2026-05-17, resolved NULL → **frozen** | live 109; 1 pre5 row gone from live (item `8ff93a7e` MEAF — item deleted, FK cascade), 3 new live rows |
| item_supersessions_pre_phase5 | 5 | created 2026-03-02 → **frozen** | live 11; all 5 pre5 ids still live, 6 new live rows |
| ingest_rejections_pre_phase5 | 0 | (empty) | live 131 (backup taken before the rejection batch existed... it was created empty) |

- **Structure:** all 4 are constraint-free copies — no PK, no FK, no CHECK, all columns nullable
  (CTAS-style). RLS ENABLED with **zero policies** = deny-all to anon/authenticated; service_role bypasses.
  Fail-closed; acceptable.
- **Code reads:** repo-wide grep for `pre_phase5` → **zero references under `fsi-app/src/`**. Only:
  `scripts/phase-5-backfill.mjs` (the creator), `scripts/tmp/phase-5-*` artifacts (incl. rollback script),
  `scripts/tmp/recon-stage1-*`, `scripts/tmp/critical-1-investigation.mjs`, `scripts/tmp/audit-section-A.mjs`,
  and 7 docs/audit files. Nothing in the running app.
- **F17 (dead-weight).** The backups are frozen (untouched ~8 weeks), unread by code, and their rollback
  window is arguably closed (live tables have moved: 3 new items, 6 new supersessions, provenance rebuild).
  *Next:* retention decision row — keep as forensic snapshot (cheap: ~655 rows + text) or drop via migration;
  per no-archive-during-build feedback, an explicit KEEP or DELETE, not a third holding state.

Full dump, item_supersessions_pre_phase5 (5 rows; id8|old8|new8|date|severity|note50|created):
```
0b6426bc|c1626e9c|efdb3390|2025-02-01|major|Directive replaced by directly applicable Regulati|2026-03-02
fcfc4401|8ef75b0c|87493612|2026-02-01|major|Omnibus raised company size threshold from 250 to |2026-03-02
f0b15e17|f9c3cc30|cee5aa6b|2025-12-01|minor|Federal legal basis for ALL vehicle GHG regulation|2026-03-02
14f3bd97|608e6dae|daecac87|2023-07-01|major|Ambition doubled from 50% reduction to net-zero by|2026-03-02
50271d82|3b2a3a17|e241fe75|2025-04-01|major|First binding market-based measure for shipping: m|2026-03-02
```
(pjr_pre_phase5 full dump: identical rows to the live-table dump in section "pending_jurisdiction_review"
below minus the 3 lowercase 2026-05-19 rows, plus `164cab22|8ff93a7e|MEAF|region_bucket` — verified line-set
equality by the two string_agg dumps.)

---

## Special deliverable (d) — agent_runs cost ledger (1,653 rows)

- **Total ledgered cost: $46.3955** (cost_usd_estimated, NOT NULL DEFAULT 0 → **NULL-cost rows: 0 by schema**;
  zero-cost rows: 483).
- **Per month (status split):** 2026-05: success 669 ($2.2079), error 330 ($0), skipped 8 ($0) ·
  2026-06: success 16 ($1.25), error 10 ($0.20) · 2026-07: success 608 ($34.04), error 12 ($8.6977).
  July is 92% of all spend (the reconciliation/regen waves); the 12 July errors carrying $8.70 are real
  paid-then-failed runs worth knowing about.
- **Orphaned FKs: 0 / 0.** All 4 FKs are enforced constraints (sources, intelligence_items, raw_fetches,
  intelligence_item_versions — all ON DELETE SET NULL), and a NOT EXISTS probe confirmed zero dangling
  `intelligence_item_id` / `source_id` refs. NULL rates (deleted-or-never-set): source_id 647, item_id 774,
  raw_fetch_id 993, source_url 607.
- **fetch_method vocab (no CHECK constraint; 11 values):** scrape 732 ($1.40), spend-call 604 ($32.62),
  rss 210 ($0.59), api 62 ($0.11), stored-pool 15 ($9.70, avg $0.65/run), canonical:ground 12,
  canonical:generate 9, canonical:reresearch 3, manual 3, canonical:erase 2, 4c-judge-reconcile 1 ($0.41).
  Current src writers emit only `stored-pool` (canonical-pipeline.ts:376), `spend-call` (spend-client.ts:120);
  `4c-judge-reconcile` from scripts/reconcile-4c-judge-ledger.mjs; the rest are legacy-runner values (**F14,
  cosmetic vocab drift** — fine as telemetry, but nothing normalizes it).
- **Dead columns (F6, dead-weight):** `intelligence_item_version_id` NULL in **1,653/1,653** with no writer
  anywhere in src/ — defined in mig 057, never once populated. `duration_ms` populated in only 17/1,653, no
  src writer. *Next:* drop both via migration, or wire at the run-close write site.
- Status vocab: running 0 / success 1,293 / error 352 / skipped 8 — matches CHECK. No stuck 'running' rows.
  5 rows have `ended_at` NULL but status='error' — all 2026-05-10 with errors=`["killed-by-orchestrator-restart"]`
  (dump below); honest kill-records, minor stamp gap only.
- `errors` non-empty on 1,101 rows including **741 success runs** (warnings-in-errors pattern; consistent with
  runner design, not a defect).
- Range: 2026-05-10 → 2026-07-11. Max single-run cost $2.0196; 4 runs >$1.
- RLS: service_role-only (ALL). No triggers. Matches worker-secret/service write path.

Anomalous-row dump (5 ended_at-NULL rows; id|url|method|status|started|cost|errors80):
```
fed22e55|https://www.ipcc.ch/assessment-report/ar6/|rss|error|2026-05-10 02:26:22|0|["killed-by-orchestrator-restart"]
35e68613|https://resources.ecovadis.com/blog|rss|error|2026-05-10 02:26:23|0|["killed-by-orchestrator-restart"]
63f97cd1|https://www.usgbc.org/leed|rss|error|2026-05-10 02:26:24|0|["killed-by-orchestrator-restart"]
d90eac56|https://www.thegef.org/who-we-are|rss|error|2026-05-10 02:26:25|0|["killed-by-orchestrator-restart"]
03755e68|https://www.iea.org/data-and-statistics/charts/estimated-final-…|scrape|error|2026-05-10 02:26:28|0|["killed-by-orchestrator-restart"]
```

---

## Special deliverable (e) — system_state singleton (full dump, all columns)

```json
{"id": true, "global_processing_paused": true, "updated_at": "2026-05-18T18:16:54.751631+00:00",
 "scrape_cadence": "off", "scrape_start_date": null}
```
- **F16 (info, not a defect):** the global hold has been ON since 2026-05-18 and cadence is `off` — the
  documented deliberate posture (Browserless conservation, loop OFF). Every fetch-capable route gates on this
  via `src/lib/api/pause.ts` (`isGloballyPaused` = cadence off OR emergencyPaused; fails CLOSED on read error).
  Constraints match code: `id=true` singleton CHECK, cadence CHECK (off/weekly/monthly) = mig 144. RLS enabled,
  ZERO policies → deny-all except service_role; pause.ts reads it with route clients — verified the admin
  routes use service-role/server clients (supabase-server.ts consumer), so the zero-policy posture works but is
  fragile if any anon-client read is ever added (it would silently read nothing → fail-closed → permanent
  pause; acceptable direction of failure).

---

## Per-table registers (remaining tables)

### ingestion_state (774 rows) + ingestion_control_log (709 rows) — **F5 (dead-weight, pair)**
- ingestion_state: PK source_id, FK→sources CASCADE. 771 rows {auto_run_enabled=t, processing_paused=f},
  3 rows paused=t. `last_state_change_at` = 2026-05-10 on ALL rows; `last_state_change_reason` NULL on ALL.
  Coverage: 423 of 1,197 sources have NO row (51 of them status='active') — neither complete nor maintained.
- ingestion_control_log: 709 rows, ALL `{action:'auto_run_disabled', actor:'cold_start'}`, all 2026-05-10,
  one distinct action ever.
- **Contradiction:** the log records 709 auto_run_disabled events; the state table shows all 774
  auto_run_enabled=true with no re-enable ever logged and no reason recorded — the two surfaces cannot both be
  the truth of what happened.
- **Consumers: zero in src/.** Live pause logic reads `system_state` + `sources.processing_paused` (pause.ts);
  auto-run lives on `sources.auto_run_enabled` (mig 055). Only scripts/diag artifacts reference these tables
  (incl. `scripts/_diag/ingestion-state-readers.mjs` — a prior probe of this same question).
- Anomalous-row dump (3 paused rows; source8|name|auto|paused|changed):
```
3cab0b63|DPNR – Division of Environmental Protection|t|t|2026-05-10
9fefb65c|Maryland Department of the Environment (MDE) – Air & Climate Change Program|t|t|2026-05-10
76852e81|Virginia Department of Transportation (VDOT)|t|t|2026-05-10
```
- *Next action:* decision row — drop both tables (migrations 058/059 superseded by sources columns +
  system_state) or re-point one authoritative store. The 3 paused=t rows have no effect anywhere (nothing
  reads them); if those 3 sources should be paused it must be `sources.processing_paused`.

### raw_fetches (660 rows)
- PK id, FK→sources CASCADE; referenced by agent_runs.raw_fetch_id (660 distinct refs — every raw_fetch is
  referenced; 0 unreferenced). RLS service_role-only.
- Window: 2026-05-10 → 2026-05-19 only (**dormant since**; consistent with scrape hold). 659 distinct sources,
  1 source fetched twice. content_hash: 593 distinct / 660 (67 shared-hash rows — mostly the 16 empty bodies +
  template pages).
- http_status: 644 x 200, 16 x 202-with-0-bytes (Browserless async artifacts; dump below). html_bytes avg
  159 KB, max 2.48 MB. `file_path` shape `"<source_uuid>/<date>/<hash>"` — storage-bucket keys (not repo paths).
- **F13 (info):** the 16 zero-byte 202 rows are stored as if fetched; anything replaying raw_fetches must
  filter `html_bytes>0 AND http_status=200`.
```
7234b471|260089a9|202|0  20c3b14d|13f9585a|202|0  e0156fd2|ac2bec50|202|0  99246915|167dae92|202|0
dbfac12f|c048ce5e|202|0  ddb1d575|4c6f45e9|202|0  d197fbe4|93fc8015|202|0  c85cfb69|363abb3f|202|0
1df4fba1|e6956d6f|202|0  df73682f|44ddd506|202|0  e241bcc5|807a3ad8|202|0  4b6257e8|777c7a9c|202|0
5a4d835c|8afd5b81|202|0  1f8b1043|de36ea2b|202|0  e040d55f|b32c0e41|202|0  c281e190|41c1cadd|202|0   (all 2026-05-10)
```

### monitoring_queue (580 rows)
- FKs enforced both ways clean (source CASCADE, item SET NULL). CHECKs: priority (4 vals), last_result (5 vals).
  RLS: **SELECT USING(true) to public** (F19, cosmetic — telemetry readable by any authenticated/anon role
  holder; no workspace scoping), INSERT/UPDATE service_role.
- Data: ALL 580 priority='normal'; last_result: no_change 365 / inaccessible 215 (error_message set on exactly
  those 215); change_detected=false on ALL; `item_id` NULL on ALL 580 (dead column in practice);
  `reconciled_at` NULL on ALL — its writer (`api/worker/reconcile`) only stamps rows with change_detected=true,
  of which there have never been any, so mig 124's column is wired-but-never-exercised, not dead.
- Window: created 2026-04-28 → 2026-06-28; scheduled_check max 2026-06-28 (**nothing scheduled in the future**
  — the queue is drained/dormant, consistent with cadence off). 206 distinct sources.
- **F7 (dead-weight/ops):** dormant queue + never-fired change detection; fine while the hold is on, but when
  scraping resumes the queue must be re-seeded (no future rows exist).

### intelligence_items_domain_backfill_audit (212 rows)
- No FKs (snapshot table), PK id. RLS enabled, zero policies (service-only). Captured in a single instant
  (2026-05-24 01:56:12, mig 101). rule_branch: 12 values; certainty high 186 / medium 20 / ambiguous 6;
  domain moves dominated by 1→3 (regional_data 54), 1→4 (market 40+15+6+6), 1→7 (research 24+12+8+6), 1→2.
- Unreachable: 3 audit ids no longer in intelligence_items; 43/212 live items now carry a domain different
  from proposed_domain (later reclassification waves — expected for a point-in-time audit record; **F21 info**).
- Full dump (212 rows; id8|old>new|rule_branch|certainty|item_type|source24) — recorded verbatim from
  string_agg scan:
```
01126119|1>4|initiative+null_source_default_market|ambiguous|initiative|-
015c28f1|1>2|tech_innov|high|technology|Legislative Assembly of
02ad37c7|1>7|research_finding|high|research_finding|Organisation for Economi
0339e2b7|1>3|initiative+ops_source|high|initiative|Lloyd's Register Maritim
05b786f8|1>2|tool_default_tech|medium|tool|EcoVadis
0638c19d|1>2|tool_default_tech|high|tool|National Heavy Vehicle R
06d01f75|1>2|tool_default_tech|medium|tool|Thomson Reuters Regulato
0781a8c0|2>3|tool+ops_source|medium|tool|Blue Visby Consortium (c
08b0a1b3|1>7|framework+research_source|high|framework|United Nations Departmen
09f8d920|1>4|initiative+market_source|high|initiative|UNFCCC
0a8b8ef0|1>7|framework+research_source|high|framework|World Bank Group
0ab2a460|1>3|regional_data|high|regional_data|Ministerstvo životného p
0af6afdf|1>4|initiative+market_source|high|initiative|Global Maritime Forum (m
0bbd757c|1>4|market_signal|high|market_signal|ESG Today
0c03b4bd|5>7|framework+research_source|high|framework|World Bank Carbon Pricin
0f93eb09|1>7|framework+research_source|high|framework|ECLAC / CEPAL – United N
10f3d5b0|1>4|market_signal|high|market_signal|Washington State Departm
11794ed7|1>4|market_signal|high|market_signal|U.S. Energy Information
12255665|1>3|regional_data|high|regional_data|Ville de Paris (Mairie d
14ff3453|1>3|regional_data|high|regional_data|City of Los Angeles — De
16696c96|1>4|initiative+market_source|high|initiative|H2Accelerate Collaborati
19f08fcc|1>2|tool_default_tech|medium|tool|EcoVadis
1c954622|1>3|regional_data|high|regional_data|Hawaii State Energy Offi
22e1d608|1>3|tool+ops_source|medium|tool|Climate Change Laws of t
23cf67df|1>4|framework+market_source|medium|framework|CLECAT (European Forward
24cf9264|1>3|regional_data|high|regional_data|Ville de Montréal — Cons
25b4c0b6|1>2|tech_innov|high|technology|Singapore Statutes Onlin
2648d4ad|1>7|framework+research_source|high|framework|UNCTAD (UN Trade and Dev
27f22c4f|1>4|market_signal|high|market_signal|Splash247
281644c5|1>2|tool_default_tech|high|tool|Statutes of the Republic
282e480c|1>3|regional_data|high|regional_data|Ministério dos Transport
29132ca6|1>4|initiative+market_source|high|initiative|European Clean Trucking
2b7bbd3a|1>4|market_signal|high|market_signal|CleanTechnica
2b9f91a5|1>3|regional_data|high|regional_data|Hawai‘i Department of He
2c814d07|1>2|tool_default_tech|high|tool|ACT Legislation Register
2e3ef7e7|1>3|regional_data|high|regional_data|U.S. Energy Information
3105da5c|1>3|regional_data|high|regional_data|American Samoa Fono (Leg
31b18416|1>7|initiative+research_source|high|initiative|United Nations Departmen
3373d06e|1>7|research_finding|high|research_finding|International Renewable
340ddf31|1>3|framework+ops_source|medium|framework|DP World (dpworld.com)
344a58cd|1>3|regional_data|high|regional_data|Newfoundland and Labrado
36cb651f|1>3|regional_data|high|regional_data|Guam Legislature (I Lihe
371d2218|1>3|tool+ops_source|medium|tool|US EIA Open Data API
388b2ce8|1>7|research_finding|high|research_finding|Centre for Sustainable R
3af75490|5>1|reg_type|high|regulation|THETIS-MRV
3b026e42|1>4|initiative+market_source|high|initiative|European Clean Trucking
3b396de4|1>3|regional_data|high|regional_data|Washington Utilities and
3c4dcd04|1>3|regional_data|high|regional_data|Yukon Legislative Assemb
3cac277d|1>2|tool_default_tech|high|tool|EEA EU ETS Data Viewer
3ed4f908|1>4|market_signal|high|market_signal|BloombergNEF Energy Stor
3f11f1fc|1>3|regional_data|high|regional_data|International Energy Age
412ffbf4|5>7|tool+research_source|high|tool|International Civil Avia
41dcbf7b|1>2|tech_innov|high|technology|Naturvårdsverket — Swedi
42399c2f|1>7|research_finding|high|research_finding|Agência Portuguesa do Am
432a5042|1>7|framework+research_source|high|framework|ASEAN Main Portal (asean
43fd4d25|1>4|market_signal|high|market_signal|Northwest Territories De
488d21c1|1>3|regional_data|high|regional_data|Poslanecká sněmovna Parl
4a6d21d7|1>7|tool+research_source|high|tool|NREL PVWatts Calculator
4d240f75|1>3|initiative+ops_source|high|initiative|Blue Visby Consortium (c
50ccd5cc|1>7|framework+research_source|high|framework|Smart Freight Centre
538c2774|1>7|framework+research_source|high|framework|Carbon Trust
54fb8bfe|1>7|initiative+research_source|high|initiative|IMT — Institute for Mark
566f0598|1>4|initiative+null_source_default_market|ambiguous|initiative|TIACA (The International
577f9536|1>4|initiative+market_source|high|initiative|Julie's Bicycle
58bf0406|1>4|initiative+market_source|high|initiative|European Clean Trucking
5b07f503|6>3|regional_data|high|regional_data|International Labour Org
5b37050b|1>4|market_signal|high|market_signal|Air Cargo News
5d54ed52|1>3|regional_data|high|regional_data|Environment Protection A
5f9e9fb4|1>4|market_signal|high|market_signal|GreenBiz
5fc45237|1>4|market_signal|high|market_signal|DNV Maritime Regulatory
5fec12c6|1>4|framework+market_source|medium|framework|International Air Transp
620f2692|1>7|research_finding|high|research_finding|Tyndall Centre for Clima
646dda2d|1>4|market_signal|high|market_signal|Ministerio de Transporte
653f174b|1>3|regional_data|high|regional_data|City of Toronto — Enviro
6627ef8b|1>4|market_signal|high|market_signal|FreightWaves
67434312|1>3|regional_data|high|regional_data|Colorado Department of T
67c6e313|1>4|market_signal|high|market_signal|Asian Development Bank (
68af10b5|1>7|research_finding|high|research_finding|Inter-American Developme
6a8036a0|1>4|framework+market_source|medium|framework|CER – Community of Europ
6ac6d029|1>3|regional_data|high|regional_data|Ministarstvo gospodarstv
6b55b53d|1>4|initiative+market_source|high|initiative|World Economic Forum
6c59d250|1>4|market_signal|high|market_signal|EcoVadis
708e0b02|1>3|initiative+ops_source|high|initiative|European Sea Ports Organ
7115c978|1>7|framework+research_source|high|framework|World Trade Organization
7126e83b|1>4|market_signal|high|market_signal|ADOT – Arizona State Fre
71b03469|1>3|regional_data|high|regional_data|U.S. Bureau of Labor Sta
7227b685|1>3|regional_data|high|regional_data|North Carolina General A
72950a9b|1>3|regional_data|high|regional_data|Missouri General Assembl
72be8dd3|5>7|tool+research_source|high|tool|ECLAC / CEPAL – United N
7838d723|1>3|regional_data|high|regional_data|Arizona State Legislatur
78aab5ee|1>3|regional_data|high|regional_data|Department of Environmen
79e73a30|1>4|initiative+market_source|high|initiative|Gallery Climate Coalitio
7ae06612|1>4|initiative+market_source|high|initiative|World Economic Forum
7ae77ef8|1>4|initiative+market_source|high|initiative|U.S. Department of State
7c78a23c|1>7|initiative+research_source|high|initiative|REVERB
7e43c296|1>3|regional_data|high|regional_data|South Carolina Departmen
7e4f2b36|1>7|research_finding|high|research_finding|International Renewable
7fd6fbf1|1>4|market_signal|high|market_signal|U.S. Energy Information
7ff81425|1>3|tool+ops_source|medium|tool|Measurabl — Building Ben
80329428|1>4|market_signal|high|market_signal|Seatrade Maritime News
8107ba33|1>2|tool_default_tech|medium|tool|EcoVadis
83094c15|5>2|tool_default_tech|high|tool|EUR-Lex
88a2918c|1>4|market_signal|high|market_signal|FreightWaves
88c3a053|1>7|research_finding|high|research_finding|MIT Climate Machine
8a9af9ef|1>3|regional_data|high|regional_data|International Monetary F
8ac4846b|1>4|initiative+market_source|high|initiative|American Trucking Associ
8c0e4e5f|1>2|tool_default_tech|high|tool|European Union Aviation
8d256568|1>4|market_signal|high|market_signal|The Loadstar
8e0457a7|1>3|regional_data|high|regional_data|Hungarian Government Env
9118aab6|1>7|initiative+research_source|high|initiative|Mission Innovation
924731b1|1>3|regional_data|high|regional_data|NSW Environment Protecti
92f4d247|1>4|market_signal|high|market_signal|Edie
9333c734|1>4|market_signal|high|market_signal|Electrek
93982f32|1>4|market_signal|high|market_signal|Hydrogen Insight
9398b472|1>3|regional_data|high|regional_data|Idaho Legislature – Idah
947e08f3|1>7|research_finding|high|research_finding|IEA Electricity Mid-Year
9546c01a|1>4|initiative+null_source_default_market|ambiguous|initiative|eFuel Alliance e.V.
956a1cb6|1>3|regional_data|high|regional_data|Ministerio de Transporte
96050141|1>4|framework+market_source|medium|framework|Sabin Center Climate Law
97d22488|1>7|research_finding|high|research_finding|Cranfield University – S
99b049f3|1>3|regional_data|high|regional_data|Queensland Department of
99de93a3|1>4|market_signal|high|market_signal|Mississippi Department o
9baa3126|1>7|initiative+research_source|high|initiative|Mission Innovation
9d18608f|1>4|initiative+null_source_default_market|ambiguous|initiative|Sustainable Packaging Co
9e594959|6>1|reg_type|high|standard|U.S. Green Building Coun
9f34b7c4|1>7|tool+research_source|high|tool|NREL NSRDB National Sola
9fe7578b|1>4|market_signal|high|market_signal|Lloyd's List
a1fd9574|1>4|initiative+market_source|high|initiative|World Economic Forum
a2ed453f|1>3|regional_data|high|regional_data|Natural Resources Wales
a7fd2700|1>7|research_finding|high|research_finding|Tyndall Centre for Clima
ab362011|1>4|market_signal|high|market_signal|FreightWaves
ad5b78ea|1>7|framework+research_source|high|framework|ASEAN Main Portal (asean
ae628786|1>2|tech_innov|high|technology|IRENA Renewable Power Ge
af277afd|1>7|research_finding|high|research_finding|International Energy Age
b0d9737e|1>3|initiative+ops_source|high|initiative|DP World (dpworld.com)
b11cccc4|1>7|research_finding|high|research_finding|Fraunhofer Institute for
b2193d25|1>7|research_finding|high|research_finding|IEA Global Hydrogen Revi
b3b32236|1>3|framework+ops_source|medium|framework|U.S. Green Building Coun
b4710002|1>7|research_finding|high|research_finding|National Laboratory of t
b4811af8|1>3|regional_data|high|regional_data|Nunavut Department of En
b5e23e3d|1>3|regional_data|high|regional_data|Mississippi Legislature
b6c47911|1>3|regional_data|high|regional_data|City of Sydney
b6fd00bf|1>7|research_finding|high|research_finding|IEA World Energy Outlook
b813d0a5|1>7|initiative+research_source|high|initiative|Centre for Sustainable R
b88753be|6>7|research_finding|high|research_finding|National Renewable Energ
b8fb3eba|1>3|regional_data|high|regional_data|Legislative Assembly of
b94cd283|1>4|market_signal|high|market_signal|Asian Development Bank (
bd6bc712|1>4|framework+market_source|medium|framework|ICOM Committee for Conse
bd9a1a6b|1>3|regional_data|high|regional_data|Global Environment Facil
bdc42a68|1>4|initiative+market_source|high|initiative|FIATA Sustainability
bf734379|1>3|initiative+ops_source|high|initiative|European Sea Ports Organ
c0eab829|1>7|research_finding|high|research_finding|National Renewable Energ
c113dd5d|1>3|initiative+ops_source|high|initiative|The Aspen Institute
c18a8545|1>4|market_signal|high|market_signal|Maritime Carbon Intellig
c347cd16|1>3|regional_data|high|regional_data|Illinois Environmental P
c3fa4cc2|5>7|framework+research_source|high|framework|International Renewable
c54cd5f2|1>7|initiative+research_source|high|initiative|United Nations Departmen
c8b4f1ae|2>1|initiative+reg_source|high|initiative|Federal Highway Administ
c8b7f538|1>4|initiative+null_source_default_market|ambiguous|initiative|eFuel Alliance e.V.
c8df59e5|1>3|regional_data|high|regional_data|Environment ACT (Environ
ca480511|1>3|regional_data|high|regional_data|West Virginia Legislatur
ca6fa630|1>7|framework+research_source|high|framework|ECLAC / CEPAL – United N
cc0958fb|1>7|framework+research_source|high|framework|International Civil Avia
cc9662dc|1>3|regional_data|high|regional_data|Région Île-de-France
ccee10a4|2>1|reg_type|high|regulation|California Air Resources
cd238eda|1>3|regional_data|high|regional_data|City of Toronto — City C
cd392833|1>7|tool+research_source|high|tool|NREL System Advisor Mode
cea7bd1b|1>4|market_signal|high|market_signal|Prince Edward Island Dep
d06c47c4|1>3|regional_data|high|regional_data|Ministerstvo životního p
d0d76892|1>4|framework+market_source|medium|framework|American Alliance of Mus
d131224a|1>7|research_finding|high|research_finding|International Energy Age
d136c88c|1>4|market_signal|high|market_signal|Reuters Sustainable Busi
d2b343b4|6>3|regional_data|high|regional_data|IEA Energy Prices Databa
d30bc25d|5>2|tool_default_tech|medium|tool|CDP Supply Chain
d4a1a8ec|1>4|initiative+market_source|high|initiative|CER – Community of Europ
d4dd6677|1>3|regional_data|high|regional_data|ASEAN Main Portal (asean
d54eeb7b|1>3|regional_data|high|regional_data|Sejm of the Republic of
d6a9889f|1>4|market_signal|high|market_signal|U.S. Bureau of Labor Sta
d779efe4|1>3|regional_data|high|regional_data|Albuquerque-Bernalillo C
d8305603|1>7|tool+research_source|high|tool|IEA Data and Statistics
d9315d6c|1>4|market_signal|high|market_signal|Journal of Commerce (JOC
daaa7e3a|1>4|market_signal|high|market_signal|Boston City Council
dce1881d|1>7|tool+research_source|high|tool|ILOSTAT
dde5a446|1>7|tool+research_source|high|tool|International Carbon Act
de368414|1>4|market_signal|high|market_signal|US EIA Petroleum Spot Pr
dfef9b93|1>3|regional_data|high|regional_data|Wisconsin Department of
e07ad9c1|1>3|regional_data|high|regional_data|Nova Scotia House of Ass
e0de7775|1>3|regional_data|high|regional_data|Office of the City Clerk
e187ba5d|1>3|regional_data|high|regional_data|Legislative Assembly of
e360e82f|5>7|tool+research_source|high|tool|OECD (Organisation for E
e69e4c63|1>4|market_signal|high|market_signal|InsideEVs
ea6cfff1|1>2|tech_innov|high|technology|ABS Sustainability
eb6641da|1>7|research_finding|high|research_finding|McKinsey Sustainability
eb872092|1>3|regional_data|high|regional_data|Rhode Island General Ass
eb898f68|1>4|market_signal|high|market_signal|Environmental Finance
ebf3e5a1|1>7|initiative+research_source|high|initiative|Sabin Center for Climate
ece93c54|1>7|research_finding|high|research_finding|OECD iLibrary
ed0d78a6|1>4|initiative+null_source_default_market|ambiguous|initiative|ZEMBA (Zero Emission Mar
ed63f522|1>4|market_signal|high|market_signal|US EIA Short-Term Energy
ed6c5c76|1>7|research_finding|high|research_finding|Centre for Sustainable R
ee2cfe81|1>3|regional_data|high|regional_data|Nova Scotia Department o
ee8f4e71|1>7|research_finding|high|research_finding|ILO Global Wage Report
efcc9f45|1>7|research_finding|high|research_finding|International Energy Age
f2995d25|1>4|market_signal|high|market_signal|Commercial Carrier Journ
f2ff2a3f|1>3|regional_data|high|regional_data|Queensland Parliament
f3510df3|1>4|market_signal|high|market_signal|The Loadstar
f41fd969|1>3|regional_data|high|regional_data|Kansas Highway Patrol (K
f57d0f58|1>7|research_finding|high|research_finding|SmartPort (partnership o
f5bc7f1f|1>4|market_signal|high|market_signal|US DOE Clean Investment
f982289b|1>7|framework+research_source|high|framework|World Trade Organization
fb86ee11|1>4|market_signal|high|market_signal|City of Boston — Environ
fb8a5c07|1>2|tool_default_tech|high|tool|Solargis Global Solar At
```

### ingest_rejections (131 rows) — **F8 (dead-letter queue, part 1)**
- CHECKs: rejection_reason 4-value vocab (data matches exactly: unparseable 84, below_granularity 20,
  non_geographic 17, institutional 10); triage_action 3-value vocab + triage-consistency CHECK. FKs clean
  (0 null source_id, 0 orphans). RLS: platform-admin read/update.
- **ALL 131 rows untriaged** (triage_action/triaged_by/triaged_at NULL on every row) since 2026-05-18/19 —
  ~54 days. The admin UI + route exist (`IngestRejectionsView.tsx`, `api/admin/triage/ingest-rejections`) but
  have processed zero rows. *Next:* one triage session, or batch-triage rules (the dump shows clear classes:
  counties, watersheds, region buckets, institution names).
- Full dump (131 rows; id8|reason|raw_value30|source_url40|triage), attempt-ordered:
```
37013fcb|below_granularity|CLARK COUNTY|https://wsdot.wa.gov/construction-planni|untriaged
37372490|unparseable|FEDERAL (49 CFR)|https://www.dot.ny.gov/divisions/operati|untriaged
43f84471|unparseable|REGIONAL - MULTI-COUNTRY|https://www.cepal.org/en|untriaged
54c9c132|unparseable|OAHU|https://energy.hawaii.gov/|untriaged
73f18f40|below_granularity|BIHOR COUNTY|https://www.mmediu.ro/|untriaged
a144892a|non_geographic|BLACKSTONE WATERSHED|https://dem.ri.gov/environmental-protect|untriaged
adfdce96|unparseable|MLIT|https://www.mlit.go.jp/en/statistics/whi|untriaged
b2d7520b|non_geographic|BLACKSTONE RIVER|https://dem.ri.gov/environmental-protect|untriaged
b49f687f|institutional|NORWEGIAN MARITIME AUTHORITY|https://www.regjeringen.no/en/whats-new/|untriaged
c1ee3a27|unparseable|NATIONAL|https://www.nhvr.gov.au|untriaged
f28bdbf6|unparseable|TEXAS-MEXICO BORDER|https://www.txdot.gov/projects/planning/|untriaged
fec277b8|institutional|MINISTRY OF CLIMATE AND ENVIRO|https://www.regjeringen.no/en/whats-new/|untriaged
05b273e0|below_granularity|LOS ANGELES COUNTY|https://www.portoflosangeles.org/environ|untriaged
0a957081|unparseable|GLOBAL MARITIME|https://splash247.com|untriaged
1e4f9121|unparseable|REGIONAL_AFRICA|https://futurefuels.imo.org/|untriaged
27ebee37|unparseable|REGIONAL_SIDS|https://futurefuels.imo.org/|untriaged
3bb8563e|unparseable|BRUNSWICK|https://epd.georgia.gov|untriaged
3fbfab02|unparseable|LEAST_DEVELOPED_COUNTRIES|https://unctad.org/topic/transport-and-t|untriaged
526920d9|unparseable|FAIRBANKS NORTH STAR BOROUGH|https://dec.alaska.gov/|untriaged
782ae18b|unparseable|REGIONAL_CARIBBEAN|https://futurefuels.imo.org/|untriaged
7b2d84b7|unparseable|PORT OF LOS ANGELES|https://www.portoflosangeles.org/environ|untriaged
8e87ba69|unparseable|UNITED NATIONS|https://sdgs.un.org/goals/goal9|untriaged
acd60c33|unparseable|SAN PEDRO BAY|https://www.portoflosangeles.org/environ|untriaged
b7d1a8d5|unparseable|SAINT VINCENT AND THE GRENADIN|https://sdgs.un.org/goals/goal9|untriaged
bc1c6b59|unparseable|MULTI-REGIONAL|https://www.dpworld.com/en/sustainabilit|untriaged
c1abdd51|below_granularity|DAVIDSON COUNTY|https://www.nashville.gov/departments/ma|untriaged
cd8dc7f5|unparseable|SOUTHWEST GEORGIA|https://epd.georgia.gov|untriaged
d3037fa8|below_granularity|MOBILE COUNTY|https://www.adem.alabama.gov/|untriaged
da7f3b50|unparseable|REGIONAL_ASIA_PACIFIC|https://futurefuels.imo.org/|untriaged
f61ecd95|unparseable|LANDLOCKED_DEVELOPING_COUNTRIE|https://unctad.org/topic/transport-and-t|untriaged
27eb1dfe|below_granularity|HARRIS COUNTY|https://houstontx.gov/council/|untriaged
39acabd3|unparseable|LOCAL|https://afdc.energy.gov/laws|untriaged
5ab48056|unparseable|IDB_REGION|https://www.iadb.org/en/who-we-are/topic|untriaged
68e222ba|unparseable|RWANDA|https://www.wri.org/|untriaged
6eaf16fd|unparseable|STATE|https://afdc.energy.gov/laws|untriaged
8b280506|below_granularity|CLARK COUNTY|https://www.clarkcountynv.gov/government|untriaged
a270cb22|unparseable|GLOBAL_MARITIME|https://www.imo.org/en/about/conventions|untriaged
c9ab7e3f|unparseable|INTERNATIONAL MARITIME ORGANIZ|https://bluevisby.com/|untriaged
25f81f20|unparseable|GLOBAL SHIPPING|https://wwwcdn.imo.org/localresources/en|untriaged
3c7d50b3|below_granularity|EAGLE COUNTY|https://www.codot.gov/programs/environme|untriaged
47ddfc91|below_granularity|BOULDER COUNTY|https://www.codot.gov/programs/environme|untriaged
497b85e1|below_granularity|CHAFFEE COUNTY|https://www.codot.gov/programs/environme|untriaged
4d9d4ce0|non_geographic|LAKE COUNTY|https://www.codot.gov/programs/environme|untriaged
50b0dec7|below_granularity|CONEJOS COUNTY|https://www.codot.gov/programs/environme|untriaged
64f925fe|below_granularity|GARFIELD COUNTY|https://www.codot.gov/programs/environme|untriaged
99767a4c|below_granularity|DAVIDSON COUNTY|https://www.nashville.gov/departments/ge|untriaged
a612e58b|unparseable|MULTILATERAL|https://www.adb.org/what-we-do/topics/tr|untriaged
a63fd134|unparseable|SOUTH COAST AIR QUALITY MANAGE|https://www.aqmd.gov|untriaged
e0aa72c6|below_granularity|EL PASO COUNTY|https://www.codot.gov/programs/environme|untriaged
e254fb96|below_granularity|ELBERT COUNTY|https://www.codot.gov/programs/environme|untriaged
0e0055e4|unparseable|MULTI-NATIONAL|https://www.ipcc.ch/reports/|untriaged
21e3456f|non_geographic|GULF_OF_OMAN|https://www.seatrade-maritime.com|untriaged
3f63a0e6|below_granularity|GREENWOOD COUNTY|https://des.sc.gov/programs/bureau-air-q|untriaged
40c1f5c8|unparseable|TRANSNATIONAL|https://www.thegef.org/publications/inst|untriaged
44341352|unparseable|PORT_OF_SANTOS|https://www.seatrade-maritime.com|untriaged
58a9a548|unparseable|PORT_OF_LOS_ANGELES|https://www.seatrade-maritime.com|untriaged
5cbbb643|institutional|ARIZONA DEPARTMENT OF TRANSPOR|https://azdot.gov/planning/transportatio|untriaged
628ce14f|unparseable|JEBEL_ALI|https://www.seatrade-maritime.com|untriaged
80eabbba|unparseable|MULTIPLE CITIES|https://www.measurabl.com/ordinance-fili|untriaged
8f762c8f|unparseable|FUJAIRAH|https://www.seatrade-maritime.com|untriaged
d985a15e|unparseable|MULTI_JURISDICTIONAL|https://initiatives.weforum.org/first-mo|untriaged
dd38fb3c|non_geographic|STRAIT_OF_HORMUZ|https://www.seatrade-maritime.com|untriaged
e3ed5448|unparseable|WTO|https://www.wto.org/english/tratop_e/env|untriaged
0926a508|institutional|EAST COURTHOUSE ROAD|https://www.mdeq.ms.gov/about-mdeq/regul|untriaged
2e475d2a|unparseable|FLANDERS|https://www.vmm.be/|untriaged
385f6e67|unparseable|RIONEGRO|https://mintransporte.gov.co/|untriaged
457bfd9f|unparseable|INTERNATIONAL MARITIME|https://lloydslist.com/|untriaged
4ef6b733|unparseable|GLOBAL SOUTH|https://www.mission-innovation.net/missi|untriaged
56eddac7|unparseable|PORT OF LOS ANGELES|https://www.portoflosangeles.org/environ|untriaged
5c5e8d31|non_geographic|NORTH SEA REGION|https://bmdv.bund.de/EN/Home/home.html|untriaged
60e84433|unparseable|GHENT|https://www.vmm.be/|untriaged
68f6b0df|unparseable|CHAPARRAL|https://mintransporte.gov.co/|untriaged
7210e934|unparseable|NECOCLÍ|https://mintransporte.gov.co/|untriaged
763dbafe|non_geographic|BALTIC SEA REGION|https://bmdv.bund.de/EN/Home/home.html|untriaged
7c5c8b10|unparseable|NATIONAL LEVEL|https://flk.npc.gov.cn/|untriaged
7e248e42|unparseable|PANAMA|https://lloydslist.com/|untriaged
9932579b|below_granularity|LOS ANGELES COUNTY|https://www.portoflosangeles.org/environ|untriaged
9dd4b29d|unparseable|PASS CHRISTIAN|https://www.mdeq.ms.gov/about-mdeq/regul|untriaged
9e8772c6|unparseable|US WEST COAST|https://theloadstar.com|untriaged
ae0e1dfd|unparseable|TOLIMA|https://mintransporte.gov.co/|untriaged
b51de5b5|unparseable|32 MEMBER COUNTRIES|https://www.eea.europa.eu|untriaged
b80ca38d|unparseable|ARBOLETES|https://mintransporte.gov.co/|untriaged
d60b93b0|unparseable|WILLEBROEK|https://www.vmm.be/|untriaged
f196754b|unparseable|UGANDA|https://climate-laws.org/|untriaged
fdb949a1|non_geographic|GULFPORT|https://www.mdeq.ms.gov/about-mdeq/regul|untriaged
1cbc3c97|institutional|LOS ANGELES DEPARTMENT OF BUIL|https://dbs.lacity.gov/services/green-bu|untriaged
3abab5b4|below_granularity|FRANKLIN COUNTY|https://www.deq.idaho.gov/|untriaged
43470a37|non_geographic|BEAR RIVER BASIN|https://www.deq.idaho.gov/|untriaged
49989c15|non_geographic|NORTH_SEA|https://maritimecarbonintelligence.com/|untriaged
4b0c9e49|unparseable|SOUTH_EAST_ASIA|https://www.icom-cc.org/|untriaged
5f80513f|unparseable|HONG_KONG|https://www.epd.gov.hk/|untriaged
9849866b|unparseable|WENDELL|https://www.deq.idaho.gov/|untriaged
9b763886|unparseable|MARITIME|https://www.imo.org/en/ourwork/environme|untriaged
a07441f1|unparseable|RUSSIA|https://maritimecarbonintelligence.com/|untriaged
b1ec8dd3|unparseable|SAUDI_ARABIA|https://maritimecarbonintelligence.com/|untriaged
d383afe5|institutional|DUTCH PARLIAMENT|https://www.tweedekamer.nl/|untriaged
03b9aa4f|institutional|COUNCIL OF EUROPE|https://www.riksdagen.se/|untriaged
0ab6a75b|institutional|US_EPA_REGION_6|https://www.deq.louisiana.gov|untriaged
1cc2a393|non_geographic|SNAKE_BASIN|https://ndep.nv.gov|untriaged
2b41b96d|unparseable|WALLONIA|https://www.awac.be/|untriaged
4ca61d0c|unparseable|ÎLE-DE-FRANCE|https://www.iledefrance.fr/|untriaged
4defedcf|non_geographic|PERSIAN_GULF|https://www.joc.com/|untriaged
4e1eaaeb|institutional|DELAWARE DEPARTMENT OF NATURAL|https://dnrec.delaware.gov/|untriaged
58a28f22|unparseable|TRINIDAD AND TOBAGO|https://www.cepal.org/en/about|untriaged
5c185917|non_geographic|RED_SEA|https://www.joc.com/|untriaged
60e6eab5|non_geographic|HUMBOLDT_BASIN|https://ndep.nv.gov|untriaged
7d92ad90|non_geographic|CARSON_RIVER_WATERSHED|https://ndep.nv.gov|untriaged
8be398fa|unparseable|MIDDLE_EAST|https://www.joc.com/|untriaged
8bed7e14|unparseable|SAINT_VINCENT_AND_GRENADINES|https://sdgs.un.org/goals/goal13|untriaged
b00ce9cf|unparseable|REGIONAL SOUTHEAST ASIA|https://asean.org/wp-content/uploads/202|untriaged
eece70fc|non_geographic|LAKE_TAHOE_WATERSHED|https://ndep.nv.gov|untriaged
f1e05bcb|unparseable|URUGUAY|https://www.cepal.org/en/about|untriaged
1590f23f|unparseable|NATIONAL|https://flk.npc.gov.cn|untriaged
1c1315ff|unparseable|PANGNIRTUNG|https://assembly.nu.ca/|untriaged
20e4dfb5|institutional|EPA|https://www.ccjdigital.com|untriaged
2e6fc07d|unparseable|RGGI|https://icapcarbonaction.com/en/terms-us|untriaged
422ea3f5|below_granularity|MARIN COUNTY|https://oal.ca.gov|untriaged
48254aa1|unparseable|INLAND EMPIRE|https://oal.ca.gov|untriaged
512f5f49|non_geographic|SAN JOAQUIN VALLEY|https://oal.ca.gov|untriaged
551853a1|unparseable|SOUTHERN CALIFORNIA|https://oal.ca.gov|untriaged
57fea0ce|unparseable|ROTTERDAM|https://smartport.nl/en/|untriaged
7a608aba|unparseable|HANDAN|https://flk.npc.gov.cn|untriaged
83df0e4a|unparseable|SOUTH HOLLAND|https://smartport.nl/en/|untriaged
a79b2ba4|unparseable|MULTI_REGIONAL|https://iea.blob.core.windows.net/assets|untriaged
acb562b8|unparseable|HALIFAX CHEBUCTO|https://nslegislature.ca/|untriaged
ad4ba382|unparseable|DOT|https://www.ccjdigital.com|untriaged
af71524f|below_granularity|SUTTER COUNTY|https://oal.ca.gov|untriaged
af9d76d7|unparseable|KAZAKHSTAN|https://icapcarbonaction.com/en/terms-us|untriaged
e03551bb|unparseable|SAITAMA|https://icapcarbonaction.com/en/terms-us|untriaged
8d09354b|unparseable|INTERNATIONAL MARITIME ORGANIZ|https://futurefuels.imo.org/publication/|untriaged
149fafe4|unparseable|new_zealand|https://www.environmental-finance.com/|untriaged
```

### pending_jurisdiction_review (109 rows) — **F8 (dead-letter queue, part 2)** + **F9**
- CHECKs: flagged_reason (continent/region_bucket/undefined_group — data: 49/38/22), source_column
  ('jurisdictions' on all 109), resolution-consistency. FK→intelligence_items CASCADE DEFERRABLE. RLS
  platform-admin read/update. Admin UI + route exist (`PendingJurisdictionReviewView.tsx`,
  `api/admin/triage/pending-jurisdiction-review`).
- **ALL 109 unresolved** (resolved_at NULL on every row) since 2026-05-17/19 — same ~54-day zero-throughput
  pattern as ingest_rejections.
- **F9 (cosmetic vocab drift):** 106 legacy rows carry UPPERCASE current_value (`EUROPE`, `LATAM`); the 3
  post-phase5 rows (item `eb898f68`, flagged 2026-05-19 via the mint-item path) are lowercase
  (`africa`, `european_union`, `asia_pacific`) — two casing regimes in one review queue.
- Full dump (109 rows; id8|item8|current_value|reason):
```
031efd58|67c6e313|EUROPE|continent
06c5b370|5cc10a6d|EUROPEAN UNION MEMBER STATES|undefined_group
09ac69f9|68e05861|ASIA|continent
0a3d0350|3ae89ce6|EUROPEAN_UNION|undefined_group
0b46f3a3|6304a9f0|ASIA|continent
0d09dc50|947e08f3|IEA MEMBER STATES|undefined_group
11d1f76d|c8b7f538|EUROPE|continent
1235834b|b94cd283|EUROPE|continent
12b5279b|0a8b8ef0|AFRICA|continent
143a8b1c|2648d4ad|MULTI-JURISDICTIONAL|undefined_group
1544bbd5|ab362011|NORTH AMERICA|continent
157c1945|b680a0b8|LATAM|region_bucket
16006ca3|2b7bbd3a|EUROPE|continent
18851693|8d256568|EUROPE|continent
18e2ae6c|14fea5cd|ASIA|continent
1cdee1c6|bd9a1a6b|ASIA|continent
1f042e30|68af10b5|CARIBBEAN|region_bucket
20794712|0658844a|MEAF|region_bucket
2207c7dc|67c6e313|ASIA_PACIFIC|region_bucket
24ecceaf|0bbd757c|EUROPE|continent
2c122c8d|49bc4705|EUROPE|continent
2de4874f|7ff81425|NORTH AMERICA|continent
2e7eecdf|ad5b78ea|ASIA|continent
30d5df5c|538c2774|EUROPE|continent
32e0a3ed|c828810c|MIDDLE_EAST_NORTH_AFRICA|region_bucket
36882626|8d256568|MIDDLE EAST|region_bucket
37ab3b59|629c2d63|ASIA|continent
3b3b168d|8d256568|ASIA-PACIFIC|region_bucket
44d15df1|c828810c|EAST_ASIA_PACIFIC|region_bucket
44ef48d6|0554d47e|BALTIC_REGION|undefined_group
4c26a190|eb6641da|AFRICA|continent
4c81986b|b293a2b6|ASIA|continent
500ba017|0a8b8ef0|SOUTH_ASIA|region_bucket
50dd5a2e|629c2d63|AFRICA|continent
5210717c|053123bc|LATAM|region_bucket
534eb02b|fcf98c3d|ASIA|continent
54795b9f|09bdd3a0|IMO MEMBER STATES|undefined_group
5b114e5c|e5c30c9a|EUROPE|continent
5c79b3b0|0f70a032|NORTHEAST_REGION|undefined_group
5c9b6af0|319f785d|SMALL_ISLAND_DEVELOPING_STATES|undefined_group
5d7befcb|2648d4ad|DEVELOPING COUNTRIES|undefined_group
5fc49479|432a5042|SOUTHEAST ASIA|region_bucket
6068ca43|2d1aeda1|G7|undefined_group
61fa74d2|0a8b8ef0|EUROPE_CENTRAL_ASIA|region_bucket
63a77f67|935680f5|ASIA|continent
64fae60e|15cb3765|AMERICAS|region_bucket
6ad0f5a7|bd9a1a6b|LATIN AMERICA|region_bucket
6bf42d9e|de2df788|MULTI-STATE|undefined_group
71907844|eb6641da|EUROPE|continent
74ebf663|629c2d63|LATIN_AMERICA|region_bucket
7629f7d0|6d2ebbdb|ASIA|continent
77745749|49bc4705|LATIN AMERICA|region_bucket
7ad77f70|0a8b8ef0|MIDDLE_EAST_NORTH_AFRICA|region_bucket
7adde17b|0a8b8ef0|LATIN_AMERICA_CARIBBEAN|region_bucket
7c8368d3|0f93eb09|LATIN AMERICA|region_bucket
7d59b8bb|0f93eb09|CARIBBEAN|region_bucket
8384012b|f57d0f58|EUROPE|continent
84476eb7|bd6bc712|AFRICA|continent
889eef3a|8c0e4e5f|EASA_MEMBER_STATES|undefined_group
8dd95d9c|c4ad4cc5|ASIA|continent
8e8ca022|72be8dd3|LATAM|region_bucket
904bd70e|6627ef8b|NORTH AMERICA|continent
946772d0|27f22c4f|MIDDLE EAST|region_bucket
967695c6|6b55b53d|MULTI-JURISDICTIONAL|undefined_group
97dd00a5|cec7d711|ASIA|continent
992021a5|f3510df3|MIDDLE EAST|region_bucket
9a9ee0c8|bd9a1a6b|AFRICA|continent
9bbae256|4a108d70|ALL US STATES|undefined_group
a00fa8eb|7566f099|ASIA|continent
a37e4142|c828810c|AFRICA|continent
a4687939|49bc4705|AFRICA|continent
a634445e|f3510df3|EUROPE|continent
aa62c765|e9ed1215|ASIA|continent
ad787ffd|ed6c5c76|EUROPE|continent
ad7ee4cc|5fec12c6|MULTI-JURISDICTIONAL|undefined_group
af59fde8|538c2774|LATIN AMERICA|region_bucket
af886e01|88a2918c|NORTH_AMERICA|region_bucket
afd0f53c|8de055dc|LATAM|region_bucket
b2f9ef7a|10f26f54|ASIA|continent
b36fbc6b|ece93c54|OECD_MEMBER_STATES|undefined_group
b3a60313|538c2774|AFRICA|continent
b84e1667|629c2d63|EUROPE|continent
b8c7f0f3|7ff81425|MULTIPLE STATES|undefined_group
bcd7d975|ca6fa630|LATIN AMERICA|region_bucket
bd29c8dc|538c2774|ASIA|continent
bdf9bf64|319f785d|DEVELOPING_COUNTRIES|undefined_group
c1a12669|c828810c|EUROPE_CENTRAL_ASIA|region_bucket
c1a188ab|b0d9737e|MEAF|region_bucket
c480fd2f|b94cd283|ASIAN DEVELOPMENT BANK MEMBERS|undefined_group
c4f90ef6|49bc4705|ASIA|continent
c64d3067|68af10b5|LATIN AMERICA|region_bucket
cad871ff|c828810c|SOUTH_ASIA|region_bucket
d062f329|0a8b8ef0|EAST_ASIA_PACIFIC|region_bucket
d0adccde|0af6afdf|EUROPE|continent
d408bc57|66835398|ASIA|continent
d4df11e7|c828810c|LATIN_AMERICA_CARIBBEAN|region_bucket
d79f28ed|49bc4705|NORTH AMERICA|continent
da780d9a|62ba40b0|EU MEMBER STATES|undefined_group
dafd9373|3b026e42|EUROPE|continent
df87f74a|f3510df3|ASIA-PACIFIC|region_bucket
e16c7834|3e9c3ebe|LATAM|region_bucket
f5165659|6373df1e|LATAM|region_bucket
f823c4d0|d690c4ca|EUROPE|continent
f89935d1|ca6fa630|CARIBBEAN|region_bucket
f9959157|93c344a1|IMO_MEMBER_STATES|undefined_group
faa2e886|9333c734|EUROPE|continent
1ce970af|eb898f68|africa|continent
7c025df1|eb898f68|european_union|undefined_group
de526ec1|eb898f68|asia_pacific|region_bucket
```

### staged_updates (24 rows)
- CHECKs: update_type (6 vals; data all 'new_item'), status (data all 'approved'), confidence (data all
  'MEDIUM'; note UPPERCASE regime unlike lowercase vocab elsewhere). FKs to items/sources clean. RLS
  service_role INSERT/UPDATE only (no SELECT policy — admin UI reads via server client). Consumers wired:
  `api/staged-updates`, `api/admin/scan`, mint path, approval test.
- All 24 created 2026-04-05 (one AI-scan batch), approved same day by user 2b7d21eb. 23/24 carry
  `materialized_item_id`; **F15: 1 row `b631762e` is approved but has materialized_item_id NULL AND
  materialization_error NULL** — a silent non-materialization (the error-swallow class). *Next:* investigate
  b631762e (re-materialize or stamp an explicit error).
- Full dump (24 rows; id8|type|status|conf|item|source|created|reviewed_by-uuid|reviewed|batch|pc_len|brief_len|materialized8|error|reason60):
```
b898affc|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=733|brief_len=0|ef0c691a|-|AI scan: general global
24d352f8|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=662|brief_len=0|ff95b385|-|AI scan: general global
b631762e|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=614|brief_len=0|-|-|AI scan: general global   <-- F15
e044bf3e|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=650|brief_len=0|1cda60cd|-|AI scan: general global
1a28bcd2|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=644|brief_len=0|9090a7c2|-|AI scan: general global
a8cd7a71|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=639|brief_len=0|219945bb|-|AI scan: general global
77e63ad6|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=602|brief_len=0|d91f76f0|-|AI scan: general global
01283125|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=684|brief_len=0|5b2c6655|-|AI scan: general global
3c67f32d|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1420|brief_len=0|f0833999|-|AI scan: general global
ed6f4dcc|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1364|brief_len=0|3f45b2aa|-|AI scan: general global
9f35085c|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1432|brief_len=0|44906e93|-|AI scan: general global
8d2050af|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1426|brief_len=0|f436708f|-|AI scan: general global
290842a1|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1475|brief_len=0|9ffa15d6|-|AI scan: general global
bfec4de4|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1563|brief_len=0|9c5d1d17|-|AI scan: general global
4dd4f5a8|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1462|brief_len=0|64e9d38d|-|AI scan: general global
dcc516e3|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1550|brief_len=0|96d8a3c1|-|AI scan: general global
7c93efa8|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1581|brief_len=0|cfcf9e4c|-|AI scan: general global
811ed2e2|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1406|brief_len=0|96169446|-|AI scan: general global
583532e6|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1411|brief_len=0|ff4064ab|-|AI scan: general global
79d2466e|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1490|brief_len=0|3e756291|-|AI scan: general global
c6d89b6d|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1498|brief_len=0|3f7e1aed|-|AI scan: general global
c91010cf|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1514|brief_len=0|007104ed|-|AI scan: general global
ff6c3b94|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1485|brief_len=0|beae0a7e|-|AI scan: general global
fb4e3e45|new_item|approved|MEDIUM|-|-|2026-04-05|2b7d21eb|2026-04-05|-|pc_len=1539|brief_len=0|d2da85da|-|AI scan: general global
```

### admin_action_cooldowns (1 row) — full dump
```json
{"action_key": "admin_spot_check_recurring", "last_triggered_at": "2026-06-01T08:39:25.853+00:00",
 "triggered_by": null,
 "metadata": {"confirm_h": 16, "thresholds": {"AI_FREIGHT_H": 55, "AI_FREIGHT_M": 25, "AI_RELEVANCE_H": 75,
  "AI_RELEVANCE_M": 50}, "sample_size": 20, "should_be_l": 0, "should_be_m": 2, "unreachable": 2,
  "false_positive_rate_pct": 10}}
```
- PK action_key, FK triggered_by→auth.users SET NULL. RLS service-role-only. Consumer:
  `api/admin/spot-check/recurring` (4h cooldown per doctrine). Last spot-check ran 2026-06-01 (monthly cron
  disabled per doctrine — the ~6-week gap is consistent with the disabled cron, not a defect). Row healthy.

### Empty tables (3): ingest_rejections_pre_phase5 · intelligence_changes · portal_link_candidates
- All confirmed 0 rows. Full dump = empty set.
- `intelligence_changes`: wired (writers in `src/lib/sources/reconcile.ts`, reader in supabase-server metrics)
  but has never received a row — change detection has never fired (0 change_detected in monitoring_queue).
  Dormant-by-upstream, not orphaned.
- `portal_link_candidates`: new (mig 162, ledgered), writer wired (`api/worker/check-sources` upsert via
  `src/lib/sources/portal-links.mjs`); empty because the scrape hold has been on since before it landed.
  CHECK status candidate/promoted/rejected; UNIQUE(url); RLS enabled zero policies (service-only). Healthy-new.
- `ingest_rejections_pre_phase5`: empty backup shell — see F17 retention decision.

---

## Views (2)

- **active_intelligence_items** (mig 116): `security_invoker=on` ✓; definition = full column projection of
  intelligence_items `WHERE provenance_status='verified'` — the customer-gate view; currently **380 rows**.
  Matches doctrine (customer reads gate on verified).
- **item_related_items_derived** (mig 146): `security_invoker=on` ✓; `SELECT source_item_id, array_agg(DISTINCT
  target_item_id) FROM item_cross_references GROUP BY 1` — 37 rows. Derivation-only; consumers cross-checked by
  X-agent per manifest.

---

## Findings index (severity + next action)

| # | Severity | Finding | Next action |
|---|---|---|---|
| F1 | breaks-doctrine | 15 applied migrations (107–134 band) missing from schema_migrations ledger | batch ledger-repair in operator DDL window |
| F2 | breaks-doctrine | mig 099 on disk, never applied; DB fn is the 091 version | decision: apply or archive the file |
| F3 | breaks-doctrine | 47 open deferral flags expired 2026-07-02, never renewed (renewal pass covered only 40) | renew-or-execute pass over the 47 |
| F4 | dead-weight | deferral flag 409eae23 payload overwritten by erased_full_brief action, still open | adjudicate manually |
| F5 | dead-weight | ingestion_state + ingestion_control_log: zero src consumers, frozen 2026-05-10, state/log contradiction, 51 active sources uncovered | drop-or-rewire decision row |
| F6 | dead-weight | agent_runs.intelligence_item_version_id 0/1653 ever set; duration_ms 17/1653, no writers | drop columns or wire write site |
| F7 | dead-weight | monitoring_queue dormant: no future scheduled_check, item_id never set, change detection never fired | re-seed on scrape resume; note in runbook |
| F8 | breaks-doctrine | Both operator triage queues at zero throughput ~54 days: ingest_rejections 131/131 untriaged, PJR 109/109 unresolved (UIs exist) | triage session or batch rules |
| F9 | cosmetic | PJR current_value casing drift (UPPERCASE legacy vs lowercase mint-item rows) | normalize at writer |
| F10 | dead-weight | 62 integrity_flags reference deleted items (56 open, unactionable) | sweep-resolve "subject deleted" |
| F11 | cosmetic | integrity_flags CHECK has 7 categories; doctrine doc lists 6 (workflow_gap missing) | one-line doc fix |
| F12 | cosmetic | 254 resolved flags without resolved_by (95 also note-less) | ensure resolve route stamps identity |
| F13 | cosmetic | raw_fetches: 16 zero-byte http-202 rows stored as fetches; 67 duplicate-hash rows | filter on replay; no write needed |
| F14 | cosmetic | agent_runs.fetch_method uncontrolled 11-value vocab, mixed naming regimes | optional CHECK or leave as telemetry |
| F15 | dead-weight | staged_updates b631762e approved, unmaterialized, no error recorded (silent swallow class) | investigate/re-materialize or stamp error |
| F16 | info | system_state hold ON since 2026-05-18, cadence off — deliberate posture, verified wired fail-closed | none |
| F17 | dead-weight | 4 pre_phase5 backups frozen, constraint-free, read by nothing; rollback window effectively closed | KEEP-or-DELETE retention decision |
| F19 | cosmetic | monitoring_queue SELECT policy USING(true) — unscoped read exposure of telemetry | tighten if table stays |
| F20 | cosmetic | dup-numbered migration files (006 x2, 007 x3) + 7 never-existed numbers | note in migrations inventory |
| F21 | info | domain_backfill_audit is a healthy point-in-time snapshot; 43/212 proposals since re-reclassified | none |
| F22 | info | Cost ledger: $46.40 total; July $42.74; 12 July error-runs burned $8.70 | watch paid-then-failed rate |

---

## Manifest check-off: 18/18 tables + 2/2 views

agent_runs ✓(1,653) · integrity_flags ✓(1,385) · ingestion_state ✓(774) · ingestion_control_log ✓(709) ·
raw_fetches ✓(660) · intelligence_items_pre_phase5 ✓(655) · monitoring_queue ✓(580) ·
intelligence_items_domain_backfill_audit ✓(212) · ingest_rejections ✓(131) · pending_jurisdiction_review ✓(109) ·
pending_jurisdiction_review_pre_phase5 ✓(107) · staged_updates ✓(24) · item_supersessions_pre_phase5 ✓(5) ·
admin_action_cooldowns ✓(1) · system_state ✓(1) · ingest_rejections_pre_phase5 ✓(0) · intelligence_changes ✓(0) ·
portal_link_candidates ✓(0) — all row counts reconciled against manifest §B exactly.
Views: active_intelligence_items ✓ (380 rows, security_invoker) · item_related_items_derived ✓ (37 rows,
security_invoker).

**Tool-call count: 72** (48 SQL executes incl. 1 oversized-result retry, 7 Grep, 6 Bash, 3 Read, 1 Glob,
2 ToolSearch, 4 TodoWrite, 1 Write).

## Deviation log
1. First constraints query (information_schema.table_constraints join) returned an oversized result (52 KB);
   the saved overflow file was NOT read — the query was re-issued compactly via pg_constraint /
   pg_get_constraintdef, which is the evidence actually used.
2. Full dumps recorded pipe-delimited with key fields; bulk-text columns recorded as length (+left N where
   informative): staged_updates.proposed_changes → pc_len, full_brief → brief_len (all 0),
   ingest_rejections.raw_value → left30, integrity_flags.description → left(120–150) on dumped anomalies.
   This follows manifest deviation-5 (length+left80 rule), with left-width varied 30–150 where the shorter/longer
   cut was the informative one.
3. Tables >500 rows (agent_runs, integrity_flags, ingestion_state, ingestion_control_log, raw_fetches,
   intelligence_items_pre_phase5, monitoring_queue) audited via full-scan predicates + complete dumps of
   anomalous rows per manifest rule, not row-by-row dumps.
4. The 202 deferral payloads were validated mechanically in aggregate (jsonb key-presence + date predicates)
   rather than dumped row-by-row: they instantiate one of two class-reason templates; the single malformed row
   is dumped in full.
5. mig-128/132 applied-status was verified by matching live slot-description text to the migration files'
   UPDATE literals (data migrations leave no catalog object to probe).
6. RLS-vs-code check for the `reconciler` role is limited to policy existence + migration text (118/163);
   no code in src/ executes as reconciler (ops-side scripts only), so runtime behaviour was not exercised
   (read-only audit).
