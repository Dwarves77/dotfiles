# P1-12 runtimes-a: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-12, DISPOSITION lane, read-only. Tree: branch `coord/part1-runtimes-a` cut from origin/master `a0749713`; origin/master was `09093a20` when this register was written and no file in scope changed between the two [CONFIRMED: `git diff --stat a0749713 origin/master -- fsi-app/scripts/turns` empty]. Written by a cloud session on 2026-10-12. Every claim carries a token (CLAUDE.md rule 14); numbers come from commands run this session.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by the awk counter (block comments and `//` lines excluded; for `.sh`, lines that are not blank and not `#`). Raw lines are `wc -l`.

## 1. Header and coverage

Module: runtimes-a. The batch, export, apply and emit side of `fsi-app/scripts/turns`: the session-authored batch turns (record briefs, question answers, need URLs, theme-brief apply), the forward-event corpus export and load, the corpus-turn ticket queue, the brief-export queue, the brief-apply IO pre-flight, the per-workflow harness artifact emitters and the artifact landing shells, plus the authoring contracts (READMEs, schema) and the committed batch files.

Scope, per the coordinator's correction of 2026-10-12: files 1 to 41 of `git ls-files fsi-app/scripts/turns | sort` (53 files on this tree). P1-13 holds files 42 to 53 (`research-sweep.mjs`, `run-change-detection.mjs`, `run-fetch-drain.mjs`, `run-ledger-consume.mjs`, `run-population-flywheel.mjs`, `run-propagation-drain.mjs`, `run-source-sweep.mjs`, `theme-briefs/{README.md, artifact.mjs, data.mjs, fixture-deps.mjs, schema.mjs}`, 7,896 lines) and the turn runtime itself. The exact file list is the table below.

Coverage (41 files, 9,253 raw lines, 5,330 code lines in the 31 `.mjs` and `.sh` files; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/scripts/turns/) | raw lines | code lines | read calls |
|---|---|---|---|
| LAST-TURN.json | 4 | data | 1 |
| RESEARCH-SWEEP.md | 155 | doc | 1 |
| apply-extraction-output.mjs | 191 | 144 | 1 |
| apply-need-urls.mjs | 295 | 256 | 1 |
| apply-question-answers.mjs | 327 | 293 | 1 |
| apply-record-briefs.mjs | 1230 | 855 | 2 (offsets 1, 997) |
| apply-theme-briefs.mjs | 195 | 164 | 1 |
| brief-export/pending/README.md | 39 | doc | 1 |
| brief-export/queue.mjs | 181 | 103 | 1 |
| commit-brief-apply-artifact.sh | 73 | 33 | 1 |
| consume-turn-requests.mjs | 385 | 276 | 1 |
| deliver-artifact-branch.sh | 119 | 37 | 1 |
| dry-run-structured-actions.mjs | 166 | 135 | 1 |
| emit-brief-export-artifact.mjs | 134 | 84 | 1 |
| emit-downstream-chain-artifact.mjs | 194 | 159 | 1 |
| emit-gate-a-rescan-artifact.mjs | 196 | 126 | 1 |
| emit-live-smoke-artifact.mjs | 129 | 114 | 1 |
| emit-source-resolution-artifact.mjs | 169 | 143 | 1 |
| export-corpus-for-extraction.mjs | 542 | 337 | 1 |
| export-needs-for-search.mjs | 118 | 100 | 1 |
| export-questions-for-answers.mjs | 166 | 145 | 1 |
| export-themes-for-briefs.mjs | 138 | 120 | 1 |
| io-preflight.mjs | 311 | 220 | 1 |
| last-turn-date.mjs | 48 | 38 | 1 |
| ledger-verdicts/README.md | 241 | doc | 1 |
| ledger-verdicts/schema.json | 142 | data | 1 |
| needs-search/README.md | 119 | doc | 1 |
| needs-search/artifact.mjs | 22 | 15 | 1 |
| needs-search/batches/needs-search-001.json | 29 | data | 1 |
| needs-search/data.mjs | 165 | 133 | 1 |
| needs-search/fixture-deps.mjs | 52 | 41 | 1 |
| needs-search/schema.mjs | 151 | 114 | 1 |
| question-answers/README.md | 178 | doc | 1 |
| question-answers/artifact.mjs | 28 | 18 | 1 |
| question-answers/data.mjs | 399 | 310 | 1 |
| question-answers/fixture-deps.mjs | 49 | 38 | 1 |
| question-answers/schema.mjs | 222 | 149 | 1 |
| read-brief-export-queue.mjs | 105 | 77 | 1 |
| record-briefs/README.md | 600 | doc | 1 |
| record-briefs/batches/record-briefs-009b-tool.json | 195 | data | 1 |
| record-briefs/schema.mjs | 1051 | 553 | 2 (offsets 1, 530) |
| TOTAL | 9253 | 5330 | 43 |

Files not read whole: none. Test files: none exist in scope on this tree; the CLEAN cuts removed every `*.test.mjs` and `*.npmtest.mjs` under `scripts/turns` [CONFIRMED: `git ls-files fsi-app | grep -E 'scripts/turns.*test'` empty], so the test counts the prior registers carry (B1:L496-L528) describe deleted files.

Registers read whole: B1-scripts-runtimes-2026-10-11.md (528 lines, 8 read calls plus 2 refused for size), B1a-part1-whole-reads-turns-runtimes-2026-10-11.md (164 lines), B1a-part2-whole-reads-turns-emitters-batches-2026-10-11.md (133 lines). Rows for scope files in every other register: `grep -rn` of each scope path over the 41 register files; hits in A1-part1, A2-part1, A3, A4, A4a, B1c, B2-part1, B2-part4, C2, C3, C3a, C3b, C4 and F1, cited where used below.

Consumer evidence: for each scope file, `grep -rlF <dir/basename>` over fsi-app/src, fsi-app/scripts, fsi-app/supabase, fsi-app/.discipline, fsi-app/package.json and .github/workflows (docs excluded); then a pass that keeps only import, spawn and `run:` lines (comment mentions dropped). For each of the 185 exported symbols, `grep -rlw <symbol>` over src, scripts and supabase excluding the defining file. Short names collide (`parseArgs` 45 files, `CITE` 51, `emit` 56); those counts are noise and are not cited as consumers.

The trigger fact that governs this whole module: `.github/workflows` holds two files, `ci.yml` and `live-smoke.yml` [CONFIRMED: `ls .github/workflows`]. Every workflow the prior registers name as a caller (brief-apply.yml, brief-export.yml, corpus-turn.yml, downstream-chain.yml, gate-a-rescan.yml, needs-search.yml, question-answers.yml, source-resolution.yml, theme-briefs.yml, maintenance.yml, population-turn.yml) is gone. `scripts/drain/kinds.mjs` still names five of them as `applyWorkflow` (kinds.mjs:34, 79, 97, 115, 133) [CONFIRMED: grep]. So every runtime in this scope runs today only by hand, by a P1-13 runtime spawning it, or (two files) from live-smoke.yml.

## 2. Module verdict

**REFACTOR AND PORT.** The turn pattern this code implements is sound and is the free path the rebuild wants: a read-only export writes a bundle; a session lane authors a batch from the bundle with its own model access ($0); a pure validator refuses a bad entry before any write; a guarded apply writes, reads back, and records a harness artifact. Four kinds use it (record briefs, question answers, need URLs, theme briefs) and two more share half of it (forward-event corpus export and load, ledger verdicts). The validators carry real moat rules: verbatim spans, quotation-only CONFIRMED, tier from host class only, pool-hash staleness, and eight pre-write mirrors of the grounding gates. What is wrong is scale and shape, not substance: each kind re-implements the CLI, credential gate, fixture database, export scaffold, apply scaffold and artifact emitter; four emitters and two shell landers exist only to carry workflows that were deleted; and history narrative is about 40 percent of the raw lines.

**Current code LOC: 5,330** (awk over the 31 code files), plus 1,947 lines of docs and data. **Estimated clean LOC: about 2,950**, plus about 250 lines of authoring docs. Arithmetic: 755 code lines are TRASH outright (commit-brief-apply-artifact 33, deliver-artifact-branch 37, dry-run-structured-actions 135, emit-brief-export 84, emit-downstream-chain 159, emit-gate-a-rescan 126, emit-source-resolution 143, last-turn-date 38); the remaining 4,575 fold to about 2,950 (section 8 file table): the shared kit replaces about 1,000 lines of repeated scaffold with about 420, record-briefs apply and validate go from 1,408 to about 800, export-corpus and the ticket queue from 613 to about 250, the brief-export queue and reader from 180 to about 70.

Core responsibilities (9), with the files that carry them today:

1. Brief apply: turn a validated record-briefs batch into published, grounded, connected items through 11 per-item steps, then the unscoped flywheel steps and cache revalidation (apply-record-briefs.mjs, record-briefs/schema.mjs, io-preflight.mjs).
2. Brief authoring contract: the session lane's rules for a brief body, metadata, claim ledger and section attachment, with eight pre-write mirrors of the live gates (record-briefs/README.md, record-briefs/schema.mjs).
3. Question answers: export open questions with their held material, validate answers (quotation-only CONFIRMED, verbatim spans, cited reach), write inference records or unanswerable outcomes, raise holdings-need targets (export-questions-for-answers.mjs, question-answers/*, apply-question-answers.mjs).
4. Need URLs: export open source needs of four kinds, validate one authoritative URL per need (tier from host class only), register the source, create a census row or portal candidate, resolve the need flag (export-needs-for-search.mjs, needs-search/*, apply-need-urls.mjs).
5. Theme-brief apply: the one writer of theme_briefs (apply-theme-briefs.mjs; the export and validator are P1-13's theme-briefs/*).
6. Forward-event corpus: export claims and sections (or full pool text for brief authoring) and load extracted events into item_forward_events under the migration-307 identity (export-corpus-for-extraction.mjs, apply-extraction-output.mjs).
7. Corpus-turn tickets: read open corpus_turn_requests, partition by the item's live state, hand ids to discovery, stamp consumed (consume-turn-requests.mjs).
8. Brief-export queue: the auto-queue of minted items owed a brief, held in harness_runs rows (brief-export/queue.mjs, read-brief-export-queue.mjs).
9. Harness artifact emission and landing for workflow runs (emit-*.mjs, deliver-artifact-branch.sh, commit-brief-apply-artifact.sh, needs-search/artifact.mjs, question-answers/artifact.mjs).

Dependencies:

- Modules: scripts/lib (db.mjs guarded reads and writes, run-artifact.mjs, record-harness-run.mjs, loop-run-id.mjs, env-file.mjs, is-main.mjs, changelog.mjs, revalidate.mjs, rate-source-by-class.mjs, institution-key.mjs); scripts/harness-runs/governing-files.mjs; src/lib/agent (canonical-pipeline.ts via jiti, parse-output.ts, extract-sections.ts, gate-a-scan.mjs, timeline-parse.mjs, timeline-harvest.mjs, formats/timeline-section.mjs, source-pool-hash.mjs, extract-recommended-actions.mjs, source-blocks.mjs); src/lib/intake (record-facts.mjs, flywheel-steps.mjs, flywheel-defect.ts); src/lib/forward-events (read-and-extract.mjs, compliance-deadline-sync.mjs); src/lib/entities (link-items.ts, link-item-entities.mjs, lineage-backfill.mjs); src/lib/connections (flag-namespaces.mjs, term-recurrence.mjs, term-needs.mjs, brief-staleness.mjs); src/lib/sources (institution.ts, host-authority.ts, seek-more.mjs, source-growth.ts via canonical-pipeline); src/lib/propagation/methods/infer-from-question.ts; src/lib/learning/constants.mjs; src/lib/surface-of.mjs; scripts/connections/ratify-flag-to-census.mjs; scripts/maintenance/host-verdicts/load-host-verdicts.mjs; P1-13 files run-population-flywheel.mjs (runUnscopedFlywheelSteps) and run-source-sweep.mjs (upsertPortalLinkCandidates); .discipline/rendering/live/live-assertions.mjs.
- Tables written: through canonical-pipeline (generate, section, ground): intelligence_items, intelligence_item_sections, section_claim_provenance, claim_versions, agent_run_searches (stubs); directly or through src helpers: item_changelog, vocabulary_terms, vocabulary_mentions, item_cross_references, item_forward_events, integrity_flags, inference_records (RPC `register_inference_record`), theme_briefs, census_worklist, portal_link_candidates, sources (registerSource), corpus_turn_requests, brief_apply_runs, harness_runs. Tables read besides: item_type_required_slots, item_timelines, workspace_settings (P1-13 theme data), connection_themes.
- Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FSI_NO_ENV_FILE; the emitters read BE_*, DC_*, GAR_*, LS_*, SR_*, QA_LOOP_RUN_ID; GITHUB_STEP_SUMMARY.
- External services: the Supabase project metrics endpoint `/customer/v1/privileged/metrics` (io-preflight.mjs:154). Indirectly, through canonical-pipeline: a Haiku judge and the direct-then-Browserless fetch ladder (section 8, call sites).

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | apply-record-briefs.mjs | 1,230 raw, 855 code; four copies of the same jiti lazy loader (56-75, 433-458), a dead ENTITIES pre-flight shim (80-81, 394-404, 785), a misplaced JSDoc (510-532 above TERMS_CITE), APPLY_STEP_ORDER (254-266) that is log-only while the real order is hard-coded in applyOneEntry 549-807 | the step list exists twice and can drift; the loader exists four times; about 375 lines are narrative | one jiti loader; the 11 steps as a data table executed in order by the kit; the shim and the dry structured-actions step removed (section 8) |
| 2 | record-briefs/schema.mjs | 1,051 raw, 553 code; header changelog 10-99 (90 lines of fix-round history); SECTION_DEFS_BY_FORMAT_TYPE 319-375 is a second copy of src/lib/agent/formats/*.ts; buildSyntheticFrontmatter 505-534 duplicates canonical-pipeline.ts 782-800 | the format registry and the frontmatter builder each exist twice; the drift test that was supposed to guard the registry copy is gone (section 4) | import the real format registry in the new tree (no `@/` alias problem once both live under src); one frontmatter builder in src/core shared by the validator and the write site |
| 3 | record-briefs/README.md | 600 lines; the authoring rules are about 200 of them, the rest is fix-round history, lane names and a stale workflow section (574-600) | a session lane reads all of it every batch (rule 11 cost) | one AUTHORING.md per kind, rules only, history left in git |
| 4 | four dead emitters | emit-brief-export 84, emit-downstream-chain 159, emit-gate-a-rescan 126, emit-source-resolution 143 code lines | each is an env-variable shim a deleted workflow called to wrap a step's summary.json into an artifact; no caller remains (section 4) | a runtime records its own artifact in process (the kit's `recordRun`) |
| 5 | triplicated export/apply scaffold | export-needs 100, export-questions 145, export-themes 120; apply-need-urls 256, apply-question-answers 293, apply-theme-briefs 164; three artifact.mjs (15, 18, plus P1-13's); three fixture-deps (41, 38, plus P1-13's) | each repeats parseArgs, the credential gate, fixture or real deps, bundle naming, artifact input and exit codes | the kit (section 8) with a per-kind adapter of export, validate and apply functions |
| 6 | export-corpus-for-extraction.mjs | 542 raw, 337 code; the buildCorpusItems JSDoc 133-179 and the main comments are about 205 lines | two products in one file (forward-event corpus and brief-authoring parts) with a flag that changes the shape | two exporters on one reader |
| 7 | question-answers/data.mjs | 399 raw, 310 code; hosts the need-target readers (OPEN_STATUSES, FLAG_COLUMNS, loadOpenNeedTargets, needOfFlag) that needs-search, raise-term-needs and research-walker import (B1a-part2:L66) | a shared library hidden in one family's directory | the need-target readers move to src/core/flags/need-targets |
| 8 | io-preflight.mjs | 311 raw, 220 code; Prometheus text parsing and a two-sample disk probe with a 30 s sleep (44-213) whose four thresholds are labelled HYPOTHESIS in the code (13-16) and were never calibrated (no apply run recorded, B1a-part2:L84) | about 140 lines and 30 s per run for a guard nobody has calibrated | cooldown read from the last brief-apply harness_runs row and the in-process byte budget the apply loop already has (section 8) |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| dry-run-structured-actions.mjs:1-166 | whole file (runExtractionPass, runDryRun) | unwired CLI | only reference is scripts/harness-runs/structured-actions/family.json (governing list) [CONFIRMED]; B1a-part2:L74 UNWIRED; its output has no destination column (migration 334 file-only, C3a:L138) |
| commit-brief-apply-artifact.sh:1-73 | whole file | shell lander | zero references [CONFIRMED]; its caller brief-apply.yml is deleted; superseded by harness_runs landing (B1a-part2:L73) |
| emit-brief-export-artifact.mjs:1-134 | parseIdsList, buildArtifact, emit | emitter | callers were brief-export.yml (deleted); remaining hits are family.json and comments [CONFIRMED] |
| emit-downstream-chain-artifact.mjs:1-194 | STEPS, termMetrics, termNeedMetrics, readStepSummary, buildArtifact | emitter | caller downstream-chain.yml deleted; readStepSummary's one importer is emit-source-resolution-artifact.mjs:8, itself dead [CONFIRMED]; transitively dead |
| emit-gate-a-rescan-artifact.mjs:1-196 | buildArtifact, emit | emitter | caller gate-a-rescan.yml deleted; remaining hits are family.json and a comment in run-propagation-drain.mjs [CONFIRMED] |
| emit-source-resolution-artifact.mjs:1-169 | STEPS, countsFor, buildArtifact, emit | emitter | caller source-resolution.yml deleted [CONFIRMED] |
| last-turn-date.mjs:12, 15 | EPOCH, readLastTurnDate | exported constant and reader | zero importers outside the file [CONFIRMED]; the only external use is writeLastTurnDate (run-population-flywheel.mjs:10, P1-13); B1:L94 writer with no reader |
| LAST-TURN.json:1-4 | marker | tracked state file | read by nothing but last-turn-date.mjs:15, which has no caller [CONFIRMED] |
| apply-record-briefs.mjs:80-81, 394-404, 785 | ENTITIES_MODULE_SPECIFIER, ENTITIES_MODULE_NOT_PRESENT, importLinkItemEntities fallback branch | dead branch | src/lib/entities/link-item-entities.mjs exists [CONFIRMED: ls], so the not-present branch at 785 cannot run (B1a-part1:L112) |
| apply-theme-briefs.mjs:54-62 | probeStructuredColumns false branch | dead branch | migration 351 is applied, ledger identical (C3b:L88); the column-error branch cannot be taken on the live schema [CONFIRMED by citation] |
| brief-export/queue.mjs:111, 151 | config.drained | dead condition | written false at 111 and never updated anywhere [CONFIRMED: grep `drained` matches no writer]; the `!== true` test at 151 is always true (B1a-part2:L87) |
| record-briefs/schema.mjs:864, 895 | `surveyed`, `void surveyed` | dead variable | parsed and discarded [CONFIRMED read] |
| record-briefs/schema.mjs:92-99 | reference to section-list-drift.npmtest.mjs | dead citation | the drift test is not in the tree [CONFIRMED: `git ls-files` 0 hits]; the registry copy it guarded (319-375) is unguarded |
| brief-export/pending/README.md | whole file | doc | describes the retired file and branch path; directory holds only this file; zero references [CONFIRMED] |
| needs-search/batches/needs-search-001.json | whole file | fixture proof batch | zero references [CONFIRMED]; its own `note` says it is refused whole against the live database |
| record-briefs/batches/record-briefs-009b-tool.json | whole file | applied batch | zero references [CONFIRMED]; applied content belongs in the database (CLAUDE.md rule 1) |
| ledger-verdicts/schema.json | whole file | duplicate contract | not read by any code; run-ledger-consume.mjs (P1-13) enforces its own validateVerdictsFile; README admits the two copies (ledger-verdicts/README.md:154-159); B-2192 |

Exported-for-a-deleted-test symbols that are used inside their own file (not dead, over-exported) [CONFIRMED scan]: apply-record-briefs 15 of 18 exports, consume-turn-requests 8 of 9, io-preflight 6 of 16, question-answers/data 6 of 27, record-briefs/schema 6 of 10, apply-question-answers 3 of 7, apply-extraction-output 3 of 6. In the new tree a symbol is exported only when a module imports it.

Counts by token: 17 dead-code rows, all [CONFIRMED].

## 5. Duplicates and over-abstraction

| duplicate | where | replacement |
|---|---|---|
| Forward-event identity key, two versions that disagree | apply-extraction-output.mjs:57-59 keys on (item, date, kind, md5 text), matching migration 307's unique index (307:87-91); src/lib/intake/flywheel-steps.mjs:13-16 still keys on the source object as well and its comment claims that is 307's key [CONFIRMED read of both and of 307:86-91] | one `forwardEventKey` in src/core/forward-events, the 307 shape; flywheel-steps (P1-09/10) imports it |
| Synthetic frontmatter builder | record-briefs/schema.mjs:454-547; canonical-pipeline.ts:782-800 (its comment names the duplication) [CONFIRMED read] | one builder in src/core/briefs/frontmatter, used by the validator and generateBriefFromInjected |
| Format section registry | record-briefs/schema.mjs:319-375 mirrors src/lib/agent/formats/*.ts | import the registry |
| Claim kind and criterion-4 vocabulary | record-briefs/schema.mjs:102, 115-118 mirror parse-output.ts and validate-mint-payload.mjs (self-declared) | export once from src/core/briefs/vocabulary |
| Main-module guard | 8 files hand-compare `process.argv[1]` (apply-extraction-output:10, consume-turn-requests:9, dry-run-structured-actions:155, emit-brief-export:14, emit-downstream-chain:61, emit-source-resolution:17, export-corpus:27, last-turn-date:32) while 10 import isMainModule [CONFIRMED grep] | the kit's CLI entry |
| Family artifact emitter | needs-search/artifact.mjs:14-22 and question-answers/artifact.mjs:14-28 are the same function; the question-answers copy reads QA_LOOP_RUN_ID and the needs-search copy does not (drift) | `recordRun(family, input)` in the kit |
| In-memory fixture database | three files chained (theme-briefs -> question-answers -> needs-search fixture-deps), each adding predicates or fake writers; question-answers/fixture-deps.mjs:20-40 re-states the inference_records CHECK constraints in JS | one fake db in src/features/turns/kit/fixture-db with eq, in, like, limit, guarded writes and an rpc hook |
| Export scaffold | export-needs:14-118, export-questions:19-166, export-themes (P1-13 sibling 16-138): same parse, gate, deps, write bundle, artifact | kit `runExport(kind)` |
| Apply scaffold | apply-need-urls:51-294, apply-question-answers:54-326, apply-theme-briefs:85-195: validate, refuse per entry, write, read back, artifact input, exit | kit `runApply(kind)` |
| Two writers of one harness family | brief-export/queue.mjs:66-142 and emit-brief-export-artifact.mjs:46-100 both write family `brief-export` with different config shapes (`mode auto, auto_queued` vs `mode explicit/auto, selection`) | one queue writer; the emitter is TRASH |
| Envelope by hand | emit-downstream-chain-artifact.mjs:117-149 writes the envelope as a literal while every sibling calls buildRunArtifactEnvelope (B1a-part2:L77) | gone with the file |
| Two run ledgers for brief apply | brief_apply_runs (io-preflight.mjs:216-256, migration 322) and harness_runs family brief-apply | cooldown reads harness_runs; brief_apply_runs retires (section 8, data model) |
| Need-target readers in the wrong home | question-answers/data.mjs:12-24, 120-142 imported by needs-search/data.mjs:5, scripts/connections/raise-term-needs.mjs:10, scripts/research/research-walker.mjs:20 [CONFIRMED grep] | src/core/flags/need-targets |
| State encoded in free text | needs-search/data.mjs:38-49 writes and regex-parses `need-url applied: need_key=... url=...` inside integrity_flags.resolution_note; question-answers/data.mjs:49-80 keeps answered and unanswerable state as elements of recommended_actions jsonb | keep the jsonb elements (typed, already read by the drain); replace the resolution_note marker with a structured element of the same kind |

## 6. Non-essential artifacts

- The fix-round and lane-history narrative in every file header and README (about 40 percent of raw lines across scope).
- LAST-TURN.json: a tracked state file nothing reads.
- brief-export/pending/README.md: keeps an empty directory for a retired path.
- needs-search/batches/needs-search-001.json: a proof batch sitting where real batches go; it belongs with test fixtures if anything.
- record-briefs/batches/record-briefs-009b-tool.json: applied content (a full brief body) committed to the repo; the database holds the fact, the harness row holds the run.
- ledger-verdicts/schema.json: a JSON Schema no code reads.
- RESEARCH-SWEEP.md: documents a P1-13 file; its live content (the research record profile, the screen contract, the two output shapes) is carried in section 8 feature rows and belongs to P1-13's register; it is stale on two points (B1a-part1:L81: manifest is not git-committed; `research-sweep-seen-urls.json` is not in the tree [CONFIRMED: ls]).
- The `domain 1..7` field in ledger-verdicts/schema.json:99-104 and README step 3: the retired seven-domain model (fsi-app/.claude/CLAUDE.md "the 7 intelligence domains navigation is RETIRED").

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's scan, import, spawn or run lines only) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| LAST-TURN.json | 1-4 (4) | corpus-turn since-date marker | TRASH | 0 | 1: last-turn-date.mjs | read by nothing live |
| RESEARCH-SWEEP.md | 1-155 (155) | doc for research-sweep.mjs | TRASH | 0 (doc) | 0 code | facts carried to section 8 rows and to P1-13 |
| apply-extraction-output.mjs | 1-191 (191) | load run-extraction events into item_forward_events, dedupe on the 307 key, guardedInsertMany | REFACTOR AND PORT | 70 | 1: run-population-flywheel.mjs:1022 (runChild) | no harness artifact (rule 17 gap); own IS_MAIN |
| apply-need-urls.mjs | 1-295 (295) | validate need URLs, register source, census row or portal candidate, resolve flag, read back | REFACTOR AND PORT | 180 | 0 executable (needs-search.yml deleted) | reads all sources rows at :94 |
| apply-question-answers.mjs | 1-327 (327) | validate answers, write inference via register_inference_record, close or refresh flags, raise holdings-need targets | REFACTOR AND PORT | 170 | 0 executable (question-answers.yml deleted) | raw createClient :304-305; imports infer-from-question.ts directly, loads under node 22 [CONFIRMED] |
| apply-record-briefs.mjs | 1-1230 (1230) | brief-apply driver: plan, preflight, per-item 11 steps, IO budget, unscoped flywheel, revalidate, run record | REFACTOR AND PORT | 380 | 0 executable (brief-apply.yml deleted); imports run-population-flywheel.mjs:19 | raw item_changelog insert :573; dry structured-actions step 711-727 |
| apply-theme-briefs.mjs | 1-195 (195) | validate and write theme_briefs (one writer), read back member_hash | REFACTOR AND PORT | 110 | 1: scripts/connections/generate-theme-brief.mjs:15 | no try/catch around 178 (B-0893); no revalidate |
| brief-export/pending/README.md | 1-39 (39) | doc for retired pending path | TRASH | 0 | 0 | |
| brief-export/queue.mjs | 1-181 (181) | brief-export queue artifact, pending-row correlation | REFACTOR AND PORT | 45 | 2: run-population-flywheel.mjs:13, read-brief-export-queue.mjs:6 | inputs_ref carries full part JSON (pool text) |
| commit-brief-apply-artifact.sh | 1-73 (73) | git commit and push of a run artifact | TRASH | 0 | 0 | |
| consume-turn-requests.mjs | 1-385 (385) | corpus_turn_requests queue read, partition, snapshot, mark consumed | REFACTOR AND PORT | 140 | 0 executable (corpus-turn.yml deleted); named in CorpusTurnPanel.tsx:180 as text | hand-rolled argv |
| deliver-artifact-branch.sh | 1-119 (119) | land untracked run artifacts into harness_runs via record-harness-run.mjs | TRASH | 0 | 1: .github/workflows/live-smoke.yml:158 | the one live caller moves to in-process landing first (port order) |
| dry-run-structured-actions.mjs | 1-166 (166) | preview extraction of recommended actions from every full_brief | TRASH | 0 | 0 | reads all full_brief, then applies --limit (:80-81) |
| emit-brief-export-artifact.mjs | 1-134 (134) | env shim for brief-export family | TRASH | 0 | 0 | |
| emit-downstream-chain-artifact.mjs | 1-194 (194) | env shim for downstream-chain family | TRASH | 0 | 1: emit-source-resolution (dead) | |
| emit-gate-a-rescan-artifact.mjs | 1-196 (196) | env shim for gate-a-rescan family, crash detection | TRASH | 0 | 0 | the crash-versus-no-op rule is kept as a kit rule (section 8) |
| emit-live-smoke-artifact.mjs | 1-129 (129) | live-smoke report to artifact | REFACTOR AND PORT | 70 | 1: live-smoke.yml:150 | moves to the live-smoke runner (P1-08 harness) and lands in process |
| emit-source-resolution-artifact.mjs | 1-169 (169) | env shim for source-resolution family | TRASH | 0 | 0 | |
| export-corpus-for-extraction.mjs | 1-542 (542) | corpus export for forward events; pool-text parts for brief authoring | REFACTOR AND PORT | 150 (two exporters) | 1: run-population-flywheel.mjs:9 (import), :1253 (runChild) | full item_forward_events read at :377 |
| export-needs-for-search.mjs | 1-118 (118) | needs bundle | REFACTOR AND PORT | 25 (adapter) | 1: scripts/drain/kinds.mjs:85 (argv) | |
| export-questions-for-answers.mjs | 1-166 (166) | questions bundle, skip-unchanged by pool hash | REFACTOR AND PORT | 45 (adapter) | 1: scripts/drain/kinds.mjs:103 | |
| export-themes-for-briefs.mjs | 1-138 (138) | themes bundle | REFACTOR AND PORT | 25 (adapter) | 1: scripts/drain/kinds.mjs:121 | export logic sits in P1-13's theme-briefs/data.mjs |
| io-preflight.mjs | 1-311 (311) | brief-apply cooldown, in-flight guard, disk probe, brief_apply_runs record | REFACTOR AND PORT | 40 | 1: apply-record-briefs.mjs | raw insert :231; metrics fetch :154 |
| last-turn-date.mjs | 1-48 (48) | read and write LAST-TURN.json | TRASH | 0 | 1: run-population-flywheel.mjs:10 (write only) | |
| ledger-verdicts/README.md | 1-241 (241) | session-verdict authoring contract for ledger consume | REFACTOR AND PORT | doc, folds into AUTHORING (about 50 lines) | 2: drain/kinds.mjs:37 (authoringGuide), run-ledger-consume.mjs (text) | stale on arming and config key (B-1080, B-1617) |
| ledger-verdicts/schema.json | 1-142 (142) | JSON Schema of the verdict file | TRASH | 0 | 0 | |
| needs-search/README.md | 1-119 (119) | needs authoring contract | REFACTOR AND PORT | doc (about 40 lines) | 1: drain/kinds.mjs:82 | current; refs needs-search.yml |
| needs-search/artifact.mjs | 1-22 (22) | family emitter | REFACTOR AND PORT | 0 (kit) | 2: apply-need-urls, export-needs | |
| needs-search/batches/needs-search-001.json | 1-29 (29) | fixture proof batch | TRASH | 0 | 0 | |
| needs-search/data.mjs | 1-165 (165) | need assembly over four flag namespaces, applied-key marker | REFACTOR AND PORT | 110 | 2: apply-need-urls, export-needs | reads all non-archived items for lineage (:108-110) |
| needs-search/fixture-deps.mjs | 1-52 (52) | fake db extension | REFACTOR AND PORT | 0 (kit fixture-db) | 2 | |
| needs-search/schema.mjs | 1-151 (151) | need-URL entry validator, needKey | REFACTOR AND PORT | 100 | 2: apply-need-urls, needs-search/data | rule 18 compliant |
| question-answers/README.md | 1-178 (178) | answers authoring contract | REFACTOR AND PORT | doc (about 60 lines) | 1: drain/kinds.mjs:100 | names a decision-ready gap (non-research needs) |
| question-answers/artifact.mjs | 1-28 (28) | family emitter with loop id | REFACTOR AND PORT | 0 (kit) | 2 | |
| question-answers/data.mjs | 1-399 (399) | question material loader, bundle under budget, outcome and need-target helpers | REFACTOR AND PORT | 250 + 60 to core/flags | 6+: apply/export, needs-search/data, raise-term-needs, research-walker | |
| question-answers/fixture-deps.mjs | 1-49 (49) | fake db plus rpc | REFACTOR AND PORT | 0 (kit fixture-db) | 3 | |
| question-answers/schema.mjs | 1-222 (222) | answers validator, CONFIRMED quotation rule, uncited-figure check | KEEP AS-IS (moved) | 130 | 1: apply-question-answers | header narrative only to trim |
| read-brief-export-queue.mjs | 1-105 (105) | list and resolve pending brief-export rows | REFACTOR AND PORT | 25 (into queue module) | 1: scripts/drain/plan-drain.mjs:228 (spawn) | reads inputs_ref of every row (:77) |
| record-briefs/README.md | 1-600 (600) | brief authoring contract, eight mirrors | REFACTOR AND PORT | doc (about 120 lines) | 1: drain/kinds.mjs:136 | stale workflow section 574-600 |
| record-briefs/batches/record-briefs-009b-tool.json | 1-195 (195) | one applied batch | TRASH | 0 | 0 | |
| record-briefs/schema.mjs | 1-1051 (1051) | record-briefs validator and mirrors | REFACTOR AND PORT | 420 | 1: apply-record-briefs.mjs:15 | duplicates in section 5 |

## 8. Build plan for this module

### What each runtime does, what it reads and writes, its trigger, and what it chains

Trigger column states the trigger on this tree, not the history; every workflow trigger the prior registers name was deleted by the CLEAN cuts (section 1).

| runtime | what it does | reads | writes | trigger now | chains (rule 17) |
|---|---|---|---|---|---|
| apply-record-briefs.mjs | resolves one batch (`--briefs`), validates it (record-briefs/schema.mjs with live pool text, required slots, item types), checks item grade and pool hash, preflights (io-preflight), then per item: generate (generateBriefFromInjected, no model), section, ground (injected ledger, replaceLedger only with `--allow-brief-overwrite`), provenance read-back, changelog when verified, grow sources, terms, structured-actions (dry), lineage, discovery, forward events, compliance deadline, entities; then runUnscopedFlywheelSteps and revalidateTags; exits 0/1/2/3 | agent_run_searches, item_type_required_slots, intelligence_items, brief_apply_runs, harness_runs | intelligence_items, intelligence_item_sections, section_claim_provenance, claim_versions, item_changelog (raw insert :573), vocabulary_terms, vocabulary_mentions, item_cross_references, item_forward_events, integrity_flags (flywheel defects), brief_apply_runs, harness artifact brief-apply | manual CLI only | in process: discovery, forward events, deadline, entities, lineage, unscoped flywheel (P1-13 runUnscopedFlywheelSteps), cache revalidate; records its own artifact in `finally`. The most complete chain in scope |
| apply-theme-briefs.mjs | validates a theme batch against live themes and material (P1-13 theme-briefs/*), writes theme_briefs by insert or snapshotting update, reads back member_hash and generated_by | connection_themes and material (P1-13 data.mjs), theme_briefs | theme_briefs, harness artifact theme-briefs | manual CLI; imported by scripts/connections/generate-theme-brief.mjs:15 | none: no revalidate, no downstream (rule 17 gap) |
| apply-question-answers.mjs | validates answers (question-answers/schema.mjs) against live questions and held pools; answered: register_inference_record, close the flag with an answered element and resolution note; unanswerable: record the outcome, raise or refresh one holdings-need target | integrity_flags (question namespace), intelligence_items, item_cross_references, section_claim_provenance, item_forward_events, agent_run_searches, inference_records | inference_records, integrity_flags, harness artifact question-answers | manual CLI | the holdings-need target is read by scripts/research/research-walker.mjs (manual, OpenAlex); no in-process downstream |
| apply-need-urls.mjs | validates need URLs (needs-search/schema.mjs); registers the source by institution key (rating by host class), creates a census_worklist row (term, holdings, flywheel-gap needs) or a portal_link_candidates row (lineage parents), resolves the need flag with an applied marker, reads back | integrity_flags (four need namespaces), sources (all rows, :94), intelligence_items, census_worklist | sources, census_worklist, portal_link_candidates, integrity_flags, harness artifact needs-search | manual CLI | the census row feeds the population turn and the portal candidate feeds ledger consume (both P1-13, neither triggered) |
| apply-extraction-output.mjs | maps run-extraction events to rows, refuses non-UUID item ids, dedupes against existing rows on the 307 key, inserts new ones | item_forward_events (chunked by item) | item_forward_events | spawned by run-population-flywheel.mjs:1022 (P1-13) | none, and no artifact of its own (rule 17 gap; the flywheel records the family) |
| export-corpus-for-extraction.mjs | default: verified live items (or `--ids`), excluding items that already have events, with claims and sections and due-date pool context, one file; `--with-pool-text`: the brief-authoring parts with full usable pool, pool hash, required slots, forward events and timelines, split by char budget | intelligence_items, item_forward_events (all rows on the default path, :377), item_type_required_slots, section_claim_provenance, intelligence_item_sections, agent_run_searches, item_timelines | local files only | imported and spawned by run-population-flywheel.mjs:9, :1253 | feeds run-extraction (P1-13 forward-events) and the session brief lane |
| export-needs-for-search.mjs, export-questions-for-answers.mjs, export-themes-for-briefs.mjs | read-only bundles for the session lane; questions skip unchanged pools; themes list no-brief, stale and superseded | integrity_flags, intelligence_items, the material tables | bundle file under `--out-dir`, harness artifact | manual; argv listed in scripts/drain/kinds.mjs | the session lane authors the batch that the matching apply reads |
| consume-turn-requests.mjs | MODE 1 reads open tickets oldest first, partitions by item state (selectable, archived, deferred), applies `--limit`, writes a snapshot, prints the id line for discover-for-items, optionally stamps consumed; MODE 2 stamps exactly a snapshot's ids, archived tickets under `<by>:item-archived` | corpus_turn_requests (all open rows), intelligence_items | corpus_turn_requests, snapshot file | manual CLI | pipes ids to scripts/connections/discover-for-items.mjs by hand; no artifact (rule 17 gap) |
| brief-export/queue.mjs + read-brief-export-queue.mjs | the flywheel writes one brief-export row per mint batch carrying the export parts in inputs_ref; the reader lists rows whose ids no brief-apply row covers yet, or prints one row's content | harness_runs (brief-export, brief-apply families, including inputs_ref) | harness_runs (through the flywheel's artifact) | queue written by run-population-flywheel.mjs:13; reader spawned by scripts/drain/plan-drain.mjs:228 | the drain hands the queue to the session brief lane |
| io-preflight.mjs | refuses an apply within 30 min of the last finished one or 60 min of an unfinished one, or when the database disk reads busy; inserts and finishes the brief_apply_runs row | brief_apply_runs, the project metrics endpoint | brief_apply_runs | imported by apply-record-briefs.mjs | part of brief apply |
| dry-run-structured-actions.mjs | extraction preview over every full_brief, writes an artifact and a best-effort harness row | intelligence_items (all rows, full_brief) | harness artifact structured-actions | none (UNWIRED) | none |
| emit-live-smoke-artifact.mjs + deliver-artifact-branch.sh | turn the live-smoke JSON report into a run artifact (pages, failures by invariant, holds) and land every untracked run artifact into harness_runs | the report file, git status | harness_runs | live-smoke.yml:150, :158 (deployment_status and dispatch) | records the live-smoke family |
| emit-brief-export, emit-downstream-chain, emit-gate-a-rescan, emit-source-resolution, commit-brief-apply-artifact.sh, last-turn-date.mjs | workflow shims and a retired marker | step summary files, env | artifacts, git commits, LAST-TURN.json | none (callers deleted) | none |

### Every LLM and network call site, with its FREE replacement

No file in scope calls a model, Browserless or the Anthropic API directly [CONFIRMED: grep of the 41 files for fetch, anthropic, haiku, sonnet, browserless returns only io-preflight.mjs:154 and three createClient lines]. The reachable sites:

| call site | what is called | metered? | free replacement in the new tree |
|---|---|---|---|
| io-preflight.mjs:154 (from :176 and :183, 30 s apart) | GET `https://<project>/customer/v1/privileged/metrics` with Basic `service_role:<service key>` | no (Supabase endpoint), but network, a credential sent over Basic auth, and a 30 s sleep | drop the disk probe; refuse on cooldown read from the last brief-apply harness_runs row; stop on the in-process byte budget the apply loop already meters (apply-record-briefs.mjs:837-955). [HYPOTHESIS that the probe adds no protection the budget lacks: its thresholds were never calibrated, B1a-part2:L84.] Decision-ready for the operator: keep the probe as an opt-in flag if wanted |
| apply-record-briefs.mjs:629 -> canonical-pipeline.ts:1979 -> :1605-1616 judgeSlotSpan | Haiku through spendStream (HAIKU_MODEL), once per uncovered required slot nomination | yes | the record-briefs criterion-5 mirror (record-briefs/schema.mjs:1021-1051) refuses an entry with an uncovered required slot before apply, so on this path the judge should be unreachable [HYPOTHESIS: proven only by reading, no apply run recorded]; the new tree makes it structural: the injected-ledger ground path never runs slot forcing, an uncovered slot is a refusal |
| apply-record-briefs.mjs:629 -> canonical-pipeline.ts:1764-1765, 1791-1793 fetchText | direct fetch then the Browserless ladder (browserlessFetch), when the item has no stored pool row or the pool read errors | yes (Browserless units) | the injected path requires the stored pool the batch was hashed against; an empty pool or a read error refuses, never fetches |
| canonical-pipeline.ts:1937 callSonnet | Sonnet claim extraction | yes, but skipped: `claims = injected ?? ...` short-circuits when the batch supplies the ledger [CONFIRMED read] | keep only the injected path in the new tree |
| apply-record-briefs.mjs:682 growSources -> source-growth.ts | registers and credits cited sources | no model, no Browserless [CONFIRMED: grep of source-growth.ts for fetch, browserless, spend returns nothing] | unchanged |
| apply-record-briefs.mjs discovery, forward events, entities, lineage (flywheel-steps.mjs, run-discovery.mjs, read-and-extract.mjs, link-items.ts) | rule-based steps | no [CONFIRMED: grep of src/lib/connections, forward-events, entities for spendStream, browserlessFetch returns nothing] | unchanged |
| apply-question-answers.mjs:304-305, apply-record-briefs.mjs:1036-1037, dry-run-structured-actions.mjs:134-138 | raw `createClient` | no (database) | P1-01's service client |
| deliver-artifact-branch.sh:76 | `node scripts/lib/record-harness-run.mjs` (database insert) | no | in-process `recordRun` |
| ledger-verdicts/README.md:9-20 (doc) | documents run-ledger-consume.mjs `--allow-api` metered Haiku classification (P1-13 file) | yes, in P1-13's file | the session-verdict batch this README defines is the free replacement; the new tree drops `--allow-api` (P1-13 to confirm) |

### The ONE turn runtime, and what folds into it

The new tree keeps ONE turn runtime, planned by P1-13 (`src/features/turns/`; if P1-13 names the entry file differently, P1-13's name wins). This register supplies its batch side: a kit and one adapter per kind. Every file in this scope that survives folds into it; nothing here stays a separate runtime.

- The kit owns: the CLI entry and main guard, the credential gate (exit 2 self-skip), real or fixture database, `runExport(kind)` (bundle to a scratch dir, never the repo), `runApply(kind)` (whole-file structural refusal, per-entry refusal as residue, guarded write, read-back, idempotent re-run), `recordRun(family, input)` (artifact plus harness_runs row in process, run id from harness_runs max+1, INV-058), the crash-versus-no-op rule from emit-gate-a-rescan-artifact.mjs:67-105 (a missing summary with a failed step is a defect, never a no-op), the cooldown and byte budget, and the downstream hook each kind declares.
- Kinds and their adapters: record-briefs (export: pool-text exporter; validate: record-briefs validator; apply: the 11 steps plus unscoped flywheel and revalidate), question-answers, needs-search, theme-briefs (apply from this scope, export and validate from P1-13's theme-briefs/*), forward-events (export: corpus exporter; selection: the ticket queue; apply: the event loader; extraction itself is P1-13's run-extraction), ledger-verdicts (export and apply in P1-13's run-ledger-consume; the authoring doc from this scope), host-verdicts (scripts/maintenance, named so the kit covers it).
- Folds in: apply-record-briefs, apply-theme-briefs, apply-question-answers, apply-need-urls, apply-extraction-output, export-corpus-for-extraction, export-needs-for-search, export-questions-for-answers, export-themes-for-briefs, consume-turn-requests, brief-export/queue, read-brief-export-queue, io-preflight, needs-search/*, question-answers/*, record-briefs/schema, the three READMEs and ledger-verdicts/README (as AUTHORING docs per kind).
- Moves out: emit-live-smoke-artifact (to the live-smoke runner, P1-08 harness, landing through `recordRun`).
- Trashed: emit-brief-export, emit-downstream-chain, emit-gate-a-rescan, emit-source-resolution, deliver-artifact-branch.sh, commit-brief-apply-artifact.sh, dry-run-structured-actions, last-turn-date, LAST-TURN.json, brief-export/pending/README.md, ledger-verdicts/schema.json, the two committed batch files, RESEARCH-SWEEP.md.
- scripts/drain/kinds.mjs (outside this scope) is the existing per-kind registry (export argv, batch dir, authoring guide, apply workflow); the kit's kind table replaces it, and its five deleted `applyWorkflow` names become the kit's own `runApply`.

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/features/turns/kit/session-batch.mjs | export-needs 14-118, export-questions 19-166, apply-need-urls 26-36, 186-294, apply-question-answers 27-38, 225-326, apply-theme-briefs 19-29, 120-195, needs-search/artifact 1-22, question-answers/artifact 1-28 | runExport, runApply, CLI parse, credential gate, recordRun, crash-versus-no-op rule | 220 |
| src/features/turns/kit/fixture-db.mjs | needs-search/fixture-deps 1-52, question-answers/fixture-deps 1-49 (plus P1-13 theme-briefs/fixture-deps) | one in-memory database: eq, in, like, limit, guarded writes, rpc hook | 120 |
| src/features/turns/kit/budget.mjs | io-preflight 7-34, 78-133, 215-256; apply-record-briefs 812-955 (budget parts) | cooldown from harness_runs, in-flight guard, byte budget and stop reason | 80 |
| src/features/turns/kinds/record-briefs/validate.mjs | record-briefs/schema 101-1051 minus 319-375 and 454-547 | the eight pre-write mirrors, claim and entry validation, criterion 5 | 420 |
| src/features/turns/kinds/record-briefs/apply.mjs | apply-record-briefs 98-1230 | plan, item grade and pool hash gate, the 11 steps as data, unscoped flywheel, revalidate | 380 |
| src/features/turns/kinds/record-briefs/export.mjs | export-corpus-for-extraction 88-130, 180-292, 392-533 (pool-text mode) | brief-authoring parts with pool, pool hash, slots, events, timelines, char budget, not_exported | 150 |
| src/core/briefs/frontmatter.mjs | record-briefs/schema 441-547; canonical-pipeline.ts 782-800 | one synthetic frontmatter builder | 60 (counted in the src/core port, shared) |
| src/features/turns/kinds/question-answers/{validate,material,apply}.mjs | question-answers/schema 1-222, question-answers/data 9-399, apply-question-answers 39-224, export-questions 45-109 | answers validator, material and bundle, apply | 130 + 250 + 170 |
| src/core/flags/need-targets.mjs | question-answers/data 12-24, 115-142 | need namespaces, open need-target reader, needOfFlag | 60 |
| src/features/turns/kinds/needs-search/{validate,needs,apply}.mjs | needs-search/schema 1-151, needs-search/data 1-165, apply-need-urls 37-185 | need-URL validator, need assembly, apply | 100 + 110 + 180 |
| src/features/turns/kinds/forward-events/{export,apply,tickets}.mjs | export-corpus 1-87, 254-380, 421-541 (default mode); apply-extraction-output 12-191; consume-turn-requests 1-385 | corpus export, event loader on the 307 key, ticket selection and consumption | 110 + 70 + 140 |
| src/features/turns/kinds/theme-briefs/apply.mjs | apply-theme-briefs 31-118 | theme_briefs writer and read-back (probe removed) | 110 |
| src/features/turns/brief-queue.mjs | brief-export/queue 1-181, read-brief-export-queue 1-105 | queue row writer (ids and part paths, not pool text), pending list, one-row resolve | 70 |
| src/features/harness/live-smoke-record.mjs (P1-08) | emit-live-smoke-artifact 17-124 | report to artifact, landed in process | 70 |
| src/features/turns/kinds/*/AUTHORING.md | record-briefs/README, question-answers/README, needs-search/README, ledger-verdicts/README | the authoring rules a session lane reads, history removed | about 250 doc lines |
| TOTAL code | | | about 2,950 (frontmatter's 60 counted with src/core) |

### Data model (columns actually used by runtimes-a; "unused" means no file in this scope reads or writes it)

- item_forward_events: intelligence_item_id, event_date, date_precision, event_kind, obligation_text, source_kind, source_claim_id, source_section_id, source_span, confidence, extractor_version (apply-extraction-output.mjs:78-91); identity is (intelligence_item_id, event_kind, event_date, md5(obligation_text)) per migration 307:86-91.
- corpus_turn_requests: id, intelligence_item_id, reason, requested_at, consumed_at, consumed_by (consume-turn-requests.mjs:315, 271).
- theme_briefs: theme_id, member_hash, member_count, title, brief_md, generated_at, generated_by, sections, claims, member_ids (apply-theme-briefs.mjs:36-49).
- inference_records: written only through `register_inference_record` (migration 339); read inference_id, trigger_question_ref, claim_text, supersedes, computed_at (question-answers/data.mjs:30).
- integrity_flags: id, subject_ref, created_by, description, recommended_actions, status, created_at, resolved_by, resolution_note (question-answers/data.mjs:26; needs-search/data.mjs:10).
- brief_apply_runs: run_id, mode, started_at, finished_at, bytes_read, items_applied, stop_reason (io-preflight.mjs:219, 231, 254). Retires in the new tree (cooldown reads harness_runs); it has 3 rows (C3:L179) and no src reader [CONFIRMED by citation C3:L179]. Decision-ready: drop with a migration once the kit's cooldown ships.
- intelligence_items.recommended_actions: authored in migration 334, file-only, never applied (C3a:L138); no writer in scope. Decision-ready for the operator: apply 334 and turn the structured-actions step into a guarded write of `extractRecommendedActions` output, or retire the step; the UI already reads `recommendedActions` (C3a:L138 names DetailShell.tsx:296 and four more).
- harness_runs.inputs_ref for family brief-export: today carries the full export parts including pool text (brief-export/queue.mjs:127). The new queue row stores item ids and part paths only.
- Unused here: none of the columns above are written by this scope without a reader; intelligence_items.recommended_actions has a reader and no writer (above).

### Interface to other modules

- Exports offered: the kit (`runExport`, `runApply`, `recordRun`, fixture-db, budget) to P1-13's turn runtime and to any session-batch kind; `forwardEventKey` (with P1-09/10) to flywheel-steps; `src/core/briefs/frontmatter` and the record-briefs validator to P1-14 mint and the brief write site; `src/core/flags/need-targets` to P1-09/10 flywheel (raise-term-needs), P1-15 producers and research (research-walker); the brief queue to the drain.
- Imports needed: P1-01 auth-db (service client, guarded writes, readAll, readAllByIds); P1-05 sources-a (`rateSourceByInstitutionClass`, `hostOf`, the class table, `permanentlyUnregisteredClass`, `verdictPlacementForHost`, registerSource); P1-07 capture (pool rows of agent_run_searches, usableCapturesOrdered); P1-08 harness (run ids, envelope, governing files, live-smoke landing); P1-09/10 flywheel (runUnscopedFlywheelSteps, discovery, forward-event extraction, lineage, entities, term recurrence); P1-03/04 intake (record-facts `assertVerbatim`, flywheel-defect); P1-14 mint (groundBrief injected path, generateBriefFromInjected, sectionBrief, growSources, Gate A scanner, timeline parser); P1-15 producers (none directly).
- Consumers by module: P1-13 runtimes-b (the kit and every adapter; run-population-flywheel imports export-corpus and the queue today); P1-09/10 flywheel (need targets, forward-event key); drain (scripts/drain) replaced by the kit's kind table.

### Invariants this code enforces

Already in data-invariants.md: INV-058 (harness run id equals harness_runs max+1), INV-145 (one forward event per natural text identity), INV-156 (FACT span verbatim in the attributed capture), INV-160 (required slots covered by FACT or explicit GAP), INV-171 (record-grade claim set, verbatim spans). Appended by this lane (INV-175 to INV-180, numbered after master's last line INV-174):

- INV-175: a session-authored batch entry is applied only against the held pool it was authored from: record-briefs `source_pool_hash` and question-answers `pool_hash` must equal the live pool identity, otherwise the entry is refused and re-authored (record-briefs README, apply-record-briefs plan; question-answers/schema.mjs:89-92).
- INV-176: an answer written from holdings is an inference record, never a fact; CONFIRMED only when every sentence is a quotation of an evidence span verbatim in the cited item's held pool, else HYPOTHESIS; cited items are verified, not archived, not Community-only, within the export's reach, and `cited_item_ids` equals the evidence item set (question-answers/schema.mjs:46-189).
- INV-177: a session batch names a source, never a tier; the tier comes from the host class table by host alone or a host verdict for that exact host, an aggregator host is never registered, and an entry carrying a tier is refused (needs-search/schema.mjs:54-119; CLAUDE.md rule 18).
- INV-178: a batch with a structural defect is refused whole; a defective entry is refused alone with its reasons recorded as residue and never blocks the valid entries; every write is read back and a second apply of the same batch writes nothing new (apply-need-urls, apply-question-answers, apply-theme-briefs, apply-extraction-output partitionNew).
- INV-179: a record-briefs entry is refused before any write when the body carries a figure or date token no FACT claim covers, a canonical section states an unlabelled requirement, its own format's timeline section yields no dated row, a claim's declared section does not contain its span, a claim_text figure is absent from its own span, or a required slot lacks a covering FACT (or a GAP where the slot's description allows one) (record-briefs/schema.mjs:556-1051).
- INV-180: a corpus-turn ticket is consumed only by the run that selected it or under `<by>:item-archived` when its item is archived; a ticket whose item is not verified stays open; marking retires exactly the ids a prior snapshot named (consume-turn-requests.mjs:106-131, 253-310).

### Rulings the code embodies (cite)

- Operator 2026-09-04 "stop offering API when you have a free option with Haiku" (ledger-verdicts/README.md:3-7): session-authored batches, no metered call in a turn.
- CLAUDE.md rule 18 (source found and rated, never the figure refused): needs-search rates by host and registers below-floor sources (needs-search/README.md:73-89).
- CLAUDE.md rule 14 (status tokens): question answers derive CONFIRMED from the text, never self-labelled (question-answers/README.md:88-97).
- CLAUDE.md rule 17 (nothing runs alone): apply-record-briefs chains the flywheel in process (section 8 table); three appliers do not (gaps below).
- Operator 2026-09-12 "Items need to be resolved not quarantined" and ADR-030: the eight mirrors refuse before grounding (record-briefs/README.md:136-141), and `--ids` reaches quarantined items (export-corpus-for-extraction.mjs:254-262).
- Operator 2026-09-12 "No item should be without some date in the timeline": the per-format timeline mirror (record-briefs/README.md:199-231).
- Operator 2026-09-26 "not once that I need a pull request from GitHub" (deliver-artifact-branch.sh:16-18): artifacts land as database rows, never branches.
- ADR-044 (answers are inference records), ADR-041 (Community-only items are not citable), ADR-031 (loop run id), migration 307 (forward-event identity), migration 339 (derivation edges to items not admitted, so pool-hash drift is the invalidation signal; question-answers/README.md:142-155).
- D32 (IO budget and cooldown), D30 (numeric-figure mirror), D31 (per-format timeline), D18 (qualification stems), lane L25 (criterion-5 mirror) as named in record-briefs/README.md.

### Proof that the module works in the new tree

1. Fixture runs of every kind through the kit with no database: export, author a fixture batch, apply dry, apply with `--execute` against fixture-db, re-apply and assert nothing new is written (INV-178).
2. Adversarial checks wired into ci.yml (CLAUDE.md rule 15): a record-briefs entry with an uncovered figure, an unlabelled modal, an empty timeline, a mis-declared claim section and a span-absent figure is refused (INV-179); a question answer marked CONFIRMED with one paraphrased sentence is refused (INV-176); a need entry carrying `tier` or citing an aggregator host is refused (INV-177); a stale pool hash is refused (INV-175).
3. A guard that the record-briefs apply path makes zero model and zero Browserless calls: run apply against fixture-db with spendStream and browserlessFetch replaced by throwing stubs.
4. A forward-event key test shared by the loader and flywheel-steps asserting the 307 shape.
5. Live: one brief-apply of a small batch in apply mode, with the harness row read back and `provenance_status` read back per item.

### Port order

1. src/core/briefs/frontmatter and the forward-event key (shared with P1-14 and P1-09/10).
2. The kit (session-batch, fixture-db, budget, recordRun) and the brief queue.
3. Validators (record-briefs, question-answers, needs-search), pure, ported with their adversarial tests.
4. Adapters: needs-search, question-answers, theme-briefs apply, forward-events (export, tickets, loader).
5. record-briefs export and apply, after P1-14's groundBrief injected path and generateBriefFromInjected land.
6. live-smoke landing in process (P1-08), then remove deliver-artifact-branch.sh and the emit-live-smoke call from live-smoke.yml in the same change.
7. Delete the TRASH files in the old tree only after their callers are gone (run-population-flywheel's writeLastTurnDate call goes with P1-13).

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Session-authored full briefs applied to record-grade stubs, no model call | apply-record-briefs, record-briefs/schema | kinds/record-briefs |
| Quarantined items reachable by an explicit ticket for re-grounding | export-corpus-for-extraction.mjs:254-292 | kinds/record-briefs/export |
| Overwrite of an existing brief only by explicit flag, with replace-ledger archiving to claim_versions | apply-record-briefs.mjs:629 | kinds/record-briefs/apply |
| Stale-pool refusal by pool hash | apply-record-briefs, export-corpus:243 | kit + record-briefs |
| Eight pre-write mirrors (Gate A, criterion 4, per-format timeline, claim section, depth accounting, qualification accounting, numeric figure, criterion 5) | record-briefs/schema | kinds/record-briefs/validate |
| Flat-YAML representability refusals (comma, newline, quote pair) | record-briefs/schema 454-496 | core/briefs/frontmatter |
| mentioned_terms carried into vocabulary_mentions | apply-record-briefs (terms step), schema 530-531 | kinds/record-briefs/apply |
| Changelog row when an applied item verifies | apply-record-briefs.mjs:562-580 | kinds/record-briefs/apply (guarded) |
| Cited-source growth from a lane brief | apply-record-briefs:682 | kinds/record-briefs/apply |
| Lineage, discovery, forward events, compliance deadline, entities per applied item | apply-record-briefs 549-807 | kinds/record-briefs/apply |
| Unscoped flywheel pass and public cache revalidation after apply | apply-record-briefs 1158-1170 | kinds/record-briefs/apply |
| IO budget stop and cooldown between applies | apply-record-briefs 837-955, io-preflight | kit/budget |
| Structured-action extraction preview | apply-record-briefs 711-727, dry-run-structured-actions | decision-ready (data model, migration 334) |
| Answers from holdings as labelled inferences, re-answer on pool change, supersedes chain | apply-question-answers, question-answers/* | kinds/question-answers |
| Unanswerable questions become holdings-need search targets | question-answers/data 82-113, apply-question-answers 164-185 | kinds/question-answers + core/flags/need-targets |
| Question bundles within a char budget with honest truncation counts | question-answers/data 278-399 | kinds/question-answers/material |
| Source needs of four kinds found by a session lane and turned into census rows or portal candidates | apply-need-urls, needs-search/* | kinds/needs-search |
| Need re-raised under a new flag id is not searched twice (applied-key marker) | needs-search/data 37-49, 147-159 | kinds/needs-search |
| Theme brief write with snapshot on update and member-hash read-back | apply-theme-briefs | kinds/theme-briefs/apply |
| Forward-event corpus export excluding items already extracted | export-corpus default mode | kinds/forward-events/export |
| Forward-event load idempotent on the 307 identity | apply-extraction-output | kinds/forward-events/apply |
| Corpus-turn ticket selection by item state, archived tickets closed under their own label | consume-turn-requests | kinds/forward-events/tickets |
| Brief-export auto-queue from mint and its pending list | brief-export/queue, read-brief-export-queue | turns/brief-queue |
| Run record for every firing, including zero-work and crashed runs | emit-*, artifact.mjs files | kit recordRun |
| Live-smoke report recorded per invariant with holds | emit-live-smoke-artifact | harness/live-smoke-record (P1-08) |
| Artifact landing into harness_runs with failure on a missed landing | deliver-artifact-branch.sh | kit recordRun (in process) |
| Ledger-verdict authoring guide (export with text, prompt version, stale re-authoring, access walls) | ledger-verdicts/README | kinds/ledger-verdicts/AUTHORING.md |
| Research-sweep record profile and screen contract (P1-13's runtime) | RESEARCH-SWEEP.md | P1-13 register |
| Corpus-turn since-date marker | last-turn-date, LAST-TURN.json | retired; tickets are the selector |

### Gaps for the coordinator (decision-ready)

- Rule 17 gaps: apply-theme-briefs, apply-question-answers, apply-need-urls and apply-extraction-output end without triggering a downstream or revalidating; consume-turn-requests and apply-extraction-output write no artifact of their own. The kit's per-kind downstream hook closes all six; each kind's hook is named in the adapters table.
- brief_apply_runs retirement and migration 334 (data model above).
- read-brief-export-queue reads every brief-export row's inputs_ref, which holds full pool text (read-brief-export-queue.mjs:77, queue.mjs:127) [CONFIRMED read]; the new queue stores ids and paths.
- The flywheel-steps forward-event key disagrees with migration 307 (section 5); P1-09/10 to take the shared key.
- scripts/drain/kinds.mjs names five deleted workflows as apply paths; the drain's apply leg cannot run as written.

### Defects the new code must not repeat (from the backlog rows in scope; the STATUS cells are written in BACKLOG-2026-10-11.md)

A raw changelog insert beside guarded writes (B-0327, still at apply-record-briefs.mjs:573) and a raw run-ledger insert (B-0328, io-preflight.mjs:231); a writer with no reader (B-0578); a validator whose duplicate guard was a test that no longer exists (B-0579, B-2193); an unwired preview that claims it writes nothing (B-0703, B-1077); appliers that never ran live (B-0890 to B-0897); a write loop with no catch so a throw leaves no run record (B-0893); comments that state a step count the code does not run (B-1073: apply-record-briefs.mjs:520 says 8, APPLY_STEP_ORDER lists 11); READMEs that describe deleted workflows and retired paths (B-1074, B-1080, B-1081, B-1082, B-1617); a lander named for a branch it no longer makes, passing with zero rows landed (B-1075, B-1076, B-2134); a second landing path (B-1616); a duplicate contract no code reads (B-2192).
