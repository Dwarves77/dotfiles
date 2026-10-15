# PART 1 MODULE MAP (coordinator, 2026-10-11). Measured on master a24e6f3e9 before CLEAN-3's header strip; lanes
# re-measure. Order = launch order (substrate first, operator correction). Each row is one lane; ~6-12k lines each.
# Totals: src ~114k + runtime scripts ~29k + capture worker 614 + schema dump (produced, size unknown).

SUBSTRATE (launch first, in this order)
P1-01 auth-db     | src/lib/supabase-server.ts (5048) supabase-server-client.ts supabase-browser.ts supabase-env.ts
                  | supabase-service.ts src/lib/db src/proxy.ts src/lib/auth src/lib/orgs src/lib/api src/app/api/auth
                  | src/app/api/orgs src/app/api/invitations src/app/auth src/app/login src/app/signup src/app/invitations
                  | src/components/auth                                                                ~10,700
P1-02 workspace   | src/lib/workspace src/app/api/workspace src/app/workspace src/components/workspace src/lib/account
                  | src/app/settings src/components/settings src/lib/profile src/app/profile src/components/profile
                  | src/app/onboarding src/components/onboarding src/stores src/types                   ~10,700
P1-03 intake-a    | src/lib/agent (10029) src/workflows src/app/api/agent src/lib/llm                    ~12,500
P1-04 intake-b    | src/lib/intake src/lib/contracts src/lib/classification scripts/classification scripts/_reground
                  | scripts/regen-quarantined.mjs scripts/plan-quarantine-disposition.mjs                ~9,200
P1-05 sources-a   | src/lib/sources (9259) src/lib/trust.ts src/lib/credibility src/lib/customer-source-tier.ts
                  | src/lib/tier-labels.ts src/lib/tier1-priority-jurisdictions.ts                       ~11,600
P1-06 sources-b   | src/components/sources src/lib/coverage src/lib/coverage-gaps.ts src/lib/coverage-gaps-rollup.ts
                  | src/components/coverage src/app/api/coverage src/lib/health src/app/api/health scripts/sources
                  | scripts/source-role-cleanup.mjs                                                      ~7,800
P1-07 capture     | supabase/functions/capture-worker/index.ts src/app/api/worker src/lib/telemetry
                  | src/components/telemetry src/app/api/telemetry src/lib/perf src/app/api/version src/lib/d3
                  | src/lib/email src/lib/notifications                                                  ~2,200
P1-08 harness     | scripts/lib (6078: run-artifact, record-harness-run, upstream-artifact, pg-conn, is-main, ...)
                  | scripts/migrations scripts/inventories scripts/health scripts/measure-bundles.mjs
                  | scripts/holdings-audit.mjs scripts/audit-skill-conformance.mjs scripts/backfill-item-timelines.mjs
                  | scripts/flag-fabricated-items.sql scripts/d3-runs.ddl.sql                            ~8,000
P1-09 flywheel-a  | src/lib/connections scripts/connections src/lib/tags src/lib/domains.ts src/lib/surface-of.mjs ~8,300
P1-10 flywheel-b  | src/lib/propagation scripts/propagation src/lib/entities scripts/entities src/lib/corrections ~7,600
P1-11 schema      | the production schema dump (one file, produced by an executor: supabase db dump --db-url <prod>
                  | -f schema.sql; schema only); plus supabase/functions, supabase/seed (which seeds are runtime)
                  | NOTE migrations do NOT reproduce production (352 applied rows, 46 without a file, 17 files
                  | without a row; dump-production-schema.mjs header). The dump is the schema source, never the
                  | 394 migration files (61,043 lines).                                                  dump size tbd
P1-12 runtimes-a  | scripts/turns (17014) first half by file order                                       ~8,500
P1-13 runtimes-b  | scripts/turns second half                                                            ~8,500
P1-14 mint        | scripts/mint (10830)                                                                 ~10,800
P1-15 producers   | scripts/producers (7019) scripts/drain src/lib/learning scripts/research scripts/spec09 src/lib/spec09 ~12,400
P1-16 obligations | src/lib/obligations src/app/api/obligations src/lib/forward-events scripts/obligations
                  | scripts/forward-events                                                               ~5,000

SURFACES (after the substrate)
P1-17 ui-kit      | src/components/ui (9334) src/app/globals.css src/app/theme.css src/lib/cn.ts src/lib/tint.ts  ~10,300
P1-18 shell-list  | src/components/shell Sidebar.tsx AppShell.tsx app-shell-banner.ts BackToTop.tsx src/components/layout
                  | src/components/shared src/components/providers src/app/layout.tsx loading.tsx error.tsx not-found.tsx
                  | src/app/privacy src/components/list-surface src/components/pages src/components/resource
                  | src/lib/list-pagination.ts list-row-fields.ts item-links.ts src/lib/url-params src/lib/nav
                  | src/app/api/intelligence-items src/lib/hooks src/lib/format.ts relative-time.ts src/lib/text
                  | src/lib/csv src/lib/cache src/app/api/cache src/app/api/revalidate src/lib/render-now.ts ~8,400
P1-19 regulations | src/components/regulations src/app/regulations src/lib/detail src/components/detail src/app/api/detail
                  | src/lib/statutory src/lib/jurisdictions src/lib/regulation-item-types.ts src/lib/applicability
                  | src/components/map src/app/map src/lib/map src/lib/constants.ts                      ~12,200
P1-20 market      | src/lib/market src/components/market src/app/market src/lib/figures src/components/figures
                  | src/lib/vocabulary                                                                   ~8,100
P1-21 research-ops| src/lib/research src/components/research src/app/research src/lib/operations src/components/operations
                  | src/app/operations src/lib/regional                                                  ~8,900
P1-22 community-a | src/components/community (11829)                                                    ~11,800
P1-23 community-b | src/app/api/community src/app/community src/lib/community src/app/api/listings src/app/api/notices ~7,800
P1-24 dash-search | src/lib/dashboard src/components/dashboard src/app/dashboard src/app/api/dashboard src/app/page.tsx
                  | src/components/home src/lib/urgency src/lib/scoring.ts src/lib/watchlist src/components/watchlist
                  | src/app/watchlist src/app/api/watchlist src/lib/watchlist-links.ts watchlist-scope.ts src/lib/portfolio
                  | src/components/portfolio src/app/api/search src/app/search src/components/search
                  | src/components/AskAssistant.tsx src/app/api/ask src/lib/data.ts                      ~8,400
P1-25 admin-a     | src/components/admin (10665) src/components/ledger src/components/account            ~11,300
P1-26 admin-b     | src/app/api/admin (7818) src/app/admin src/lib/admin src/test-support               ~10,200

REGISTERS (prior audit, docs/archive/audits/2026-10-11-complete-audit-registers/<name>-2026-10-11.md; the lane reads
its named registers whole, then greps every register for its paths; backlog rows by path, see template PRIOR WORK):
  P1-01 A1-part1-src-app-api, A2-part6, A3-src-lib-1, A4-src-lib-2, A4a..A4d-whole-reads (the lib rows)
  P1-02 A2-part6, A2-part7, A1-part2-src-app-pages, A3, A4
  P1-03 A4-src-lib-2, A4a..d, A1-part1 (api/agent), F1-harness-and-flywheel (pipeline rows)
  P1-04 A3, A4, A4a..d, B2-part4-other-scripts, B1b-whole-reads-maintenance (regen/quarantine rows), B1-scripts-runtimes
  P1-05 A3, A4, A4a..d (sources, trust), C4-db-live (tier rows)
  P1-06 A2-part4, A2-part6 (coverage), A1-part1 (api/health, api/coverage), B2-part4
  P1-07 A1-part1 (api/worker, telemetry), A2-part7, C4-db-live (capture rows), E1-site-live
  P1-08 B2-part1-lib, B1a-part3-whole-reads-harness-runs, F1-harness-and-flywheel, B2-part4, D1-part1-github
  P1-09 A3, A4, A4a..d (connections, tags), B1-scripts-runtimes, F1
  P1-10 A3, A4, A4a..d (propagation, entities, corrections), B1, F1
  P1-11 C1, C2, C3, C3a, C3b, C3c (migrations), C4-db-live, B2-part2-proof (dump/apply rows)
  P1-12 B1-scripts-runtimes, B1a-part1-whole-reads-turns-runtimes
  P1-13 B1, B1a-part1, B1a-part2-whole-reads-turns-emitters-batches
  P1-14 B1c-whole-reads-mint-research, B1
  P1-15 B1, B1a-part2, B1c (research), A3/A4 (learning, spec09)
  P1-16 A3, A4, A4a..d (obligations, forward-events), B1, B2-part4
  P1-17 A2-part3-ui-and-root
  P1-18 A2-part3, A2-part7, A2-part5 (lists, detail), A1-part2
  P1-19 A2-part4, A2-part5 (detail, map), A3, A4
  P1-20 A2-part5, A2-part6 (figures), A3, A4
  P1-21 A2-part4 (research), A2-part5 (operations), A3, A4, B1c, B1 (spec09)
  P1-22 A2-part2-community
  P1-23 A1-part1 (api/community, listings, notices), A1-part2, A3, A4
  P1-24 A2-part5 (dashboard, home), A2-part6 (portfolio), A2-part7 (watchlist, search), A1-part1 (api/ask, search)
  P1-25 A2-part1-admin
  P1-26 A1-part1 (api/admin), A1-part2 (app/admin), A2-part1
  (D1-part2..4, D2, MEM-1 are the discipline, skills and rules registers: CLEAN-3's extraction consumes them.)

RULING after P1-01 (PR 1133): the surface read layer inside src/lib/supabase-server.ts and src/lib/data.ts (about 1,900
clean lines: dashboard, lists, detail, watchlist, operations, market, research readers) belongs to the surface lanes
P1-19..P1-24; each surface lane reads the reader functions its surface calls (named in auth-db.md sections 7-8) whole
and plans them in its own section 8. P1-01 keeps only the client factories, auth, orgs, invitations, guards.
RULINGS after P1-03 (PR 1134, merged a2f9f3f): the detail-surface parsers inside src/lib/agent belong to P1-19
(regulations/detail); operations-matrix and operations-ask-context belong to P1-21; both lanes read those files whole
(named in intake-a.md section 8). Metered callers outside intake: /api/ask (P1-24) and the admin classification routes
(P1-26) are ruled by the free rule: the Assistant is retrieval over platform content and skill passages with no model
call; admin classification uses the deterministic classifier (P1-04). Each lane states the replacement in section 8.
MERGED: P1-01 904680d, P1-03 a2f9f3f, P1-06 (1136), P1-02 a074971, P1-04 09093a2, P1-05 8bbca94, P1-08 969c2f3,
P1-07 5e29268, P1-09 df36fdd, BRIEF c831e82. OWED at the end of Part 1: one reconciliation sweep of INV citations in
the registers merged by the coordinator's script before 2026-10-12 (P1-02/04/05/07/08/09: data-invariants.md was
renumbered on merge, their register and session-log citations were not; the script now renumbers both).
EXECUTION ROUTE (2026-10-11): local lanes raise a phone card per tool call while the operator is on Remote Control;
lanes run in the operator's cloud sessions via SendMessage (one lane per session at a time); PR 1133 is the exemplar.

Every file under fsi-app/src, fsi-app/scripts (post CLEAN-3) and supabase/functions must appear in exactly one lane;
the launch step runs `git ls-files` minus the union of lane scopes and assigns any remainder before the last lane.
