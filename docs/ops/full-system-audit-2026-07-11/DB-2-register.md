# DB-2 Register — Sources & Identifiers (full-system audit 2026-07-11)

Agent: DB-2. Scope: sources (1197), provisional_sources (497), institutions (432),
canonical_source_candidates (364), source_bias_tags (2895), source_verifications (1414),
source_citations (696), source_trust_events (905), taxonomy_nodes (38), pending_first_fetch (36),
source_conflicts (0), source_tier_opinions (0); views open_conflicts, provisional_sources_review,
source_health_summary. Bonus light scan: intelligence_item_citations (947 — manifest §B assigns DB-2).

Method: READ-ONLY SQL via MCP execute_sql (SELECT / information_schema / pg_catalog only), code
cross-checks via Read/Grep against branch audit/full-system-2026-07-11 (baseline master 71bcbd4).
Zero writes, zero fetches, zero model-calling code. All row data below is quoted as untrusted data.

---

## 0. Count reconciliation (manifest §B)

| Table | Manifest | Live | Match |
|---|---|---|---|
| sources | 1,197 | 1,197 | YES |
| provisional_sources | 497 | 497 | YES |
| institutions | 432 | 432 | YES |
| canonical_source_candidates | 364 | 364 | YES |
| source_bias_tags | 2,895 | 2,895 | YES |
| source_verifications | 1,414 | 1,414 | YES |
| source_citations | 696 | 696 | YES |
| source_trust_events | 905 | 905 | YES |
| taxonomy_nodes | 38 | 38 | YES |
| pending_first_fetch | 36 | 36 | YES |
| source_conflicts | 0 | 0 | YES |
| source_tier_opinions | 0 | 0 | YES |
| intelligence_item_citations (bonus) | 947 | 947 | YES |
| view open_conflicts | — | 0 rows | scanned |
| view provisional_sources_review | — | 491 rows | scanned |
| view source_health_summary | — | 18 rows | scanned |

---

## SPECIAL DELIVERABLE (a) — The 8 duplicate registry URLs

`sources.url` has **no UNIQUE constraint** (verified: pg_constraint on sources has no unique on url).
1197 rows / 1189 distinct urls = exactly 8 duplicated urls, each duplicated once (8 pairs, 16 rows).

Query: `SELECT url FROM sources GROUP BY url HAVING count(*)>1` + per-row edge counts
(items = intelligence_items.source_id, prov = section_claim_provenance.source_id,
cits = intelligence_item_citations.source_id, bias = source_bias_tags rows).

| # | url | keep-candidate (active) | twin | twin status | edges on twin | merge next-action |
|---|---|---|---|---|---|---|
| 1 | https://breeam.com/ | ef347aa7 "BREEAM (BRE Global)" T4 active, 2 items, 6 bias — role `primary_legal_authority` (itself a mis-role: BREEAM is a standards body) | dcb667a7 "BRE Group" T4 | suspended | 1 prov claim, 1 item-cit, 6 bias | Re-point twin's prov-claim + item-cit source_id to ef347aa7, then archive/delete twin; fix keeper's source_role → standards_body |
| 2 | https://climate-laws.org/ | 7d939fc1 "Climate Change Laws of the World" T4 active, 2 items (role `statistical_data_agency`) | 410466f8 "Sabin Center Climate Laws Database" T4 (role `trade_press` — mis-role) | suspended | 3 prov claims, 1 item-cit | Re-point twin's 3 claims + 1 cit to 7d939fc1, archive twin |
| 3 | https://climatemachine.mit.edu/ | 622d0e55 "MIT Climate Machine" T3 active, 2 items, 4 prov claims, 4 cits | addc7d05 "MIT Climate Machine (MIT)" T3 | suspended | 1 item-cit | Re-point 1 cit, archive twin |
| 4 | https://csrf.ac.uk/ | 071dff9e "Centre for Sustainable Road Freight" T3 active, 3 items, 40 prov claims | c096820c same name (long form) T3 | suspended | 2 item-cits | Re-point 2 cits, archive twin |
| 5 | https://doee.dc.gov/ | 5f12cb79 "DC Department of Energy & Environment (DOEE)" T2 active, 1 item, 4 bias, effective_tier=2 | b2c71c2c "DC DOEE" T2 — **BOTH ACTIVE** (only pair with two live rows), effective_tier NULL, 0 bias, role `regulator` (vocab outlier) | active | 0 edges | Zero-edge twin: delete/suspend b2c71c2c outright; keep 5f12cb79. Note: 0b769b43 in provisional_sources ALSO holds this same url (triple representation) |
| 6 | https://flk.npc.gov.cn/ | dae165c8 "National Database of Laws and Regulations (China)" T1 active, 1 item | b4b04ad0 "General Office of the Standing Committee of the NPC…" T1 — **both active** | active | 1 item + 1 item-cit | Both carry an item each; pick canonical name (dae165c8, seed row), re-point b4b04ad0's item + cit, suspend twin |
| 7 | https://freightwaves.com/ | 111c637d "FreightWaves" T5 active, 2 items, 32 prov claims | de15227a "FreightWaves" T5 | suspended | 0 edges | Zero-edge suspended twin: safe delete/archive |
| 8 | https://splash247.com/ | b2588399 "Splash247" T6 active, 1 item | 295fba96 "Splash247" T6 | suspended | 3 prov claims | Re-point 3 claims to b2588399, archive twin |

Pattern: 6/8 twins were created 2026-04-28/29 (a discovery wave that re-registered seed-wave sources
under alternate names) and later suspended — suspension parked the duplicate without merging its edges,
so **9 section_claim_provenance rows + 9 intelligence_item_citations rows still point at suspended
duplicate rows** (customer-facing provenance resolving to a suspended source). Severity:
**breaks-doctrine (provenance quality) / dead-weight (rows)**. Class fix: normalized-URL unique
index (with canonical-URL normalization: strip trailing slash, lowercase host) + merge script that
re-points edges before any suspend/delete.

BEYOND URL-LEVEL — name-level duplicate found in passing: **five separate ACTIVE "EcoVadis" rows**
(4a956756 ecovadis.com/, a6b20a8a ecovadis.com/blog, 4fdb662c ecovadis.com/about-us, a2d25d50
resources.ecovadis.com/blog, 6f698bf0 resources.ecovadis.com/whitepapers/…) — all base_tier 6,
same institution ecovadis.com. Contradicts the Sprint-3 source-quality-sweep posture (EcoVadis-style
vendor marketing → archive + pause). URL-level dedup would never catch these; entity identity does.
Next-action: entity-level (institution_id) dedup pass + apply the sweep policy to the survivors.

---

## SPECIAL DELIVERABLE (b) — instrument_identifier state on intelligence_items

Totals: 653 items, **25 populated (3.8%)**, 628 NULL.

Format classes (all 25 enumerated):

| Class | Count | Values |
|---|---|---|
| Bare number `YYYY/N` (typed rows) | 13 | 2013/952, 2019/1242, 2022/2464, 2023/1542, 2023/1804, 2023/1805, 2023/2405, 2023/958, 2023/959, 2024/1610, 2024/1735, 2025/40 (itype eu_regulation/eu_directive) + 97/2019 (local_law, NYC LL97) |
| `CELEX:` prefixed | 5 | CELEX:32022L2464, CELEX:32023R0956, CELEX:32023R1805, CELEX:52021DC0550, CELEX:52023PC0445 (all itype NULL) |
| ELI relative path | 4 | eli/reg/2019/1242/oj, eli/reg/2023/1804/oj, eli/reg/2024/1610/oj, eli/reg/2025/40/oj (all itype NULL) |
| Ad-hoc slug / other | 3 | RIN 2060-AV50 (federal_rule), matrix-hudson-2br-lottery (market_signal), world-heritage-fjords-ZE-2026 (itype NULL) |

**Cross-format same-instrument twins (6 pairs)** — the same regulation exists as two item rows whose
identifiers cannot match string-wise:

| Instrument | Row A | Row B |
|---|---|---|
| CSRD 2022/2464 | 9c5d1d17 `2022/2464` (quarantined) | f0833999 `CELEX:32022L2464` (quarantined) |
| HDV CO2 2019/1242 | ab922a18 `2019/1242` (verified) | b7736a1a `eli/reg/2019/1242/oj` (quarantined) |
| AFIR 2023/1804 | ff95b385 `2023/1804` (quarantined) | 62ba40b0 `eli/reg/2023/1804/oj` (verified) |
| FuelEU 2023/1805 | 7a0ead55 `2023/1805` (quarantined) | e4d84c60 `CELEX:32023R1805` (quarantined) |
| HDV CO2 amend 2024/1610 | 3ae89ce6 `2024/1610` (quarantined) | 8c186db2 `eli/reg/2024/1610/oj` (quarantined) |
| PPWR 2025/40 | 5cc10a6d `2025/40` (verified) | efdb3390 `eli/reg/2025/40/oj` (verified) — **both verified: two live PPWR rows** |

This defeats identifier-keyed dedup (the "dedup before grounding — entity identity, not title" gate
has no canonical key to join on). Whether each pair is truly one item or item-vs-amendment is DB-1's
item-domain call; the identifier-normalization defect is DB-2's.

Deterministically derivable now: **3 items** have NULL instrument_identifier but a source_url
containing `celex` or `/eli/` (regex-derivable without any fetch). The remaining 625 NULLs are mostly
non-EU/non-legal items where no deterministic derivation exists from stored columns.

Next-action: pick ONE canonical form (recommend bare CELEX number, e.g. `32022L2464` — it is
derivable from both `CELEX:` and `eli/` forms), migrate the 25, backfill the 3 derivable, add a CHECK
or normalizing trigger, then run pairwise dedup on the 6 twins. Severity: **breaks-doctrine**
(dedup-before-grounding gate is unenforceable without it).

---

## SPECIAL DELIVERABLE (c) — tier / base_tier / effective_tier / tier_override (mig-094 lockstep)

- `tier IS DISTINCT FROM base_tier`: **0 rows** of 1197. CHECK `sources_tier_matches_base_tier`
  (`NOT (tier IS DISTINCT FROM base_tier)`) exists and `convalidated=true`. Trigger
  `sync_sources_tier_columns` (BEFORE INSERT OR UPDATE) mirrors whichever side changed. Lockstep HOLDS.
- `tier_override`: **0 rows** non-null (override channel never used; override_reason/override_date all NULL).
- `effective_tier`: NULL on **326** rows (of which **21 active**) — Q7 recompute has never stamped
  them; display readers fall back per `effective_tier ?? base_tier`, so cosmetic.
- `effective_tier <> base_tier`: **26 rows** (all enumerated in evidence pull): 18 active tier-6 news
  sources lifted to 3-5 (Air Cargo News→4, J.P. Morgan EotM→3, EcoVadis×5→5, Reuters→5, Lloyd's List→5,
  TradeWinds→5, etc.) and 8 provisional-status tier-5 associations lifted to 2-3 (WBCSD Pathfinder→2,
  Sea Cargo Charter→3, INTERTANKO→3, …).
- Moat check (code): `fsi-app/src/lib/sources/institution.ts` lines 54-66 — grounding stamp locked to
  `base_tier` ONLY (2026-06-28 hardening); effective_tier divergence is display-only. **Moat holds.**
- Residual observation: effective_tier 2-3 on PROVISIONAL-status sources is a display-signal oddity
  (a never-reviewed source advertising T2/T3 credibility on any surface that renders effective_tier).
  Severity: cosmetic now; worth a `status='active'` guard in the Q7 batch.
- `tier_at_creation <> base_tier` on 293 rows — expected history, no defect. All four tier CHECKs
  (1..7 ranges) validated.

---

## SPECIAL DELIVERABLE (d) — status / role / category vocabulary vs code

`sources.status` (CHECK: active|stale|inaccessible|provisional|suspended — matches TS `SourceStatus`):

| status | rows |
|---|---|
| active | 750 |
| provisional | 433 |
| suspended | 14 |
| stale / inaccessible | 0 / 0 — defined but never used |

`admin_only`: **all 1197 = false** → the code gate `status='active' AND admin_only=false`
(enforced in 6 files: `src/lib/supabase-server.ts`, `src/lib/sources/verification.ts`,
`src/lib/agent/source-pool.ts`, `src/lib/coverage-gaps.ts`, `src/app/api/admin/canonical-sources/decide/route.ts`,
`src/app/api/admin/sources/verify/route.ts`) currently reduces to the status test alone; the
admin_only leg is vacuous but harmless (dead-weight flag column until first admin-only source exists).

`source_role` — **NO CHECK constraint**; 13 distinct live values vs 10-value code enum
(`src/lib/sources/classify-source-role.ts` `SourceRole`):

| value | rows | in code enum? |
|---|---|---|
| primary_legal_authority | 518 | yes |
| (null) | 394 | — |
| intergovernmental_body | 97 | yes |
| industry_association | 44 | yes |
| statistical_data_agency | 39 | yes |
| academic_research | 35 | yes |
| trade_press | 30 | yes |
| standards_body | 19 | yes |
| vendor_corporate | 12 | yes |
| industry_data_provider | 3 | yes |
| government_press | 2 | yes |
| **government_data** | 2 | **NO** |
| **portal** | 1 | **NO** |
| **regulator** | 1 | **NO** (it's the DC DOEE duplicate row b2c71c2c) |

`category` (CHECK: regulatory|research|market_news|operational_data, validated): regulatory 564,
(null) 384, research 139, market_news 74, operational_data 36. Derived by trigger
`set_source_label_trg` → `derive_source_category(source_role, name)`; the 384 NULLs track the 394
null-role rows (mostly status=provisional). `intelligence_types` is derived from category by the same
trigger: DB vocab = regulation|research|market_intel|operational_data — the TS `IntelligenceType`
enum (`REG|STD|RES|MKT|IND|SUP|INN|PTN` in `src/types/source.ts`) matches NOTHING in the DB:
**the TS enum is dead/superseded** by the migration-123 label chain. 384 rows have `{}` types.

`update_frequency` — **no CHECK**; code contract (`src/types/source.ts`: daily|weekly|monthly|
quarterly|ad-hoc) vs live: weekly 1016, **varies 61**, ad-hoc 27, daily 26, **annual 22**,
**continuous 20**, monthly 13, quarterly 11, **business-daily 1** — 4 out-of-contract values, 104 rows.

`access_method` CHECK allows api|rss|html_scrape|scrape|gazette|manual; live uses scrape 552,
manual 400, rss 189, api 56 — `html_scrape` and `gazette` allowed-but-unused (constraint widened for
a vocab that never landed). `classification_confidence`: HIGH 414 / LOW 219 / MEDIUM 122 / null 442 —
uppercase, no CHECK (contrast canonical_source_candidates.confidence lowercase CHECKed — case-fractured
twin vocab across tables).

---

## 1. sources (1,197 rows, 85 columns)

Full per-column profile executed (jsonb_each over all 85 columns; non-null / null / empty /
distinct / min / max recorded — evidence in audit transcript). Key structure: PK id; FKs
institution_id→institutions (SET NULL), spotchecked_by→auth.users; 13 CHECKs all validated;
RLS: read `true` (public SELECT), write service_role-only. Triggers: set_source_label_trg,
sources_recompute_accuracy (accuracy_rate & accessibility_rate derived BEFORE UPDATE of the four
count columns — matches code assumption that these are computed, not written),
sources_sync_tier_columns, sources_updated_at, trg_sources_enqueue_first_fetch_insert/_update
(function verified: gates on active + not paused + auto_run_enabled + no existing items; UPDATE arm
requires a real auto_run_enabled flip; ON CONFLICT DO NOTHING — fail-safe, matches drain worker design).

**All-NULL columns (15)** — dead-column candidates:
api_auth_method, api_endpoint_url, api_response_format, cited_by, classification_observed_distribution,
fetch_status, fetch_status_at, last_content_changed_at, last_observed_at, last_substantive_change,
override_date, override_reason, spotchecked_at, spotchecked_by, tier_override.
Notable: the api_* trio + fetch_status pair are wired in CHECKs but never written (built, never fired);
`last_substantive_change` is load-bearing in the TS demotion-trigger spec (stale detection) yet has
never been written — the stale-status machinery cannot ever fire (consistent with status 'stale' = 0).

**Single-value columns (14)** — dead-weight/dormant:
admin_only (all false), avg_lead_time_days (0), conflict_count (0), conflict_total (0),
lead_time_samples (0), observed_correctness_count (0), reliability_score (0.00), secondary_roles ([]),
self_citation_count (0), spotchecked (false), tier_history ([]), trust_score_accuracy (20.0),
trust_score_timeliness (10.0), trust_score_reliability (10.0).
Trust-score decomposition: of the four components only trust_score_citation varies (30 distinct,
0-9.9); accuracy/timeliness/reliability are frozen at their defaults corpus-wide; accuracy_rate has
2 distinct values (0.5 default, 1.0). The accuracy-40% / timeliness-20% / reliability-20% doctrine
is implemented but starved — no conflicts, no lead-time samples, checks on only 206 sources.

Near-dead: last_content_hash / last_content_fetched_at (8 rows), api_endpoint (28),
highest_citing_tier (247), last_accessible (159), last_checked/next_scheduled_check (206),
last_scanned (190), vertical_tags (10 non-empty), topic_tags (302 non-empty), secondary_roles (0).

Dual-write legacy: `jurisdictions` (20-value legacy vocab: global 275, us-federal 225, eu 129, …)
still populated alongside `jurisdiction_iso` (141 ISO values); migration-033's "60-day window"
(April) is long past — retirement decision owed. 480 rows have empty jurisdiction_iso.

Registry hygiene: **7 active rows named "source" / "generate pool source"** (e0338de0, 269ab027,
97a22037, 9bc659b3, 8d2cd2d6, 08b65477 = "source", e6303ec4 = "generate pool source"; all T2, all
active) — stub names from the generate-pool seed path (two pending_first_fetch error rows record the
same stub-seed failure shape). Also provisional rows named by bare domain (lw.com, ups.com, pwc.com…)
— acceptable for provisional, not for active.

Unreachability: 433 provisional-status rows are correctly invisible to every customer/pipeline path
(all gates verified in code). 183 sources have ZERO references from any edge table (no items, no
claims, no item-citations, no source-citations) — **92 of them active**: registered but never used
by anything (candidates for coverage work or pruning). 167 provisional-status + 4 suspended sources
DO carry section_claim_provenance claims — see Findings F7.

## 2. provisional_sources (497 rows) — full dump taken

Full compact dump (all 497 rows: id8|status|via|rec_tier|url48|name30) captured in audit transcript
(3 chunks, ordered by created_at; row-set reproducible via
`SELECT … ORDER BY created_at, id`). Statuses: pending_review 489, confirmed 6, needs_more_data 2
('rejected' allowed, never used). discovered_via: worker_search 396, manual_add 90,
citation_detection 11 — **DB CHECK includes 'manual_add' but the TS `ProvisionalSource` type
(src/types/source.ts) lists only 3 values** (vocab drift, minor).

Dead columns: domain (all NULL), promoted_to_source_id (all NULL). Dormant machinery: citation_count
all =1, independent_citers max 1 (11 rows via citation_detection have the only citing chains — all
citing_source_ids array members verified to exist in sources: 0 orphans), accessibility_verified /
publishes_structured_content / entity_identified all false (the three assessment booleans have never
been set on any row). recommended_tier 376 non-null (1/2/4 only), recommended_classification 407.
reviewed_at on 8 rows only (2026-05-06, one review session ever).

Defects: (i) **6 status='confirmed' rows with promoted_to_source_id NULL** — confirmation never
completed the promote leg (b3d0118b EPA Clean Transportation, f763a37a METI GX, 3af5f538 MEE,
f94f522d METI, 99babef4 MPA, 1f3fc668 MOCCAE); several of these entities appear ALSO in sources
via other rows — promotion state is ambiguous. (ii) **28 pending_review rows whose url already
exists verbatim in sources** (e.g. 0b769b43 doee.dc.gov) — review-queue noise violating
dedup-before-generation; verification.ts's duplicate check evidently ran before those sources
existed or matched on a different normalization. Next-action: sweep queue against sources.url
(normalized) and auto-resolve.

FKs (cited_by_source_id, promoted_to_source_id → sources) validated; unique(url) present.
RLS: SELECT open (via view usage pattern), INSERT/UPDATE service-role.

## 3. institutions (432 rows) — full dump taken

Full dump (all 432 rows: id8|registrable_domain|name40) captured in audit transcript (2 chunks,
ordered by registrable_domain). Columns: id, name, registrable_domain (UNIQUE, validated), created_at
— no NULLs, no dead columns. FK integrity: 0 orphan institutions (every row referenced by ≥1
sources.institution_id — 432 distinct institution_ids over 722 sources). 475 sources have NULL
institution_id (29 active); 2,024 section_claim_provenance rows sit on institution-less sources
(resolver returns NULL→unregistered for their hosts — consistent with fail-closed design, but that
volume quantifies the registration backlog).

**RLS defect-shape: RLS enabled, ZERO policies** — anon/authenticated get empty reads; only
service_role sees rows. Every current consumer is server-side service-role so nothing breaks today,
but any future client-side read fails silently (the PostgREST-silent-failure class). Same shape on
source_bias_tags and source_tier_opinions.

**eTLD+1 keying collisions (breaks-doctrine risk):**
- `amazonaws.com` → institution "Smart Freight Centre" (via source 5aa6c2c0, the GLEC v3 PDF on S3).
  ANY future span on any *.amazonaws.com host resolves to Smart Freight Centre T4.
- `windows.net` → "International Energy Agency (IEA)" (source 77d910f4, iea.blob.core.windows.net PDF) — same class, T3.
- `service.gov.uk` → one institution row but 5 sources spanning THREE distinct UK entities
  (DESNZ/BEIS, DfT ×3, Companies House) — identity collision inside one gov platform domain (all T2,
  so tier-harmless today, but identity-wrong).
Next-action: shared-host treatment in the institution resolver (public-suffix-plus list for
s3.amazonaws.com, blob.core.windows.net, assets.publishing.service.gov.uk, etc.); re-key the 3 rows.

## 4. canonical_source_candidates (364 rows) — full dump taken

Full compact dump (all 364 rows: id8|item8|issue|decision|verified|http|url44) captured in audit
transcript (2 chunks, ordered by created_at). All created in ONE wave 2026-04-28 21:39–22:21;
reviewed 2026-04-29 by a single reviewer (2b7d21eb) — reviewer_id single-valued.
decision × reviewed cross-tab: approved/reviewed 300, rejected/reviewed 34, **pending/unreviewed 30**
('deferred' never used). issue_classification: only stale_url + missing_link used (missing_source,
thin_match defined, never used). verified=false on 62 with excerpt NULL; verified_status_code
distinct 7 (200/202/307/401/403/404/500; 10 NULL).

Defects: (i) **30 pending rows frozen since 2026-04-28** — queue never drained (9 of them also
reviewed_at NULL + recommended_classification NULL on 27). (ii) **10 approved rows with
promoted_to_source_id NULL** — approve leg completed, promote leg didn't (same half-finished-promotion
class as provisional_sources). 290 promoted (274 distinct targets), 0 promoted-without-approval
(good). FKs (item CASCADE, current/promoted source SET NULL) validated. RLS: admin-role read/write
policies via org_memberships (owner/admin) — consistent with admin-only surface.

## 5. source_bias_tags (2,895 rows)

Per-column profile: no NULLs anywhere except confidence (0 nulls — all scored 0.65–0.95, 14 distinct).
dimension: funding/methodology/stakeholder only (CHECK-conformant); tag: 22 distinct, all inside the
22-value CHECKed vocabulary (`source_bias_tags_vocabulary_chk` — full three-dimension whitelist,
validated). unique(source_id,dimension,tag) present. FK CASCADE to sources validated, 0 orphans.
assignment_source: haiku_auto_high_confidence 2,511 / haiku_proposed_low_confidence 384 —
**operator_confirmed and operator_set never used**: the operator leg of the six-element credibility
model has never fired; 384 proposed-low-confidence tags have sat unconfirmed since 2026-05-19/20
(assigned_at spans just those two days — one batch run ever).
Coverage: 776 distinct sources tagged; **49 active sources have zero bias tags** (customer-facing
credibility signal gap on those). RLS: enabled, ZERO policies (service-role only; same silent-read
class as institutions). Next-action: tag the 49 active stragglers; surface the 384 proposed tags in
an operator review queue or expire them.

## 6. source_verifications (1,414 rows; >500 so predicate-scan, no dump)

One burst: created_at spans 2026-05-04 20:30–21:23 (single B-wave run, never re-run).
action_taken: rejected 928, queued-provisional 381, auto-approved 105 (CHECK-conformant).
rejection_reason (no CHECK): reachability 420, duplicate 357, domain_unknown 234, ai_relevance_low 146,
language_non_english 80, ai_call_failed 16, not_freight_relevant 1, NULL 160. Cross-checks:
**2 rejected rows have NULL rejection_reason** (silent rejection — minor); 1,254 reasons > 928
rejections because queued-provisional rows also carry reasons (ok by design but worth knowing).
resulting_source_id 105 = exactly the auto-approved count; resulting_provisional_id 381 = exactly the
queued count (0 dangling, FKs SET NULL validated). ai_* trio null on 793 (H-tier fast-rejects that
never reached the AI call — consistent with verification_tier H/M/L design). jurisdiction_iso 118
distinct. RLS: public SELECT, no insert policy (service-role writes). Dead columns: none.

## 7. source_citations (696 rows)

citing 376 distinct → cited 226 distinct; unique(citing,cited) enforced; both FKs CASCADE validated.
**0 self-citations.** `context` single-valued: every row = 'brief-citation' (dead column — carries no
information). detected_at spans 2026-06-05..06-21 (grow-step era). This is the aggregateConvergence
input (source-level corroboration, deliberately sealed from claim confidence per doctrine — no drift
observed: institution.ts stamps base_tier only). RLS: public read, service-role insert.

## 8. source_trust_events (905 rows)

event_type live: accessibility_check 585, manual_review 293, discovery 24, tier_demotion 3 —
**only 4 of the 14 CHECK-allowed types ever fired** (confirmation, conflict_opened/resolved,
citation_received, tier_promotion, stale_flag, paywall_change, self_citation, tier_override,
tier_override_revert: zero each — matches the dormant trust machinery in §1). created_by:
system/worker/human (CHECK-conformant); reviewer_id TEXT (not uuid FK — schema-type mismatch vs
canonical_source_candidates.reviewer_id uuid; cosmetic), single value (2b7d21eb…) on 273 rows.
details jsonb never empty. FK CASCADE validated. RLS: public read, service-role insert.
Immutable-audit-trail contract: no UPDATE/DELETE policy exists for non-service roles — holds.

## 9. taxonomy_nodes (38 rows) — full dump taken

Full dump (38 rows: id8|node_type|slug|path|sort|label) in audit transcript §evidence — 13 industry,
8 regulation, 7 technology, 5 region, 5 transport_mode ('topic' type allowed, never used).
description ALL NULL, parent_id ALL NULL (hierarchy expressed only via ltree path), created_at
single-valued (seeded 2026-04-05, untouched since). slug unique validated; self-FK parent unused.
**ZERO consumers in fsi-app/src/** (grep: no file references taxonomy_nodes); only FK consumer is
vendor_technologies (0 rows, retired vendors surface); one measurement script mentions it.
Verdict: **dead weight** — a seeded taxonomy nothing reads. Next-action: retire or wire; do not
extend until a consumer exists.

## 10. pending_first_fetch (36 rows) — full dump taken

Full dump (36 rows: id8|status|attempts|last_attempt|error42|source_name38) in audit transcript.
status: done 19, queued 9, skipped 5, error 3 ('fetching' allowed, never observed at rest — correct
for a transient state). Partial-unique on (source_id) WHERE status NOT IN (done,skipped) — trigger
pairs verified (§1). Cross-checks: 0 queued rows whose source already has items; 0 queued rows
currently ineligible (all 9 queued are active+auto_run+unpaused — queue is honest); errors: 1
fetch_quality (Environmental Finance), 2 stub-seed failures ("new row for relation intelligence_items…"
— the same events that left the junk-named sources in §1). skipped rows record Cloudflare/rate-limit
interstitials with reasons — no silent truncation. 9 queued rows await the drain worker
(`/api/worker/drain-first-fetch` exists). last_error_text doubles as a NOTES field on done rows
("entity-gate: portal…") — overloaded semantics, cosmetic.

## 11. source_conflicts (0 rows) + 12. source_tier_opinions (0 rows)

Both empty (manifest-consistent; <500 rule satisfied trivially — nothing to dump). Schema + CHECKs +
FKs all in place and validated; source_conflicts matches the TS SourceConflict contract 1:1.
Conflict machinery has NEVER fired (consistent with conflict_count=0 corpus-wide and open_conflicts
view = 0 rows). source_tier_opinions: RLS enabled with ZERO policies (third instance of that shape);
opinion_source CHECK (haiku_brief_classifier|haiku_verification|operator_review) — built for the
tier-opinion loop that hasn't started. Dead-weight-until-wired; keep (both are contract surfaces for
built code paths: conflicts in trust.ts, opinions in recommend-source-tier.ts).

## 13. intelligence_item_citations (947 rows — bonus light scan)

origin: sources_used_backfill 737, agent_extraction 210 ('manual' allowed, unused). 185 distinct
items × 382 distinct sources; unique(item,source,origin) enforced; both FKs CASCADE validated.
Profile clean (no NULLs). 9 rows point at suspended duplicate sources (see deliverable a).

## 14. Views (3)

All three are `security_invoker=on` (mig-157 class posture holds — no definer bypass).
- **open_conflicts**: 0 rows (joins conflicts→sources→items, status='open'). No app consumer found.
- **provisional_sources_review**: 491 rows (= 489 pending_review + 2 needs_more_data; arithmetic
  verified). Joins cited_by name/tier. No app consumer found in src/ (admin routes query the base
  table directly).
- **source_health_summary**: 18 rows (base_tier × status grouping over 1197 — sums verified against
  §1 status counts). Referenced only in a COMMENT in SourceHealthDashboard.tsx (line 26); the
  component computes its own aggregates.
Verdict: all three views currently have **zero live consumers** (one payload-measure script touches
them) — dead-weight candidates, or the intended admin read-path that the dashboard never adopted.

---

## Findings register (severity + next-action)

| # | Finding | Severity | Next-action |
|---|---|---|---|
| F1 | 8 duplicate-URL pairs; 6 parked-by-suspension with 9 claims + 9 item-cits still pointing at suspended twins; DC DOEE pair both active; no unique constraint on sources.url | breaks-doctrine (provenance points at suspended dupes) | Merge script per pair table in deliverable (a); then normalized-URL unique index |
| F2 | EcoVadis: 5 active same-entity rows (name/institution-level dup, URL dedup blind) | dead-weight + sweep-policy contradiction | Entity-level dedup keyed on institution_id; apply Sprint-3 sweep policy |
| F3 | instrument_identifier: 25/653 populated across 4 incompatible formats; 6 cross-format same-instrument item pairs (incl. two VERIFIED PPWR rows); 3 rows derivable from source_url | breaks-doctrine (dedup gate has no canonical key) | Canonicalize to bare CELEX; backfill derivables; CHECK/trigger; adjudicate 6 twins with DB-1 |
| F4 | 167 provisional-status + 4 suspended sources carry section_claim_provenance claims | needs adjudication (doctrine: grounding-eligibility is base_tier per-claim, so possibly by-design; but "never process provisional" reads otherwise) | Rule on whether claim-citation == processing; if yes, re-home or re-ground those claims |
| F5 | institutions keyed on eTLD+1 collide on shared hosts: amazonaws.com→SFC T4, windows.net→IEA T3, service.gov.uk→3 entities | breaks-doctrine risk (wrong-tier stamp channel for any future cloud-hosted span) | Shared-host suffix list in resolver; re-key 3 institutions |
| F6 | sources: 15 all-NULL + 14 single-value columns; trust-score accuracy/timeliness/reliability frozen at defaults; last_substantive_change never written so stale-demotion can never fire | dead-weight (columns) / breaks-doctrine (stale trigger inert) | Column-retirement list for mig planning; wire last_substantive_change or drop the stale trigger from the spec |
| F7 | Vocab drift: source_role 3 out-of-enum values (no CHECK); update_frequency 4 out-of-contract values ×104 rows (no CHECK); TS IntelligenceType enum dead vs DB label chain; classification_confidence case-fractured vs csc.confidence; TS ProvisionalSource.discovered_via missing manual_add | dead-weight/cosmetic (no consumer breaks found) | Add CHECKs to source_role + update_frequency; delete/replace dead TS enums; align confidence case |
| F8 | provisional_sources: 28 pending rows whose URL already in sources; 6 confirmed-never-promoted; assessment booleans + domain + promoted_to all dead | dead-weight (queue noise) | Dedup sweep vs sources.url; finish or revert the 6 confirmations |
| F9 | canonical_source_candidates: 30 pending frozen since 2026-04-28; 10 approved-never-promoted | dead-weight (stalled queue) | Drain or expire the 30; complete/annul the 10 promote legs |
| F10 | RLS enabled with zero policies on institutions, source_bias_tags, source_tier_opinions → client reads silently empty | cosmetic today (all consumers service-role) | Add explicit read policies or a comment-of-intent; guards against the PostgREST-silent-fail class |
| F11 | source_bias_tags: operator assignment legs never used; 384 low-confidence proposals unreviewed since 2026-05-20; 49 active sources untagged | dead-weight / signal gap | Operator review queue or expiry for proposals; tag the 49 |
| F12 | 3 views have zero app consumers; SourceHealthDashboard re-aggregates in TS | dead-weight | Wire dashboard to source_health_summary or drop views |
| F13 | taxonomy_nodes: 38 seeded rows, no consumer anywhere, description/parent all NULL | dead-weight | Retire or wire; freeze until consumer exists |
| F14 | 7 active T2 sources named "source"/"generate pool source" (stub-seed leftovers); 2 pff error rows record the failed stub inserts | data_quality | Rename from institution/URL via classifier backfill; fix stub-seed path |
| F15 | 92 active sources with zero references from any edge table | dead-weight / coverage signal | Feed the coverage/first-fetch lane or prune |
| F16 | source_citations.context single-valued; ste.reviewer_id TEXT not uuid; pff.last_error_text doubles as notes | cosmetic | Batch into next schema-hygiene migration |
| F17 | jurisdictions legacy column still live alongside jurisdiction_iso; mig-033 dual-write window long expired | dead-weight | Retirement decision + consumer sweep |
| F18 | admin_only=false everywhere → gate leg vacuous | cosmetic (by design until first admin-only source) | None; note for gate tests |
| F19 | trust machinery events: only 4/14 event types ever emitted; conflicts table empty since inception | dead-weight (dormant, matches doctrine that promotion needs data) | None now; revisit when conflict detection ships |

---

## Manifest check-off

**12/12 tables + 3/3 views scanned (row counts reconciled against manifest §B — all exact matches);
plus intelligence_item_citations (947, §B DB-2 row) light-scanned.**
Full dumps taken for all <500-row tables: provisional_sources (497), institutions (432),
canonical_source_candidates (364), taxonomy_nodes (38), pending_first_fetch (36), source_conflicts (0),
source_tier_opinions (0) — compact pipe-delimited form, bulk text as left-N truncations.

**Tool-call count: 52** (38 SQL execute_sql calls, 1 ToolSearch, 4 Read, 9 Grep) + 1 register Write.

## Deviation log

1. intelligence_item_citations (947) appears in manifest §B under DB-2 but not in the dispatch's
   12-table list — resolved by light scan (profile, constraints, origin counts, suspended-dup edge
   check), not full-depth treatment; >500 rows so no dump owed either way.
2. Dump rule: dumps are compact key-column lines (id8 + discriminating columns), with long text
   recorded as left-30..left-48 truncations plus per-column distinct/min/max in the profiles, rather
   than literal `length + left(…,80)` per bulk cell — chosen to keep 1,367 dump rows inside register
   and tool-output limits; every row is enumerated and reproducible via the stated ORDER BY.
3. source_verifications (1,414 rows > 500): predicate scans + cross-tabs only, per the manifest's
   large-table rule; all anomalous rows quantified (2 rejected-no-reason).
4. Rows-unreachable-by-UI/RPC assessed by code grep (consumer inventory), not by driving the UI —
   READ-ONLY/zero-fetch constraint.
5. Per-column min/max recorded as text-lexicographic (jsonb_each ::text) rather than native-type
   min/max — sufficient for range sanity, noted for numeric columns.
