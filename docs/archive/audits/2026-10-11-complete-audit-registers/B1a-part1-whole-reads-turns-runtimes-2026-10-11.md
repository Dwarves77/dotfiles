# B1a part 1: fsi-app/scripts/turns runtimes and appliers, read whole (2026-10-11)

Lane: audit2-b1a-whole-reads-turns. Fact lane, read-only. Reference register: B1-scripts-runtimes-2026-10-11.md (read 5 of 155 bodies whole). Charter: audit2-charter.md.
Parts: part1 = 15 files below (11,522 lines). part2 = turns emitters, exporters, batch subdirs. part3 = harness-runs.
Environment for all executed commands: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY unset, FSI_NO_ENV_FILE=1, cwd fsi-app. No `--apply` / `--execute` was ever run. No DB, no CI, no sub-agents.

## Coverage table (every file read WHOLE)

| File | Lines | Read whole |
|---|---|---|
| turns/run-ledger-consume.mjs | 2070 | yes (chunks of 600-720 lines, Read cap 25k tokens) |
| turns/run-population-flywheel.mjs | 1842 | yes |
| turns/run-source-sweep.mjs | 1475 | yes |
| turns/apply-record-briefs.mjs | 1340 | yes |
| turns/run-change-detection.mjs | 703 | yes |
| turns/export-corpus-for-extraction.mjs | 641 | yes |
| turns/run-propagation-drain.mjs | 599 | yes |
| turns/research-sweep.mjs | 587 | yes |
| turns/run-fetch-drain.mjs | 508 | yes |
| turns/consume-turn-requests.mjs | 442 | yes |
| turns/apply-question-answers.mjs | 370 | yes |
| turns/apply-need-urls.mjs | 334 | yes |
| turns/apply-extraction-output.mjs | 228 | yes |
| turns/apply-theme-briefs.mjs | 228 | yes |
| turns/RESEARCH-SWEEP.md | 155 | yes |
| TOTAL | 11,522 | under the 12,000 split threshold only because the lane is split in three registers (part2 8.1k, part3 4.6k) |

Not read whole: none in this part. Test files (`*.test.mjs`) were EXECUTED, not audited line by line (brief excludes tests).

## SUMMARY

STATUS counts (15 rows): LIVE 7, UNPROVEN 6, HALF-SLICE 1, STALE 1, DEAD 0, UNWIRED 0.
CLASS counts (15 rows): CAPABILITY 3, LEARNING 11, SELF-MAINTENANCE 0, NONE 1.

DISAGREES with B1 / prior audits (details in the rows):
1. aud-sys-1 SM-3c ("ledger-consume apply arms only with an explicitly named verdict file") vs `isApplyArmed` (run-ledger-consume.mjs:1290), which counts committed verdict batch FILES. Plus the verdict batches are all stale (see top-ten 1).
2. B1 ten-rows #3 (`vocabulary_mentions` HALF-SLICE) is REFUTED as a half-slice: readers exist at scripts/connections/term-recurrence.mjs:195 and scripts/connections/raise-term-needs.mjs:154. Bears on apply-record-briefs step "terms".
3. A4 (app-audit-a4d, 2026-09-30) "raw upsert in upsertPortalLinkCandidates" is FIXED-SINCE (guardedUpsert). But a raw `sb.from("monitoring_queue").insert` (run-source-sweep.mjs:1251) and a raw storage upload (L1211) remain and neither prior audit named them.
4. RESEARCH-SWEEP.md and research-sweep.mjs header say the seen-urls manifest is "git-committed"; the file is not tracked and not ignored (see row 7).

Unverified (HYPOTHESIS, not executable here):
U1 DB effects of every writer in this part (no DB access; all run only under fixtures/injected deps).
U2 Whether `research-sweep-seen-urls.json` persists across CI runs (source-sweep.yml:247-249 has no commit step; persistence effect not run).
U3 Whether run-propagation-drain unfinished-outbox replay state survives between CI runs (local history empty on a runner).
U4 `BROWSERLESS_UNITS_PER_SOURCE_EST=2` and `DEFAULT_BACKLOG_MAX_ARTIFACTS=2` cost projections (labelled INFERRED/UNCONFIRMED in code).
U5 Prior audits not re-read whole by this lane: stage-audit, wiring-audit A1, B1-modules (only A4d, dead-code-census, aud-sys-1 SM-3, B1 table were compared).
U6 Worker HTTP outcomes of run-fetch-drain and run-change-detection route POST (needs deployed endpoint and secrets).

TEN ROWS THAT MATTER MOST
1. run-ledger-consume: both committed verdict batches (386 entries) carry stale prompt_version sha256:70ca104246d8bb95 vs live sha256:1ceca92ff0dfae68; `--check-verdicts` exits 4, usable verdicts 0 of 386, while `isApplyArmed` counts the 2 files as armed.
2. run-source-sweep: raw `monitoring_queue` insert (L1251) and raw storage upload (L1211) bypass db.mjs guards (rule 015).
3. apply-record-briefs: raw `item_changelog` insert (L683, unguarded); `APPLY_STEP_ORDER` is log-only, real order is hard-coded.
4. run-change-detection: route POST non-ok is recorded `route_error` but exit stays 0; in build mode detects nothing by design (rule 16).
5. research-sweep: outputs consumed only by a manual `run-mint-batch --batch-file`; manifest untracked; no fetch timeout.
6. run-population-flywheel: only writer of tracked `turns/LAST-TURN.json`; spawns `run-mint-batch --outcomes`; step numbering stale after S3-A reorder.
7. apply-theme-briefs: no try/catch around write loop, a guarded-write throw leaves no harness artifact; sole writer of `theme_briefs`.
8. run-source-sweep: `--max-hosts` is a dead flag (parsed, recorded, never used) yet source-sweep.yml still passes it.
9. apply-question-answers / apply-need-urls / apply-theme-briefs: the `batches/` dirs they document never existed in git; the appliers have never had a committed real batch.
10. run-propagation-drain: raw `createClient` by design; replay state depends on a local run artifact history.

## Rows

Schema: ID | WHAT | FOR | CALLED BY | CONSUMED BY | PROVEN BY | LAST REAL RUN | CLASS | PRIOR | B1 ROW | STATUS | token

| ID | WHAT | FOR | CALLED BY | CONSUMED BY | PROVEN BY | LAST REAL RUN | CLASS | PRIOR | B1 ROW | STATUS | token |
|---|---|---|---|---|---|---|---|---|---|---|---|
| turns/run-ledger-consume.mjs | Plan/apply the corpus ledger-consume turn: export candidates (`--export-candidates`, `--with-text`, `--stale-verdicts`), check committed verdict batches (`--check-verdicts`), fetch+promote under caps (max-promote default 50, ceiling 200), exit 0/1/2/3/4 | flywheel stage: ledger consumption / discovery promote | .github/workflows/ledger-consume.yml, .github/workflows/population-turn.yml, scripts/drain/kinds.mjs, .claude/commands/drain.md | ledger rows (harness_runs) and promoted sources/captures; verdict batches in turns/ledger-verdicts | node --test run-ledger-consume.test.mjs: 151/151 pass; no-creds CLI exit 2; `--check-verdicts` on batches 001, 002 exit 4 | ledger family ledger-consume: ledger id 016 vs tracked 010 (modes plan/dry/export); no live apply in the 280-row export | LEARNING | aud-sys-1 SM-3c: DISAGREES. dead-code-census: AGREES (live). | CONFIRMED (WHAT ok); CORRECTED: verdict arming and staleness | LIVE | [CONFIRMED: `node --test scripts/turns/run-ledger-consume.test.mjs` -> pass 151, fail 0; `node scripts/turns/run-ledger-consume.mjs --check-verdicts` on ledger-verdicts-001/-002 -> exit 4 REFUSED, prompt_version mismatch] |
| turns/run-population-flywheel.mjs | 13-step plan (tag-proposals, tag-ratification, discovery, corpus-export, fwd-event extract/apply, analyze-corpus, derive-obligations, trigger-questions, compute-outcomes, write-outcomes, record-last-turn, brief-export); modes `--mint-run`, `--check-gate`, `--backlog`; spawns children incl. `run-mint-batch --outcomes`; writes `_snapshots/population-flywheel-<id>/` and `harness-runs/brief-export/*.json`; writes tracked turns/LAST-TURN.json (L245 import, L1474 call) | rule 17 (flywheel connects every mint) | .github/workflows/population-turn.yml, .github/workflows/downstream-chain.yml | mint apply gate (`--check-gate`), brief-export queue, LAST-TURN.json readers | node --test run-population-flywheel.test.mjs: 92/92; `--check-gate` exit 0 ("29 mint-run artifact(s) checked"); `--backlog --mode dry` reports 0 stale | population-turn ledger runs are dry/forced_dry (build mode) | LEARNING | A4d: AGREES live | CONFIRMED; CORRECTED: step numbers stale after S3-A reorder, twins (see body facts) | LIVE | [CONFIRMED: `node --test scripts/turns/run-population-flywheel.test.mjs` -> pass 92; `node scripts/turns/run-population-flywheel.mjs --check-gate` -> exit 0, 29 artifacts] |
| turns/run-source-sweep.mjs | Walkers (register-eurlex, register-federal-register, feed, sitemap) over sources, time-budgeted (1500 s), writes portal_link_candidates (guardedUpsert), sources.rss_feed_url and sitemap coverage columns (guarded), raw monitoring_queue insert (L1251), raw storage upload raw_fetches/sitemap-snapshots/<id>/current.json.gz (L1211) | discovery of new URLs / change signals | .github/workflows/source-sweep.yml, .github/workflows/downstream-chain.yml; scripts/turns/apply-need-urls.mjs imports `upsertPortalLinkCandidates`; scripts/connections/raise-term-needs.mjs references | portal_link_candidates, monitoring_queue, sources columns, harness_runs | run-source-sweep.test.mjs 83/83; no-creds exit 2 (dry still needs DB creds) | ledger source-sweep-run-025 (tracked 018); research subject dry run source-sweep-run-021 2026-09-29 | LEARNING | A4 B3 (raw upsert): FIXED-SINCE for upsert; raw insert/upload NOT COVERED | CONFIRMED; CORRECTED: `--max-hosts` dead flag, two raw writes | LIVE | [CONFIRMED: `node --test scripts/turns/run-source-sweep.test.mjs` -> pass 83; `git grep -n 'sb.from("monitoring_queue").insert' scripts/turns/run-source-sweep.mjs` -> L1251] |
| turns/apply-record-briefs.mjs | Per-item apply of committed record-briefs batches: generate, section, ground, provenance-status, changelog, grow, terms, structured-actions (DRY ONLY), lineage, discovery, forward-events, compliance-deadline, entities; then `runUnscopedFlywheelSteps` and revalidate; IO preflight; exit 0/1/2/3 | brief-apply (record facts to published briefs) | .github/workflows/brief-apply.yml; scripts/maintenance/finish-staged-updates.mjs and scripts/connections/term-recurrence.mjs reference | intelligence_items.full_brief, item_changelog, terms, lineage; harness_runs | apply-record-briefs.test.mjs 82/82; apply-record-briefs.npmtest 4 | ledger brief-apply modes dry/plan; tracked vs ledger run ids diverge; no live apply in ledger export | CAPABILITY | A4d: AGREES | CORRECTED: header says "8 steps", code runs 13 | UNPROVEN | [CONFIRMED: `node --test scripts/turns/apply-record-briefs.test.mjs` -> pass 82; raw insert at L683 `sb.from("item_changelog").insert`] |
| turns/run-change-detection.mjs | Three steps: detect (POST deployed /api/worker/check-sources with x-worker-secret, apply only), reconcile, drain; reads scrape gate | change detection (rule 16 build mode) | .github/workflows/change-detection.yml | monitoring_queue, harness_runs | run-change-detection.test.mjs 46/46; no-creds exit 2 | ledger change-detection runs all dry/forced_dry (cadence off) | LEARNING | A4d: AGREES | CONFIRMED | UNPROVEN | [CONFIRMED: `node --test scripts/turns/run-change-detection.test.mjs` -> pass 46; route non-ok recorded `route_error`, exit stays 0 (read L417-L600)] |
| turns/run-propagation-drain.mjs | Imports drain.ts directly; drains propagation outbox in batches of 500; replays unfinished outbox ids from the prior local run artifact (MAX_REPLAY_RANGE 5000, UNFINISHED_ID_CAP 500); then questions-on-change and signposts steps | propagation (flywheel downstream) | .github/workflows/propagation-drain.yml; spawned from run-population-flywheel.mjs and apply-question-answers.mjs references | propagation_outbox, harness_runs | run-propagation-drain.test.mjs 50/50; bare Node 24.15 emits MODULE_TYPELESS_PACKAGE_JSON warning on .ts import | ledger propagation id 031 vs tracked 012; dry/forced_dry | LEARNING | A4d: AGREES | CONFIRMED | UNPROVEN | [CONFIRMED: `node --test scripts/turns/run-propagation-drain.test.mjs` -> pass 50; replay-state persistence: HYPOTHESIS U3] |
| turns/research-sweep.mjs | Selects `sources.category='research'` sources, fetches, writes traces/<run>.census-rows.json, .payloads.json and research-sweep-seen-urls.json | research ingestion | .github/workflows/source-sweep.yml:247-249 only | NOTHING automated; only a manual `run-mint-batch --batch-file` | research-sweep.test.mjs 31/31 | ledger source-sweep-run-021 (2026-09-29, subject research, dry) | LEARNING | NOT COVERED | CORRECTED: outputs have no automated consumer | HALF-SLICE | [CONFIRMED: `git grep -l research-sweep` -> only source-sweep.yml, run-artifact.mjs (comment), capture-static-primaries.mjs, record-briefs/schema.mjs; `git check-ignore` of the manifest -> exit 1 (not ignored) and `git ls-files` -> not tracked] |
| turns/run-fetch-drain.mjs | Resets stuck pending_first_fetch rows (guardedUpdateByIds), POSTs capture-worker Edge Function in batches of 8 with service key Bearer; no AbortSignal | first-fetch capture | .github/workflows/fetch-drain.yml; scripts/verify/population-report.mjs references | sources.fetch state, harness_runs | run-fetch-drain.test.mjs 27/27 | ledger fetch-drain-run-006 (2026-09-29, live); ledger 011 vs tracked 005 | CAPABILITY | A4d: AGREES | CONFIRMED | LIVE | [CONFIRMED: `node --test scripts/turns/run-fetch-drain.test.mjs` -> pass 27; worker HTTP failure is recorded per item, exit stays 0] |
| turns/consume-turn-requests.mjs | Reads OPEN corpus_turn_requests; `--mark-file` stamps consumed_at/consumed_by via guardedUpdateByIds; hand-rolled indexOf argv | corpus-turn tickets | .github/workflows/corpus-turn.yml; scripts/turns/emit-corpus-turn-artifact.mjs, export-corpus-for-extraction.mjs reference | corpus_turn_requests, /api/admin/corpus-turn-requests | consume-turn-requests.test.mjs 41/41 | ledger corpus-turn 009 vs tracked 002 | LEARNING | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test scripts/turns/consume-turn-requests.test.mjs` -> pass 41] |
| turns/export-corpus-for-extraction.mjs | Read-only exporter to local files; `--with-pool-text`; parts by `--char-budget` (3_000_000); reads all agent_run_searches pool, and ALL item_forward_events rows on the non-pool path | forward-event extraction | .github/workflows/corpus-turn.yml, .github/workflows/brief-export.yml, scripts/drain/kinds.mjs, run-population-flywheel.mjs | extraction agents, apply-extraction-output.mjs | export-corpus-for-extraction.test.mjs 68/68 | ledger corpus-turn runs | LEARNING | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 68] |
| turns/apply-extraction-output.mjs | guardedInsertMany into item_forward_events after client md5 dedupe mirroring migration 307; malformed rows warned and skipped, exit 0; no harness artifact | forward events | .github/workflows/corpus-turn.yml, .github/workflows/population-turn.yml, run-population-flywheel.mjs | item_forward_events readers | apply-extraction-output.test.mjs 16/16 | no harness artifact written, so no ledger row | LEARNING | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 16; header of forward-events PROTOCOL.md gives the old UNIQUE key (see part3)] |
| turns/apply-need-urls.mjs | Registers a source, then census_worklist row or portal_link_candidates, then resolves the flag, read-back after each; `--fixture` mode | needs-search applier | .github/workflows/needs-search.yml; scripts/connections/ratify-flag-to-census.mjs references | sources, census_worklist, portal_link_candidates | needs-search tests 35/35; `--fixture` dry run exit 0 (2 valid) | ledger needs-search-run-001 mode dry; no batch ever committed beyond fixture example | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: `node scripts/turns/apply-need-urls.mjs --fixture ...` -> exit 0, 2 valid] |
| turns/apply-question-answers.mjs | Calls `register_inference_record` RPC with a raw client; imports .ts directly; CHUNK 25 | question answers | .github/workflows/question-answers.yml; .claude/commands/drain.md | inference records | question-answers tests 52/52; `--fixture` dry run exit 0 (2 valid) | no live run in ledger export; `batches/` dir never existed in git | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: dry fixture run -> exit 0, 2 valid; `git ls-files scripts/turns/question-answers/batches` -> empty] |
| turns/apply-theme-briefs.mjs | Only writer of `theme_briefs`; no try/catch around write loop or main; `probeStructuredColumns` sniffs migration 351 by regex on error text | theme briefs | .github/workflows/theme-briefs.yml; scripts/connections/generate-theme-brief.mjs imports it | theme_briefs readers | apply-theme-briefs.test.mjs 16/16; dry fixture exit 0 (1 valid) | none; `batches/` never existed | CAPABILITY | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: dry fixture run -> exit 0, 1 valid; read L1-228 whole: no try/catch] |
| turns/RESEARCH-SWEEP.md | Doc for research-sweep.mjs | doc | none (read by humans) | none | not executable | n/a | NONE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: says manifest is "git-committed"; git ls-files shows it is not; "Known kit-check gap" section contradicts itself] |

## Body facts per file (hidden writers, dead branches, duplicates, TODOs, hard-codes, secrets, swallowed exits)

TODO/FIXME/XXX/HACK count across this part: 0 (executed grep over all turns and harness-runs scripts). HYPOTHESIS/UNCONFIRMED/INFERRED markers in code: run-population-flywheel 2, apply-record-briefs 2, run-change-detection 2.

### run-ledger-consume.mjs
- Hidden/other writers: promotion and fetch writes via guarded paths; writes artifact to harness-runs/ledger-consume.
- `isApplyArmed` (L1290) counts verdict batch FILES present, not a named file. `resolveApplyGate(requestedMode, applyEnabled)` keeps a stale parameter name from retired `LEDGER_CONSUME_APPLY_ENABLED`.
- Dead/orphan: JSDoc blocks at L1180-1184 and L1261-1267 attach to nothing.
- Duplicate: `validateVerdictEntry` duplicates `ledger-verdicts/schema.json`; `buildFetchDoc` twins `politeFetch` in run-source-sweep.mjs; `resolveSweepLoopRunId` twin in run-fetch-drain.mjs.
- Hard-coded: fetch gap 1000 ms (env LEDGER_CONSUME_FETCH_GAP_MS), timeout 20_000, pdfMaxChars 400_000, UA "FSI-ledger-consume/1.0 (+corpus-turn)", max-promote 50/200, scanPageSize 500, domain 1..7, 200-char floor.
- Secrets: service key from env; ANTHROPIC_API_KEY used only with `--allow-api` (exit 3 otherwise). Not logged.
- Swallowed exits: none found beyond designed exit codes.

### run-population-flywheel.mjs
- Writers: `_snapshots/population-flywheel-<id>/`, harness-runs/brief-export/*.json, tracked turns/LAST-TURN.json (hidden tracked-tree write, see last-turn-date in part2).
- Stale step numbering after S3-A reorder; header says 13 steps in plan, comments reference other numbers.
- Twins: `chunkArray` vs imported `chunk`; `OUTCOME_KEYS` vs run-mint-batch `KNOWN_OUTCOME_KEYS`; `DEFAULT_BRIEF_EXPORT_CHAR_BUDGET` 3_000_000 vs export-corpus-for-extraction `DEFAULT_CHAR_BUDGET`; `buildTagProposalsDeps` / `buildTagRatificationDeps` mirror maintenance scripts' IS_MAIN deps.
- Orphan JSDoc above `resolveMintedItemIds`. `DEFAULT_BACKLOG_MAX_ARTIFACTS=2` is an INFERRED cost projection.

### run-source-sweep.mjs
- Raw writes: `monitoring_queue` insert L1251 and storage upload L1211 (rule 015 bypass; not through db.mjs).
- Dead flag: `--max-hosts` (parsed, recorded in `config.max_hosts`, never used; selection uses `slice`). source-sweep.yml still passes it.
- Twins: `upsertPortalLinkCandidates` mirrors `persistPortalCandidates`; `recordSitemapChange` mirrors the check-sources route insert.
- Hard-coded: `DEFAULT_TIME_BUDGET_SECONDS` 1500 derived from workflow timeout-minutes 30; comments embed measured counts (1630 sources, 646 hosts) that will drift.
- Swallow: persist `catch { failed++ }` discards error text.

### apply-record-briefs.mjs
- Raw write: `item_changelog` insert L683, unguarded.
- `APPLY_STEP_ORDER` (11 names) is plan/log only; real execution order is hard-coded; header says "8 steps".
- Dead branch: the `importLinkItemEntities` "module not present" shim cannot trigger (src/lib/entities/link-item-entities.mjs exists).
- Four jiti lazy-loader boilerplates; orphan JSDoc above `TERMS_CITE`.
- Hard-coded: `DEFAULT_IO_BUDGET_MB` 400; `PIPELINE_POOL_REREADS` 2 (labelled HYPOTHESIS in code).

### run-change-detection.mjs
- Secrets: x-worker-secret from env (APP_URL + WORKER_SECRET); without them in apply mode exits 2 (L417).
- Swallow: route POST non-ok -> `route_error` recorded, exit 0; read helpers return []/0 on error.
- Twins: mirrors the route's due SELECT; constants `DEFAULT_CHECK_LIMIT` 10, `DEFAULT_RECONCILE_BATCH` 200.
- `BROWSERLESS_UNITS_PER_SOURCE_EST=2` labelled UNCONFIRMED.

### run-propagation-drain.mjs
- Uses raw `createClient` (deliberate per header). Imports `drain.ts` directly.
- Hard-coded batch 500, `MAX_REPLAY_RANGE` 5000, `UNFINISHED_ID_CAP` 500.

### research-sweep.mjs
- Writes three untracked-tree files; no fetch timeout; twin `stripHtmlToText` (duplicate acknowledged at maintenance/capture-static-primaries.mjs:130).
- Manifest `research-sweep-seen-urls.json` is neither tracked nor ignored.

### run-fetch-drain.mjs
- Writer: `guardedUpdateByIds` on stuck rows; POST with service key as Bearer.
- No AbortSignal on fetch. Orphan JSDoc on `stuckCutoffIso`. Constants 8/64/8/1h. Worker HTTP failures recorded per item, exit 0.

### consume-turn-requests.mjs
- Header says it replaces `last-turn-date` as selector while the flywheel still writes LAST-TURN.json.

### export-corpus-for-extraction.mjs
- Read-only. Constants `DEFAULT_LIMIT` 10000, `DEFAULT_CHAR_BUDGET` 3_000_000. IO risk: reads full agent_run_searches pool and all item_forward_events rows.

### apply-extraction-output.mjs / apply-need-urls.mjs / apply-question-answers.mjs / apply-theme-briefs.mjs
- Covered in the rows. apply-theme-briefs: `probeStructuredColumns` regex-sniffs migration 351 on error text; apply-need-urls imports `upsertPortalLinkCandidates` from run-source-sweep.mjs and `OPEN_STATUSES` from question-answers/data.

## Executed evidence

| Command | Output (tail) |
|---|---|
| `node --test` on each of: apply-extraction-output, apply-theme-briefs, consume-turn-requests, export-corpus, research-sweep, run-change-detection, run-fetch-drain, run-propagation-drain, run-source-sweep, run-ledger-consume, run-population-flywheel, apply-record-briefs, needs-search, question-answers tests | pass 16, 16, 41, 68, 31, 46, 27, 50, 83, 151, 92, 82, 35, 52; fail 0 each |
| Each of the 14 CLIs with creds unset | exit 2 |
| `node scripts/turns/run-population-flywheel.mjs --check-gate` | exit 0, "29 mint-run artifact(s) checked" |
| `node scripts/turns/run-population-flywheel.mjs --backlog --mode dry` | 0 stale |
| `run-ledger-consume.mjs --check-verdicts` on ledger-verdicts-001 (30 entries) and -002 (356) | exit 4 REFUSED (prompt_version sha256:70ca104246d8bb95 vs live sha256:1ceca92ff0dfae68) |
| fixture dry runs: apply-need-urls, apply-question-answers, apply-theme-briefs | exit 0; 2, 2, 1 valid |
| `git grep -l research-sweep` / `git check-ignore` on the manifest | callers listed in row 7; check-ignore exit 1 |
| caller scan `git grep -l -F <basename>` excluding tests/docs | callers cited in the CALLED BY column |

## Prior findings still open (from reference audits, checked by execution)

| Prior finding | Date | Then | Now |
|---|---|---|---|
| app-audit-a4d: raw upsert in `upsertPortalLinkCandidates` (A4-B3) | 2026-09-30 | finding | FIXED-SINCE (guardedUpsert in run-source-sweep.mjs) |
| aud-sys-1 SM-3c: apply arms only with a named verdict file | 2026-10-11 | claim | DISAGREES (run-ledger-consume.mjs:1290 counts files) |
| B1 ten-rows #3: vocabulary_mentions HALF-SLICE | 2026-10-11 | claim | REFUTED (readers at connections/term-recurrence.mjs:195, raise-term-needs.mjs:154) |
| STILL-OPEN, not previously named: raw monitoring_queue insert and storage upload | | | run-source-sweep.mjs:1251, :1211 |
| STILL-OPEN, not previously named: raw item_changelog insert | | | apply-record-briefs.mjs:683 |
