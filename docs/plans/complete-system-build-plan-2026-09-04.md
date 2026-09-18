# Complete-system build plan — 2026-09-04

**Operator's instruction, verbatim:** "i need a complete build plan now that looks at the actual code that
incorporates every skill, tool, flywheel harness site map, rss feed into the entire system, no partial, not
half built, not partially wired, everything must be done to the highest standard … it is a complete system
and must be completed as such. you are leaving dead code and unwired systems that NEED to be incorporated."

This plan is derived from `docs/audits/wiring-audit-2026-09-04.md` and its six evidence sections (every
component named below is cited there to a file, artifact, commit or live SQL result), not from memory.
Standing rules it obeys: no schedules of any kind during the build (rule 16, now including the two crons
disarmed today); no API spend where a Haiku lane or the browser does it for free; population is $0 and
deterministic; one writer per dataset; no human gate inside the flywheel (ADR-025); the harness records
every run (F28). Every train lands through the browser transport and the full gate set.

## Why the previous plans stopped short (read against the code, not their own text)

Four plans in the last month promised completion of the same components this audit found unfinished:
`system-remediation-plan-2026-08-09`, `surface-rebuild-plan-2026-08-11`, `unwired-disposition-2026-08-31`
(26 dispositions, ruling R-C taken 2026-09-03), `system-completion-plan-2026-09-02` (nine lanes),
`wave2-lanes-2026-09-02`, `wave3-lanes-2026-09-03`. Checked today:

- The 2026-08-31 register: of 10 DELETEs, 6 executed, 4 still present (`scripts/lib/anthropic.mjs`,
  `src/lib/llm/metered-emit.mjs`, `.discipline/lib/adr-loader.mjs`, `src/lib/sources/api-fetch.ts`); of 8
  WIREs, 3 done (spend-gauge, derived-consistency, evaluateDemotion), the rest open (the
  `assumption_register` seeder was "built, never run" on 2026-08-31 and is still 0 rows; the board row
  1702 says "NEXT: coordinator applies migration 271" and 271 has been applied for days).
- The 2026-09-02 plan's Lane CONSUME built `run-ledger-consume.mjs` exactly as specified, with apply
  gated on a source constant "until an operator flips it" and on `ANTHROPIC_API_KEY`; the plan's own
  §"Not a lane — operator-only" listed the flip and the dispatch as later steps. They never came. The
  lane was marked done because its write set landed.
- Every wave plan defines lanes by disjoint write set. "Done" for a lane meant tests green in its files.
  Wiring a step into `maintenance.yml`, running it, reading the rows back, and putting it on a page were
  "coordinator, after landing" and went onto the board as `NEXT`/"dispatch next" rows: 12 such rows on
  the board and 19 "dispatch next" lines in the log today, several superseded by events (e.g. the
  WSEQ row closed only this afternoon, migration 271).
- Nothing enforces closure. F28 fails CI when a harness family drifts; F25 fails CI when a module under
  `src/**` is orphaned; no gate fails when a board row stays `NEXT` across trains, when a maintenance step
  has never run, or when a table has a writer and no reader. Plans were tracked by prose that nothing
  reads back, so each compaction of the coordinator's context and each new plan re-listed the same items.

Root cause in one sentence: completion was defined at the write set, and the parts that make a component
real (wired, run, populated, visible, gated) had no owner and no gate. This plan fixes the definition (§0)
and adds the gate (W7.3, W7.5) before it adds work.

## Tools already built to manage this: use, or retire

| Tool | Verdict | How this plan uses it |
|---|---|---|
| `docs/PROGRAM-BOARD.md` + `docs/ops/session-log.md` + `ledger`/`done` skills | USE (the memory) | The board becomes the only tracker. Every open item in this plan is a board row with a §0 status column; no separate per-wave plan files after this one. |
| `docs/plans/unwired-disposition-2026-08-31.md` + `w1-dispositions` maintenance step (parses the register into a worklist) | USE, extend | The audit's Appendix A/B rows are appended to the register in its own format; the step's worklist is the wire-or-delete queue; the 4 unexecuted DELETEs and 5 open WIREs are its first rows. Retire the step's "R-C-accepted" gate: R-C was taken. |
| `.discipline/governance/execution-wiring.mjs`, `coverage-scan.mjs`, F25 module-liveness, F23 orphaned-proofs ratchet | USE, widen | F25 scope → `scripts/**`; the audit's import-graph + workflow-grep becomes a governance check (W7.3). |
| Harness families, `governing-files.mjs`, F28, proposer passes, meta-harness | USE | Unchanged; the evidence-of-run mechanism every W-item cites. |
| `review-digests` / `build-review-digests.mjs` and the four `apply-*` scripts | USE, wire | The ratification queue drain (W1.2). |
| `scripts/verify/population-report.mjs`, `verification-audit-report.mjs` | USE / wire | The read-back reports after population slices; wire the second into `data-audit-lane` or delete. |
| Per-wave plan files (`wave2-lanes`, `wave3-lanes`, `finish-plan`, `system-completion-plan`) | RETIRE as trackers | Kept as history; their open items are moved to the board with §0 statuses and the files get a "superseded by" header. |
| `docs/dispatches/lane-common-contract.md` | USE | Lane brief contract; add §0 as the definition of done for every lane. |
| `last-turn-date.mjs` (corpus-turn's "what changed") vs `corpus_turn_requests` | RETIRE one | The ticket queue is the mechanism (W1.3); the marker file goes. |
| `community-topics-seed` | RETIRE | Contradicts the ruling (W6.1). |
| `tier-opinions` (no DB path), `census-off-vertical` archive path (no column) | FIX or RETIRE | W3.3 / W2.2. |

## 0. Definition of done (applies to every component, no exceptions)

A component is done only when all six hold, with the evidence type named:

1. **Reachable**: invoked by a runtime step (a workflow `run:` line), a page/route, or a chokepoint; not
   only by its own test. Evidence: the workflow line or the import, and the repo's own resolver
   (`execution-wiring.mjs` / F25 with the widened scope in W7) green.
2. **Run**: it has executed for real at least once and left a harness-run artifact or a guarded write with
   read-back. Evidence: `scripts/harness-runs/<family>/…-run-NNN.json` or the maintenance summary.
3. **Populated**: the table or column it feeds has rows from that run. Evidence: read-only SQL count.
4. **Visible**: a customer surface or an operator surface renders what it produced, and the render has
   been looked at in the browser. Evidence: the route and a screenshot-backed check.
5. **Gated**: a fitness function, contract test or golden fails CI if the wiring or the shape regresses.
   Evidence: the F-number or test file.
6. **Documented**: runbook section, inventory row, marker/proposer pass current. Evidence: the file.

Anything that cannot meet all six is either finished in this plan or deleted in this plan. Nothing is
left "built, dormant".

## 1. The system as one loop, with every component placed

```
SOURCES ──sweep──▶ portal_link_candidates ──consume──▶ census_worklist ──mint──▶ intelligence_items
   ▲   (register / feed / sitemap walkers)   (classify → intake)        (THE GATE, record-grade kit)
   │                                                                          │
   │ change detection (monitoring_queue ← sitemap lastmod, feeds)             ▼ enrich (same run, no gate)
   │                                                        connections · forward events · obligations
   │                                                        tags/signals/classifications (ADR-025)
   │                                                                          │
   │ propagation (outbox → DAG → drain → notices) ◀── producers (market_series, emission_factors, regional)
   │                                                                          │
   └──────────────────── customer surfaces (Regulations · Market · Operations · Research · Community) ◀──┘
                         + heal/grounding (Gate A, STEP SOURCE, tiers) keeping every figure sourced
Cross-cutting: harness (9 families, one governing table, F28), discipline (F1–F34 + suite), memory
(ledger/done skills, session log, board), transport (browser → Codespace → PR → squash).
```

Every box has a workstream below. The two loops the audit found (corpus growth, decision propagation) are
one loop here: nothing is "designed only" at the end of this plan.

## 2. Workstreams (each task: files, acceptance evidence per §0)

### W0 — Speed (in flight: PERF-8)
Measured: all routes `private/no-store`, /regulations 857 KB and React #418, item click 4.25 s, five
post-render calls 0.6–3.4 s. Tasks: fix the hydration mismatch at its source with a deterministic test;
cut listing documents to one page of data; split public content (cached data layer with tag
revalidation fired by the runtimes on apply, ADR-026) from per-user state (one client bootstrap call);
`loading.tsx` + prefetch on item links; parallelise the item page's serial awaits; a fitness function
against un-timezoned date rendering and over-inlined listings. Done when: warm click to content < 300 ms
and DCL < 1 s on all five surfaces, re-measured in Chrome, numbers in the log.

### W1 — Intake: close the loop in front of mint
1. **ledger-consume at $0.** `scripts/turns/run-ledger-consume.mjs`, `src/lib/intake/portal-harvest.ts`,
   `src/lib/llm/first-fetch-classify.ts`: accept a session-verdict file (`scripts/_snapshots/ledger-verdicts/
   <run>.json`, schema = the classifier's own output: entity_verdict, item_type, confidence) and bypass the
   API call for rows that carry one; Haiku lanes in this session produce the verdicts with the runtime's
   exact prompt over the 1,837 candidates (page text via the browser where the runtime's fetch is blocked);
   flip `LEDGER_CONSUME_APPLY_ENABLED` in the same diff (ADR-023 mechanism); remove the dead
   `ANTHROPIC_API_KEY` dependency from the plan path. Done when: candidates → `census_worklist` rows with
   `ledger-consume-run-001.json`, promoted count > 0, spend telemetry $0.
2. **The four ratification scripts wired.** `scripts/review/apply-{portal-links,provisional-sources,
   canonical-candidates,coverage-gaps}.mjs` become the four `maintenance.yml` steps their own
   `build-review-digests.mjs` `QUEUES[].maintStep` already names; `review-digests` wrapper corrected (the
   builder exists; the runbook text is stale). Done when: each has a dry and an apply run recorded and
   `portal_link_candidates.status` moves.
3. **`corpus_turn_requests` consumed.** `scripts/turns/consume-turn-requests.mjs` becomes corpus-turn's
   input; `last-turn-date.mjs`'s parallel "what changed" mechanism is retired (one mechanism). Done when:
   1,709 open → consumed with `corpus-turn-run-001.json`.
4. **Event chaining without schedules.** `workflow_run` triggers: source-sweep completed → ledger-consume;
   ledger-consume completed → population-turn; producers completed → propagation-drain. Each still
   dispatchable by hand. Done when: one hand dispatch of source-sweep produces a minted item with no
   further dispatch, artifact chain in the log.
5. **Sitemaps and feeds to 100 %.** SITEMAP-3 (in flight): all-hosts mode, per-source coverage columns
   (migration 304 applied), then repeated dispatches until every active host is walked; feed walker over
   every `sources.rss_feed_url`; `monitoring_queue` receives lastmod deltas; change-detection consumes
   them on dispatch. Done when: `sitemap_walk_outcome` non-null on every active source, feeds probed on
   all, `monitoring_queue` rows from sitemap deltas reconciled at least once.
6. **Artifact branches land themselves.** `deliver-artifact-branch.sh`'s refused-PR fallback stays, but
   the train assembly (fold artifact branches, proposer pass, land) becomes one scripted step the
   coordinator runs per train; the 18 dead branches deleted. Done when: no artifact branch older than one
   train on origin.

### W2 — Population to completion (record grade, $0)
1. Slices of 200 through THE GATE until `would_mint` = 0 (3,461 today ≈ 18 runs), each folding into the
   next train with one proposer pass per family.
2. Holds resolved, not parked: `record_hollow` holds stay held (honest); `ungrounded_url` re-admitted via
   `reopen-validation-holds`; R-A (1,655 off-vertical rows), R-B (10 ambiguous records) and R-E
   (`origin_class` for 1,222 null rows) executed on the recommendations already on file
   (archive / archive / apply mapping) with the guarded, reversible path.
3. Migration 299 (3-slot kit for 149 pre-kit items) applied after a backfill lane re-extracts those
   items' slots, so no live verified item is mass-quarantined.
4. The 6 record-verified items with zero FACT claims: re-minted from their captures or archived
   `record_hollow`; the 575 with one or two FACTs re-extracted under the current kit.
Done when: `census_worklist` has no `would_mint`, every hold names its reason, every record item has ≥ 3
grounded FACTs or an honest GAP per slot and is upgraded to a brief by W9's runtime before it counts as done, all visible on the surfaces.

### W3 — Every figure sourced (rule 18) and every source rated
1. **attach-found-sources.** New maintenance step consuming a worklist `{item_id, token, url, quote}`
   through `heal-provenance.mjs`'s STEP SOURCE (register or match by SC-13's class table, capture, locate
   span, ground FACT, real tier); Haiku browser lanes fill the worklist for the 443 figures on 76 items.
   Done when: heal apply over those 76 shows orphans → 0 or an honest strip of non-assertions only.
2. **Standards bodies at T4** (ifrs.org, cdp.net, sciencebasedtargets.org): `institution-canonicalize`
   Part C override applied; the class table updated so the next host of that class is not "ambiguous".
3. **tier-opinions gets its write path**: `source_tier_opinions` (0 rows, "not runnable") either gains a
   deterministic upstream (the class table + heal read-back tiers) or the step and table are deleted.
4. Credibility chips on all four surfaces (today Research-only), RecordGradeBadge on Operations,
   AiPromptBar on Research and Operations: one rule, four surfaces, UX-gated.
Done when: 0 quarantined-live items for want of a source, every `sources` row rated, every figure on a
surface carries its chip.

### W4 — Decision propagation made real (spec 08's subject)
1. **DAG authorship at write time**: the producers (`eia-v2`, `ecb-fx`, `eurostat`, `desnz/epa`,
   oil bulletin) and the mint chokepoint write `derivation_edges` for the figures they land, per the two
   registered methods; `backfill-lineage-edges.mjs` run once over the corpus and then retired.
2. **First live statutory and estimate rows**: `statutory_computations` (FuelEU Annex IV per spec 08's
   worked example, from the obligations table + `market_series`) and `estimated_values` with their
   writers behind `admissibleFor()`; `entity_scope` writer; corridors seeded beyond the one worked example
   so `reroute_events` can populate.
3. **Drain and notices**: propagation-drain chained off producers via `workflow_run`; 2,748 pending events
   drained; `/api/notices` renders `RecalculationNotice` on the item and Market surfaces; `publish_aggregate()`
   gets its caller (the aggregate views on Market/Operations) or is dropped with its log table.
Done when: a producer apply changes a figure and a notice appears on the page that depends on it, with
`propagation-run-NNN.json` recording the chain.

### W5 — Surfaces: nothing renders empty by design
1. Spec-09 panels: for each 0-row table decide by source: `reroute_events` (unblocked by W4 corridors);
   `grid_connection_queues`, `oem_tech_roadmaps` (deterministic parsers over the structured public
   sources SOURCES.md names, no LLM); `surcharge_audits`, `tce_data_quality`, `auxiliary_energy_profiles`,
   `eudr_plot_claims`, `custody_chains` (customer data: build the workspace CSV upload flow, guarded write,
   RLS per org, so the panels have a real input path); `carrier_compliance_pools` and `indexation_clauses`
   (no reader today: add the reader on Market or drop the tables and producers). No panel ships that
   cannot receive data.
2. `published_price_statistics`: refresh apply after R-D ratification lands; series board shows all six.
3. Every surface re-checked in the browser after W0 with the UX compliance block.
Done when: no live panel renders an empty state for a reason the code itself calls "no source".

### W6 — Community as ruled: user-started rooms on a regional spine
1. Retire `scripts/seed/community-topics-seed.mjs` and its maintenance wrapper (cite the ruling in the
   commit); remove the `community_topics` dependency from discovery (already entity-thread based).
2. Design note (short, comparison of Discord, Reddit, Slack Connect, Circle) → operator ruling → build:
   create-room flow (owner, region, entity binding), discovery of user rooms, `community_promotion_transitions`
   writer (0 rows, no writer today), member-profile verification live end to end, benchmarks answered.
3. Spec 05 §5 "sector-seeded groups" struck from the spec by ADR (replaced by user-started rooms).
Done when: a member can start a room, others find it by region/entity, a post can be promoted, and the
tables that exist all have writers and readers.

### W7 — Discipline: nothing unwired can land again, and what is dead is gone
1. F25 module-liveness widened to `scripts/**` (deliberate one-shots allowlisted by name with an expiry);
   the "no CI" rows of the audit's Appendix A each wired (W1.2, W1.3, W4.1) or deleted:
   `propose-classifications.mjs`, `generate-theme-brief.mjs`, `ratify-flag-to-census.mjs`, the three
   `migration-26x/27x` generators, `held-classes.mjs`, `verification-audit-report.mjs`,
   `build-oil-bulletin-rows.mjs`/`ratify-series-items.mjs` (wired as the R-D producer pair),
   `assumption-register-seed.mjs` (run its `--apply` and give `assumption_register` its reader in the
   obligation register, or drop table + seeder), the six spec-09 producers (W5), `skill-contract-map.mjs`.
2. The 19 dead exports removed; `scripts/mint/lib/gate-a-*.mjs` shims removed once no importer remains.
3. A repo-wide "orphan module" check in CI (the audit's own import-graph + workflow-grep method) so a
   module that is imported by nothing but its test fails the build.
4. Runbook: the four undocumented steps; `schema_migrations` rows for 270–275; inventory rows current.
5. **Closure gate (the missing enforcement).** A governance check that fails CI when: a `maintenance.yml`
   step or workflow has no recorded run artifact after N trains; a board row is `NEXT` with no owning train
   after N trains; a table created by a migration in the window has a writer and no reader (or the
   reverse); a lane brief lacks the §0 done-conditions. The 2026-08-31 register's 4 unexecuted DELETEs and
   5 open WIREs are its first failing rows, executed in T45 through `w1-dispositions`.
Done when: F25 (widened), the orphan check and the closure gate are green with an empty allowlist except
named one-shots.

### W8 — Harness and memory stay whole
Proposer passes per family per train (Haiku), markers discharged by real runs only, `governing-files.mjs`
the single list, meta-harness run per wave; the `ledger` and `done` skills used at every session start and
every train; the session log and board carry every ruling. Done: already true; kept true by F28.

### W9: Brief chain, briefs exist for all items, wired at mint, populated through flywheel
**Workstream plan:** [brief-chain-build-plan-2026-09-11](./brief-chain-build-plan-2026-09-11.md) (Part 1: architecture and ADR-028; Part 2: brief contract; Part 3: runtime execution).

**Operator ruling, 2026-09-09, verbatim** (docs/ops/session-log.md:16493-16500): "the fix is making sure a full brief, analysis of the data and all information is pulled and then put through the flywheel to make sure we are connecting data points across the site, right now we have a completely broken and unwired set of tools. it should NOT be locked out, it's integral to the site, so this needs addressed. You're giving me these three like they are options to fix but ALL of them look like they need fixed, the system isn't working because all of this is a problem and briefs need to exist for all items as well."

Measured 2026-09-11 [CONFIRMED]: A new item is minted at `item_grade='record'` with a stub `full_brief` and zero analysis fields. Nothing upgrades it to a brief until the brief runtime (Part 3, task 3.4, the brief-apply driver) executes. The upgrade is mandatory and automatic for every new item (ADR-028): queued at mint (task 3.5), executed by the runtime (task 3.4), recorded in a harness artifact. The record grade is not a terminal state; it is a cache of the current upgrade state. Done when: Part 1 (ADR-028) accepted, Part 2 (brief contract design) complete, Part 3 (runtime) built and wired at mint for every new item, every item successfully upgraded, harness artifacts recorded.

## 3. Sequence (trains), dependencies, and what lands when

| Train | Contents | Depends on |
|---|---|---|
| T37 (landed #584 `835e3df0`) | R-D ratification, markers discharged, RD-TESTS, audit, plan, crons disarmed, source-sweep-run-012, PROPOSER-9/10 | operator "go" |
| T38 (assembled 2026-09-04 16:45; carries what the table below planned for T39, T40 and T42 because all nine lanes finished together) | W1.1 ledger-consume $0 path + flip; W1.2 four review-apply steps; W1.3 turn-request consumer; W1.4 workflow_run chaining (ledger-consume → population-turn, producers → propagation-drain, `POPULATION_PAUSED` variable); W3.2 T4 standards-body class; W4.1 DAG authorship at write time + `backfill-derivation-edges`; W4.2 first statutory writer (FuelEU Annex IV, rows-file driven, 0 rows until a reviewed rows-file exists); W6.1 seeder deleted; W7.1 F25 widened + orphan/dead-export census; W7.2 register deletes 3/10/12/18 + 16 dead exports + Gate-A shims; W7.5 closure gate in CI (never-run, stale-NEXT, writer/reader, lane contract; `docs/ops/dispatch-ledger.jsonl`) | T37 |
| T38b → landed as T39 | PERF-8 items 1/2/6 (W0) + FWD-TEXT-4 + SITEMAP-3 (W1.5 code; migration 304 applied after landing) + LEDGER-EXPORT (the export carries fetched text) + TICKET-CORPUS; PERF-8 items 3/4/5 (caching model, item-click RSC, post-render calls) → PERF-9, train 40 | T38 |
| T39 (this train) | first dispatches that prove T38's components per §0: maintenance `institution-canonicalize` dry → apply; `review-digests` apply then the four review-apply steps (dry, then ruled apply); corpus-turn dry → apply (limit 200); propagation-drain `backfill_and_statutory` apply then the chained drain; producers apply (edges authored inline); `ledger-consume` plan with the first session-Haiku verdicts file (the Haiku lanes classify the 1,837 candidates from `--export-candidates`); each recorded in `docs/ops/dispatch-ledger.jsonl` | T38 |
| T40 (folded into T38) | W1.3, W1.4, W7.1: landed in T38 | — |
| T41 | W3.1 attach-found-sources + browser lanes over the 443; W3.3 tier-opinions path | T39 |
| T42 (W4.1/W4.2 writers landed in T38) | corridors (W4.2 second corridor entity so `spec09-reroute` can write); the statutory rows-file (reviewed ship-year GHG inputs) so `write-statutory` computes its first rows | T39 |
| T43 | W4.3 drain chaining + notices on surfaces; W5.1 spec-09 decisions built (parsers, upload flow, readers) | T42 |
| T44 | W6 community build after the ruling; W3.4 chips/badges on all surfaces | T39 |
| T45 | W7.2–7.4 dead exports, shims, runbook, migration ledger; W2.3 migration 299 with backfill | T40 |
| T46 | **Full-system validation (operator instruction 2026-09-04: "a full test of the system to validate that every item is used")**: one lane per loop stage re-checks every component against §0 with fresh evidence (a sweep dispatch flowing to a surface with no coordinator step; every maintenance step with a run artifact; every table with a writer and a reader and rows; every surface measured in the browser); the closure gate green; the audit re-run and diffed against 2026-09-04 | T45 |
| continuous | W1.5 sitemap/feed dispatches until 100 %, W2.2 hold rulings executed. **Population slices are stopped until T46 passes (operator, 2026-09-04)** | T38 |

Each train: full gates (fitness 0, discipline 141+, suite, tsc, rendering smoke, UX block where surfaces
change), memory postscript + board, proposer passes, browser measurement where a surface changed. A train
does not land with a component that fails §0.

## 4. What this plan will not do
No schedules or crons (rule 16). No metered API calls where a session lane or the browser does the work.
No LLM in population or classification runtimes. No component left "built, not dispatched": every
remaining one above is either finished or deleted, with the audit's evidence as the checklist.

## 5. Revision 2026-09-18: the machine before the data (supersedes section 3's sequence for everything unfinished)

**Operator ruling, 2026-09-18, verbatim intent:** "before we continue updating the data and eating tokens
doing it, I want to make sure we have fully finished building the system that collects, evaluates and uses
the data and puts it into the site; I do not think that is complete and we will just have to go back and
fix the data again." Then: "Re-verify every stage against the six criteria on today's master with read-only
checks, one table, one owner per stage, fixing nothing during the audit. Then close the machine gaps in loop
order: mint gate, evaluate, propagate, publish. Only then run each data pass once." And in the same message,
the site-wide parts brief for the design (section 5.4).

**Why this revision exists.** Section 3 already carried this order: train T46, "one lane per loop stage
re-checks every component against section 0", with "population slices stopped until T46 passes (operator,
2026-09-04)". The 2026-09-05 audit was that check and scored 53 rows: 12 complete, 22 partial, 7 built but
dormant, 11 not built, 1 unverified, with eleven machine findings. W9 then went to the data side (briefs for
every item) while the apply path under it was still being corrected: three fixes in two days (L40 attribution
by content, L42 pool-row and GAP allowance, L43 brief-failure mirror), each forcing re-applies. The session
log since 2026-09-12 records work on two of the eleven findings and none on the other nine. That is data
paying for machine work, which is the loop the ruling stops. [CONFIRMED by reading the audit README and the
session log, 2026-09-18]

### 5.0 Standing state while this revision runs

- No batch apply, no provenance heal, no re-scan and no brief lane runs until 5.1 is signed and 5.2 is
  done. The W9 batches already authored (005, 008, 008b, 009 reg-a, reg-b, research-ops, 009b, market, 010)
  stay in their PRs; their PRs may merge (they are files, not data) but nothing applies them.
- The open lane PRs on the merge train (#704 to #712) are code and batch files; they merge in order as
  before. Nothing else is pushed until the audit reports are in.
- Read-only means: no writes, no migrations, no workflow dispatches, no full builds, SQL SELECT only under the
  IO budget (stored length columns, LIMIT, never a corpus-wide content scan), no LLM or paid calls.

### 5.1 The stage audit (one table, one owner per stage, fixing nothing)

Six stages, taken from the loop in section 1, plus the design inventory the parts brief demands before any
design lane starts. Each owner produces one table against section 0's six criteria for every component in
the stage, with the verdict vocabulary of the 2026-09-05 audit (COMPLETE, PARTIAL, BUILT-DORMANT, NOT BUILT,
COULD NOT VERIFY) and rule 14's status token on every cell. The prior audit's file for the stage is a claim
to re-check, never evidence. Reports land as `docs/audits/stage-audit-2026-09-18/<stage>.md` with a README
that carries the merged table.

| Stage | Loop boxes (section 1) | Components to score (start list; the owner extends it from the code) | Prior claims to re-check |
|---|---|---|---|
| S1 collect | sources, sweep, portal_link_candidates, change detection, monitoring_queue | register / feed / sitemap walkers, check-sources, source-sweep runs, monitoring_queue writers and readers, capture worker, snapshots | W1-W2 file, W1.5 rows |
| S2 mint gate | consume, census_worklist, mint, enrich | classify and intake, corpus-turn and population-turn workflows, apply-mint-batch, the record-grade kit at mint, ledger-consume (both halves), corpus-turn-requests | W1-W2 file; findings 1, 4, 5 |
| S3 evaluate | heal and grounding, Gate A, STEP SOURCE, tiers | brief runtime (W9 Parts 1 to 3: generate, ground, validate_item_provenance, Gate A, quarantine disposition, heal), attach-found-sources, tier-opinions, institution canonicalisation, every-figure-sourced (rule 18) | W3-W4 file; findings 2, 7; brief-chain plan Part 7 |
| S4 propagate | outbox, DAG, drain, notices, producers | derivation_edges authorship per producer family, drain chaining, notices, market_series, emission_factors, regional producers, statutory_computations, estimated_values, spec-09 decisions and the CSV route | W3-W4 file; findings 6, 7, 11 |
| S5 publish | customer surfaces | the five surfaces and the dashboard: listing and detail RPCs (verified-only, item_grade, migration 310), what each surface renders from which table, the rendering guard, the admin surfaces that operate the machine | W5-W6-W7 file; finding 3; the parts brief's acceptance list as the visible criterion |
| S6 gates and harness | cross-cutting: harness, discipline, memory, transport | execution-wiring and F1 to F48 reachability, the closure gate and its STALE-NEXT entries, harness families and their artifacts, maintenance.yml steps, the memory hooks (ledger, done, vault-sync) | loop-harness file; skills-rules file; findings 8, 9, 10 |
| D1 parts inventory | (design) | `docs/design/parts-inventory.md` per the parts brief 1.1: for each part in its section 2, the component path or NONE, and every route rendering the equivalent UI without it (file and line) | SHARED-PART-REPORT-2026-09-08, AUDIT-2026-09-07 |

Sign-off, superseded the same day: the operator ruled "make a build plan to fix it ALL"; section 6 decides every
row from doctrine (finish unless a rule says delete) and the operator's word overrides any line. The audit landed as
`docs/audits/stage-audit-2026-09-18/README.md`.

### 5.2 Gap closure, in loop order

After sign-off, lanes close the machine gaps in the loop's own order so that each stage is complete before
the next stage depends on it: S2 mint gate, then S3 evaluate, then S4 propagate, then S5 publish, with S1 and
S6 fixes slotted where a later stage needs them. Every lane meets section 0 in full (reachable, run,
populated, visible, gated, documented) and lands with the fitness function or golden that keeps it there. The
eleven 2026-09-05 findings are the first entries of that list; the audit adds or retires entries with
evidence. A lane that finds it must touch data to prove itself runs a bounded probe (one item, read back),
never a pass.

### 5.3 The data passes, once

Only when 5.2 is complete for a stage's consumers does the corresponding data pass run, each once, in this
order and each through the brief-apply workflow under the IO budget with the overwrite flag: the authored W9
batches in their PR order; the Gate A re-scan; the provenance heals for the healed captures; the refetch-capped
apply when the operator hands the GUARD-1 token. A pass that fails on the machine stops the passes and reopens
5.2; it does not get re-run against a patched apply path.

### 5.4 W10, the parts program (design)

The operator's site-wide parts brief of 2026-09-18 is landed verbatim as
[`docs/design/parts-brief-2026-09-18.md`](../design/parts-brief-2026-09-18.md) and governs every surface
change from here. The rule of work is parts, not pages: a lane owns one shared part and every call site of it
on all 17 routes plus /watchlist, /privacy and /invitations, and is done when the part renders from one file
everywhere, proven by a presence report (route, file, line) and one fixture screenshot of the part with all
its variants. The operator signs off parts; page screenshots are no longer the review unit.

Order and gating, from the brief:

1. D1 parts inventory (5.1) before any lane starts.
2. The parts gate: the brief calls it F44; F44 is taken (`F44-broken-main-guard`), so it lands as **F49
   parts-not-pages** with the brief's exact rule: a route's page.tsx may not contain the literal styles that
   define a part (Anton title, card border and radius 10, 3px rule, fact card edge or band, chip padding,
   state note edge); pages import parts; no grandfathering. It lands with the first part lane so every later
   lane is measured by it.
3. A fix lane first, disjoint from every part lane so it runs alongside FactCard: the impact meter row
   variant (brief 2.16, added 2026-09-18): `ImpactMeter.tsx` renders the stepped fill of the total N/12 in one
   ramp colour, identical markup for identical N, dashed outlines and an em dash when unscored, the "Impact"
   header alone, the legend at 8/12; the per-dimension breakdown stays in the full variant only. Acceptance is
   the brief's: on every list route, rows grouped by N render byte-identical meter markup, zero "LOW to HIGH"
   headers, zero green bars at N of 7 or more.
4. Lanes in the brief's order: FactCard (v2, artboard 21c) then ItemGroup and SectionHeader, then Masthead
   and ActionCard, then CommandBar, then ListRow with Absence and Chips, then StateNote, then RailCard and
   StatBlock, then NavCard. Each lane also removes the out-of-scope content its part touches (brief 2.15).
5. Acceptance is the brief's section 3, measured at 1440 on every route through the existing rendering audit
   machinery (`fsi-app/.discipline/rendering/audit/`), not on one page.
6. Artboard wins over README; a case not drawn is asked, never invented; the operator answers the same day and
   adds it to the README.

Coordinator notes reported under the brief's rule 1.3: the bundle is `docs/design/handoff-2026-09-06/` (the
brief names a 2026-09-07 folder that does not exist); artboard 21 and its README dimensions are owed to that
bundle before the FactCard lane starts; the fitness number is F49.

### 5.5 Sequence

| Step | Contents | Depends on |
|---|---|---|
| A (now) | 5.1: seven read-only owners, one table each, merged README; merge train drains #704 to #712 | operator go, 2026-09-18 |
| B | operator sign-off per row | A |
| C | 5.2 lanes in loop order; F49 and D1 land with the first W10 lane | B |
| D | 5.3 data passes, once each | C per stage |
| E | W10 part lanes in the brief's order, each signed off by the operator | A (D1), C where a part reads a field the machine must first produce |
| F | P7 re-measure and /done with the three standing numbers, the board row, and the stage table re-run green | D, E |

## 6. Build plan 2026-09-18: fix it all (the machine, then a proof run, then the data, with the parts program alongside)

**Operator ruling, 2026-09-18, verbatim intent:** "the system is the focus right now, NOT the data; then after
we fix the system and make sure it works, we fix the data." And: "after this audit is complete, make a build
plan to fix it ALL." This section is that plan. It replaces section 5.1's per-row sign-off: every row of the
stage audit (`docs/audits/stage-audit-2026-09-18/README.md`) is decided here from doctrine, finish unless a
rule says delete; the operator's word overrides any line.

### 6.0 What "fixed" means

The loop in section 1 runs from one dispatch at its head through every hop to the customer surface with no
person in between, and leaves a harness artifact at every hop. No schedule (rule 16 and the build-mode ruling:
`scrape_cadence` stays off; nothing runs on a clock). The head is one human dispatch; everything after it is
`workflow_run`. Every lane below lands with all six section 0 criteria and names its evidence; a lane that
cannot meet one says so in its report and the criterion stays red on the board until it does.

### 6.1 Lanes, in loop order

Lane contract: `docs/plans/brief-chain-build-plan-2026-09-11.md` Part 7.2 (tests, tsc, memory gate, glyph
rule, never the pre-push hook, one writer per worktree, grep for prior art before building, stage explicit
paths). **Execution rule (operator, 2026-09-18): the lanes are Sonnet and Haiku sub-agents, dispatched
by the coordinator with a self-contained brief; a lane does exactly what its brief says and nothing beyond it.
A lane that meets a problem the brief does not address, a choice the brief does not make, or a failure it
cannot explain STOPS, writes the problem in its report (what, where, the evidence) and returns; it does not
work around it, does not widen scope, does not pick an answer. The coordinator (Fable) solves the problem,
amends the plan or the brief, and re-dispatches. Deviation is a defect of the lane, not initiative.** Read-only SQL for probes; any corpus write is a bounded probe of one row read back, never a pass.
Each lane's commit carries its harness artifact, its gate, its runbook section and its session-log entry.

| Lane | Gap (audit) | What lands | Files (start list) | Acceptance (section 0, named evidence) | Depends on |
|---|---|---|---|---|---|
| M0 housekeeping (coordinator) | L39 code unmerged; migration 299 unapplied; nine lane PRs open | merge train drains #704 to #712; migration 299 applied by the coordinator before its dependent code merges (rule 3); `docs/inventories/migrations.md` rows | the open PRs; `supabase/migrations/299_*.sql` | PRs merged; `select count(*)` of pre-kit items at 0 read back; inventory row | none |
| M1 head of the loop | S1: nothing starts a sweep or a fetch drain; fetch-drain has no workflow | `fetch-drain.yml` (dispatch plus `workflow_run` after "Source sweep"), replacing the hand `pg_net` call; `source-sweep.yml` becomes the loop head with one input (`scope`: all-hosts, changed, or a host list) and a `loop_run_id` it passes downstream; harness family `fetch-drain` commits artifacts like every other family | `.github/workflows/source-sweep.yml`, new `.github/workflows/fetch-drain.yml`, `scripts/turns/run-fetch-drain.mjs` (extract the pg_net call from the runbook into a script with a harness artifact), `scripts/harness-runs/CONVENTION.md` | reachable: both workflows have `run:` lines; run: `fetch-drain-run-004` from a `workflow_run` firing, not a dispatch; populated: `pending_first_fetch` queued count moves; visible: population-report line; gated: the loop manifest (M9); documented: runbook section | none |
| M2 ledger-consume apply | S2 finding 1: the apply half has never fired | apply mode wired as the `workflow_run` hop after the sweep with a bounded cap (`max_promote` input, default 50) and a plan-then-apply pair in one run; the promoted rows carry `loop_run_id`; `LEDGER_CONSUME_APPLY_ENABLED` retired as a constant (the cap is the guard) | `.github/workflows/ledger-consume.yml`, `scripts/turns/run-ledger-consume.mjs` | run: an artifact with `config.mode:"apply"` and `promoted > 0`; populated: `portal_link_candidates.status='promoted'` count moves from 3 and `census_worklist` gains rows with that run id; gated: golden that fails if apply is unreachable from the workflow (grep of the yml in the test); documented | M1 |
| M3 turns chained and proven | S2: corpus-turn has no upstream; downstream-chain never fired; apply-mint-batch skips rule 16 on the batch path | `corpus-turn.yml` gains `workflow_run` after "Ledger consume" (tickets present) alongside its dispatch; `population-turn` un-pauses behind the M2 cap (the cap bounds the mint, not a flag); the batch mint path runs discovery and forward-events inline like the single-item path (finding 4 closed); harness family `downstream-chain` with a committed artifact | `.github/workflows/corpus-turn.yml`, `population-turn.yml`, `downstream-chain.yml`, `scripts/mint/apply-mint-batch.mjs`, `src/lib/intake/mint-item.ts` (shared enrichment helper, one home) | run: `mint-run-030` and `downstream-chain-run-001` both from `workflow_run`; populated: new items minted at record grade with obligations, tags and tier opinions rows keyed to the same `loop_run_id`; gated: F13 chokepoint stays green; a test that the batch path calls the shared enrichment; documented | M2 |
| M4 brief chain wired at mint | S3: mint leaves a stub; export and apply are hand hops | `brief-export.yml` gains `workflow_run` after "Population turn" for the run's minted ids (the export lands as a committed batch skeleton on a `brief-lane/` branch, so the authoring lane starts from it); `brief-apply.yml` runs its dry mode automatically on a batch-file merge to master (`push` path filter on `scripts/turns/record-briefs/batches/`) and its apply mode on dispatch only (handoff rule 4: no production apply on merge without a human), under the IO budget with the overwrite flag; a `briefs owed` line in the population report (record-grade items with a stub `full_brief`, by age) so a stub is never silent | `.github/workflows/brief-export.yml`, `brief-apply.yml`, `scripts/turns/record-briefs/`, `scripts/maintenance/population-report.mjs` | run: an export artifact from `workflow_run`; a dry-run artifact from a batch merge; populated: the owed line goes down when a batch applies; gated: golden on the yml triggers; documented (README of record-briefs) | M3 |
| M5 market-series edges | S4: wired code authors zero edges | traced apply run of `ecb-fx` with the authorship path logged (`--trace`); the defect fixed at its cause; the producer harness artifact asserts `edges_authored > 0` whenever `rows_changed > 0` and fails the run otherwise (the run is the gate) | `scripts/producers/market/*.mjs`, `scripts/producers/lib/run-envelope-producer.mjs`, `authorMarketSeriesDeltaEdges` | run: a producer artifact with `edges_authored > 0`; populated: `derivation_edges from_table='market_series'` > 0; then one drain run that reports `recomputed > 0` from those edges; gated: the artifact assertion plus the existing static contract test; documented | none (parallel with M1 to M3) |
| M6 evaluate invokers | S3: Gate A bulk re-scan and the quarantine disposition verifier have no invoker but a dispatch | `gate-a-rescan` runs as a `workflow_run` hop after "Brief apply" and after "Population turn" (scope: items whose `gate_a_version` differs from the constant), so the corpus never carries two versions; `quarantine-disposition-audit.mjs` runs in the CI data-audit lane and fails on any undispositioned past-bound item (RD-6 measured, not only registered); `attach-found-sources` re-dispatched to finish the 94 open worklist rows and its step chained after brief-apply for new orphans | `.github/workflows/maintenance.yml` (or a `gate-a.yml`), `scripts/verify/quarantine-disposition-audit.mjs`, `scripts/verify/run-data-audit-lane.mjs`, `scripts/maintenance/attach-found-sources.mjs` | run: a re-scan artifact from `workflow_run`; populated: `distinct(gate_a_version) = 1` read back; the disposition audit red-then-green in CI with the 53 items dispositioned or deferred with valid deferrals (write-time guard); gated: the CI lane; documented | M4 |
| M7 last mile | S5, S4: grade badge unmounted; notices unfed; computed-values writers without input | the grade renders on every list row and detail masthead from the shared parts (the parts brief has no grade slot: it renders as a kind chip in the title meta line per brief 2.10 unless the operator draws otherwise, recorded as a case not drawn); `NoticesRail` proven with one superseded pair from M5's drain; the statutory writer's input path becomes an admin-uploaded, schema-validated rows-file (spec-09 upload flow reused, one home) instead of a fixture path, so the writer is reachable from the product; `estimated_values` gets its first writer for the one case W4 specifies, or W4 is amended to say the table is retired (no third state) | `src/components/ui/ListRow.tsx`, `Masthead.tsx`, `src/components/shell/RecordGradeBadge.tsx` (folded into Chips), `src/app/api/notices/route.ts`, `scripts/propagation/write-statutory.mjs`, spec-09 upload route, `docs/plans/complete-system-build-plan-2026-09-04.md` W4 | visible: the grade on every list route at 1440 through the rendering audit; run: a notices response with one real notice; populated: `statutory_computations > 0` from an uploaded file, or the retirement migration; gated: F49 (parts) and the presence report; documented | M5, and the FactCard lane for the chip |
| M8 collect completeness | S1: sitemap backfill never completed; feed walker failed once; research walker never ran | dispatch runs to 100% of hosts under the sweep head from M1, in bounded slices with artifacts; the feed walker's one failure diagnosed and fixed or the feed retired with reason; the research walker's first run; the inaccessible-source triage ladder leaves a committed artifact | `src/lib/sources/sitemap-walk.mjs`, `scripts/turns/research-sweep.mjs`, `scripts/sources/inaccessible-triage.mjs` | run: artifacts `source-sweep-run-019+` until the never-walked bucket reads 0; populated: `sources` walked counts; gated: the loop manifest; documented | M1 |
| M9 loop manifest and harness truth | S6: wired-but-never-fired is invisible; dispatch ledger dark; maintenance family has no committed artifacts; closure gate too slow locally; community promotion A and B both dormant; rooms hardcode GLOBAL | `.discipline/governance/loop-manifest.mjs`: the hops of section 1 as data (producer workflow, consumer workflow, trigger kind, harness family); gate F50 loop-wiring: every hop's `workflow_run` edge exists in the yml, every family has an artifact newer than its governing-files hash, every hop has fired at least once (an artifact whose `trigger` reads `workflow_run`); the dispatch ledger appended by a workflow step, never by hand; maintenance.yml commits its artifacts like the other families; closure gate finishes locally under a budget (cache the merge-base scan); community promotion mechanism A (`community_promotion_transitions`, 0 rows, no importer) retired by migration and its module deleted, B kept; rooms bind region from the creating workspace (W6.2) | `.discipline/governance/`, `.discipline/fitness/functions/F50-loop-wiring.mjs`, `docs/ops/dispatch-ledger.jsonl` writer step, `maintenance.yml`, `closure-gate.mjs`, a migration dropping the dormant table, `src/app/api/community/.../route.ts` | gated: F50 red on today's tree, green after M1 to M6 land; run: ledger rows appear from workflow runs; documented: runbook | none for the gate (it lands first and stays red until the hops land); M1 to M6 for green |

### 6.2 The proof run (the "make sure it works" step)

When M1 to M6 and M9 are merged: one dispatch at the head (`source-sweep.yml`, scope `changed`, a
`loop_run_id`). Pass criteria, read from artifacts and SELECT only: an artifact at every hop carrying that
run id and `trigger: workflow_run` (sweep, fetch-drain, ledger-consume apply, population-turn, downstream-chain,
propagation-drain, brief-export, gate-a-rescan); the population report shows the run's items minted, enriched,
exported and owed a brief; F50 green. A hop that does not fire reopens its lane. Nothing in 6.3 starts before
this passes. The proof run is recorded as `docs/audits/loop-proof-run-<date>.md` with the artifact paths.

### 6.3 The data, once (unchanged from 5.3)

After the proof run: the authored W9 batches in PR order through brief-apply (dry automatic, apply on
dispatch, IO budget, overwrite flag); the Gate A re-scan is already automatic from M6; the provenance heals;
the refetch-capped apply when the operator hands the GUARD-1 token; the statutory rows-file through M7's
upload path; the sitemap backfill slices from M8 until 100%. A pass that fails on the machine reopens the
lane; it is not re-run against a patched path.

### 6.4 The parts program (W10), alongside

Independent of the machine lanes because the files are disjoint. Order from section 5.4: F49
parts-not-pages and the impact meter fix first, then FactCard, ItemGroup with SectionHeader, Masthead with
ActionCard, CommandBar, ListRow with Absence and Chips (the grade chip from M7 lands here), StateNote,
RailCard with StatBlock, NavCard. The parts inventory (`docs/design/parts-inventory.md`) is the backlog and its
section 4 lists the eight cases not drawn; those go to the operator as they are reached, never invented.
Artboard 21 is owed to the bundle before FactCard starts.

### 6.5 Sequence

| Step | Contents | Runs |
|---|---|---|
| A | this audit and plan land; M0 (train, migration 299) | now |
| B | M9 gate lands red; M1, M5 start; W10 F49 and impact meter start | after A |
| C | M2, then M3, then M4, then M6, then M7; M8 slices as M1 lands | in order |
| D | proof run 6.2 | after C |
| E | data once 6.3 | after D |
| F | W10 part lanes continue in order, each signed off by the operator | from B |
| G | P7 re-measure and /done: the three standing numbers, F50 green, the stage table re-run with every row COMPLETE or retired with reason | after E and F |
