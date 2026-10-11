# B1a part 2: fsi-app/scripts/turns emitters, exporters, delivery shells, batch subdirectories, read whole (2026-10-11)

Lane: audit2-b1a-whole-reads-turns. Fact lane, read-only. See part1 for the shared environment (creds unset, FSI_NO_ENV_FILE=1, no apply/execute, no DB).
Companion registers: part1 (runtimes/appliers), part3 (harness-runs).

## Coverage table (every file read WHOLE)

| File | Lines | Read whole |
|---|---|---|
| turns/deliver-artifact-branch.sh | 119 | yes |
| turns/commit-brief-apply-artifact.sh | 73 | yes |
| turns/dry-run-structured-actions.mjs | 198 | yes |
| turns/emit-brief-export-artifact.mjs | 162 | yes |
| turns/emit-corpus-turn-artifact.mjs | 232 | yes |
| turns/emit-downstream-chain-artifact.mjs | 215 | yes |
| turns/emit-gate-a-rescan-artifact.mjs | 221 | yes |
| turns/emit-live-smoke-artifact.mjs | 142 | yes |
| turns/emit-source-resolution-artifact.mjs | 191 | yes |
| turns/export-needs-for-search.mjs | 143 | yes |
| turns/export-questions-for-answers.mjs | 195 | yes |
| turns/export-themes-for-briefs.mjs | 166 | yes |
| turns/io-preflight.mjs | 337 | yes |
| turns/last-turn-date.mjs | 78 | yes |
| turns/read-brief-export-queue.mjs | 124 | yes |
| turns/brief-export/queue.mjs | 214 | yes |
| turns/brief-export/pending/README.md | 39 | yes |
| turns/ledger-verdicts/README.md | 241 | yes |
| turns/needs-search/README.md, artifact.mjs, data.mjs, fixture-deps.mjs, schema.mjs | 119, 29, 178, 61, 171 | yes |
| turns/question-answers/README.md, artifact.mjs, data.mjs, fixture-deps.mjs, schema.mjs | 178, 35, 415, 59, 240 | yes |
| turns/theme-briefs/README.md, artifact.mjs, data.mjs, fixture-deps.mjs, schema.mjs | 152, 50, 255, 90, 323 | yes |
| turns/record-briefs/README.md | 600 | yes |
| turns/record-briefs/schema.mjs | 1123 | yes |

Not read whole: none. Data JSON batch files (ledger-verdicts-001/-002, record-briefs/batches/*, needs-search-001) are artifacts outside scope; their metadata (entry counts, prompt_version) was read through executed commands only.

## SUMMARY

STATUS counts (23 rows; each subdirectory group is one row): LIVE 10, UNPROVEN 7, UNWIRED 1, STALE 4, HALF-SLICE 1, DEAD 0.
CLASS counts (23 rows): CAPABILITY 1, LEARNING 6, SELF-MAINTENANCE 11, NONE 5.

DISAGREES with B1 / prior audits:
1. B1 says turns/read-brief-export-queue.mjs has CALLED BY NONE. It is called by scripts/drain/kinds.mjs:166 (exportArgv) and scripts/drain/plan-drain.mjs:276-281. CORRECTED.
2. app-audit-a4d "commit-brief-apply-artifact: no findings" is superseded by R22: the script is a second landing path (brief-apply.yml:276, after deliver-artifact-branch), and on master it commits locally only and exits 0.
3. record-briefs/README.md claims the batch path is `scripts/turns/record-briefs/record-briefs-NNN.json`; files live in `record-briefs/batches/` (15 tracked). The README also claims committed brief-export run artifacts (retired by R22).
4. ledger-verdicts/README.md L221-224 claims apply arms ONLY with an explicit `--verdicts`; code (`isApplyArmed`) counts files. L200 cites `config.verdicts_file`, code writes `verdicts_files`.
5. brief-export/pending/README.md describes a file/branch path retired by R22; directory holds only this README.

Unverified (HYPOTHESIS, not executable here):
U1 DB effects of io-preflight (`brief_apply_runs` insert, privileged metrics GET) and every exporter read (no DB).
U2 io-preflight thresholds 30 / 60 / 0.5 / 40 (labelled HYPOTHESIS in code); metrics endpoint behavior on a live project.
U3 emit-corpus-turn `latestForwardEventsCount` may read a stale tracked artifact.
U4 CI behavior of deliver-artifact-branch.sh `git status --porcelain` with the `:(glob)` pathspec on a runner (exercised only with local fixtures).
U5 The 43-versus-46 workflow call-line count of deliver-artifact-branch (43 here from `git grep`, B1 said 46; unreconciled).
U6 Whether any workflow run has ever exercised commit-brief-apply-artifact's push branch (non-master).

TEN ROWS THAT MATTER MOST
1. deliver-artifact-branch.sh: zero artifacts gives landed=0, exit 0; missing creds gives a warning, exit 0. Every workflow's landing step can pass with nothing landed.
2. commit-brief-apply-artifact.sh: second landing path after R22; on master it commits locally only, exit 0.
3. dry-run-structured-actions.mjs: no caller anywhere (UNWIRED); header says it writes nothing, but it writes a local artifact and a best-effort harness_runs row.
4. read-brief-export-queue.mjs: B1 CALLED BY NONE is wrong; drain kinds and plan-drain call it.
5. emit-*-artifact.mjs (6): a bare run writes an artifact into the tracked tree (reproduced: emit-live-smoke wrote live-smoke-run-002.json, removed).
6. emit-*: a missing numeric exitCode is treated as 0 (success by default).
7. io-preflight.mjs: sends service_role key as Basic auth to the project metrics endpoint; every threshold is an unverified hypothesis.
8. record-briefs/schema.mjs: header says driver "not yet built" although apply-record-briefs.mjs exists; 4 self-declared duplicates of src constants.
9. record-briefs/README.md and brief-export/pending/README.md: stale after R22.
10. question-answers/data.mjs is a de-facto shared library (OPEN_STATUSES, FLAG_COLUMNS, loadOpenNeedTargets, needOfFlag) imported by needs-search, apply-need-urls, raise-term-needs, research-walker.

## Rows

| ID | WHAT | FOR | CALLED BY | CONSUMED BY | PROVEN BY | LAST REAL RUN | CLASS | PRIOR | B1 ROW | STATUS | token |
|---|---|---|---|---|---|---|---|---|---|---|---|
| turns/deliver-artifact-branch.sh | Finds untracked scripts/harness-runs/*/*-run-*.json via `git status --porcelain` and lands each through scripts/lib/record-harness-run.mjs into harness_runs (R22) | harness record landing | 43 workflow call lines (brief-apply, brief-export, change-detection, corpus-turn, downstream-chain, fetch-drain, gate-a-rescan, ledger-consume, live-smoke, maintenance, needs-search, ...) and .claude/commands/drain.md | harness_runs table | deliver-artifact-branch.test.mjs 8/8; zero-artifact run: landed=0 exit 0; one artifact no creds: skipped=1 exit 0 | every ledger row since R22 | SELF-MAINTENANCE | A4: NOT COVERED | CONFIRMED; CORRECTED: contradictory comments L38-55 vs L88-96, stale name (no branch), `set -u` only | LIVE | [CONFIRMED: `node --test` -> pass 8; `bash deliver-artifact-branch.sh` with zero artifacts -> "landed=0", exit 0] |
| turns/commit-brief-apply-artifact.sh | Bot-identity git add/commit; on master commits LOCALLY ONLY with a warning, exit 0; otherwise pull --rebase + push (two tries), degraded to warning | brief-apply artifact commit (pre-R22) | .github/workflows/brief-apply.yml:276, .github/workflows/maintenance.yml; twin scripts/maintenance/commit-worklist-artifact.sh | git history | commit-brief-apply-artifact.test.mjs 5/5 | not determinable | SELF-MAINTENANCE | A4: "no findings" DISAGREES (superseded by R22) | CORRECTED | LIVE | [CONFIRMED: `node --test` -> pass 5; body read L1-73: master branch path commits locally, exit 0] |
| turns/dry-run-structured-actions.mjs | Reads ALL intelligence_items.full_brief via readAll, runs extractRecommendedActions, writes a local artifact and a best-effort harness_runs row; exit always 0 | structured-actions extraction preview | NONE (git grep: only F25 liveness fixture, LAST-PROPOSER-PASS.md, record-harness-run.mjs mention it) | NONE | dry-run-structured-actions.test.mjs 3/3 | ledger structured-actions ids disagree with artifact names | NONE | NOT COVERED | CORRECTED: B1 had it as runtime | UNWIRED | [CONFIRMED: `git grep -n dry-run-structured-actions -- .github fsi-app/package.json fsi-app/scripts/proof` -> no output; `node --test` -> pass 3] |
| turns/emit-brief-export-artifact.mjs | Env-driven (BE_*) artifact writer for brief-export family | harness record | .github/workflows/brief-export.yml | harness_runs via deliver | emit-brief-export-artifact.test.mjs 10/10 | ledger brief-export runs | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 10] |
| turns/emit-corpus-turn-artifact.mjs | Env (CT_*) writer for corpus-turn; hand-writes the envelope instead of buildRunArtifactEnvelope | harness record | .github/workflows/corpus-turn.yml | harness_runs | test 18/18 | ledger corpus-turn 009 vs tracked 002 | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 18] |
| turns/emit-downstream-chain-artifact.mjs | Env (DC_*, 8 env reads) writer; hard-coded 7-step list; hand-written envelope | harness record | .github/workflows/downstream-chain.yml, brief-export.yml | harness_runs | test 16/16 | ledger downstream-chain-run-001 (2026-09-29 skipped no-op), newer dry | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 16] |
| turns/emit-gate-a-rescan-artifact.mjs | Env (GAR_*) writer for gate-a-rescan | harness record | .github/workflows/gate-a-rescan.yml | harness_runs | test 12/12 | ledger gate-a-rescan runs | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 12] |
| turns/emit-live-smoke-artifact.mjs | Reads LS_REPORT JSON, records pages/failures/warnings/holds per invariant; imports INVARIANTS from .discipline/rendering/live/live-assertions.mjs | harness record for live smoke | .github/workflows/live-smoke.yml (if: always()) | harness_runs | test 5/5; bare run wrote live-smoke-run-002.json (removed) | live-smoke ledger runs | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node scripts/turns/emit-live-smoke-artifact.mjs` (no env) -> "wrote .../live-smoke-run-002.json"; I deleted that file] |
| turns/emit-source-resolution-artifact.mjs | Env (SR_*) writer; hard-coded 3-step list | harness record | .github/workflows/source-resolution.yml | harness_runs | test 13/13 | ledger source-resolution runs | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 13] |
| turns/export-needs-for-search.mjs | Bundle of open needs to `--out-dir` plus harness artifact; DEFAULT_CHAR_BUDGET 60000 (twin constant) | needs-search export | .github/workflows/needs-search.yml, scripts/drain/kinds.mjs | search agents | fixture run exit 0 (5 of 7) | ledger needs-search-run-001 dry | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: fixture export -> exit 0, 5 of 7 exported] |
| turns/export-questions-for-answers.mjs | Same scaffold for questions | question-answers export | .github/workflows/question-answers.yml, scripts/drain/kinds.mjs | answering agents | fixture run exit 0 (2 of 4) | none live | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: fixture export -> exit 0, 2 of 4] |
| turns/export-themes-for-briefs.mjs | Same scaffold for themes | theme-briefs export | .github/workflows/theme-briefs.yml, scripts/drain/kinds.mjs, scripts/connections/generate-theme-brief.mjs | brief writers | test 11/11; fixture run exit 0 (3 of 3) | none live | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: fixture export -> exit 0, 3 of 3; `node --test` -> pass 11] |
| turns/io-preflight.mjs | Apply-mode guard before first item: raw insert into brief_apply_runs, guardedUpdate on finish, 30 s sleep, GET <project>/customer/v1/privileged/metrics with Basic service_role:<service key>; thresholds 30/60/0.5/40 | brief-apply IO safety | imported by apply-record-briefs.mjs:147 | apply-record-briefs.mjs | io-preflight.test.mjs 33/33 | no apply run in ledger | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: `node --test` -> pass 33; thresholds labelled HYPOTHESIS in code] |
| turns/last-turn-date.mjs | Retired as a selector; only writer is the flywheel; tracked turns/LAST-TURN.json holds {"since":"2026-09-03T20:29:26Z"} | legacy what-changed marker | scripts/turns/run-population-flywheel.mjs:245 (write); referenced by consume-turn-requests.mjs header, corpus-turn.yml comment | nothing reads it as a selector | last-turn-date.test.mjs 6/6 | flywheel step 12 | NONE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: `git ls-files scripts/turns/LAST-TURN.json` -> tracked; consume-turn-requests header says it replaces it] |
| turns/read-brief-export-queue.mjs | Lists/reads brief-export queue rows (harness_runs); reads full inputs_ref payloads just to list | drain planning | scripts/drain/kinds.mjs:166, scripts/drain/plan-drain.mjs:276-281, scripts/turns/brief-export/queue.mjs and verify/population-report.mjs reference | drain CLI | test 9/9 | n/a | SELF-MAINTENANCE | B1 NONE: DISAGREES | CORRECTED | LIVE | [CONFIRMED: `git grep -n read-brief-export-queue` -> kinds.mjs:166, plan-drain.mjs:276,281; `node --test` -> pass 9] |
| turns/brief-export/queue.mjs | Database-shaped brief-export auto-queue (R22); `config.drained` is always false (dead check); `pendingQueueRows` ignores time order though doc says "later"; header says "step 12" while plan has 13 | brief-export queue | scripts/turns/read-brief-export-queue.mjs, run-population-flywheel.mjs | drain CLI | queue.test.mjs 14/14 | n/a | SELF-MAINTENANCE | NOT COVERED | CONFIRMED | LIVE | [CONFIRMED: `node --test` -> pass 14] |
| turns/brief-export/pending/README.md | Describes the retired file/branch pending path | doc | NONE | NONE | dir contains only this README | n/a | NONE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: `ls turns/brief-export/pending` -> README.md only; R22 retired the path] |
| turns/ledger-verdicts/README.md | Doc for the verdict batch convention | doc | NONE | NONE | not executable | n/a | NONE | aud-sys-1 SM-3c: DISAGREES | CORRECTED | STALE | [CONFIRMED: README L221-224 vs `isApplyArmed` run-ledger-consume.mjs:1290; README L200 `config.verdicts_file` vs code `verdicts_files`] |
| turns/needs-search/{README,artifact,data,fixture-deps,schema} | Session-batch pattern for needs: validator (schema.mjs, imports .ts directly), data loaders, fixture deps, artifact envelope | needs-search family | apply-need-urls.mjs, export-needs-for-search.mjs, needs-search.yml | appliers | needs-search tests 35/35 | one committed batch = fixture example (needs-search-001.json) | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: `node --test` -> pass 35; README matches code] |
| turns/question-answers/{README,artifact,data,fixture-deps,schema} | Same pattern for questions; data.mjs is shared library (OPEN_STATUSES, FLAG_COLUMNS, loadOpenNeedTargets, needOfFlag) used by needs-search, apply-need-urls, raise-term-needs, research-walker; imports figureTokens from theme-briefs/schema | question-answers family | apply-question-answers.mjs, export-questions-for-answers.mjs, many importers | appliers | tests 52/52 | none; `batches/` never existed | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: `node --test` -> pass 52; `git ls-files .../question-answers/batches` -> 0] |
| turns/theme-briefs/{README,artifact,data,fixture-deps,schema} | Same pattern for themes; loadThemeMaterial reads all workspace_settings and uses ws[0].jurisdiction_weights (single-tenant assumption); loadBriefs repeats migration-351 column sniff | theme-briefs family | apply-theme-briefs.mjs, export-themes-for-briefs.mjs | appliers | theme-briefs tests 43/43 | none; `batches/` never existed | LEARNING | NOT COVERED | CONFIRMED | UNPROVEN | [CONFIRMED: `node --test` -> pass 43; batches count 0] |
| turns/record-briefs/schema.mjs | Pure validator for record-brief batches (1123 lines); header says driver "not yet built" (garbled sentence L163-171); imports .ts directly; self-declared duplicates CLAIM_KIND_VALUES, ANALYSIS_LABEL_RE, SECTION_DEFS_BY_FORMAT_TYPE, requiredSlotErrors/slotAllowsGap; `void surveyed;` dead variable; LARGE_POOL_CHAR_THRESHOLD 200_000 | record-briefs validation | apply-record-briefs.mjs | apply step | record-briefs.test.mjs 90, timeline-mirror 12, section-list-drift.npmtest 6 | 15 batch files tracked | CAPABILITY | NOT COVERED | CORRECTED (driver exists) | HALF-SLICE | [CONFIRMED: `node --test` -> pass 90; apply-record-briefs.mjs exists and imports it, so "not yet built" is false; HALF-SLICE reason: no live apply recorded to consume validated batches] |
| turns/record-briefs/README.md | Doc for record-briefs convention | doc | NONE | NONE | not executable | n/a | NONE | NOT COVERED | CORRECTED | STALE | [CONFIRMED: cites `scripts/turns/record-briefs/record-briefs-NNN.json`; `git ls-files scripts/turns/record-briefs/batches` -> 15; 001/002 no longer exist] |


## Body facts per file

TODO/FIXME/HACK count: 0 in this part. HYPOTHESIS/UNCONFIRMED labels in code: io-preflight 2, brief-export/queue 1, question-answers/schema 2, question-answers/fixture-deps 1, record-briefs/schema 1, record-briefs/README 1.

- deliver-artifact-branch.sh: hidden writer is record-harness-run.mjs (inserts harness_runs; renames artifact file to ledger id). Swallowed exits: landed=0 and missing-creds both exit 0 (designed warning). Contradictory comments L38-55 vs L88-96. Name stale (no branch is created).
- commit-brief-apply-artifact.sh: writes git history using bot identity; master branch commit stays local (never pushed) and exits 0.
- dry-run-structured-actions.mjs: header claims "WRITES NOTHING", but writeRunArtifact writes the local tree and a best-effort harness_runs insert via raw createClient; swallow: any recorder error becomes a log line and the run exits 0 (exit is always 0, L197).
- emit-* (6): fixed FAMILY_DIR in tracked tree; env-driven; a missing numeric exitCode becomes 0; main-guard idiom drifts (isMainModule vs hand-compare); corpus-turn and downstream-chain hand-write the envelope. Hard-coded STEPS (downstream-chain 7, source-resolution 3) disagree with FAMILY.md (part3). live-smoke report holds only origin, page paths, invariant names, truncated text (no credential).
- export-needs/questions/themes: triplicate scaffold, twin DEFAULT_CHAR_BUDGET 60000 and schema_version literals; also called via scripts/drain/kinds.mjs exportArgv.
- io-preflight.mjs: secrets handling: service key placed in Basic auth against the project metrics endpoint; raw insert into brief_apply_runs (unguarded); 30 s sleep; thresholds hard-coded.
- brief-export/queue.mjs: dead `config.drained` check; ignores time order.
- needs-search/data: schema.mjs imports .ts directly (MODULE_TYPELESS warning under bare Node 24.15, CI uses node 24).
- question-answers/schema: imports figureTokens from theme-briefs/schema (cross-batch coupling).
- record-briefs/schema.mjs: four self-declared duplicates guarded by drift tests (section-list-drift.npmtest 6/6 pass); dead `void surveyed;`.

## Executed evidence

| Command | Output (tail) |
|---|---|
| `node --test` on: governing-files, family-registry (part3), dry-run-structured-actions 3, emit-brief-export 10, emit-corpus-turn 18, emit-downstream-chain 16, emit-gate-a-rescan 12, emit-live-smoke 5, emit-source-resolution 13, export-themes 11, io-preflight 33, last-turn-date 6, read-brief-export-queue 9, brief-export/queue 14, record-briefs 90, timeline-mirror 12, theme-briefs 43, commit-brief-apply-artifact 5, deliver-artifact-branch 8, apply-record-briefs.npmtest 4, section-list-drift.npmtest 6 | all pass, fail 0 |
| fixture exports: export-needs, export-questions, export-themes | exit 0; 5 of 7, 2 of 4, 3 of 3 |
| deliver-artifact-branch.sh zero artifacts / one artifact no creds | landed=0 exit 0 / skipped=1 exit 0 |
| bare `emit-live-smoke-artifact.mjs` | wrote live-smoke-run-002.json into tracked tree; removed by me |
| `git ls-files .../batches` counts | question-answers 0, theme-briefs 0, needs-search 1, record-briefs 15 |
| `git grep -n read-brief-export-queue` | scripts/drain/kinds.mjs:166, scripts/drain/plan-drain.mjs:276,281 |
| `git grep -n dry-run-structured-actions -- .github fsi-app/package.json fsi-app/scripts/proof` | no output |

HOUSEKEEPING INCIDENT (mine): the emit-live-smoke bare run also created an empty claim directory `scripts/harness-runs/live-smoke/.claims/live-smoke-run-002.json.claim`. A cleanup command was blocked by a PreToolUse hook and was not retried by another route. `ls -la scripts/harness-runs/live-smoke/.claims` shows two empty dirs: live-smoke-run-001.json.claim (04:54, predates my run, not mine) and live-smoke-run-002.json.claim (06:34, mine). Empty dirs are invisible to git; `git status` shows only `?? show2.sh` (another lane's). Mine remains on disk.

## Prior findings still open

| Prior finding | Date | Now |
|---|---|---|
| app-audit-a4d: commit-brief-apply-artifact "no findings" | 2026-09-30 | DISAGREES: superseded by R22; second landing path |
| B1 read-brief-export-queue CALLED BY NONE | 2026-10-11 | DISAGREES (callers in drain/) |
| STILL-OPEN, not previously named: raw `brief_apply_runs` insert | | io-preflight.mjs |
| STILL-OPEN, not previously named: stale READMEs (record-briefs, brief-export/pending, ledger-verdicts) | | rows above |
