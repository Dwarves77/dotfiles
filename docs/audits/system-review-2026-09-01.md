# System Review, 2026-09-01: does Caro's Ledge work as intended, and what stands between it and a complete, functional system

Author: coordinator (Claude Fable 5.1), on operator instruction. Evidence gathered by six read-only
sweeps over the repo at `lane/integration` (HEAD `3c90e220`, 13 commits ahead of `origin/master`), live
database counts (2026-09-01), and two external checks on the competitive landscape. Every claim below
cites a file, a query, or a source; anything not verifiable is labeled UNCONFIRMED.

---

## 1. The verdict, in one page

**Intent** (from `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md`, the canonical model): a
freight-sustainability intelligence SaaS with two coupled halves, four intelligence surfaces
(Regulations, Market Intel, Research, Operations) plus Community as a co-equal fifth surface, with Map,
Dashboard, Assistant and Onboarding cross-cutting. Customers: freight forwarders (art logistics, live
events, luxury, automotive, humanitarian first; all freight forwarding later). The operator's long-term
pitch, recorded 2026-08-21: "a tool that will eventually take ALL regulations for any freight forwarder
and categorize them."

**Does it work as intended today? No, not as a product. Yes, as an engineering substrate.**

What works, verifiably: a provenance-grounded content model (claim-level FACT/ANALYSIS/LEGAL labeling,
`set_provenance_status` trigger, quarantine on ungrounded content); a discipline engine that is real,
not decorative (23 gating fitness functions, 9 commit rules, 2,320 tests, a memory gate in CI, F28
catching live staleness this very day); a harness that records every tool run as an artifact and a
flywheel that turns the corpus into a graph, themes, gaps, forward obligations and self-grading metrics
(all built, tested, and after this train, wired end to end).

What does not work: **the product is starved.** The database holds 2,561 sources (1,612 active, 927
provisional) and a census of 21,609 documents, of which 3,661 are marked `would_mint`. The site shows
**322 live verified items.** Every hop of the pipeline that turns a source into an item (census, screen,
mint, ground, generate) is session-only: no runtime executes it except a coordinator typing in a
sandbox, and paid grounding is administratively frozen. The surfaces the operator asked about (Market
Intel, Research, Operations) shipped their redesign visually in July 2026 but were never fed: Market
Intel's price feed is 1 of 48 series, three of four producers are unbuilt, and every surface's named
differentiator is still unbuilt. The 901 forward obligations extracted yesterday, the single most
customer-relevant data the platform now owns ("what is due, when"), render only on an admin tab.

**The single root cause behind "why is anything blocked":** the system was built with no execution
layer of its own. Tools run wherever the coordinator's session happens to run and inherit that
session's limits. `producers.yml` says it in its own header: "missing layer: a named runtime." The fix
is not a network setting. It is giving the flywheel and harness a runtime the repo already has a proven
pattern for (GitHub Actions, dispatch-gated, repository secrets), and giving intake an event-driven path
so items are processed when they arrive, with one deliberate run over everything already in the system.
Per the operator's ruling in this review: **no standing schedules during build.**

---

## 2. What the system is: the map

### 2.1 Customer surfaces (Vercel, Next.js)

Pages: `regulations/`, `market/`, `research/`, `operations/`, `community/` (list + detail each), plus
`admin/`, `map/`, `workspace/`, `watchlist/`, `onboarding/`. Four detail surfaces carry the connection
lens (`ItemConnectionsCard`, mounted at `RegulationDetailSurface.tsx:373`,
`MarketSignalDetailSurface.tsx:600`, `OperationsDetailSurface.tsx:1157`,
`ResearchFindingDetailSurface.tsx:1084`); Community deliberately not. Research detail reads the theme
brief join (`research/[slug]/page.tsx:242-252`). Forward events render only in
`components/admin/UpcomingObligationsPanel.tsx` inside `SourceHealthDashboard.tsx:524`.

87 API routes. Admin routes gate on `requireAuth` → `isPlatformAdmin` → `checkRateLimit`
(`src/lib/auth/admin.ts:23-37`, `src/lib/api/rate-limit.ts`, in-memory, single-instance). Worker
routes use `x-worker-secret` (`src/lib/api/worker-auth.ts:45-73`). No middleware. No Vercel crons
(`vercel.json` has no `crons` key).

### 2.2 The ingestion pipeline (sources → items)

| Hop | Code | How it runs today |
|---|---|---|
| Sources registry | `sources` (migration 004), admin routes | admin UI |
| Census | `src/lib/intake/census-writer.mjs` → `census_worklist` (221) | session-only ("Session A / Session C", header L24-27) |
| Screen | `scripts/mint/screen-worklist.mjs` + `screen-rules.mjs` | session-only, DB-less: coordinator exports rows, runner classifies, coordinator applies |
| Mint | `scripts/mint/run-mint-batch.mjs` → coordinator applies via guarded path → `mint-item.ts` (in-app path) | session-only; MINT-RUNBOOK L6-9 "zero API spend, no DB writes from a mint lane" |
| Staged updates | `apply-staged-update.ts` via `runIntakeCycle` | operator-fired only: `POST /api/admin/run-intake`, which has **zero UI callers** |
| Grounding / generation | `canonical-pipeline.ts`, `workflows/generate-brief.ts` | `GROUNDING_ACQUIRE_ENABLED` OFF → throws before any spend (`verify-item.mjs:149`) |
| First-fetch capture | `supabase/functions/capture-worker` over `pending_first_fetch` | invoked by hand via `pg_net`/`execute_sql`; 1,235 done, 136 error, 4 queued |

Every row of that table says the same thing: nothing runs unless a person runs it.

### 2.3 The harness (self-improvement of the tools)

Substrate `scripts/lib/run-artifact.mjs` (11-key artifact schema, collision-safe run ids, CLI), five
registered families (`mint`, `screen`, `fetch-drain`, `meta-harness`, `forward-events`), governing-file
hashes per family, F28 enforcing schema/presence/staleness/attestation in CI (`discipline.yml:283`).
After this train: mint and forward-events self-emit artifacts from a `finally` block; fetch-drain still
emits by prose (its runner is a Supabase edge function invoked by hand); meta-harness artifacts are
hand-authored per wave. 17 run artifacts exist. Findings do become code: mint-run-004's dedup proposal
was executed queue-wide (session-log 7203), forward-events-run-001's dedupe-key defect became migration
275. The loop is real. It is also entirely session-driven.

### 2.4 The flywheel (self-improvement of the corpus)

Pure units in `src/lib/connections/`: discover (4 signals, ADR-019 idf), cluster (label propagation),
gaps (3 types), anticipate (U5), theme-delta (F6), signal-candidates (L4), flag-namespaces, brief
candidates/staleness, pair-view. Orchestrated by `scripts/connections/analyze-corpus.mjs` (17-step pass,
guarded writes, read-back verification). Tables: `item_cross_references` (1,929 edges), `connection_themes`
(9 themes, stale since 2026-08-21), `connection_theme_runs` (+276 `theme_delta`), `theme_briefs` (9),
`item_forward_events` (901). Four interfaces to the harness now exist (ratify-flag-to-census, rule-16
intake participation, corpus-outcome metrics, the writer registry). Requires DB credentials; runs
nowhere but a session.

### 2.5 The discipline engine and memory

`.discipline/`: 23 fitness functions (F2, F6, F8–F28), 9 commit rules, 3 consistency checks, governance
registries (invariants, doctrine, skill-contract map), one test list (`run-test-suite.sh`) shared by CI
and the pre-push hook, five CI jobs. The memory gate exists (`discipline.yml:133-187`): a PR touching
code without touching `session-log.md`/`PROGRAM-BOARD.md` fails. Nine repo skills; seven registered in
governance.

---

## 3. Does each part work as intended? Scorecard

| Subsystem | Intended | Actual | Verdict |
|---|---|---|---|
| Content model / provenance | every claim grounded, ungrounded content quarantined | trigger 115/209, F13 single mint chokepoint, F21 single grounding entry, 97 quarantined items honestly held | **Works** |
| Discipline engine | rules as code, CI-enforced | 23 fitness fns gating, memory gate real, F28 caught 2 live violations today | **Works** |
| Harness | tools record runs, proposer passes improve them | 17 artifacts, 2 proposals turned into code, self-application caught itself twice | **Works, session-bound** |
| Flywheel | corpus learns from itself, feeds the tools | all units built; themes stale 11 days; first Interface-3 finding already produced (census wave untagged) | **Built, unmerged, session-bound** |
| Intake pipeline | sources become items | 2,561 sources → 322 live items; 3,661 `would_mint` waiting; every hop manual | **Does not work as a system** |
| Generation | grounded briefs at scale | frozen behind `GROUNDING_ACQUIRE_ENABLED` OFF; $0 regime since 2026-07-13 | **Frozen by ruling** |
| Market Intel | price feeds, carbon overlay, lead-time chart | 1/48 series populated; 3/4 producers unbuilt; differentiators unbuilt; producers workflow dispatch-only | **Shell shipped, data absent** |
| Research | theme briefs + community pickups | 9 briefs, hand-authored; fake client-side themes replaced by real ones (WO-25); pickup pipeline still stubbed (intent skill: "absent or stubbed") | **Partial** |
| Operations | structured cost/ops content | By-state list could show 2 of 13 facts until WO-10; differentiator unbuilt | **Partial** |
| Community | co-equal fifth surface | 18 routes, cookie auth; 2 invitation routes wired nowhere; pickups not consumed by Research | **Exists, unverified value** |
| Forward obligations | "what is due next" | 901 events, admin-only tab | **Hidden from customers** |
| Dashboard / Assistant | digest; research helper | Assistant fail-closed on `ASSISTANT_ENABLED` | **Off** |

---

## 4. The population problem, with numbers

Live query, 2026-09-01:

- Sources: 1,612 active, 927 provisional, 22 suspended.
- `census_worklist`: 21,609 documents. 16,717 `invariant_reject` (77%), 3,661 `would_mint`, 1,225 `hold`, 5 dedup.
- `intelligence_items`: 322 verified live; **513 verified archived**; 97 quarantined live; 78 quarantined archived; 56 unverified archived. Live by type: 112 regulation, 58 framework, 36 market_signal, 31 research_finding, 28 directive, 21 regional_data, 20 initiative, 10 guidance, 4 technology, 2 standard.
- Of the 513 verified archived, **491 were archived on 2026-08-21 with `archive_reason = NULL`.** Session-log Addendum 28 explains them: the WO-26 scope ruling ("freight-sustainability platform, first") archived 632 customs and transport-administration EUR-Lex items reversibly; the operation never stamped a reason. Later work (session-log 7207) already tripped over this: 456 `would_mint` queue rows are blocked by holders in that unstamped wave.

Why 322 and not thousands, causally:

1. **Every mint needs a grounded brief, and grounded briefs need either paid generation (frozen) or a
   session author.** The census-mint path yields 5 to 8 items per batch (mint-run-005/006). At that rate
   the 3,661 `would_mint` backlog is roughly 500 batches.
2. **No hop is automated.** Even the $0 steps (screen, validate, discover, extract) wait for a person.
3. **Scope is deliberately narrow today** (WO-26), which is correct per the ruling, but the archived 632
   sit unstamped and unindexed, blocking dedup and hiding the "eventually all regulations" inventory.
4. **Census-minted items are invisible to the flywheel** because they carry empty
   scenario/compliance/topic tags (verified 2026-09-01: discovery over 8 such items produced 0 edges).
   The August wave cannot connect, cluster, or surface gaps until a tagging pass exists.

This is the honest reason the operator's question "thousands of sources, a few hundred items, this makes
zero sense" is right: the architecture converts sources to items only through the most expensive and
least automated path it has.

---

## 5. Wired, unwired, dead

**Unwired (built, no caller or no runtime):**

- The entire intake chain (§2.2). `POST /api/admin/run-intake`, `/admin/promotion-policy`, `/admin/users`: zero callers.
- Every flywheel script and every harness runner: no workflow, route, or cron (`vercel.json` empty; only `trust-recompute.yml` and the spend probe in `uptime-probes.yml` are armed).
- `POST /api/worker/reconcile`: zero callers, and its input `monitoring_queue.change_detected` is hardcoded `false` at the writer (`content-change.mjs:4`). A doubly dead chain.
- `community/invitations/[id]/accept` and `/decline`: zero callers; the UI hits the workspace-level `/api/invitations/[token]/…` instead.
- `pending_first_fetch`: live enqueue trigger (065), consumer route deleted 2026-07-11, drained only by hand via the edge function. Invisible to F14 (scan excludes edge functions).
- Forward events: no customer-facing surface.
- Community editorial pickups: not consumed by Research (intent skill, correction 3).

**Dead or superseded:**

- `fsi-app/.claude/skills/resume/SKILL.md`: superseded by root `ledger`; `/start` names ledger as the one boot sequence.
- `SectorSynopsis.tsx`: zero importers (F25 allowlisted).
- 34 modules pinned alive by F25's `LEGACY_ALLOWLIST` (`F25-module-liveness.mjs:96-198`): 15 in `scripts/lib`, 11 proven-but-unwired in `src/lib`, 4 with no proof. This train's sunset lane KEPT four `scripts/lib` modules only because moving them would red F25's allowlist, i.e. the liveness gate is currently preserving dead code.
- `.claude/skills/analysis-construction-spec/SKILL.md` cites `detect_intersections` (dropped by migration 265) as the live mechanism, three times.
- `PROTOCOL.md` (forward-events) names the pre-move extractor path first; `DRY-RUN-REPORT.md` too.
- `PROPOSER-RUNBOOK.md` §5 still says mint emission is prose-only; it has been code since `f3ff3ae7`.
- `.discipline/consistency/manifest.mjs` header says "only C3 + C4 remain"; C5 exists.
- `PROGRAM-BOARD.md` names `MONTHLY_SPEND_CEILING_USD`, which exists nowhere in code (the real constants are `SPEND_CEILING_USD`=85 per call and `MONTHLY_TOTAL_DISPLAY_USD`=130, explicitly not a limit).
- Migration 276's own header says "left UNAPPLIED"; it was applied 2026-09-01 (board and this session). Header is now false.

**Tooling blind spots found while auditing the tools:**

- F14 (producer-consumer orphan) cannot see `guardedInsert`/`guardedUpdate` writers and mis-reports `regional_data_facts`, `theme_briefs`, `emission_factors` as write-orphans.
- F14 and the writer registry both exclude `supabase/functions/**`, so the one live consumer of `pending_first_fetch` is invisible to every governance scan.
- The `system-prompt.ts` ↔ SKILL.md "synced" claim is enforced by nothing but a version-string test; the skill lists 14 rules, the prompt 16. The skill's "19-field contract" enumerates 13 fields.
- The writer registry test is now suite-wired (this train) but was not in CI before today.

---

## 6. The interface question: Market Intel, Utilities, Research

Did the better interface happen? **Visually, yes; functionally, no.** The redesign (11 mocks approved
2026-07-03, integrated via PRs #215/#219/#223+, DONE on the board) was scoped as a shell migration and
its own handoff named data population as separate "known new backend work." That work landed unevenly:

| Surface | Designed | Shipped | Still missing |
|---|---|---|---|
| Market Intel | live price feeds, carbon-price overlay, lead-time chart, signal briefs | shell + `MarketSeriesBoard`; 1 of 48 series populated (EU oil bulletin); 36 market_signal items | 3 of 4 producers; carbon overlay; lead-time chart; producers workflow dispatch-only |
| Research | findings + theme briefs + community pickups | shell; real graph-derived themes (WO-25 replaced a fake client-side version); 9 hand-authored briefs; 31 items | pickup pipeline; brief generation at scale (F5 has no runnable synthesis unit) |
| Operations ("Utilities", UNCONFIRMED mapping) | structured cost/operational facts by state and mode | shell; By-state list fixed at WO-10 (was 2 of 13 facts); 21 regional_data items; emission factors on market detail | differentiator unbuilt; operational integration (booking-time decisions) absent |

"Utilities" does not appear as a surface name anywhere in the repo; the closest match is the Operations
surface's regional cost, energy and emission-factor data. UNCONFIRMED: the operator should say which
surface he means if it is not Operations.

Why it "wasn't useful before" and still is not: a surface with 21 to 36 items and one price series is
not a product a freight forwarder will open twice. The redesign fixed the frame, not the picture.

---

## 7. Through a customer's eyes

A compliance or sustainability lead at a freight forwarder opens the site today and gets: a well-written,
provenance-labeled brief on roughly 112 EU regulations and 58 frameworks, a connections card, a themes
view, one oil-price series, a research page with 31 findings, an operations page with a handful of
regional facts, and a community with groups and posts. They do not get: an obligations calendar (the
901 events exist, on an admin tab), alerts when something changes, search across the corpus, coverage
beyond the EU-heavy core (US, IMO, ICAO, Asia thin), emissions calculation, or any way to map a
regulation to their own shipments, lanes or clients. Nothing tells them what changed since last week.

What they need, in the order they would pay for it, based on what the market sells (§8): (1) coverage
they trust across the jurisdictions they ship through, (2) "what is due, when, for whom" as a calendar
with alerts, (3) plain-language obligation mapping to their operations (mode, lane, cargo class), (4)
change detection with a diff, (5) peer context (Community's actual differentiator, if it fills).

---

## 8. Against the field

Regulatory-intelligence platforms sell on source coverage and cadence: Obsidian claims 6,100+ official
sources with publication-time alerts and per-user pricing; CUBE 10,000+ bodies across 180 jurisdictions
with AI obligation mapping; Regology maps changes to obligations, controls and evidence; Enhesa sells
expert-authored EHS content across 279 jurisdictions; Thomson Reuters and Wolters Kluwer sell editorial
depth to finance ([Obsidian comparison, 2026](https://obsidianri.com/blog/best-regulatory-intelligence-tools-2026)).
Buyers are told to evaluate on coverage, real-time detection, industry specialization, jurisdiction
reach, setup time, pricing transparency and alert customization. On the freight side, tools like BuyCo,
Searoutes, Shipzero and OceanScore sell GLEC/ISO 14083 emissions calculation with CSRD/EU ETS reporting,
and the stated 2026 need is "data to action in one unified system", decisions before booking
([BuyCo, 2026](https://buyco.co/blog/sustainability/ocean-freight-emissions-software-co2-tracking-tools-2026/)).

Where Caro's Ledge is differentiated, on paper: nobody in either list is freight-vertical AND
regulation-plus-market-plus-research-plus-operations AND community. The provenance model (claim-level
grounding with quarantine) is stricter than what generalist platforms advertise. Forward-event
extraction from grounded content is exactly the "obligation calendar" the generalists charge for.

Where it is behind, decisively: coverage (322 items vs. thousands of sources monitored by competitors),
cadence (no monitoring runs; `source-monitoring.yml` frozen), alerting (none), obligation mapping to
the customer's own operations (none), emissions calculation (none, and not in intent), search (none).
A top-percentile engineer would say the governance layer is built to a standard the product has not
earned yet: the platform can prove every sentence it publishes and publishes very few sentences.

---

## 9. The developer's critique (what a top-0.01% engineer would say)

Strengths worth keeping exactly as they are: the single mint chokepoint (F13), single grounding entry
(F21), guarded writes with snapshots (rule 015, db.mjs), the run-artifact substrate and F28, the
deterministic $0 flywheel units with colocated tests, the memory gate. These are rare and correct.

Structural faults, ranked by damage:

1. **No runtime layer.** Everything operational depends on a human session. This is the cause of the
   population gap, the staleness, and today's blockage. Cost to fix: low; the pattern exists.
2. **The item economics are wrong for the mission.** "Every item is an LLM-grounded brief" cannot reach
   "all regulations for any freight forwarder" under a $0 regime. The system needs a cheaper item
   tier: a deterministic instrument record (identity, dates, forward events, tags, jurisdiction,
   source) minted at $0 from the document itself, upgradable to a grounded brief when spend is
   authorized. The extractor and screen rules already prove deterministic extraction works.
3. **Two mint paths** (in-app `mint-item.ts` and coordinator SQL apply) with a runbook holding them
   together. After this train both feed the flywheel, but the coordinator path should call the same
   TypeScript chokepoint, not re-implement it.
4. **Governance scans with blind spots** (F14 guarded-writer blindness, edge-function exclusion) and
   documentation that asserts sync it cannot prove (system-prompt ↔ SKILL.md).
5. **Dead code kept alive by the liveness gate.** An allowlist of 34 modules is a backlog, not a gate.
6. **Customer value hidden behind admin.** Forward events, themes, intersections all render for
   operators first. The customer pages get the shell.
7. **Ledger weight.** The vault (session-log at 7,300+ lines, board at 1,800+) is superb memory and a
   real cost; the board already contradicts itself (U5 BLOCKED and BUILT in two places).

---

## 10. The plan: complete and functional, event-driven, no schedules

Operator rulings applied: no standing schedules during build; process items when they arrive and run
everything already in the system through the same path once; all data through harness and flywheel;
nothing deferred.

**Lane RT, the runtime layer (the blockage fix).** `.github/workflows/corpus-turn.yml`: triggers are
`workflow_dispatch` (inputs: mode dry/apply, steps) and `push` to branches matching `turn/**`, never a
schedule. Runs, in order, with the repository's existing DB secrets: `discover-for-items --since <last
turn>`, `run-extraction` over items lacking events, `analyze-corpus --signals`, then commits the run
artifacts and `_snapshots` to the turn branch and opens a PR. Same shape as `producers.yml`. A
companion `intake-turn.yml` runs screen → validate for new census rows and emits apply-ready payloads
as artifacts. Result: any coordinator, in any sandbox, pushes a branch and the sanctioned scripts run
against the real database with full artifact recording. Write set: `.github/workflows/`, one runbook.

**Lane EV, event-driven processing.** The in-app path is already event-driven after rule 16 (mint and
substantive update run discovery and extraction). Close the remaining gaps: (a) a DB-side notification
on `intelligence_items` insert/verify that enqueues a `corpus_turn_requests` row consumed by the next
turn (so coordinator-SQL mints and un-archives are never silent); (b) `run-intake` reachable from the
admin UI (it has no button); (c) one-time backfill run of every live item through discovery and
extraction via Lane RT. Write set: one migration, `src/app/admin`, `src/lib/intake`.

**Lane TAG, make the census wave connectable.** Deterministic $0 tag derivation for items with empty
signature tags: scenario/compliance/topic from the vocab SoT (`vocab-drift` guard files) applied to
title, CELEX descriptor and grounded sections, emitted as proposals into `integrity_flags` under a new
`flywheel-tag:` namespace for operator ratification, applied through the guarded path on approval.
Never silent auto-tagging. Write set: `src/lib/connections/tagging.mjs`, `scripts/connections/`.

**Lane POP, the population engine (needs one operator decision).** Introduce the instrument-record item
tier: `mint-item.ts` gains a `record` grade (identity, dates, forward events, tags, jurisdiction,
source, no synthesized brief) that passes provenance because it carries only extracted FACT spans;
`run-mint-batch` can mint records for all 3,661 `would_mint` rows at $0; a record upgrades to a
brief when grounding is armed. Stamp `archive_reason='out_of_scope_wo26'` on the 491 unstamped rows
so dedup and holders work. Decision required: whether record-grade items may appear on customer
surfaces (recommended: yes, labeled, because coverage is what customers buy first). Write set:
`src/lib/intake`, `scripts/mint`, one migration.

**Lane SURF, customer value.** Obligations calendar on the customer side (forward events by
jurisdiction/mode, on Regulations list and item detail), a "changed since" strip on the Dashboard fed by
`connection_theme_runs.theme_delta` and new-item dates, and the three missing market producers behind
`producers.yml`'s existing dispatch gate. Write set: `src/components/{regulations,dashboard,market}`,
`scripts/producers/market`.

**Lane HYG, hygiene.** Delete the two dead invitation routes and `worker/reconcile` (or wire it, ruling
needed: the change-detection chain is dead at both ends), retire `resume`, fix the stale skill pointer
to `detect_intersections`, fix PROTOCOL/DRY-RUN paths, PROPOSER-RUNBOOK §5, consistency manifest
header, migration 276 header, board's phantom constant, fix F14's guarded-writer blindness and include
`supabase/functions/**` in F14 and the writer registry, and convert F25's allowlist into an archive pass
(move the 15 `scripts/lib` and 4 no-proof modules, shrink the allowlist to what is actually pending a
ruling). Write set: `.discipline/`, `.claude/skills`, `scripts/_archive`, docs.

**Lane DOC, the sync gaps.** Bring `environmental-policy-and-innovation/SKILL.md` to the 16-rule,
20-field contract and add a content-parity test between the skill's rules section and
`system-prompt.ts`, so "synced" becomes enforced. Write set: that skill, `src/lib/agent/*.test.mjs`.

Coordinator: land the current train first (F28 artifact refresh, full suite, one squashed commit on
master), then dispatch RT and HYG and DOC in parallel (disjoint), then EV/TAG/POP/SURF in parallel
(disjoint), then run the first corpus turn through Lane RT and verify against the register.

Two operator decisions gate the plan: the record-grade item tier (Lane POP), and whether
`worker/reconcile` is deleted or wired (Lane HYG). Everything else is execution.
