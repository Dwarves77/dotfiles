# A1 — Runtimes audit (workflows in `.github/workflows/`)

Scope: all 17 files in `.github/workflows/` at `e8cb748f` and every dispatchable step/mode/walker inside
them. Evidence sources used: `git log` on this worktree; `fsi-app/scripts/harness-runs/<family>/*.json`
(committed run artifacts, each carrying a real GitHub-Actions `run_id` in its `config` paths);
`fsi-app/scripts/harness-runs/<family>/PENDING-RUN.md` (F28's own "never run" acknowledgment format);
`docs/runbooks/MAINTENANCE-RUNBOOK.md` §1–§12; `docs/ops/session-log.md`; read-only `SELECT`s against the
live Supabase project `kwrsbpiseruzbfwjpvsp`; and `git for-each-ref`/`git merge-base` against `origin/*`
runtime branches. `[CONFIRMED]` = I ran or read it directly this session; `[HYPOTHESIS]` = inferred, not
directly verified.

---

## 1. Workflow-level summary (17 files)

| Workflow | Trigger | Built / last changed (git log) | Dispatch evidence | Loop stage |
|---|---|---|---|---|
| `maintenance.yml` | `workflow_dispatch` only, no schedule | first 2026-09-02, last 2026-09-04 (`e1a02872`) | **[CONFIRMED]** Extremely heavy — MAINTENANCE-RUNBOOK.md documents ≥35 named dispatches by run number, several with real Actions run IDs (`33855060659`, `33851505474`, `33864089323`, `33829526120`, …) | population-turn: mint under THE GATE (operator-gated writes) |
| `population-turn.yml` | `workflow_dispatch` only; schedule commented out | first 2026-09-02, last 2026-09-04 (`03e6a8a8`) | **[CONFIRMED]** 15 real runtime branches `origin/population/<run_id>` dated 2026-09-02→2026-09-04; `mint` harness family has 27 committed run artifacts, latest `mint-run-027.json` (`config.out_dir` path names run `33878338285`) | population-turn: export → mint under THE GATE |
| `corpus-turn.yml` | `workflow_dispatch` + `push: turn/**`; schedule commented out | first 2026-09-01, last 2026-09-04 (`03e6a8a8`) | **[CONFIRMED]** 1 runtime branch `origin/turn/33802504364` (2026-09-03); `forward-events` family has 32 committed artifacts (latest `forward-events-run-032.json`, `config.out_dir` names `population-flywheel-mint-run-027`, i.e. chained off a population run) | flywheel: connection discovery (`discover-for-items.mjs`) + forward events (`run-extraction.mjs`/`apply-extraction-output.mjs`) + L4 signals (`analyze-corpus.mjs`) |
| `change-detection.yml` | `workflow_dispatch` only; schedule commented out | first 2026-09-02, last 2026-09-04 (`03e6a8a8`) | **[CONFIRMED]** `change-detection` harness family: 5 committed artifacts, 6× `mode:dry` + 4× `mode:apply` across those 5 files (a run can log both an outer dry projection and inner apply counts) | change-detection: monitoring_queue → reconcile |
| `propagation-drain.yml` | `workflow_dispatch` only; schedule commented out | first 2026-09-02, last 2026-09-04 (`03e6a8a8`) | **[CONFIRMED]** 2 runtime branches `origin/propagation/<run_id>` (2026-09-02); `propagation` harness family: 2 artifacts, 2× dry + 2× apply logged | propagation (ADR-024 decision propagation) |
| `source-sweep.yml` | `workflow_dispatch` only; schedule commented out | first 2026-09-01, last 2026-09-04 (`03e6a8a8`) | **[CONFIRMED]** 6 runtime branches `origin/source-sweep/<run_id>` (2026-09-02→2026-09-04); `source-sweep` harness family: 11 artifacts, 6× apply + 15 dry entries (multi-window runs) | source sweep (register/feed/sitemap walkers) |
| `ledger-consume.yml` | `workflow_dispatch` only; schedule commented out | first 2026-09-02, last 2026-09-04 (`03e6a8a8`) | **[CONFIRMED] NEVER DISPATCHED** — `fsi-app/scripts/harness-runs/ledger-consume/` holds only `PENDING-RUN.md`, zero `*-run-*.json` files; no `origin/ledger-consume/*` branch exists in `git for-each-ref` | ledger-consume: classify → intake |
| `producers.yml` | `workflow_dispatch` only; schedule commented out | first 2026-08-30, last 2026-09-03 (`97eef2c7`) | **[CONFIRMED]** live `market_series` rows exist under 3 of 9 producer keys (`eia-v2:*` 2726 rows, `eu-oil-bulletin:*` 12 rows, `ecb-fx:*` 3 rows) — real applies. `refresh-published-price-statistics` derived 4 rows into `published_price_statistics`. Eurostat/BLS/DESNZ/EPA producers: session-log names dry dispatches (`#15/#16` `eurostat-lc-lci-lev`) but I found no corresponding live row count check beyond `regional_data_facts` (90 rows) / `emission_factors` (13 rows), which are shared across several producers — cannot attribute per-producer without re-running `--dry` | producers feed regional_data_facts / market_series / emission_factors, which population-turn/change-detection read as source-of-record context |
| `data-audit-lane.yml` | `workflow_dispatch: {}` only; schedule commented, explicitly **stopped by operator ruling** | first 2026-06-11, last 2026-08-11 (`946b11a9`, pre-window) | **[CONFIRMED]** Header states dispatch run #67 was first fully green since #36 (2026-08-11) — pre-dates the 2-week window; no evidence of a dispatch inside the 2026-08-21→2026-09-04 window | audit lane over the census/mint pipeline; not itself a loop stage |
| `discipline.yml` | `push: master`, `pull_request: master` | first 2026-05-20, last 2026-09-03 (`e8dc50f8`) | **[CONFIRMED]** fires on every push/PR to master — 107 PRs in the window is itself the run count; this is a CI gate, not a loop stage | CI guard (fitness functions, memory-gate, UX smoke) |
| `build-proof.yml` | `push: master` | first + last 2026-09-02 (`d60124b9`) | **[CONFIRMED]** fires on every push to master since 2026-09-02 | CI guard (deployed-bundle build proof) |
| `bug-class-guard.yml` | `push: master`, `pull_request` | first 2026-06-01, last 2026-08-12 (pre-window) | **[CONFIRMED]** fires on every push/PR; last *code* change pre-window, but it still executes on every one of the 107 PRs | CI guard |
| `inspect-oil-bulletin.yml` | `workflow_dispatch: {}` | first + last 2026-08-30 (pre-window by one day) | **[HYPOTHESIS]** read-only inspection tool for the oil-bulletin `.xlsx` format (no DB, no artifact) — no artifact trail to confirm a post-window re-dispatch; superseded once `fetch-oil-bulletin.mjs` shipped inside `producers.yml` | one-off scouting tool for the EU Weekly Oil Bulletin producer; not itself a loop stage |
| `source-monitoring.yml` | `workflow_dispatch` (`check-sources` / `triage`); schedule commented, **acquisition freeze** | first 2026-04-27, last 2026-09-02 (`65dfeb55`) | **[HYPOTHESIS]** `triage` job (inaccessible-source ladder) built 2026-09-02; no harness-run family exists for it and I found no session-log dispatch confirmation in the window | change-detection-adjacent: sources health, feeds monitoring_queue indirectly |
| `spot-check-monthly.yml` | `workflow_dispatch` only; schedule commented, **metered/frozen** | first 2026-04-27, last 2026-07-25 (pre-window) | No changes or dispatch evidence in window | population re-classification spot-check; dormant |
| `trust-recompute.yml` | **`schedule: '0 3 1 * *'` (ACTIVE)** + `workflow_dispatch` | first + last 2026-04-27/28 (pre-window) | **[HYPOTHESIS]** monthly cron is live and unrelated to the build-mode freeze pattern every other family uses — next fire 2026-10-01; no artifact trail (it's a stateless HTTP POST, not a harness family) so I cannot confirm the 2026-09-01 fire actually ran | trust score recompute, feeds source tier used by mint's authority floor |
| `uptime-probes.yml` | **`schedule: '0 9 * * *'` (ACTIVE, spend job only)** + `workflow_dispatch` (`surfaces` job) | first 2026-07-11, last 2026-08-10 (pre-window) | **[HYPOTHESIS]** daily spend cron is live; `surfaces` job is dispatch-only by design (re-shaped 2026-08-10 to avoid false-reds against the deliberately-dormant health cache) — no artifact trail to confirm daily firing inside the window | observability probe, not a loop stage |

**Rule-16 note** ("no standing schedules during build"): every workflow that touches the flywheel loop
itself (`maintenance`, `population-turn`, `corpus-turn`, `change-detection`, `propagation-drain`,
`source-sweep`, `ledger-consume`, `producers`, `data-audit-lane`, `spot-check-monthly`) carries its
`schedule:` block **commented out** with an explicit build-mode note. The two exceptions —
`trust-recompute.yml`'s monthly cron and `uptime-probes.yml`'s daily spend cron — are both pre-window
(April/July builds) and are observability/scoring probes outside the loop proper, not enumeration/mint
steps; I did not find an operator ruling exempting them from rule 16, so they are flagged below as a gap
to confirm, not asserted as a violation.

---

## 2. `maintenance.yml` — every dispatchable step

20 named steps + `all` (dry-only fan-out). Governed by `docs/runbooks/MAINTENANCE-RUNBOOK.md` §1–§12 for
16 of them; 4 steps exist in the workflow's dispatch dropdown and have real run scripts under
`fsi-app/scripts/maintenance/` but are **not documented in the runbook's §1–§12 numbering** — confirmed
by grep (zero hits) and cross-checked as real, dispatched steps via `docs/ops/session-log.md`.

| Step | Built (PR/lane, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `community-topics-seed` | Runbook §1, 2026-09-02 | `maintenance` dispatch, `arg` none | **[CONFIRMED]** live `community_topics` = **0 rows** (queried this session) — same as the runbook's own "before" baseline; no evidence an `apply` dispatch ever landed | customer surfaces: Community | WIRED-NOT-RUN | Never applied; Community topic taxonomy still empty live |
| `tier-opinions` | Runbook §2 | n/a — no DB path exists | **[CONFIRMED]** live `source_tier_opinions` = **0 rows**; runbook itself says "Runnable today: NO" (this step only reports the finding, exits) | N/A | DESIGNED-ONLY (by the runbook's own admission) | No non-LLM writer exists anywhere; not this step's gap to close |
| `w1-dispositions` | Runbook §3 | dispatch, `mode=apply` requires `arg=R-C-accepted` | **[CONFIRMED]** report-only step (writes no DB row in any mode); no evidence R-C was ever accepted | N/A (code-lane worklist producer) | WIRED-NOT-RUN (apply-gated on an un-taken ruling) | R-C acceptance is an operator decision still pending |
| `origin-class-backfill` | Runbook §4, R-E ruling | dispatch, `apply` requires `arg=R-E-accepted` | **[HYPOTHESIS]** no live count re-queried this session for `intelligence_items.origin_class`; runbook implies it ran (R-E accepted) but I did not re-verify the row split | census_worklist / customer surfaces filtering | WIRED-NOT-RUN or WIRED+USED (unconfirmed) | Re-query `origin_class` distribution to confirm apply landed |
| `source-type-backfill` | Runbook §4a | dispatch | **[CONFIRMED]** live `sources.source_type IS NOT NULL` = **357 rows** — real apply landed | source-sweep/ledger scoping (coverage-gaps.ts) | WIRED+USED | Only 2 of N host classes are classifiable (`environmental_body`, `legislature`); rest stay NULL by design |
| `derive-obligations` | Runbook §4b, migration 290 | dispatch | **[CONFIRMED]** live `obligations` = **1,149 rows**, matches `item_forward_events` = **1,149 rows** exactly (1:1 derivation) — real apply landed, read by `/regulations` ObligationRegister | customer surfaces: Regulations | WIRED+USED | none found |
| `seed-corridors` | Runbook §4c, ADR-024 §4 | dispatch | **[CONFIRMED]** live `entities WHERE kind='corridor'` = **1 row** — only the ADR-024 fallback worked example (CNSHA–NLRTM), meaning the corpus itself has never named a real corridor candidate | customer surfaces: Market Intel carbon-cost overlay | WIRED+USED (fallback only) | Real corridor discovery from `market_series.series_key`/`regional_data_facts` never fired — overlay runs on one synthetic example |
| `census-off-vertical` | Runbook §5, R-A ruling **open** | dispatch | **[CONFIRMED]** R-A (archive vs. park) is explicitly unresolved per the runbook; `apply, arg=archive` is **not runnable** (no schema column) | census_worklist | BUILT-NOT-WIRED (archive path) / DESIGNED-ONLY (park path, a no-op by design) | R-A ruling still pending; archive path needs a migration |
| `review-digests` | Runbook §6 | dispatch | **[CONFIRMED]** "This script does NOT exist in this worktree" per the runbook's own text — the step exists solely to fail cleanly | N/A | BUILT-NOT-WIRED | Depends on a sibling lane (R1) that has not shipped `build-review-digests.mjs` |
| `tag-proposals` | Runbook §6a, 2026-09-03 | dispatch, `arg` = untagged/since/ids | **[CONFIRMED]** live `integrity_flags WHERE status='open' AND created_by LIKE 'flywheel-tag:%'` = **1,123 rows** — heavy real apply use | flywheel: tags (proposal half) | WIRED+USED | none found |
| `tag-ratification` | Runbook §7 | dispatch, id-path or `arg=auto` | **[CONFIRMED]** live `integrity_flags WHERE status='resolved' AND created_by LIKE 'flywheel-tag:%'` = **143 rows** — real applies on both paths, but **1,123 still open vs. 143 resolved** means the ratify/auto-adopt stage is draining far slower than `tag-proposals` fills it | flywheel: tags (apply half) | WIRED+USED, but backlogged | 1,123 open proposal flags outstanding — the flywheel's own "second loop, no human in the path" design intent (docs/specs/08-flywheel-design.md:128) is not keeping pace |
| `apply-classifications` | not in runbook §1–12; `scripts/maintenance/apply-classifications.mjs` | dispatch | **[CONFIRMED]** session-log #25: "apply `apply-classifications`: 1,015 flags inserted, 797 auto-adopted" | flywheel Loop B (`docs/specs/08-flywheel-design.md`) | WIRED+USED | Runbook documentation gap (not itself a code gap) |
| `seed-benchmark-instruments` | not in runbook §1–12; `scripts/community/seed-benchmark-instruments.mjs` | dispatch | **[CONFIRMED]** session-log: "`seed-benchmark-instruments` dry (run #5) then apply" | customer surfaces: Community benchmarks | WIRED+USED | Runbook documentation gap |
| `spec09-reroute` | not in runbook §1–12; `scripts/spec09/reroute-producer.mjs` | dispatch | **[HYPOTHESIS]** listed as "dispatch-only, no schedule" in session-log Addendum 85; no explicit apply-count evidence found this session | customer surfaces: spec-09 panels (7 tables, all ship empty per Addendum 85) | WIRED-NOT-RUN or WIRED+USED (unconfirmed) | Re-check spec09 table row counts |
| `provenance-heal` | Runbook §8 — by far the largest section (10 sub-passes, HEAL-1…HEAL-10) | dispatch, `arg` selects population | **[CONFIRMED]** exhaustively documented — run #21 (`33829526120`, 11m56s, apply, 94 candidates, **0 `healed_verified`**, 94 `still_failing`); run #31 (`33855060659`) hit the 30-min job timeout at 15/87 items; multiple code-only fix passes (HEAL-6 through HEAL-10) each landed with **zero live items flipping to `verified`** as of the runbook's own last-recorded pass | provenance/Gate-A healing → census_worklist re-admission | WIRED+USED, but **not yet delivering its outcome** | Every apply run on record still shows 0 `healed_verified` for the 94-item quarantine — the mechanism runs, writes real evidence, but the quarantine has not actually shrunk yet per the runbook's own last-recorded numbers |
| `institution-canonicalize` | not in runbook §1–12; `scripts/maintenance/institution-canonicalize.mjs` | dispatch | **[CONFIRMED]** session-log #18: "`institution-canonicalize` dry ... planned exactly the two defects" | source registry hygiene | WIRED-NOT-RUN (dry only, per the one dispatch found) | Runbook documentation gap; apply dispatch not confirmed |
| `reopen-validation-holds` | Runbook §9, 2026-09-03 | dispatch, `arg` required in both modes | **[HYPOTHESIS]** runbook names exactly 1 target row (`ungrounded_url`) at authoring time; not re-queried live this session | census_worklist | WIRED+USED (small, targeted) | none found beyond narrow scope by design |
| `record-hollow-sweep` | Runbook §10, 2026-09-04 | dispatch, no `arg` required | **[CONFIRMED]** live `archive_reason='record_hollow'` = **551 rows** — exact match to the runbook's own measured defect population; real apply landed. **However**, a broader re-query this session (`item_grade='record' AND provenance_status='verified' AND is_archived=false`) = **1,101 rows**, more than double the 551 already swept — the underlying "record-grade, title-only" pattern is recurring faster than one sweep clears it (record-grade mint keeps minting new title-only rows) | census_worklist re-admission → re-mint | WIRED+USED, but the defect it targets is regenerating | 1,101 live record-grade verified items today vs. 551 already archived — needs a second sweep or a mint-time fix, not just a maintenance sweep |
| `canonical-key-dedup` | Runbook §11, EP-11/ADR-021 | dispatch, no `arg` required | **[CONFIRMED]** live `archive_reason='duplicate_of_verified'` = **8 rows** (runbook's own authoring-time measurement named only 2 duplicate groups / ~3-4 rows — the live count has grown since, consistent with more re-runs or new duplicates surfacing) | intelligence_items dedup | WIRED+USED | none found |
| `forward-events-retext` | Runbook §12 — 3 sub-lanes (FWD-TEXT, FWD-TEXT-2, FWD-TEXT-3) + RETEXT-COLLIDE | dispatch, `arg=ids:...` optional | **[CONFIRMED]** Maintenance #35 (run `33864089323`) **died on a live unique-constraint violation** (`uq_item_forward_events_dedupe`) 6 seconds into an apply — the exact defect RETEXT-COLLIDE's own fix targets; runbook's last-recorded baseline: 541/1,017 rows already clean pre-fix | customer surfaces: Regulations "Upcoming obligations" strip | WIRED+USED, with one **confirmed live production failure** en route | Confirm the RETEXT-COLLIDE fix's next apply run actually completes without the same constraint violation — not re-verified this session |

---

## 3. `population-turn.yml` — three modes

| Mode | Purpose | Evidence | Loop stage | Verdict |
|---|---|---|---|---|
| `normal` (default: `rows_file`/`flywheel_backlog` both unset) | `export-census-rows.mjs` → `run-mint-batch.mjs`/`apply-mint-batch.mjs` from `census_worklist`, gated by THE GATE | **[CONFIRMED]** `mint` harness family: 27 committed artifacts, 21 logged `mode:"execute"`; `mint-run-027.json` (run `33878338285`) shows real per-item outcomes (`minted_verified`, `validation_failed: record_hollow`) | population-turn: export → mint | WIRED+USED |
| `rows_file` | Skips `export-census-rows.mjs`; drives mint directly off a browser-captured JSON (MINT-RUNBOOK §11) | **[HYPOTHESIS]** referenced throughout `docs/ops/session-log.md` (browser-capture workflow for `capture_blocked` EUR-Lex rows) but no artifact in `harness-runs/mint/*.json` names a `rows_file`-sourced `batch_file` distinct from the normal export path in the files I inspected | population-turn: export (bypassed) → mint | WIRED, use not independently confirmed this session |
| `flywheel_backlog` | Skips export/mint; runs `run-population-flywheel.mjs --backlog` over existing THE-GATE-refused mint-run artifacts, enriching in place | **[CONFIRMED]** `forward-events-run-032.json`'s `config.out_dir` = `.../population-flywheel-mint-run-027` — names this exact mode chained directly off a mint run, i.e. the backlog mode has fired at least once in the window | population-turn backlog reclamation | WIRED+USED |

15 real `origin/population/<run_id>` branches exist for the window (2026-09-02→2026-09-04); **all but one
are unmerged into `master`** (see §6, branch-landing).

---

## 4. `source-sweep.yml` — five walkers

| Walker | Requires | Evidence | Verdict |
|---|---|---|---|
| `register-eurlex` | `from`/`to` | **[HYPOTHESIS]** part of the 11-artifact/6-branch source-sweep history; not individually attributable per-walker from filenames alone without opening each artifact | WIRED, used (aggregate evidence) |
| `register-federal-register` | `from`/`to` | session-log line 7727/7759 explicitly names `register-federal-register dry` dispatches | WIRED+USED |
| `feed` | `feed_url` | session-log names `feed dry` dispatches paired with `register-federal-register` | WIRED+USED |
| `research` (lane RSRCH, 2026-09-02) | none — sweeps `sources.category='research'` | **[HYPOTHESIS]** newer of the 5 walkers; no dedicated artifact filename distinguishes it from the register/feed runs in the 11 on record | WIRED, not independently confirmed run |
| `sitemap` (lane SITEMAP, 2026-09-04) | `source_id` or `host` | **[CONFIRMED]** session-log #25/#34: "`apply-classifications` dry/apply, source-sweep `sitemap` dry on the two named hosts" | WIRED+USED |

`portal_link_candidates` = **1,840 live rows** (queried this session) — matches the meta-harness note's
"~1,838 portal_link_candidates classified and waiting" almost exactly, confirming source-sweep's ledger
write is real and is the volume ledger-consume (below) is blocked in front of.

---

## 5. `producers.yml` — 9 dispatchable producers

| Producer | Run step exists? | Live evidence | Verdict |
|---|---|---|---|
| `eurostat-nrg-pc-205` | yes | writes `regional_data_facts` (90 rows total, shared across producers — not attributable alone) | WIRED, use unconfirmed per-producer |
| `eurostat-lc-lci-lev` | yes | session-log names explicit dry+apply dispatches (`#15`/`#16`) | WIRED+USED |
| `bls-oews` | yes | shares `regional_data_facts`; no dedicated confirmation | WIRED, use unconfirmed |
| `eu-weekly-oil-bulletin` | yes (2-stage: `fetch-oil-bulletin.mjs` + `eu-weekly-oil-bulletin.mjs`) | **[CONFIRMED]** live `market_series` `eu-oil-bulletin:*` = 12 rows across 6 series | WIRED+USED |
| `ecb-fx` | yes | **[CONFIRMED]** live `market_series` `ecb-fx:*` = 3 rows (EUR/USD, EUR/JPY, EUR/GBP), 1 observation each — one apply landed | WIRED+USED (single observation only) |
| `desnz-emission-factors` | yes | `emission_factors` = 13 rows total (shared with EPA) | WIRED, use unconfirmed per-producer |
| `epa-emission-factors` | yes | shares the same 13-row table | WIRED, use unconfirmed per-producer |
| `eia-v2-petroleum-spot` | yes (added 2026-09-03, lane not in the choice-list comment) | **[CONFIRMED]** live `market_series` `eia-v2:*` = **2,726 rows** across 6 series (~455 daily obs each) — the single heaviest-used producer of the nine | WIRED+USED |
| `refresh-published-price-statistics` | yes | **[CONFIRMED]** live `published_price_statistics` = 4 rows — derived, real, but thin | WIRED+USED |

**Stale comment finding**: `.github/workflows/producers.yml` lines 84–93 (the `producer:` choice-list
comment, authored by lane SURF 2026-09-01) still reads "deliberately has NO run step below yet and is not
in 'all'" for `eia-v2-petroleum-spot`. The actual run step was added 2026-09-03 (line 238, confirmed
present) and the producer is now the largest live `market_series` contributor. The comment is stale
documentation, not a functional gap — flagged for a one-line fix.

---

## 6. Branch-landing manual handoff — `deliver-artifact-branch.sh`

`fsi-app/scripts/turns/deliver-artifact-branch.sh` is the shared delivery step for 6 of the 17 workflows
(`population-turn.yml`, `source-sweep.yml`, `propagation-drain.yml`, `corpus-turn.yml`,
`change-detection.yml`, `ledger-consume.yml` — confirmed by `grep -rl deliver-artifact-branch
.github/workflows/`). Each of these pushes an "artifact branch" (`population/<run_id>`,
`source-sweep/<run_id>`, `propagation/<run_id>`, `turn/<run_id>`, `change-detection/<run_id>`,
`ledger-consume/<run_id>`) carrying the harness-run JSON + any doc/code changes, then tries
`gh pr create`. When the repository refuses PR creation from Actions (a Settings toggle, per the script's
own header), it falls back to filing the branch + compare URL on one tracked issue,
**"Runtime artifact branches awaiting a hand-opened PR,"** and exits green rather than red.

**[CONFIRMED, this session]** — I enumerated every `origin/{population,source-sweep,turn,propagation}/*`
branch and checked ancestry against `origin/master` via `git merge-base --is-ancestor`:

- **15** `population/*` branches (2026-09-02T20:21 → 2026-09-04T14:06)
- **6** `source-sweep/*` branches (2026-09-02T12:43 → 2026-09-04T05:12)
- **2** `propagation/*` branches (2026-09-02T12:21, 12:35)
- **1** `turn/*` branch (2026-09-03T20:29)
- **Total: 24 runtime branches.** Every single one is **unmerged into `master`** by ancestry.

One branch's *file content* (`population/33878338285`'s `mint-run-027.json`) is byte-identical to what
now sits in `master` — meaning a coordinator manually copied that one artifact into a `train/wave36`
integration branch rather than merging the runtime branch itself (`git log` shows the file landed via
`train/wave36-2026-09-04` → PR `#583`, not via the runtime branch). All 23 other branches, including 6
population branches dispatched *before* `master`'s own tip commit time (14:01:15 UTC 2026-09-04), remain
stranded on `origin` with no PR and no manual cherry-pick.

**Families depending on this coordinator hand-off to land**: `population-turn`, `source-sweep`,
`propagation-drain`, `corpus-turn`, `change-detection`, `ledger-consume` (by workflow declaration —
`ledger-consume` has never actually produced a branch since it has never run). `maintenance.yml` and
`producers.yml` do **not** use this mechanism — their writes go straight through the guarded Supabase
path with no branch/PR step, so they have no landing backlog by construction.

---

## 7. `ledger-consume.yml` — the flywheel's classify→intake stage, structurally disarmed

This is the single largest gap A1 found and merits its own section.

1. **[CONFIRMED] Never dispatched.** `fsi-app/scripts/harness-runs/ledger-consume/` holds only a
   `PENDING-RUN.md` (re-pinned 4 times, most recently by lane GOV-SINGLE 2026-09-04) — zero
   `ledger-consume-run-*.json` artifacts exist. No `origin/ledger-consume/*` branch exists.
2. **[CONFIRMED] Apply mode is structurally disarmed regardless of dispatch.**
   `fsi-app/scripts/turns/run-ledger-consume.mjs:95`: `export const LEDGER_CONSUME_APPLY_ENABLED = false;`
   — a source constant, not an env var or workflow input, guarded by its own test
   (`run-ledger-consume.test.mjs:135-136`, asserting the shipped value is `false`). A `mode: apply`
   dispatch is refused (line 414: `"run-ledger-consume: --mode apply requested but
   LEDGER_CONSUME_APPLY_ENABLED is false"`), and even the workflow's own header calls this "ADR-023" gated,
   awaiting an explicit operator flip.
3. **[CONFIRMED] Registration gap blocks even a `plan`-mode first dispatch.** The workflow references
   `secrets.ANTHROPIC_API_KEY` (required in every mode — plan mode still calls Haiku classify);
   `.discipline/governance/secrets-reference-audit.mjs` fails the build because `ANTHROPIC_API_KEY` is not
   yet registered in `.discipline/governance/secrets-registry.mjs`'s `WORKFLOW_SECRETS` — per the
   `PENDING-RUN.md`'s own text, outside the lane that wrote the marker.
4. **[CONFIRMED] Real backlog waiting on this gate.** Live `portal_link_candidates` = **1,840 rows**
   (queried this session), matching `meta-harness-run-008.json`'s own note: *"~1,838
   portal_link_candidates are classified (Haiku, ~$0.001/candidate) and waiting: ledger-consume's apply
   mode stays structurally disarmed by LEDGER_CONSUME_APPLY_ENABLED=false (ADR-023) until the operator
   flips it."*

**Verdict: BUILT-NOT-WIRED.** The library code (`consumePortalCandidates`,
`first-fetch-classify.ts`/`spendMessage`) is real and unit-tested (`run-ledger-consume.test.mjs`'s
stub-Supabase end-to-end proves the wiring, per zero-candidate result), the workflow file exists and is
syntactically complete, but the chain from source-sweep's ledger (1,840 rows) into
census/mint (`consumePortalCandidates`) has never executed once, live, in this codebase's history. This
is the one break in the flywheel loop as described (`source sweep → portal_link_candidates →
ledger-consume (classify → intake) → census_worklist → ...`) — every stage before and after it has real
committed run evidence; this one link does not.

---

## Ranked gaps

1. **`ledger-consume.yml` has never run and cannot apply even if dispatched** (§7). This is the one
   missing link in the flywheel loop as the operator described it — 1,840 classified portal-link
   candidates are sitting downstream of source-sweep with no path into census_worklist. Two independent
   blockers: `LEDGER_CONSUME_APPLY_ENABLED=false` (needs an explicit operator flip, by design) and
   `ANTHROPIC_API_KEY` missing from `WORKFLOW_SECRETS` (blocks even `plan` mode from succeeding).
2. **24 runtime artifact branches are stranded, unmerged, on `origin`** (§6) — 15 population, 6
   source-sweep, 2 propagation, 1 corpus-turn — because `gh pr create` is refused by a repository setting
   and only one branch's content has ever been manually landed (via a separate `train/` integration, not
   a merge of the branch itself). Every population-turn/source-sweep/propagation/corpus-turn family
   depends on a coordinator doing this by hand; the backlog is growing faster than it's cleared.
3. **`tag-ratification` is draining `tag-proposals`' output far slower than it fills** (§2) — 1,123 open
   `flywheel-tag:` flags vs. 143 resolved. The flywheel's own design spec calls for a second loop "without
   a human in the path" (`docs/specs/08-flywheel-design.md:128`); the auto-adopt path exists and works,
   but the open/resolved ratio shows it is not closing the gap in practice.
4. **`provenance-heal` runs real, expensive apply passes (11m56s+ each) that still show 0
   `healed_verified` on the last-recorded 94-item quarantine** (§2, `provenance-heal`) — the mechanism is
   thoroughly wired and evidenced, but per the runbook's own last-recorded numbers it has not yet
   delivered the outcome (fewer quarantined items) it exists to produce.
5. **`record-hollow-sweep` targets a defect that is regenerating faster than it's swept** (§2) — 551
   archived by the one sweep on record, but 1,101 live record-grade verified items match the same
   title-only pattern today (re-queried this session) — record-grade mint keeps producing new instances
   of the defect this maintenance step exists to clean up.
6. **`community-topics-seed` has never been applied** (§2) — live `community_topics` = 0 rows, unchanged
   from the pre-existing-runtime baseline the runbook itself documents.
7. **`review-digests` is BUILT-NOT-WIRED by its own runbook admission** (§2) — the script it wraps
   (`build-review-digests.mjs`) does not exist in this worktree; the step exists only to fail cleanly
   naming the gap.
8. **`census-off-vertical`'s archive path is un-runnable** (§2) — no schema column exists for
   `is_archived`/`archive_reason` on `census_worklist`'s off-vertical rows, and ruling R-A (archive vs.
   park) is still open.
9. **`forward-events-retext` had one confirmed live production failure** (Maintenance #35, unique
   constraint violation) whose fix (RETEXT-COLLIDE) I could not re-verify actually completed cleanly on
   its next apply run.
10. **4 of 20 maintenance steps are undocumented in `MAINTENANCE-RUNBOOK.md` §1–§12**
    (`apply-classifications`, `seed-benchmark-instruments`, `spec09-reroute`, `institution-canonicalize`)
    — all confirmed real and dispatched via session-log, so this is a documentation gap, not a wiring
    gap, but it means the runbook the operator reads is incomplete.
11. **Two workflows (`trust-recompute.yml`, `uptime-probes.yml`) carry live cron schedules** while every
    other loop-touching workflow has its schedule explicitly commented out under the stated build-mode
    ruling — both are pre-window, observability-only, and plausibly exempt, but I found no explicit
    operator ruling exempting them from rule 16 the way `data-audit-lane.yml`/`spot-check-monthly.yml`
    document their own freezes.
12. **Stale comment in `producers.yml`** (§5) claims `eia-v2-petroleum-spot` has no run step; it does, and
    is the largest live producer by row count. Cosmetic, one-line fix.

## What I could not confirm

I could not independently re-verify, this session, whether `origin-class-backfill` (§2) actually landed
an apply on the live `intelligence_items.origin_class` column — the runbook implies R-E was accepted but
I did not re-query the column's distribution to check. I could not attribute `regional_data_facts` (90
rows) or `emission_factors` (13 rows) to individual producers among the several that share each table, so
`eurostat-nrg-pc-205`, `bls-oews`, `desnz-emission-factors`, and `epa-emission-factors` are marked "use
unconfirmed per-producer" rather than a firm verdict. I could not confirm whether `source-sweep.yml`'s
`research` and `sitemap`-adjacent walkers (`register-eurlex` specifically) have each individually fired,
since the 11 committed source-sweep artifacts are not all individually attributable to a walker from
filename alone within my time budget — I read `run_id`/`mode` fields but not every artifact's full
per-walker payload. I could not check whether `trust-recompute.yml`'s monthly cron or
`uptime-probes.yml`'s daily spend cron have actually fired successfully inside the audit window (both are
plain HTTP POSTs with no committed artifact trail, and I have no access to the GitHub Actions run history
UI/API from this environment — no `gh` CLI, no network egress to the Actions API). I could not confirm
`population-turn.yml`'s `rows_file` mode has fired independently of the normal export path, since no
`mint-run-*.json` artifact I opened carried a `batch_file` path distinguishable from a browser-capture
source versus the standard `export-census-rows.mjs` output. Finally, I did not open every one of the 27
`mint-run-*.json` / 32 `forward-events-run-*.json` / 11 `source-sweep-run-*.json` artifacts in full — I
sampled the latest of each family plus targeted grep/field extraction, so per-run details earlier in each
family's history (e.g. whether any *specific* run 001–026 for mint failed outright) are not individually
confirmed here.
