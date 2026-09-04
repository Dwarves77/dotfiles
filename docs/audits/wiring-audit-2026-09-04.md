# Wiring audit — 2026-09-04 (everything built since 2026-08-21: PRs #474–#583)

**Operator's question, verbatim:** "are all of our site tools built and wired? I want an audit of everything
built in the last two weeks to see if it is being used and wired and fits within the flywheel loop."

**Method.** Six read-only Sonnet lanes over the 107 PRs, each with a disjoint scope and its own evidence
file in `wiring-audit-2026-09-04/`: A1 runtimes (17 workflows, every dispatchable step), A2 customer
surfaces, B1 modules (252 added, import graph + the repo's own execution-wiring resolver), B2 data layer
(36 migrations, live schema, row counts), C1 the loop map, C2 rulings/ADRs/specs vs implementation.
Every verdict cites a file:line, a harness-run artifact, a commit, or a read-only SQL result; the
coordinator re-verified the claims marked below. Live counts are 2026-09-04 ~15:00 UTC.

## The answer in one paragraph

Built: yes, almost everything in the window exists as tested code. Wired: mostly, with the exceptions
listed. Used: the corpus-growth half of the flywheel is closed and running — mint, connection discovery,
forward events and tag adoption happen inside one population-turn run with no human in the path, and the
result is on the customer pages within minutes (1,101 record-grade verified items live, 20,401 connection
edges, 1,149 forward events, 538 auto-adopted derivations). The intake half in front of mint is not
running: source-sweep fills `portal_link_candidates` (1,837 waiting) but `ledger-consume` has never run and
cannot apply, so nothing new enters the census except what the coordinator hand-feeds; `corpus_turn_requests`
has 1,709 open tickets and no consumer wired. The decision-propagation half (spec 08's actual subject) is
fully built and nearly inert: the trigger has emitted 2,754 events, the derivation DAG has 6 hand-seeded
rows, the drain has run twice over those same 6, and no writer extends the DAG when new data lands. Every
cross-workflow handoff is a coordinator dispatch, by design under rule 16; two of them can be replaced by
`workflow_run` chaining without a schedule. And the customer surfaces are slow: measured today, every route
is fully dynamic (0.5–2.0 s server render, 857 KB HTML on /regulations), an item click waits 4.25 s for its
payload, and /regulations throws a React hydration mismatch that re-renders the page client-side (5.3 s to
usable). That is the single most customer-visible defect in this audit and lane PERF-8 is on it.

## Verdicts by loop stage

| Stage | Component | Verdict | Evidence (live unless noted) |
|---|---|---|---|
| A1 source sweep | walkers register-eurlex / federal-register / feed / research / sitemap (`run-source-sweep.mjs`, `sitemap-walk.mjs`) | WIRED+USED, dispatch-only | 12 source-sweep artifacts; sitemap: 1 host walked of 2,563 sources, 383 candidates, 189 sources with `rss_feed_url`; snapshot baseline in Storage, no per-source coverage columns (lane SITEMAP-3 in flight) |
| A1→A2 | `deliver-artifact-branch.sh` (PR refused by repo setting) | manual handoff | artifact branches land only via coordinator trains; **correction to A1**: of the 19 `population/*`, `source-sweep/*`, `propagation/*`, `turn/*` branches still on origin, all artifacts are already on master except `source-sweep-run-012` (folded in train37); the rest are dead branches, deleted in the same landing |
| A2 ledger consume | `run-ledger-consume.mjs`, `portal-harvest.ts`, `first-fetch-classify.ts` | BUILT, WIRED, **NEVER RUN**, apply hard-off | `LEDGER_CONSUME_APPLY_ENABLED=false` (source constant) and `ANTHROPIC_API_KEY` not in `WORKFLOW_SECRETS`; 1,837 candidates waiting; the four `scripts/review/apply-*.mjs` ratification scripts have no caller at all |
| A2 corpus turn requests | `corpus_turn_requests` (mig 277), `consume-turn-requests.mjs` | BUILT-NOT-WIRED | 1,709 open / 0 consumed; the consumer has no caller; the family has no run artifact |
| A3 census → mint | `export-census-rows.mjs`, `run-mint-batch.mjs`, `apply-mint-batch.mjs`, THE GATE (`--check-gate`), `rows_file` | WIRED+USED | population applies #34–#39 today: 1+120+103+89+104+5 minted verified at $0; `would_mint` 3,461, `hold` 1,425, `invariant_reject` 16,717 |
| A4/A5 flywheel | discovery, forward events, recluster, obligations, tags/signals/classifications (ADR-025 auto-adopt) | WIRED+USED, automatic inside one run | 20,401 edges, 1,149 forward events, 21 themes / 9 theme briefs, 538 `auto-adopted:*` flags |
| A5 tag ratification | `tag-proposals` → `tag-ratification` | WIRED, backlogged | 1,123 open `flywheel-tag:` flags vs 143 resolved (the non-deterministic remainder after auto-adopt) |
| A6 maintenance | 20 maintenance steps | WIRED+USED (16), BUILT-NOT-WIRED (`review-digests`: wrapped script does not exist; `census-off-vertical` archive path: no schema column, ruling R-A open), NEVER DISPATCHED (`community-topics-seed`, correctly, see Community) | 44 Maintenance runs today; 4 steps undocumented in the runbook (`apply-classifications`, `seed-benchmark-instruments`, `spec09-reroute`, `institution-canonicalize`) |
| A6 provenance heal | `heal-provenance.mjs` STEP SOURCE, brief-honest, Gate-A scanner (single source since #580) | WIRED+USED | **correction to A1** ("0 healed"): apply #42 healed 3 of 86, grounded 30 tokens, 443 figures on 76 items absent from every cited page: $0 paths exhausted, the browser+Haiku source-finding path is the next build |
| Surfaces | Regulations bands/IMMEDIATE-first/empty states, forward-events strip, connections card, record-grade badge, credibility chips, series board, Research pipeline/coverage, Operations matrix | WIRED+USED | all read live tables with rows; `published_price_statistics` 4 rows by design until R-D (ratified today on train37; refresh dispatch next) |
| Surfaces | spec-09 panels (grid queues, DQI, auxiliary energy, EUDR custody, OEM roadmap, rerouting, surcharge audit) | WIRED, honest-empty | 8 of 10 tables 0 rows by documented $0-sourcing gaps (`scripts/spec09/SOURCES.md`); 2 tables have no reader |
| Surfaces | speed | **DEFECT** | measured in Chrome today: all routes `private, no-store`, x-vercel-cache MISS; /regulations 857 KB, DCL 5.3 s, React #418 hydration mismatch; item click RSC 4.25 s; five post-render API calls 0.6–3.4 s each. Lane PERF-8 |
| Community | 7 regional rooms; member profiles, benchmarks, corporate-email verification, entity-thread discovery | WIRED, unused | 7 `community_groups`, 0 topics, 0 posts, 0 member profiles, 0 benchmark responses: no users yet. Live state already matches today's ruling (regions exist, no topic rooms) |
| Community | `community-topics-seed` (7 fixed topics) | BUILT, NEVER DISPATCHED, **contradicts today's ruling**, and structurally cannot make shared rooms (topics are per-user under RLS) | retire, do not leave dormant |
| A7 change detection | `run-change-detection.mjs`, `reconcile.ts`, `monitoring_queue` | WIRED, dispatch-only | 580 queue rows, 0 change-detected-unreconciled; schedules commented out (rule 16) |
| B decision propagation | outbox trigger (mig 284), `derivation_edges`, `drain.ts`, `admissible-for.ts`, `statutory_computations`, `estimated_values`, `/api/notices` | BUILT, WIRED, **INERT** | 2,754 events / 2,748 pending; DAG 6 rows seeded once (2026-09-02); drain ran twice on those 6; `statutory_computations`/`estimated_values` 0 rows; no code writes `derivation_edges` when producers land data; `/api/notices` always empty |
| Harness layer | 9 families, `governing-files.mjs` (one table since #583), `run-artifact.mjs`, F28 | WIRED+USED | every family's computed hash equals its marker as of train36 |
| Discipline | F25 module liveness | scoped too narrowly | governs `src/**` and `scripts/lib/**` only: ~180 of the 252 added modules have no liveness gate; 66 modules whose only importer is a test; 19 modules with dead exports (B1 appendices) |
| Data layer | 36 migrations | applied except 299 (deliberate operator gate) and 304 (SITEMAP-3, pending) | `schema_migrations` ledger lacks rows for 270–275 (applied, verified by DDL); `assumption_register` 0 rows, 0 references; `publish_aggregate()` 0 callers; `backfill-lineage-edges.mjs` never executed |
| Schedules | `trust-recompute.yml` (monthly), `uptime-probes.yml` (daily spend watch) | live crons, pre-window | no recorded rule-16 exemption; every loop workflow has its schedule commented out |

## Ranked gaps (deduplicated across the six sections)

1. **Speed on every customer surface** (measured; PERF-8 in flight: hydration mismatch, 857 KB document, dynamic-everything caching, serial item render, five post-render calls, plus a fitness function so it cannot regress).
2. **Intake is open in front of mint.** `ledger-consume` never ran (hard-off constant + missing secret); the four review/apply ratification scripts are unwired; `corpus_turn_requests` has no consumer. Nothing new reaches the census without the coordinator. The $0 path the operator ruled today: Haiku lanes in session classify the 1,837 candidates with the runtime's exact prompt, a dispositions file the runtime consumes with the API call bypassed; then `workflow_run` chaining source-sweep → ledger-consume → population-turn (event-triggered, not a schedule).
3. **Decision propagation is inert.** No DAG authorship at write time; 2,748 pending events drain to nothing; the statutory/estimate layer has no writer. This is spec 08's own subject and it has not produced one customer notice.
4. **Grounding residue**: 443 figures on 76 quarantined items with no source on any cited page. $0 build: browser+Haiku source-finding lanes feeding a new `attach-found-sources` maintenance step through STEP SOURCE (rule 18: find, rate, publish).
5. **Community**: the dormant topic seeder contradicts today's ruling and must be retired; the sector-seeding half of spec 05 §5 was never built; the product question (user-started rooms on a regional spine, what Discord/Reddit/Slack Connect/Circle do) is open for the operator.
6. **Discipline blind spot**: F25 does not watch `scripts/**`; 66 test-only modules and 19 dead-export modules accumulated in two weeks.
7. **Dead weight to remove**: 18 landed runtime branches on origin; `assumption_register` (seed it or drop it); `publish_aggregate()`; `review-digests` wrapper for a script that does not exist; stale `producers.yml` comment.
8. **Runbook gaps**: 4 undocumented maintenance steps; `schema_migrations` ledger rows for 270–275.
9. **Surface asymmetries** for an operator ruling: AiPromptBar on 2 of 4 detail surfaces, RecordGradeBadge on 3 of 4 (Operations excluded), credibility chips Research-only.
10. **Two live crons** (`trust-recompute`, `uptime-probes`) with no recorded rule-16 exemption: ruling needed, keep or disarm.

## Open operator decisions (deduplicated; each with what it blocks)

| Decision | Blocks |
|---|---|
| Ledger-consume flip (`LEDGER_CONSUME_APPLY_ENABLED`), now $0 via session Haiku | 1,837 candidates → census |
| Standards-body tier override (`institution-canonicalize` Part C: ifrs.org, cdp.net, sciencebasedtargets.org rated T5 by the host class table against T4 for their own text; `ruling_needed`) | part of the 443-figure grounding residue; rule 18 on those hosts |
| Grounding residue path: browser+Haiku source-finding (build) vs stay quarantined | 76 items off customer surfaces |
| Migration 299 (3-slot kit backfill for 149 pre-kit items) | kit consistency old vs new items |
| R-A (1,655 off-vertical census rows: archive or park), R-B (10 ambiguous records), R-E (`origin_class` backfill: 1,222 of 2,766 items null) | census hygiene, origin-class completeness |
| Community structure (user-started rooms on the regional spine) and retiring the topic seeder | Community build direction |
| Surface asymmetries (AiPromptBar, RecordGradeBadge on Operations, credibility chips beyond Research) | consistency |
| Two live crons: exempt or disarm | rule 16 |
| Brief-honest strip | refused on evidence (ps 46); listed for the record only |

## Corrections to the section files (coordinator, after re-verification)

- A1 §6 "24 stranded branches": 19 exist on origin; all their artifacts are on master except `source-sweep-run-012`; landed by train37, branches deleted in the same landing.
- A1 gap 4 "provenance-heal 0 healed": stale runbook figure; apply #42 healed 3 of 86 and grounded 30 tokens.
- A1 gap 5 "1,101 record items match the hollow pattern": regex over-match; live, 6 of 1,101 record-verified items have zero FACT claims, 575 have one or two.
- C2 §3 audit test post: `community_posts` is 0 rows live; the deletion is unrecorded in the log and is noted here as a memory gap, not assumed.

## Build plan derived from this audit (in the operator's priority order)

1. PERF-8 (in flight): the six measured causes, re-measured live after deploy, fitness-gated.
2. Intake at $0: session-Haiku classification + runtime bypass for ledger-consume; `consume-turn-requests` wired to a runtime step; `workflow_run` chaining A1→A2→A3 (no schedule). Needs the flip.
3. Grounding at $0: `attach-found-sources` step + browser/Haiku source-finding lanes over the 443 figures; standards-body tier ruling applied.
4. Propagation: DAG authorship on producer/mint write paths; first live `statutory_computations` row (FuelEU Annex IV per spec 08's worked example); drain chained off the outbox.
5. Community: retire the topic seeder now (one commit, cites the ruling); design note with the comparison for the operator's ruling; build after.
6. Discipline: extend F25 to `scripts/**` (allowlist the deliberate one-shots), delete the 66 test-only orphans or wire them, remove the 19 dead exports; delete the 18 dead branches; seed or drop `assumption_register`; runbook and migration-ledger gaps.
7. SITEMAP-3 (in flight): all-hosts backfill with per-source coverage columns, migration 304 applied after landing, then repeated dispatches until every active host is walked.
8. Population continues at 200 per slice throughout; artifacts fold per train with one proposer pass per family.
