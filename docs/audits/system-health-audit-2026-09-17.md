# System health audit, 2026-09-17: duplicated code, unreferenced database objects, files

Operator rulings that triggered this audit (2026-09-17, verbatim gist): "This isn't just about EUR-Lex. It's about recurring doubling of work and code." "Why is a human the one that caught this?" "Wire or remove the dead code audit. If I sell this product to a top development team and they look at everything we built, will you be embarrassed by the amount of dead, unwired, duplicate or non-functioning code?"

Every number below is [CONFIRMED] by the named measurement on master `ed2ee7c9` unless marked otherwise. Every finding carries one of three dispositions: **remove**, **wire**, or **keep** with a written reason. "Candidate" is not a disposition; a row still marked decision is owed a decision in the lane that takes it.

## 1. Why nothing caught it

The repository carries 44 fitness functions, three consistency checks, an invariant meta-gate, a producer-consumer orphan check and a module-liveness check. Each was built after one incident, for that incident. No standing number ever said how much code is duplicated, how many database objects nothing references, or how many routes have a second home. The two-homes rule lived only in prose (the remediation-discipline skill, the lane contract, coordinator memory), and prose binds an agent in the moment and nothing else. The EUR-Lex case is the proof: the census exporter carried a Cellar route from 2026-09-02, the capture step rebuilt it on 2026-09-13, and a coordinator lane rebuilt it again on 2026-09-17, each time without searching.

The fix is structural, not another reminder: three standing numbers with both-ways ratchet gates (the count may only fall, and an improvement must re-seed the ceiling in the same commit), reported at every session close.

## 2. Duplicated code

Measurement: a dependency-free clone scan (`fsi-app/.discipline/fitness/functions/F45-duplicate-code.mjs`, windows of 8 normalized lines, comments, blanks and import lines dropped) over `fsi-app/src` and `fsi-app/scripts`, excluding tests and proofs, fixtures, `_archive`, `scripts/harness-runs` (run records, similar by design), `scripts/_snapshots` (data) and generated `.d.ts`. Cross-checked against an independent tool (jscpd 4, min 8 lines / 60 tokens) on the same scope: 381 clone blocks, 7,716 duplicated lines across 236 files; the in-repo scan reads 8,061 duplicated normalized lines across 970 files in 372 clone pairs. The in-repo number is the ratchet (F45, ceiling 8,061).

By directory (jscpd, code only): `src/app` 3,502 lines, `src/components` 2,790, `scripts/maintenance` 558, `scripts/spec09` 179, `scripts/producers` 135, `src/stores` 108, `src/lib` 88, `scripts/connections` 77, `scripts/turns` 60, `scripts/review` 55. By extension: tsx 4,056, ts 2,369, mjs 1,291.

The clone families (files that share clone blocks with each other), each one extraction:

| Family | Files | Disposition |
|---|---|---|
| Admin API routes sharing the same guard-and-respond boilerplate (`src/app/api/admin/**/route.ts`) | 26 | DONE, lane L31: `requireAdminRoute` in `src/lib/api/route-guard.ts` (auth, rate limit, service client, platform-admin gate, one 403 shape); 35 admin routes and the admin-gated agent-run and coverage routes moved onto it; four private `requireAdminRole` copies deleted; F2 accepts the guard |
| Community API routes (`src/app/api/community/**/route.ts`) | 22 | DONE, lane L31: `requireCommunityRoute` (cookie auth + rate limit); 39 community, invitation and org routes moved onto it |
| Workspace and user-state routes (`src/app/api/workspace/**`, `watchlist`, `user/list-order`) | 10 | DONE, lane L31: `requireUserRoute`; 16 routes moved onto it (the timed bootstrap auth composes the guard inside its timer) |
| Community page shells (`src/app/community/{benchmarks,profile,directory,discover,moderation,[slug],browse}/page.tsx`) | 7 | wire: one `CommunityPageShell` component; the largest single clone pairs in the tree (96, 89, 89, 86 shared windows) |
| Identical `loading.tsx` pages across the surfaces | 8 | wire: one shared loading component |
| Detail surfaces (`MarketSignalDetailSurface`, `ResearchFindingDetailSurface`, `RegulationDetailSurface`, `OperationsDetailSurface`, `SourcesGrid`) | 5 | wire: shared detail primitives; the 107-line block shared by Market and Research is the first cut |
| Admin views (`IngestRejectionsView`, `TierOpinionDisagreementsView`, `PendingJurisdictionReviewView`, `SourceAdminControls`, ...) | 10 | wire: one admin table view primitive |
| Maintenance and classification scripts sharing one read-plan-write scaffold (`propose-classifications`, `ratify-flag-to-census`, `generate-theme-brief`, `apply-tags`, `canonical-key-dedup`, `record-hollow-sweep`, ...) | 9 | wire: the scaffold already exists as `scripts/maintenance/lib/cli.mjs` (`runCli`); the scripts that do not use it move onto it |
| Two recommend-classification routes (`canonical-sources` and `sources`) sharing 85 windows | 2 | wire: one handler, two thin routes |
| `src/lib/supabase-server.ts` repeating its own RPC-paging block (66 windows within the file); `api/admin/corpus-turn-requests` carrying its own `readAllValues` pager with a comment saying a route cannot import a scripts module (it can import `src/lib/db/paginate.mjs`, which already exists) | 2 | wire: `fetchAllRows` in `src/lib/db/paginate.mjs` is the one paging helper; both move onto it |

Admitted mirrors: 77 comments in source say a constant or helper was copied rather than imported. Some are legitimate client-bundle boundaries (a browser component cannot import a Node-only module) and say so; each will be listed with keep-or-wire in the removal lanes. The JS mirrors of SQL functions (`url-canon`, `source-blocks`, `effective-confidence`, `aggregate-safeguards`, `canonical-key`) are deliberate and drift-tested; they stay.

External hosts with more than one home (63 hosts appear in code; 14 in more than one module): the EUR-Lex CELEX text URL was built in four modules (now one, `scripts/lib/eurlex-cellar.mjs`, lanes L28 and L28b); the Federal Register API base in five (`api-transport`, `transport-escalation`, `register-walk`, `identifier-variants`, `export-census-rows`); eCFR in three; legislation.gov.uk in two; the Eurostat API base in two producers; the Anthropic messages endpoint in two; the weekly oil bulletin URL in four. Data tables that cite URLs (`source-licence.mjs`, `intake-url-corpus.mjs`, `url-canon.mjs` examples) are references, not routes. Disposition: wire, one route module per host under `src/lib/sources`, every other file imports it; F45 catches a new copy.

## 3. Database objects

Measurement: exact `count(*)` per table (the planner's row estimates were reset by the compute resize and read zero for populated tables; an estimate is never reported as a count), `pg_proc`, `pg_trigger`, `pg_policy`, `pg_views`, and a reference scan of every table and function name across non-test code, `.github`, and the migration tree.

Public schema: 121 tables, 1,561 columns, 95 application functions (204 including the ltree and pg_trgm extension functions), 6 views, 42 triggers, 218 row-level-security policies, 481 MB.

Functions: 65 referenced from code, 18 referenced only from SQL (triggers, callees, policies), 12 flagged by the code scan as unreferenced, all 12 bound to triggers in `pg_trigger`. **No dead functions.**

Tables: 39 hold zero rows. 36 of those are referenced by code (unbuilt or idle features: community posts and moderation, notifications, user state, OEM roadmaps, custody chains, EUDR plot claims, statutory computations, aggregate query log); they are not dead but they are unfinished, and each belongs to a surface that must either ship or be cut. 13 tables have no code reference at all:

| Table | Rows | Live through the database? | Disposition |
|---|---|---|---|
| `_snapshot_gapflags_20260831` | 3 | nothing references it; it had no migration either (live-only, RD-49's class) | DONE (L32): dropped by migration 325, applied 2026-09-17 after the live check (3 rows, 0 triggers, 0 foreign keys in, 0 policies) |
| `drain_worklist` | 66 | nothing references it | DONE (L32): dropped by migration 324, applied 2026-09-17. [CORRECTED] the first draft said migrations 219 and 254 retired it; they retired other tables in its favour. The drop rests on the live verification instead: 0 triggers, 0 foreign keys in, 0 code references, 0 SQL references beyond its DDL; its reader, the drain-first-fetch worker, was dissolved 2026-07-12 |
| `intelligence_summaries` | 2,040 | policies only (captured undeclared in migration 009) | KEEP [CORRECTED, same day]: "remove after a read-back" contradicted the operator's 2026-04-30 decision (`.claude/CLAUDE.md`, Sector Activation: SHELVE, not retire; the rows stay for per-sector reporting). F47 allowlist entry with that reason and date |
| `intelligence_item_versions` | 4,082 (26 MB) | written by trigger `trg_intelligence_items_version_snapshot` | keep: F47's replay found a SQL reader (it is not in the unread set), so "read by nothing" was the hand census's miss; the trigger-written class is now measured by F47's unread count instead of by hand |
| `case_studies`, `case_study_endorsements` | 6, 0 | trigger and policies from the community layer, no code | keep-with-reason (L32): `case_studies` is referenced (its trigger); `case_study_endorsements` is written by nothing and read by nothing, carried in the F47 allowlist as the unbuilt half of a core surface with review at the community rebuild dispatch, which ships case studies or drops both tables |
| `community_topic_groups` | 0 | policies only | referenced (F47: policies and a foreign key count as SQL references); stays with the community rebuild, no gate row |
| `taxonomy_nodes` | 38 | policies only | referenced (F47: foreign keys from the community tables); stays with the community rebuild, no gate row |
| `coverage_gap_census_findings` | 116 | read by view `census_rollup_by_surface` | keep |
| `gate_a_health_cache` | 1 | `gate_a_health`, `gate_a_health_refresh` | keep; `gate_a_health_refresh` itself has no caller anywhere: deliberately unscheduled by operator ruling 2026-08-10 (migration 256), run by hand, last computed 2026-08-10 09:20 UTC; F47 function allowlist with that reason |
| `mutation_leases` | 0 | the lease functions | keep |
| `pending_first_fetch` | 1,388 | trigger `enqueue_pending_first_fetch`; [CORRECTED] no reader: the drain-first-fetch worker was dissolved 2026-07-12 and the population is re-homed to the cadence-flip wiring unit (`mint-item.ts` header) | keep as a writer preceding a named-later reader (build mode holds the cadence off, rule 16); F47 allowlist entry, live 2026-09-17: done 1,235, error 136, queued 12, skipped 5 |
| `system_state_flag_audit` | 8 | trigger `guard_pause_flag_writer` | keep |

Gap in the existing gate, closed by L32: the producer-consumer orphan check (F14) saw only application writers, so a trigger-written table nothing reads was invisible to it. F47 `db-object-reference` (RD-71) is the standing number: the committed schema replayed statement by statement (equal to the live catalog, 120 tables, 6 views, 95 functions) against every reference in code and SQL; unreferenced tables and unread tables are both-ways ratchets seeded at 0 after L32's drop and dated allowlist entries; dead functions are strict zero. F14's schema scan now reads the same replay, so a dropped table no longer survives as a phantom. One more write-only table surfaced by F47 that the hand census missed: `community_promotion_transitions` (0 rows, the promote-to-public audit trail), allowlisted as a terminal sink until the community rebuild's moderation history view reads it.

## 4. Files

The 2026-08-11 dead-code manifest (495 files) was applied; all 495 are gone. Byte-identical files: 24 groups, 53 files, all tracked snapshot data under `scripts/_snapshots` (disposition: those snapshots are gitignored scratch by rule 5 and should not be tracked; remove from the index in the snapshot-cleanup lane). Module liveness (F25) and orphaned proofs (F23) already ratchet the source tree at zero.

## 5. The gates

- **F45 duplicate-code** (lane L30, RD-69): both-ways ratchet on duplicated normalized lines, ceiling 8,061 on `ed2ee7c9`; a new copy anywhere in src or scripts reds the build naming the clone pair. Re-seeded to 7,600 by lane L31 (the route-guard extraction).
- **Database census** (lane L32, F47 db-object-reference, RD-71, LANDED): unreferenced tables, unread tables and dead functions, from a statement-ordered replay of the migrations; attack-proven (a planted table, a planted function, a planted trigger sink, each red then green).
- **One home per external route** (lane L31, F46 external-host-home, RD-70, LANDED): every external host that code builds URLs for is named in exactly one route module. Consolidated hosts (`HOST_HOMES`: publications.europa.eu in `scripts/lib/eurlex-cellar.mjs`, which also gained the OJ-issue endpoint the provenance healer had built on its own) may appear only in their home, and the count of other multi-home hosts is a both-ways ratchet seeded at 7 (eur-lex.europa.eu 7 files, www.federalregister.gov 6, www.ecfr.gov 3, api.anthropic.com 2, ec.europa.eu 2, www.legislation.gov.uk 2, www.linkedin.com 2). Removal order item 4 consolidates them one host per commit. [CORRECTED 2026-09-17, same day, before merge: the first draft of this line said the gate was folded into F45. That was wrong. F45 catches copied lines; the EUR-Lex case was three different implementations of one route, which F45 would not have caught. Until F46 lands, only the per-host sweep test in `capture-static-primaries.test.mjs` covers that one host, and re-implementations of any other host are not gated.]
- **Lane contract**: the binding prior-art step (search the repo first; cite what is reused).

## 6. Removal order

1. DONE (lane L31): route guard for the API routes; 87 route files onto one module, F45 8,061 to 7,600.
2. Community page shell and the shared loading page (15 files).
3. Detail-surface and admin-view primitives (15 files).
4. One route module per external host (Federal Register, eCFR, legislation.gov.uk, Eurostat, the oil bulletin, Anthropic).
5. Maintenance scripts onto `runCli`.
6. DONE (lane L32): `drain_worklist` dropped (migration 324), the decisions in section 3 resolved with reasons, F47 seeded at 0 and 0. `_snapshot_gapflags_20260831` dropped by migration 325 the same day.
7. Snapshot files out of the index.

Each lane re-seeds F45 downward in its own commit; the number in this document is the starting point, not a target.
