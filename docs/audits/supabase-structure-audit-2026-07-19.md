# Supabase Structure Audit + Pipeline Built-vs-Missing Map (2026-07-19)

**Why this exists.** Before building the scrape-and-build-content capability, look at the existing structure
in great detail (operator directive, after repeated check-first failures this session that produced dead
code, PR #351/#352). This is the RD-9 producer-consumer discipline applied to the WHOLE schema plus the
pipeline code: every table classified from live row counts + mechanical writer/reader enumeration across the
entire codebase, and the real built-vs-missing state of the enumeration/intake/ground path. Deletes are
PROPOSED, not applied. No build follows until the plan grounded in this is approved.

**Method.** (1) Exact live row count for every public base table (dynamic count, not the unreliable pg_class
estimate). (2) Mechanical writer/reader map: for each table, every `.from("t").insert/upsert/update/delete`
(+ guarded-layer + raw SQL `INSERT/UPDATE/DELETE`) = writer; every `.from("t").select` / SQL `FROM`/`JOIN`/
`REFERENCES` = reader, across `src` + `scripts` + `supabase/migrations` (tests and `_snapshots` excluded).
(3) Content inspection for tables with data but no code reference. Grep flags are signals; each classification
below is a judgment on the evidence, and the two genuinely-uncertain ones are labeled as such, not guessed.

---

## 1. Table classification (every public table)

### LIVE-CORE — written and read on the product/pipeline path (KEEP)
`intelligence_items` (434), `section_claim_provenance` (9973), `intelligence_item_sections` (3252),
`intelligence_item_versions` (1374, append-only history), `intelligence_item_citations` (1085),
`agent_run_searches` (2864, the working pool + the criterion-3 evidence store — this is the store the
reverted F3 work duplicated), `agent_runs` (2701), `sources` (1214), `institutions` (432, tier SSOT, written
by `source-institution-backfill.mjs` via raw INSERT, read by `institution.ts`), `source_trust_events` (905),
`source_citations` (701), `source_bias_tags` (2871), `source_verifications` (1414), `provisional_sources`
(497), `canonical_source_candidates` (331), `holdings_quality` (729), `raw_fetches` (678, the permanent
per-source snapshot store — the durable content store that already existed), `monitoring_queue` (527),
`corpus_census` (650), `item_timelines` (1182), `item_cross_references` (48), `item_type_required_slots`
(48, the required-slots reference the validator reads), `claim_versions` (56, append-only), `staged_updates`
(30, intake transit), `ingest_rejections` (130), `pending_jurisdiction_review` (107), `drain_worklist` (56,
the quarantine drain lane), `regional_data_facts` (55), `region_dimension_coverage` (30), `state_cost_facts`
(13), `published_price_statistics` (4), `item_supersessions` (11), `item_changelog` (9), `item_disputes` (7),
`integrity_flags` (1589), `system_state` (1), `error_events` (3), `admin_action_cooldowns` (1),
`workspace_item_overrides` (1), `workspace_settings` (1), `profiles` (1), `org_memberships` (1),
`organizations` (1), `community_groups` (7), `community_posts` (1), `community_group_members` (1),
`taxonomy_nodes` (38, reference data), `regions` (5, reference data), `funded_pass_runlock` (0, the run-lock
primitive, empty at rest), `mutation_leases` (0, lease primitive, empty at rest).

### AUDIT-SINK — write-only by design, legitimate append-only terminal (KEEP)
- `disposition_ledger` (196) — tombstone record for deleted items (written by tombstone-delete). Terminal by design.
- `system_state_flag_audit` (6) — audit of pause-flag writes (RD-23). Terminal by design.
- `bulk_imports` (0) — audit of bulk-import runs. Terminal by design.

### PENDING-CONSUMER — written, consumer NOT built yet; these ARE the scrape-and-build gaps (KEEP + wire)
- `portal_link_candidates` (0) — the P2-5 portal deep-link discovery ledger. Writer = check-sources
  (`extractPortalLinks`, dormant); **no reader** consumes it into intake. This is the enumeration→intake seam
  the build needs, not dead.
- `coverage_gap_candidates` (98) — Session C's census of missing instruments. Written, awaiting a priced
  intake wave to read it. Not dead — the sizing feedstock.
- `intelligence_changes` (0) — the change-detection loop's flag store. Writer = reconcile; read only by the
  dashboard digest; **no re-ground consumer** (the F2 gap). Not dead — the change-to-analysis seam.

### PRE-ADOPTION-WIRED — code writes AND reads them, but no data yet (KEEP; single-tenant pre-launch)
`notifications` (0), `notification_preferences` (0), `notification_events` (0), `notification_deliveries`
(0), `notification_subscriptions` (0), `moderation_reports` (0), `community_group_invitations` (0),
`community_post_signoff_requests` (0), `community_topics` (0), `community_topic_groups` (0), `org_invitations`
(0), `org_member_bans` (0), `org_watchlist` (0), `user_watchlist` (0), `post_promotions` (0), `case_studies`
(6, submitted), `case_study_endorsements` (0). These are community/notification features wired for the
multi-tenant expansion; empty because the platform is single-tenant pre-launch. NOT dead. (A few, e.g.
`notification_deliveries`/`_subscriptions`, showed 0 app readers in the map and are the weakest of this set —
flagged for a lighter look, but they are wired feature scaffolding, not orphans, so they are NOT drop
candidates here.)

### SHELVED-KEEP — deliberately retained despite zero live use (doctrine says keep)
- `intelligence_summaries` (2085, 6.9 MB) — the archived multi-sector-synopsis model. **CLAUDE.md is explicit:
  "DO NOT delete the existing intelligence_summaries rows. Decision was SHELVE not RETIRE."** Not a drop
  candidate; flag for the operator only if they want to reverse that ruling.
- `sector_contexts` (15) — the sector-synopsis reference data for the same shelved model. Same posture.

### BACKUP / ONE-SHOT — safe drop candidates (PROPOSED below, NOT applied)
- `intelligence_items_pre_phase5` (655) — pre-migration snapshot (has MORE rows than the live 434 = a
  before-cleanup copy). Zero code refs.
- `pending_jurisdiction_review_pre_phase5` (107) — pre-migration snapshot. Zero code refs.
- `item_supersessions_pre_phase5` (5) — pre-migration snapshot. Zero code refs.
- `ingest_rejections_pre_phase5` (0) — pre-migration snapshot, empty. Zero code refs.
- `institution_regroup_snapshot_20260712` (66) — dated one-time backup from the 2026-07-12 institution
  regroup. Referenced only by the migration that created it.
- `intelligence_items_domain_backfill_audit` (212) — one-shot audit table from migration 101 (domain
  backfill), long completed. Write+SQL-read-only, no live consumer.

### ORPHAN — data but NO code (needs a ruling, NOT a silent drop)
- `hold_resolution_queue` (39: floor 28 / quarantine_next_action 9 / hold_to_find 2, all `queued`) —
  **zero code references anywhere**, yet 39 items are queued as held. It overlaps conceptually with the live
  `drain_worklist` (56) and looks like a superseded predecessor whose driver script was removed. Because the
  39 rows track REAL held items, this needs an operator ruling: confirm it is superseded by `drain_worklist`
  (then drop), or re-wire a consumer. Not classified as a clean drop.

---

## 2. Delete proposals (PROPOSED — nothing applied)

**SAFE-DROP set** (backups / one-shot audits; zero code refs; live equivalents are the active tables):
`intelligence_items_pre_phase5`, `pending_jurisdiction_review_pre_phase5`, `item_supersessions_pre_phase5`,
`ingest_rejections_pre_phase5`, `institution_regroup_snapshot_20260712`, `intelligence_items_domain_backfill_audit`.

An authored (not applied) tombstone-then-delete migration for this set lives at
`supabase/migrations/_proposed/219_drop_backup_snapshot_tables.sql.proposed` — each DROP is content-gated
(a row count is logged first) and the file is `.proposed` so CI does not treat it as an applied migration.
Total reclaimed: ~1045 rows across 6 backup tables. Reversible only from the migrations that created them
(they are backups; the live data is untouched).

**NEEDS A RULING before any drop:** `hold_resolution_queue` (39 orphaned held-item rows — superseded by
`drain_worklist`, or re-wire?).

**Explicitly NOT proposed for drop:** the SHELVED-KEEP set (doctrine), the PENDING-CONSUMER set (the build
wires them), the AUDIT-SINK set (terminal by design), the PRE-ADOPTION-WIRED set (feature scaffolding).

---

## 3. Pipeline built-vs-missing map (the scrape-and-build-content path)

The whole point: scrape sources, build content. Here is what already exists for that, read from the code,
so the build plan reuses instead of rebuilding (the discipline I broke this session).

| Capability | Built? | Where | Gap |
|---|---|---|---|
| Portal deep-link enumeration | **BUILT** (pure, tested; RUNS — proven: EUR-Lex 43 / MPA 22 / u.ae 2 real counts) | `portal-links.mjs` `extractPortalLinks`, wired in check-sources → `portal_link_candidates` | ledger has **no consumer** into intake |
| Register-API routing | BUILT | `apiEndpointFor` (federalregister/ecfr) | no multi-page **index walk** to a full document set |
| Identifier → URL derivation | BUILT (pure, tested) | `identifier-variants.mjs` (`euCandidates`/`discoverCandidateUrls`), `seek-more.mjs` (`generateCandidates`) | per-item, not source-sweep |
| Feed listing (RSS) | **MISSING** | (rss-fetch purged P-5) | needs a feed transport behind `assertFetchAllowed` |
| Discovered-doc classification | BUILT | `haikuVerifyCandidate`, `verification-decision.mjs`, `recommend-source-tier` | (needs the live key, which exists) |
| Intake chokepoint (+ dryRun) | BUILT (hardened this session, Phase R) | `run-intake-cycle` → `applyStagedUpdate` → `mintIntelligenceItem` | — |
| Grounding pipeline | BUILT | `canonical-pipeline.ts` (generate→section→ground→grow) | — |
| Durable source content | **ALREADY EXISTS** | `agent_run_searches` (per-item, SQL-queryable, 21 MB) + `raw_fetches` (permanent per-source snapshot) | (this is what the reverted F3 wrongly duplicated) |
| Change-to-analysis | writer BUILT, consumer MISSING | check-sources → reconcile → `intelligence_changes` | no re-ground consumer (F2) |

**The genuinely missing pieces for scrape-and-build (narrow):** (1) the `portal_link_candidates` → intake
consumer, (2) a register-API index walk, (3) a feed transport, (4) the `intelligence_changes` re-ground
consumer. Everything downstream (classify, mint, ground, the durable content stores) already exists.

**Correction on record:** API keys exist and the pipeline has run (631 agent_runs with a model, `raw_fetches`
678 rows). The earlier "no keys / walled" claim was wrong — it checked the local shell, not where the app
runs. The paid pipeline runs in the keyed/deployed environment.

---

## 4. Code traces: dead / unwired / unfinished code behind the table anomalies

Each anomalous table traced back into the code, then judged against PLATFORM INTENT (the ratified
five-surface model + ADR-015 source-monitoring operating design + Community-as-core) — because dead or
unwired does NOT mean purposeless. Verdicts: FINISH (meaningful, complete it), KEEP-DORMANT (meaningful,
wake later), RULING (ambiguous), DROP (abandoned).

| Table anomaly | Code trace | Intent judgment | Verdict |
|---|---|---|---|
| `portal_link_candidates` 0 rows | Writer IS wired (`check-sources` route:115-117 calls `extractPortalLinks` → upsert) but its ONLY invoker is the `source-monitoring.yml` cron — **disabled_manually** (the spend freeze). So the writer is live code behind a frozen trigger, and the intake consumer was never built (the half-slice). | Source-monitoring IS the operating design (ADR-015, founding text). This is the discovery layer's core seam. | **FINISH** — the consumer is build-plan item 1; the cron re-arm is the ADR-015 checklist at its gate. |
| `intelligence_changes` 0 rows | Writer exists (`worker/reconcile` route), invoked by the same frozen cron; reader = dashboard digest only; the re-ground consumer never built (Step 1 F2). | Change-to-analysis is the product's monitoring half. | **FINISH** — build-plan item (Phase 2 in the approved plan). |
| `hold_resolution_queue` 39 rows, 0 code refs | **Created by NO committed migration** — the table exists in prod but no `supabase/migrations/*.sql` defines it: out-of-repo DDL (the out-of-repo boundary class). Its 39 queued rows (28 floor / 9 quarantine-next-action / 2 hold-to-find) overlap the live `drain_worklist` (56). Looks like a superseded predecessor whose driver was created and removed outside the repo. | Held-item tracking is meaningful, but the LIVE home for it is `drain_worklist` + integrity_flags. Two parallel queues violate one-home. | **RULING** — confirm superseded → migrate any still-relevant rows into `drain_worklist`, then drop; plus record the out-of-repo-DDL finding. |
| `notification_events` / `_deliveries` / `_subscriptions` 0 rows, no app writers | Created by migrations 007/032 (community/notification layer); the delivery/event writers were never built — reader scaffolding exists. Unfinished half-slice. | Community is a CORE co-equal surface (platform-intent, operator-corrected); notifications are its expansion scaffolding, empty because single-tenant pre-launch. | **KEEP-DORMANT** — finish with the Community/multi-tenant wave, not now, not dropped. |
| `pending_first_fetch` 92 rows | READ live by `mint-item.ts` (+ scripts). The population was re-homed to the cadence-flip wiring unit per doctrine. | Part of the intake re-home; consumed at cadence flip. | **KEEP-DORMANT** — consumed by the re-arm. |
| `source_tier_opinions` 0 rows | Writer EXISTS (`admin/sources/tier-opinions` route + scripts) — the Q3 tier-opinion capture is BUILT, just no opinions recorded yet. My earlier "no app reader" flag was the grep missing the route. | Q3 of the credibility model (tier-opinion preservation) — designed, built, awaiting data. | **KEEP** — wired, not dead. |
| `taxonomy_nodes` 38 / `community_topics` 0, "no writer" | Seeded BY migrations (031/007) — writer = the migration, reader = the app. The healthy seeded-reference pattern, not an orphan. | Reference data for Community topics + taxonomy. | **KEEP** — correctly classified as reference. |
| `case_studies` 6 / `case_study_endorsements` 0 | Community-layer feature (migration 007 era); 6 submitted rows; write path exists in SQL, app surface thin. | Community is core; case studies are a Community content type awaiting the rebuild wave. | **KEEP-DORMANT** — Community wave. |
| `briefings` 0 rows | Early-era table (mig 007 family); superseded by `intelligence_items.full_brief` as the brief home; zero app writers/readers. | The intent (briefs) is served by the live `full_brief` path — this is the abandoned predecessor. | **RULING → likely DROP** — propose alongside the backup set. |
| `intelligence_summaries` 2085 / `sector_contexts` 15 | Archived multi-sector-synopsis model; view still renders from `full_brief`. | Explicit doctrine: SHELVE not RETIRE (sector activation is a roadmap feature). | **KEEP-DORMANT** — doctrine-bound. |
| `disposition_ledger` / `system_state_flag_audit` / `bulk_imports` write-only | By design: append-only audit terminals (RD-9 allowlist class). | Audit trails ARE their purpose. | **KEEP** — legitimate sinks. |

**Dead-code finding from the traces (code side):** none of the traced writers is dead code to delete — the
pattern everywhere is *live code behind a frozen trigger* (the disabled source-monitoring cron) or a
*missing second half* (consumers never built). The one true predecessor-superseded candidate on the code
side is whatever out-of-repo driver fed `hold_resolution_queue` (already gone). The system's dormancy is
concentrated in the FROZEN CRON + four missing consumers, exactly matching ADR-015's restoration framing —
not in rotting modules.

## 5. What this feeds into the build plan (next, on approval)

- **Reuse, do not rebuild:** enumeration (`extractPortalLinks` + `portal_link_candidates`), classification,
  the intake chokepoint, the grounding pipeline, and the existing durable content stores (`agent_run_searches`,
  `raw_fetches`). The build is the four narrow seams above, not a new pipeline and not a new content store.
- **Clean up first:** the SAFE-DROP backups + a ruling on `hold_resolution_queue`, so the schema the build
  targets is not cluttered with dead tables.
- **The build plan** (separate, next) sequences: cleanup → wire the enumeration→intake consumer →
  register/feed enumeration → the change-to-analysis consumer, each reusing the built machinery, costed,
  operator-gated.

*This is the structure audit. No table was dropped, no code was built. The build plan grounded in it comes
next, for operator approval before anything executes.*
