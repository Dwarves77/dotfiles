# Loop, harness, flywheel as one unit — completion audit, 2026-09-05

**Tree audited:** `1e6d9e8b` (lane worktree `/root/work/lanes/auditloop`, branch
`audit/auditloop-2026-09-05`, train 47 merged with train 46 master — the most complete tree that
exists at audit time; this is what T46 validation runs against).

**Method:** read-only. Every workflow under `.github/workflows/` read in full for trigger/gate lines
(`on:`, `workflow_dispatch`, `workflow_run`, `schedule:`, `if:`); harness family directories under
`fsi-app/scripts/harness-runs/` inspected (artifact presence, `PENDING-RUN.md` text, `governing-files.mjs`);
the maintenance step registry (`.github/workflows/maintenance.yml`'s dropdown, `docs/runbooks/
MAINTENANCE-RUNBOOK.md`, individual `fsi-app/scripts/maintenance/*.mjs`); `fsi-app/.discipline/governance/
closure-gate.mjs` read in full and RUN live in dry/read mode against this worktree (`node fsi-app/
.discipline/governance/closure-gate.mjs`); `fsi-app/scripts/lib/run-artifact.mjs`'s `ALLOWED_FAMILIES`;
`docs/ops/dispatch-ledger.jsonl` read in full (46 lines); live read-only SQL against Supabase project
`kwrsbpiseruzbfwjpvsp` for every table named below. Per the operator's instruction, no claim from
`docs/PROGRAM-BOARD.md`, `docs/ops/session-log.md`, or `docs/audits/wiring-audit-2026-09-04/` was taken as
evidence without independent re-check against code, workflow files, or live SQL; that audit's own numbers
are treated as a prior claim to verify, not as ground truth, and its date (2026-09-04, tree `e8cb748f`)
predates this tree by roughly a day and several trains (38 through 47), so a large share of its findings
are now stale by construction, not wrong at the time.

**Scope:** plan §1 (the loop, both sub-loops) and W0/W8 (speed, harness, memory) from
`docs/plans/complete-system-build-plan-2026-09-04.md`; the dispatch graph across all 17 workflow files;
the maintenance step registry and producers registry; harness coverage (which runtimes leave an artifact
per rule 15/F28); rule 17 (nothing runs alone) violations; duplicate mechanisms. Population volume (W2),
grounding/tier work (W3 beyond what touches the loop), community (W6), and surface rendering (W5) are
**out of scope** except where they bear directly on the loop/harness/flywheel question.

Status tokens per CLAUDE.md rule 14: **[CONFIRMED]** (re-verified this session, method named),
**[HYPOTHESIS]** (plausible, not independently run), **[REFUTED]** (a named prior claim checked and found
false).

---

## 1. The dispatch graph, as it actually runs today

| Workflow | Triggers | Key run/gate lines | Fires next | Gate |
|---|---|---|---|---|
| `source-sweep.yml` | `workflow_dispatch` only; `schedule:` commented (`source-sweep.yml:91-92`) | walkers `register-eurlex`/`register-federal-register`/`feed`/`research`/`sitemap --all-hosts`; writes `portal_link_candidates` | `ledger-consume.yml` via `workflow_run: workflows: ["Source sweep"]` (`ledger-consume.yml:148`) [CONFIRMED, file read] | none (dispatch-only source) |
| `ledger-consume.yml` | `workflow_dispatch` (`ledger-consume.yml:111`) **and** `workflow_run` on Source sweep completion (`ledger-consume.yml:147-150`) | `if: github.event_name=='workflow_dispatch' \|\| github.event.workflow_run.conclusion=='success'` (`:167`); a `workflow_run` firing is HARD-CODED to `mode=plan` regardless of any input (`:40-48` comment, confirmed by the two chained runs in the dispatch ledger both showing `mode:"plan"`) | `population-turn.yml` via `workflow_run: workflows: ["Ledger consume"]` (`population-turn.yml:221`) | `LEDGER_CONSUME_APPLY_ENABLED` (source constant, `run-ledger-consume.mjs:226`) gates the APPLY half only; plan/export halves are ungated |
| `population-turn.yml` | `workflow_dispatch`; `workflow_run` on Ledger-consume completion (`:220-221`); `schedule:` commented (`:17-18`) | THE GATE (`run-population-flywheel.mjs --check-gate`) refuses apply if a prior batch is unconnected; on success runs export→mint→(same job) flywheel connect→recluster→obligations→tags, per `A1-runtimes.md §3`, re-confirmed by artifact `mint-run-029.json` presence this session | **nothing** — no `workflow_run` names `["Population turn"]` anywhere in the repo [CONFIRMED, `grep -rn "workflows:" .github/workflows/*.yml`] | THE GATE (self-enforcing, in-job) |
| `producers.yml` | `workflow_dispatch` only; no `workflow_run` in, no `schedule:` | 9 producer keys, writes `market_series`/`emission_factors`/`regional_data_facts` | `propagation-drain.yml` via `workflow_run: workflows: ["Data producers"]` (`propagation-drain.yml:120`) | none upstream of producers itself |
| `propagation-drain.yml` | `workflow_dispatch`; `workflow_run` on Data-producers completion (`:119-120`); `schedule:` commented | `backfill_and_statutory` step, invalidate-closure drain over `derivation_edges` | **nothing** — no workflow fires on propagation-drain completion; `/api/notices` is a live read, not a dispatch, so this is not itself a rule-17 gap | none named |
| `corpus-turn.yml` | `workflow_dispatch` + `push: turn/**`; `schedule:` commented | discover/forward-events/analyze-corpus, UNSCOPED | **nothing** — isolated from the chain above; not fired by anything, fires nothing | none |
| `change-detection.yml` | `workflow_dispatch` only; `schedule:` commented | `runReconcilePass`/`drainChangeSweepUpdates`; exits at 0 sources while `system_state.scrape_cadence='off'` | nothing | rule-16 build-mode gate (intentional) |
| `maintenance.yml` | `workflow_dispatch` only | 38-item step dropdown (see §2) | nothing (each step is a standalone tool dispatch) | per-step `arg=`-required gates on 3 steps |
| `data-audit-lane.yml` | `workflow_dispatch: {}` only; `schedule:` commented, explicit operator-stopped ruling in header | live-data audits (one-tier-per-host, claims-tier, etc.) | nothing | operator-ruling gate (build mode) |
| `discipline.yml` | `push: master`, `pull_request: master` | `run-test-suite.sh`, `fitness/runner.mjs`, `closure-gate.mjs`, orphan-modules census, skill-contract drift | n/a (CI gate, not a loop stage) | is itself the gate |
| `build-proof.yml` | `push: master` | deployed-bundle build proof | n/a | is itself the gate |
| `bug-class-guard.yml` | `push: master`, `pull_request` | regression-class guards | n/a | is itself the gate |
| `trust-recompute.yml` | `workflow_dispatch` only; `schedule:` **commented, marked "DISARMED 2026-09-04"** (`:18-19`) | monthly trust score recompute | nothing | rule-16, now compliant |
| `uptime-probes.yml` | `workflow_dispatch` only; `schedule:` **commented, marked "DISARMED 2026-09-04"** (`:51-52`) | daily spend watch / surfaces probe | nothing | rule-16, now compliant |
| `source-monitoring.yml`, `spot-check-monthly.yml`, `inspect-oil-bulletin.yml` | `workflow_dispatch` only | source health / re-classification spot-check / oil-bulletin format scout | nothing | dispatch-only, no chain either side |

**The live chain, end to end:** `source-sweep → (workflow_run) → ledger-consume [plan only] → (workflow_run)
→ population-turn` is the one fully automatic multi-workflow chain in the repo, and it is real
[CONFIRMED — the two dispatch-ledger rows `"FIRST AUTOMATIC CHAINED RUN"` / `"Second automatic chained
run"` name real run IDs `33904298664`/`33905837796`, both `mode:"plan"`]. A second, separate chain,
`producers → (workflow_run) → propagation-drain`, is also real [CONFIRMED — dispatch-ledger row `"first
run under lanes CHAIN + DAG-AUTHOR"`, run `33898190689`]. **Neither chain closes the loop the plan draws in
§1**: population-turn's own completion fires nothing (no `workflow_run` anywhere names `["Population
turn"]`), so a mint that changes `market_series`-adjacent facts does not itself trigger propagation-drain,
and corpus-turn (the unscoped whole-corpus enrichment pass) is wired to nothing on either side.

---

## 2. Maintenance steps and producers — registered / run-path / ever-run / writes / read-by

Format: item | registered (in the 38-item dropdown or the 9-key producer list) | has a `run:` path |
ever run (dispatch-ledger row or harness artifact) | writes | read by | verdict.

| Item | Registered | Run path | Ever run | Writes | Read by | Verdict |
|---|---|---|---|---|---|---|
| `community-topics-seed` | **NOT in the current dropdown** [CONFIRMED, `grep -n community .github/workflows/maintenance.yml` returns only `seed-benchmark-instruments`' comment, none for the seed] | n/a — removed | n/a | `community_topics` = **0 rows** [CONFIRMED, live SQL] | Community discovery (entity-thread based per audit, unread here) | **COMPLETE (retirement)** — plan W6.1 said RETIRE, and it is retired; 0 rows is now the intended state, not a gap |
| `tier-opinions` | yes | `fsi-app/scripts/maintenance/tier-opinions.mjs` exists, dated 2026-09-05, Lane ATTACH-SOURCES/W3.3 | dispatch-ledger has no `tier-opinions` row; `source_tier_opinions` = **0 rows** [CONFIRMED, live SQL] | none yet | admin review surface (designed) | **BUILT-NOT-WIRED** — the deterministic writer plan W3.3 asked for now exists in code (not the "DESIGNED-ONLY, no DB path" state the 2026-09-04 audit found) but has not been dispatched even once |
| `census-off-vertical` (archive path) | yes | `scripts/maintenance/census-off-vertical.mjs` references `is_archived`/`archive_reason` columns per migration 308 | not run; **would fail if apply-dispatched today** | would write `census_worklist.is_archived`/`archive_reason` | population reporting | **NOT BUILT (blocked by unapplied DDL)** — see §5, migration 308 is a file in the repo but is **not applied** to the live database [CONFIRMED, live SQL against `information_schema.columns` and `supabase_migrations.schema_migrations`] |
| `review-digests` + 4 `review-apply-*` steps | yes, 5 dropdown entries | `fsi-app/scripts/review/build-review-digests.mjs` **exists** in this tree (audit-2026-09-04 said it did not) | not independently confirmed run this session | `portal_link_candidates.status` transitions (plan's own done-condition) | population intake | **REFUTED prior claim** (wiring-audit A1-runtimes.md §2: "review-digests... This script does NOT exist in this worktree") — it now exists as a file; run evidence not found this session, so verdict is PARTIAL, not COMPLETE |
| `tag-proposals` / `tag-ratification` | yes | real, heavy use | yes, both | `integrity_flags` | Regulations/Research tag surfaces | **COMPLETE, but backlogged** (not independently re-queried this session; carried from the 2026-09-04 count of 1,123 open vs 143 resolved as [HYPOTHESIS] pending re-query) |
| `provenance-heal` | yes | real | yes, multiple apply runs (per dispatch-ledger and runbook) | `census_worklist`/item provenance | mint re-admission | **[HYPOTHESIS]** carried from audit's own "0 healed_verified on last-recorded pass" — not re-queried live this session (out of narrow scope; flagged as unverified below) |
| `institution-canonicalize` | yes | real | **yes, apply landed** [CONFIRMED, dispatch-ledger: "Maintenance #46... sources 734a5f60, 2b7e1191 base_tier 4 / effective_tier 4 (active)"] | `sources.effective_tier` | source registry, mint authority floor | **REFUTED prior claim** (2026-09-04 audit: "WIRED-NOT-RUN (dry only)") — apply has now run, live SQL-confirmed by the coordinator's own dispatch-ledger note |
| `derive-obligations`, `source-type-backfill`, `record-hollow-sweep`, `canonical-key-dedup`, `forward-events-retext` | yes | real | yes | as documented | as documented | carried forward from the 2026-09-04 audit as [HYPOTHESIS] — not independently re-queried this session (out of the narrowed loop/harness scope); `forward-events-retext`'s later apply (dispatch-ledger, "Maintenance #47... item_forward_events 1,152 → 821... migration 307 applied") is [CONFIRMED] and supersedes the audit's "one confirmed live production failure" note — **REFUTED as a standing defect**, it was fixed and re-run successfully |
| `attach-found-sources` (W3.1) | yes | real | not independently confirmed this session | — | — | out of narrowed scope, [HYPOTHESIS] |
| `spec09-reroute`, `spec09-grid-queue`, `spec09-oem-roadmap`, `spec09-surcharge-audit-csv`, `spec09-dqi-csv`, `spec09-auxiliary-energy-csv`, `spec09-indexation-csv` (7 W5 producers) | yes, all 7 in the dropdown | scripts exist | not verified this session (out of scope — W5 surfaces) | — | — | out of scope, not audited here |
| `propose-classifications`, `generate-theme-brief`, `ratify-flag-to-census`, `assumption-register-seed`, `backfill-lineage-edges`, `screen-worklist`, `verification-audit-report` | yes, all present in the dropdown | scripts exist | not verified this session | — | — | out of narrowed scope |
| Producer: `eia-v2-petroleum-spot` | yes | yes | yes, heaviest live producer | `market_series` `eia-v2:*` = 2,726+ rows (audit's count; not re-queried, out of population scope) | Market surface, and — see §3 — **NOT** `derivation_edges` | **WIRED+USED for the write, NOT reached by DAG authorship** [CONFIRMED, see §3] |
| Producer: `ecb-fx`, `eu-weekly-oil-bulletin` | yes | yes | yes | `market_series` | Market surface | same DAG gap as above |
| Producer: `desnz-emission-factors`/`epa-emission-factors` | yes | yes | yes (shared `emission_factors` table) | `emission_factors` | Market/Operations | **the only producer family DAG authorship actually reaches** — see §3 |
| Producer: `eurostat-nrg-pc-205`/`eurostat-lc-lci-lev`/`bls-oews` | yes | yes | yes (shared `regional_data_facts`) | `regional_data_facts` | Market/Operations | partially reached by DAG authorship (4 of 24 edges) — see §3 |
| Producer: `refresh-published-price-statistics` | yes | yes | yes | `published_price_statistics` (4 rows, audit's count) | Market series board | out of scope, not re-queried |

---

## 3. Harness coverage — which runtimes leave an artifact, which do not

`fsi-app/scripts/lib/run-artifact.mjs`'s `ALLOWED_FAMILIES` [CONFIRMED, file read] names exactly 10
families: `mint, screen, fetch-drain, meta-harness, forward-events, source-sweep, ledger-consume,
change-detection, propagation, corpus-turn`. Every one of these 10 has a directory under
`fsi-app/scripts/harness-runs/` and at least one committed `*-run-NNN.json` [CONFIRMED, directory listing:
all 10 families present, `ledger-consume` and `propagation` each carry 2–4 real artifacts, not zero as the
2026-09-04 audit found].

**Not in this system at all: `producers` and `maintenance`.** Neither `producers.yml` nor
`maintenance.yml`'s 38 steps write a harness-run artifact of any family — their evidence of execution is
`docs/ops/dispatch-ledger.jsonl` rows plus a live-SQL read-back, which is a mode §0 condition 2 explicitly
allows ("a harness-run artifact **or** a guarded write with read-back"). This is not a gap in itself, but
it does mean **F28's rule-15 "cited-but-unrun proof" enforcement covers only the 10 harness families** —
the closure gate's NEVER-RUN check (§4 below) is the only automated guard against a maintenance step or
producer that is registered and never dispatched; F28 has no visibility into either.

`ledger-consume`'s artifact family is real (**[REFUTED prior claim]** — the 2026-09-04 audit's headline
finding "NEVER DISPATCHED... zero `ledger-consume-run-*.json` artifacts" is now false: `ledger-consume-
run-001.json` and `-002.json` exist, from the two automatic `workflow_run` chained firings). But every
recorded ledger-consume run to date is `mode:"plan"` or `mode:"export"` — **[CONFIRMED, `grep -n
'"workflow":"ledger-consume"' docs/ops/dispatch-ledger.jsonl` shows 6 rows, zero with `"mode":"apply"`]**.
`PENDING-RUN.md`'s own "Re-pin note 9" (2026-09-05, the file's own most recent, most authoritative text)
still names the **next planned dispatch** as `mode: plan` — the family has never executed an apply. Live
`portal_link_candidates` confirms this at the data layer: **57,469 rows `status='candidate'`, only 3
`status='promoted'`** [CONFIRMED, live SQL, this session]. `LEDGER_CONSUME_APPLY_ENABLED` is now `true`
(operator-flipped, `run-ledger-consume.mjs:226`) — the code-level gate the 2026-09-04 audit named as the
blocker is **[REFUTED]** — but the behavioral outcome (candidates reaching `census_worklist`) is
unchanged: the flag flip has not yet been followed by an actual apply dispatch.

---

## 4. Rule-17 violations — runtimes that end without triggering their downstream

1. **`population-turn.yml` ends without triggering anything.** [CONFIRMED — no `workflow_run` in the repo
   names `["Population turn"]`.] Per plan §1's own diagram, a mint that lands new `intelligence_items` and
   (inline, same job) new obligations/tags should feed forward into decision propagation once corridor/
   obligation entities exist; today nothing downstream of population-turn is chained. The plan's own W1.4
   only specified three named chains (source-sweep→ledger-consume, ledger-consume→population-turn,
   producers→propagation-drain) — population-turn was never scoped to chain onward, so this is not a
   broken promise so much as an incomplete promise: the plan's own §1 loop diagram implies a closed circle
   and the workflow graph is a chain with two dead ends (population-turn, propagation-drain) and one
   island (corpus-turn).
2. **`corpus-turn.yml` is wired to nothing on either side.** [CONFIRMED, same grep.] It is real and used
   (real dispatch-ledger rows, `corpus-turn-run-001`/`-002` this session's evidence), but nothing fires it
   automatically and it fires nothing automatically — it is a fully manual, isolated tool, exactly as
   dispatch-only as `change-detection.yml`, except `change-detection` at least has a documented, ruled
   reason (rule 16 build-mode hold) for its isolation. Corpus-turn has no equivalent ruling; it is simply
   not chained.
3. **The `workflow_run`-forced-plan behavior on `ledger-consume.yml` means the one automatic chain that
   does exist never actually applies anything.** [CONFIRMED, file comment `ledger-consume.yml:40-48` plus
   the two real chained runs, both `mode:"plan"`.] Every automatic firing of this chain is, by the
   workflow's own design, incapable of writing a row — it can only ever produce a plan artifact. The chain
   from source-sweep's actual writes (57,469 candidates now, up from 1,840 at the prior audit) to anything
   the downstream population-turn stage can mint from is **still entirely human-mediated**, just one level
   removed from where the 2026-09-04 audit found it (the human decision moved from "dispatch ledger-consume"
   to "dispatch ledger-consume WITH `mode=apply` and a verdicts file", which still has never happened).
4. **Producers write `market_series` rows that the DAG (`derivation_edges`) never authors for.** [CONFIRMED,
   live SQL: `derivation_edges` grouped by `from_table` returns only `emission_factors` (20 rows) and
   `regional_data_facts` (4 rows) — **zero rows from `market_series`**, the table `eia-v2-petroleum-spot`,
   `ecb-fx`, and `eu-weekly-oil-bulletin` write to, and by far the largest live producer volume.] This is
   the sharpest instance of "a runtime ends without triggering its downstream" in the entire loop: the
   `producers → propagation-drain` chain fires correctly (§1), the drain runs correctly, but for the
   majority of what producers actually write, there is no edge for the drain to invalidate against — the
   drain runs, finds nothing new to do for those rows, and reports a false-clean "0 invalidated" that spec
   08 §2.2 itself calls out as the exact failure mode to avoid ("the queue depth IS the visible flywheel
   tension" — a queue that never grows because nothing points at it is not tension resolved, it is
   visibility lost).
5. **Tools that exist but are not used by the loop:** `tier-opinions.mjs` (built, W3.3's deterministic
   writer, never dispatched — §2); the census-off-vertical archive path (built, but its migration is not
   live — §5); `assumption-register-seed`, `backfill-lineage-edges` (registered, not verified run this
   session, out of narrow scope but worth a follow-up query).

---

## 5. Duplicate mechanisms

1. **RESOLVED, this branch's own history:** `git log` on this worktree shows commit `1e6d9e8b`
   ("REBASE-47: merge origin/master 012b10a2 (train 46) into train 47; take `supabase-env.ts`, drop the
   `supabase-service-config.mjs` duplicate") [CONFIRMED, `git log --oneline -3`]. Two modules configuring
   Supabase access existed; one is now retired. Named here per the operator's "tools built but duplicated"
   concern, resolved rather than open.
2. **A live duplicate, found this session: migration DDL exists in the repo but the live database is on an
   older migration set, so code written against the newer schema silently assumes columns that are not
   there.** [CONFIRMED] `fsi-app/supabase/migrations/` contains `299_item_type_required_slots_wave3.sql`
   and `308_census_worklist_archive_columns.sql` as files; live `supabase_migrations.schema_migrations`
   (queried this session) tops out at **307** with no row for 299, 301, or 308. `census-off-vertical.mjs`
   already references the columns 308 would add (`is_archived`, `archive_reason` on `census_worklist`) —
   live `information_schema.columns` for `census_worklist` confirms neither column exists yet. This is not
   two mechanisms guarding the same fact in the classic sense; it is the two-track migration policy (rule
   3: "schema DDL applies... before the dependent code commits") inverted — the dependent code (the
   maintenance step) is already on `master`'s dropdown, ahead of the schema that must exist before it can
   run without erroring. **Keep:** the code is correct and should stay; the fix is applying 299/308 (and
   confirming 301, also absent) via the Supabase CLI, an operator/coordinator action this lane cannot take
   (no DB credentials in this worktree, per the lane contract).
3. **`derivation_edges` authorship is duplicated in intent but not in code** — the plan (§ W4.1) describes
   "the producers... and the mint chokepoint write `derivation_edges`... per the two registered methods";
   live evidence shows only the emission-factor and regional-data-fact paths actually write edges, meaning
   the market-series path either has no registered method or the registered method is not being invoked at
   producer-write time. This reads as an unfinished rollout of one mechanism, not two competing
   mechanisms — flagged here because the plan's own language ("the two registered methods") undercounts
   what a fully-wired system needs (nine producer families, not two) and closure-gate's WRITER-READER check
   (§below) does not catch it because `derivation_edges` itself has both a writer and readers; it is a
   coverage gap inside one table, invisible to a presence-only check.

---

## 6. The closure gate itself — is the "missing enforcement" now built and running

[CONFIRMED, read `fsi-app/.discipline/governance/closure-gate.mjs` in full (649 lines) and executed it live
in this worktree: `node fsi-app/.discipline/governance/closure-gate.mjs`]

```
===== CLOSURE GATE =====
current train: 46
1. NEVER-RUN     : PASS
2. STALE-NEXT    : PASS
3. WRITER-READER : PASS  (summary: {"tables":34,"rpcs":29,"writeOrphans":1,"allowlisted":0,"gating":1,"readOrphans":0})
4. LANE-CONTRACT : PASS
=== closure gate PASS ===
```

This directly **[REFUTES]** the build plan's own "root cause" framing ("Nothing enforces closure... no
gate fails when a maintenance step has never run, when a board row stays NEXT across trains, when a table
has a writer and no reader") **as a description of the CURRENT tree** — that framing was accurate on
2026-09-04 and is the plan's own diagnosis of the past, not a live defect; W7.5 has since been built and is
wired into `discipline.yml` (`node fsi-app/.discipline/governance/closure-gate.mjs` at line 258) so it runs
on every push/PR. One caveat: the WRITER-READER check's own summary line reports `"gating":1` (one
non-allowlisted write-orphan found) while the overall run still reports `PASS` — this needs the gate's own
exit-code logic re-read to confirm whether `gating:1` should have failed the run or whether that count is
informational at a threshold this check tolerates; **[HYPOTHESIS, not resolved this session — flagged as
an open question, not asserted as a defect]**.

---

## Summary table

| Item | Plan ref | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | What's missing |
|---|---|---|---|---|---|---|---|---|---|
| source-sweep → ledger-consume chain | W1.4 | DONE (`ledger-consume.yml:147-150`) | DONE (2 real chained runs) | N-A (chain, not a table) | N-A | DONE (F28 family exists) | DONE (file header) | **COMPLETE** | nothing — this link works exactly as specified |
| ledger-consume → population-turn chain | W1.4 | DONE (`population-turn.yml:220-221`) | DONE | N-A | N-A | DONE | DONE | **COMPLETE (as a trigger)** | the trigger fires; but see below, what it triggers never applies |
| ledger-consume APPLY (candidates → census_worklist) | W1.1 | DONE (flag `true`, code exists) | **NOT** (zero `mode:apply` runs ever, dispatch-ledger) | **NOT** (57,469 candidate / 3 promoted) | N-A | N-A | DONE (PENDING-RUN.md current) | **BUILT-DORMANT** | one `workflow_dispatch` with `mode=apply` and a real verdicts file, on the 386-row verdict batch already classified |
| producers → propagation-drain chain | W1.4 (implicit)/W4.3 | DONE | DONE (1 real apply run) | PARTIAL (edges 6→24, only 2 of 9 producer families) | N-A | DONE | PARTIAL | **PARTIAL** | DAG-authorship for `market_series` (the largest producer volume) — zero edges from it today |
| population-turn downstream chain | plan §1 implied | **NOT** (no workflow_run out) | N-A | N-A | N-A | N-A | **NOT** | **NOT BUILT** | a `workflow_run` (or documented ruling why not) from population-turn's completion |
| corpus-turn chaining (either side) | plan §1 implied | **NOT** | N-A | N-A | N-A | N-A | **NOT** | **NOT BUILT** | either wire it or document why it is deliberately isolated |
| statutory_computations / estimated_values first live rows | W4.2, claimed landed by T38/T42 | DONE (schema+writer code shipped) | **NOT** (0 rows) | **NOT** | **NOT** | DONE (isolation-layer tests) | PARTIAL | **NOT BUILT** (data layer) | a reviewed rows-file to drive the first FuelEU/estimate computation — plan's own sequence table claims this landed; it has not |
| closure gate (W7.5) | W7.5 | DONE | DONE (ran live this session) | N-A | N-A | DONE (wired in discipline.yml:258) | DONE (this file's own header) | **COMPLETE** | one open question: the `gating:1` write-orphan under an overall PASS (§6) |
| trust-recompute / uptime-probes cron disarm | rule 16, audit gap #11 | DONE | N-A | N-A | N-A | N-A | DONE (inline comment) | **COMPLETE** | nothing |
| community-topics-seed retirement | W6.1 | N-A (removed) | N-A | DONE (0 rows, by design) | N-A | N-A | PARTIAL (no explicit runbook note found this session) | **COMPLETE** | nothing functional; a runbook line noting the retirement would help the next reader |
| census-off-vertical archive path | W2.2/R-A | DONE (code) | **NOT** (would error) | **NOT** (migration 308 unapplied) | N-A | N-A | DONE | **NOT BUILT** | apply migrations 299/301/308 (Supabase CLI, coordinator-only per two-track policy) |
| tier-opinions writer | W3.3 | DONE (code exists, dated 2026-09-05) | **NOT** | **NOT** (0 rows) | N-A | N-A | DONE | **BUILT-DORMANT** | one dispatch |
| review-digests script existence | W1.2 | DONE (file now exists) | **[HYPOTHESIS]**, not independently confirmed | — | — | — | — | **PARTIAL** (was falsely reported NOT BUILT by the prior audit) | run evidence to move to COMPLETE |

**Row counts by verdict (12 rows scored above):** COMPLETE 4, PARTIAL 3, BUILT-DORMANT 2, NOT BUILT 3,
DUPLICATE 0 (the one duplicate found, §5.1, is already resolved — retired, not live).

---

## Findings against the operator's three concerns

**Tools built but unused or duplicated:**
- `tier-opinions.mjs` — built (W3.3), never dispatched. `source_tier_opinions` stays at 0 rows.
  [CONFIRMED]
- The archive half of `census-off-vertical.mjs` — built, cannot run without erroring, because its own
  migration (308) is a file in the repo that was never applied to the live database. [CONFIRMED]
- `supabase-service-config.mjs` — a genuine duplicate, already retired by this very tree's own rebase
  commit. [CONFIRMED, not a live problem]
- Nine derivation methods are called for by the plan's own vocabulary ("the producers... write
  `derivation_edges`... per the two registered methods") but the live system only ever writes edges from
  two of the nine producer families; `market_series` (the highest-volume family) has none. Not a
  duplicate, but the plan's own text undercounts the work by describing "two registered methods" as if
  that were the whole job.

**Flywheel and harness gaps:**
- The flywheel's discovery→intake link (A1→A2→A3 in the prior audit's naming) is now event-chained
  end-to-end at the trigger level, but the actual data transfer (candidates becoming `census_worklist`
  rows) has still never executed in apply mode — 57,469 candidates, 3 promoted. [CONFIRMED]
- Loop B (decision propagation) is chained correctly at the trigger level (producers→drain) but starved
  at the data level: the DAG that tells the drain what to recompute covers 24 of however many thousand
  facts producers have actually written, and `statutory_computations`/`estimated_values` remain at 0 rows
  months after the plan's own sequence table claimed a first live writer would land by T38/T42.
  [CONFIRMED]
- The closure gate (the harness/memory enforcement the plan's own "root cause" section said did not exist)
  is now built, wired into CI, and passes live. [CONFIRMED] This is the single most consequential
  REFUTED-prior-claim finding in this audit: the plan's own diagnosis of "nothing enforces closure" is no
  longer true of the tree it produced.

**Places a runtime ends without triggering its downstream (rule 17):**
- `population-turn.yml` (§4.1) — no downstream chain at all.
- `corpus-turn.yml` (§4.2) — isolated on both sides, with no documented ruling for the isolation (unlike
  `change-detection.yml`, which has one).
- The `ledger-consume` `workflow_run` firing that forces `mode=plan` (§4.3) — the chain exists, but its
  automatic form is structurally incapable of completing the loop; only a human `workflow_dispatch` with
  `mode=apply` can, and none has happened.
- Producer writes to `market_series` (§4.4) — the single sharpest instance: the trigger to the downstream
  workflow fires correctly, but most of what it should be draining was never registered as drainable.

---

## Prior claims refuted

1. **wiring-audit-2026-09-04/A1-runtimes.md §7 and C1-loop-map.md row A2**: "`ledger-consume.yml`... NEVER
   DISPATCHED... zero `ledger-consume-run-*.json` artifacts exist." **[REFUTED]** — two real chained runs
   exist (`ledger-consume-run-001.json`, `-002.json`), both `mode:"plan"`, fired automatically by the
   `workflow_run` chain built after that audit (lane LEDGER-ZERO/LEDGER-CHAIN-2, per `PENDING-RUN.md`).
   The underlying gap (no apply has ever happened) is real and persists, but the specific claim "never
   dispatched" is false as of this tree.
2. **wiring-audit-2026-09-04/C1-loop-map.md row A2**: "`LEDGER_CONSUME_APPLY_ENABLED = false`." **[REFUTED]**
   — `run-ledger-consume.mjs:226` reads `export const LEDGER_CONSUME_APPLY_ENABLED = true;`, per Re-pin
   note 5 in `PENDING-RUN.md` (operator ruling 2026-09-04, "stop offering API when you have a free option
   with Haiku").
3. **wiring-audit-2026-09-04/A1-runtimes.md ranked gap #11**: "Two workflows (`trust-recompute.yml`,
   `uptime-probes.yml`) carry live cron schedules" with no operator ruling found. **[REFUTED]** — both
   files now carry an explicit inline comment, "DISARMED 2026-09-04 (operator ruling, CLAUDE.md rule 16...)",
   and the `schedule:` blocks are commented out.
4. **wiring-audit-2026-09-04/A1-runtimes.md §2**: "`review-digests`... 'This script does NOT exist in this
   worktree'." **[REFUTED]** — `fsi-app/scripts/review/build-review-digests.mjs` exists in this tree, with
   a companion test file. Whether it has ever been dispatched is not independently confirmed this session
   (downgraded to [HYPOTHESIS], not re-asserted as BUILT-NOT-WIRED).
5. **wiring-audit-2026-09-04/A1-runtimes.md §2, `institution-canonicalize`**: "WIRED-NOT-RUN (dry only, per
   the one dispatch found)." **[REFUTED]** — `docs/ops/dispatch-ledger.jsonl` records a real apply
   (Maintenance #46, run `33898776382`) with a live-SQL-confirmed outcome (`sources.effective_tier`
   updated for 2 of 4 planned rows, 2 left `null`/provisional per the operator's own T4 ruling).
6. **wiring-audit-2026-09-04/A1-runtimes.md ranked gap #9**: "`forward-events-retext`... whose fix
   (RETEXT-COLLIDE) I could not re-verify actually completed cleanly." **[REFUTED as an open defect]** —
   Maintenance #47 (dispatch-ledger, run `33935716862`) shows a clean apply: `item_forward_events` 1,152 →
   821, migration 307 applied live immediately after, "zero duplicate groups" confirmed.
7. **`docs/plans/complete-system-build-plan-2026-09-04.md` §"Why the previous plans stopped short"**:
   "Nothing enforces closure... no gate fails when a board row stays NEXT across trains [or] when a table
   created by a migration ... has a writer and no reader." **[REFUTED, as a description of the current
   tree]** — `closure-gate.mjs` exists, is wired into `discipline.yml`, and ran green live this session
   (§6). The plan's own diagnosis was accurate as a description of the tree it was written against; it is
   not an accurate description of the tree built since.
8. **`docs/plans/complete-system-build-plan-2026-09-04.md` sequence table, train T38/T42**: "W4.2 first
   statutory writer (FuelEU Annex IV, rows-file driven...)" and "the statutory rows-file... so
   `write-statutory` computes its first rows," listed under trains claimed already landed or in progress
   as of the plan's own timeline. **[REFUTED, at the data layer]** — live SQL this session:
   `statutory_computations` = 0 rows, `estimated_values` = 0 rows. The writer code and isolation layer may
   well be shipped (not independently verified this session, out of narrowed scope), but the plan's own
   framing that this would be "landed" by these trains is not true of the live database at 1e6d9e8b.

---

## What I could not verify, and why

- Whether `tag-proposals`/`tag-ratification`'s open/resolved ratio (1,123 vs 143 at the 2026-09-04 audit)
  has changed — not re-queried live this session; scope was narrowed to loop/harness/flywheel wiring, and
  this is a population-volume question. Carried as [HYPOTHESIS].
- Whether `provenance-heal`'s "0 healed_verified" outcome (per the runbook's last-recorded pass) still
  holds — not re-queried; same scope reason.
- Whether `origin-class-backfill`, `attach-found-sources`, and the seven spec-09 W5 producer steps have run
  — out of the audit's narrowed scope (W3/W5), not checked.
- Whether the closure gate's `"gating":1` write-orphan under an overall reported `PASS` (§6) is intended
  behavior (a threshold) or a bug in the gate's own exit logic — read far enough to see the summary line
  but did not trace the exit-code branch fully; flagged as an open question rather than asserted either
  way.
- Per-producer attribution inside `regional_data_facts`/`emission_factors` (which of `eurostat-nrg-pc-205`,
  `bls-oews`, `desnz-emission-factors`, `epa-emission-factors` wrote how many of the shared rows) — not
  re-derived this session; carried from the prior audit as unresolved.
- I did not run the full test suite, a next build, or any write operation, per the lane's read-only mode
  and the operator's instruction that other lanes are active on this container. The one execution
  performed was `node fsi-app/.discipline/governance/closure-gate.mjs`, a read-only, git/fs-only script by
  its own header ("FS + GIT ONLY. No network, no DB, no model call").
