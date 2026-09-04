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
grounded FACTs or an honest GAP per slot, all visible on the surfaces.

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

## 3. Sequence (trains), dependencies, and what lands when

| Train | Contents | Depends on |
|---|---|---|
| T37 (assembled, unlanded) | R-D ratification, markers discharged, RD-TESTS, audit, plan, crons disarmed, source-sweep-run-012, PROPOSER-9/10 | operator "go" |
| T38 | PERF-8 (W0) + FWD-TEXT-4 + SITEMAP-3 (W1.5 code) + migration 304 applied | T37 |
| T39 | W1.1 ledger-consume $0 path + flip; W1.2 four ratification steps; W3.2 T4 override; W6.1 seeder retired | T38 |
| T40 | W1.3 turn-request consumer; W1.4 workflow_run chaining; W7.1 F25 widened + orphan check (allowlist filled from the audit) | T39 |
| T41 | W3.1 attach-found-sources + browser lanes over the 443; W3.3 tier-opinions path | T39 |
| T42 | W4.1 DAG authorship + lineage backfill; W4.2 statutory/estimate writers + corridors | T40 |
| T43 | W4.3 drain chaining + notices on surfaces; W5.1 spec-09 decisions built (parsers, upload flow, readers) | T42 |
| T44 | W6 community build after the ruling; W3.4 chips/badges on all surfaces | T39 |
| T45 | W7.2–7.4 dead exports, shims, runbook, migration ledger; W2.3 migration 299 with backfill | T40 |
| continuous | W2.1 population slices, W1.5 sitemap/feed dispatches until 100 %, W2.2 hold rulings executed | T38 |

Each train: full gates (fitness 0, discipline 141+, suite, tsc, rendering smoke, UX block where surfaces
change), memory postscript + board, proposer passes, browser measurement where a surface changed. A train
does not land with a component that fails §0.

## 4. What this plan will not do
No schedules or crons (rule 16). No metered API calls where a session lane or the browser does the work.
No LLM in population or classification runtimes. No component left "built, not dispatched": every
remaining one above is either finished or deleted, with the audit's evidence as the checklist.
