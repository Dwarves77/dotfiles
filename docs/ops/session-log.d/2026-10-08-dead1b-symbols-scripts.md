# 2026-10-08 DEAD-1b (dead1b-symbols-scripts): dead exported symbols under scripts/ and .discipline/

Lane DEAD-1b, branch `lane/dead1b-symbols-scripts`, cut from origin/master `12c69634`. Scope: census `dead-code-census-2026-10-08`
sections 2a (A1 dead-strict) and 2b (A2 export-only-local), restricted to `fsi-app/scripts/**` and `fsi-app/.discipline/**`,
excluding `scripts/proof/**`, `scripts/producers/**`, `scripts/migrations/**` and `.discipline/rendering/**` (other lanes). `src/**` is DEAD-1c.
In scope: 23 A1 symbols in 20 files and 112 A2 symbols in 64 files (census totals: 82 and 491).

## Method [CONFIRMED]

- The census row list was re-read from the census file and re-verified uncapped on the `origin/master` tree: every tracked text file
  (4,685 files, including `.github`, docs, runbooks, `package.json`, JSON registries, `chain-steps.json`, `loop-hops.d`, `attacks.json`)
  was tokenised once and every census symbol looked up; every hit other than the defining file and its own sibling test was read.
- A hit counts as LIVE when it is code, config, a workflow step, a string a loader consumes, or a living runbook that names the symbol as
  something to maintain. Hits in point-in-time records (docs/audits, docs/ops, docs/archive, docs/dispatches, harness-run json, session logs)
  and comments naming a symbol that still exists were not treated as use, and the export removal leaves them true.
- Master moved after the census (ee0dd483 to 12c69634): six files and three symbols named by the census no longer exist; they are recorded as ALREADY GONE.
- A1 symbols: deleted with their now-unused helpers/header lines. A2 symbols: only the `export` keyword removed (one mechanical pass, then
  `git diff -U0` checked that every changed line is an `export X` to `X` pair or one of the explicit A1 deletions).
- Governing files of 13 harness families were touched (brief-apply, carrier-ets-proxy, fetch-drain, judgement-drain, needs-search, propagation,
  quarantine-disposition, question-answers, research-walker, screen, state-cost, structured-actions, theme-briefs). Per CONVENTION.md
  (GATE-3) no marker is added; each family's live governing hash moves and F28 reports a run owed; fitness F28 stayed green.

## Totals

| Section | In scope | Deleted | Export removed | Already gone | Refuted or kept |
|---|---|---|---|---|---|
| 2a A1 | 23 symbols | 17 | 0 | 3 | 3 |
| 2b A2 | 112 symbols | 0 | 99 | 11 | 2 |

Diff: 69 files changed, 99 insertions, 217 deletions. No test file edited or deleted, no file deleted, no allowlist or registry entry touched
(no file became empty).

### Census 2a A1

| Row | File | Symbol | Decision | Note / hit |
|---|---|---|---|---|
| 1 | .discipline/fitness/functions/F51-no-shared-append.mjs | HOTSPOT_WINDOW_ANCHOR_DECIDED_ON | ALREADY GONE | symbol absent from the file on master 12c69634 (census predates it) |
| 2 | .discipline/fitness/functions/F51-no-shared-append.mjs | HOTSPOT_WINDOW_ANCHOR_REASON | ALREADY GONE | symbol absent from the file on master 12c69634 (census predates it) |
| 3 | .discipline/fitness/functions/F64-rls-admin-gate-class.mjs | _clearCorpusCache | DELETED | symbol removed (definition only; no importer, no code hit) |
| 4 | .discipline/fitness/functions/F9-build-compiles.mjs | _runTypecheck | DELETED | symbol removed (definition only; no importer, no code hit) |
| 5 | .discipline/fitness/lib/glob.mjs | _expandPattern | DELETED | symbol removed (definition only; no importer, no code hit) |
| 6 | .discipline/fitness/lib/glob.mjs | _matchesTail | DELETED | symbol removed (definition only; no importer, no code hit) |
| 7 | .discipline/governance/doctrine-register.mjs | DOCTRINE_IDS | DELETED | symbol removed (definition only; no importer, no code hit) |
| 8 | .discipline/governance/execution-wiring.mjs | _resetCacheForTest | DELETED | symbol removed (definition only; no importer, no code hit) |
| 9 | .discipline/governance/skill-contract-map.mjs | isSkillContractClean | DELETED | symbol removed (definition only; no importer, no code hit) |
| 10 | .discipline/governance/skill-map.mjs | skillsForClass | DELETED | symbol removed (definition only; no importer, no code hit) |
| 11 | .discipline/lib/no-npm-sandbox.mjs | initialize | REFUTED, skipped | declared inside the HOOK_SOURCE template string (line 129) that register() loads as the ESM loader module; Node calls initialize(data) by convention. Hit: no-npm-sandbox.mjs:160 register(data:text/javascript,HOOK_SOURCE ...) |
| 12 | .discipline/rules/012-hardcoded-user-path.mjs | _CODE_EXTENSIONS | DELETED | symbol removed (definition only; no importer, no code hit) |
| 13 | .discipline/rules/012-hardcoded-user-path.mjs | _SKIP_PATH_FRAGMENTS | DELETED | symbol removed (definition only; no importer, no code hit) |
| 14 | .discipline/rules/020-fork-log-frozen.mjs | _FORK_PATH | ALREADY GONE | file deleted from master since the census |
| 15 | .discipline/rules/022-no-dash-glyphs.mjs | isDesignHandoffBundleFileExempt | DELETED | symbol removed (definition only; no importer, no code hit) |
| 16 | scripts/_ruling/null-tier-host-ruling.mjs | BY_HOST | DELETED | symbol removed (definition only; no importer, no code hit) |
| 17 | scripts/classification/propose-classifications.mjs | ANOMALY_THRESHOLD | DELETED | symbol removed (definition only; no importer, no code hit) |
| 18 | scripts/connections/analyze-corpus.mjs | IN_CHUNK | REFUTED, skipped | named by living code comments: scripts/turns/consume-turn-requests.mjs:354 and :429, scripts/connections/propose-tags.mjs:470 ("see analyze-corpus.mjs IN_CHUNK"). Deleting it leaves dangling pointers in files outside the write set; see open items |
| 19 | scripts/lib/batch-primitives.mjs | createProgressReporter | DELETED | symbol removed (definition only; no importer, no code hit) |
| 20 | scripts/lib/funded-pass-lock.mjs | HEARTBEAT_MIN_MS | DELETED | symbol removed (definition only; no importer, no code hit) |
| 21 | scripts/mint/validate-mint-payload.mjs | VALIDATE_MINT_PAYLOAD_KIT_VERSION | REFUTED, skipped | named as a version stamp to bump by living runbooks: scripts/mint/MINT-RUNBOOK.md:816, docs/runbooks/maintenance.d/08-provenance-heal.md:337; governing file of the mint family |
| 22 | scripts/turns/needs-search/schema.mjs | NEED_KINDS | DELETED | symbol removed (definition only; no importer, no code hit) |
| 23 | scripts/verify/lib/information-schema-scan.mjs | fetchSchemaSnapshot | DELETED | symbol removed (definition only; no importer, no code hit) |

### Census 2b A2

| Row | File | Symbol | Decision | Note / hit |
|---|---|---|---|---|
| 1 | .discipline/consistency/lib/inventory-parser.mjs | stripMarkdownLink | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 2 | .discipline/consistency/lib/inventory-parser.mjs | stripBackticks | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 3 | .discipline/consistency/override-check.mjs | messageForCommit | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 4 | .discipline/dispatch/audit.mjs | findCommitsByUuid | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 5 | .discipline/dispatch/audit.mjs | findRecentDispatches | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 6 | .discipline/fitness/functions/F15-spend-chokepoint.mjs | DIRECT_API_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 7 | .discipline/fitness/functions/F16-transport-hold-gate.mjs | GATE_CALL_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 8 | .discipline/fitness/functions/F16-transport-hold-gate.mjs | RAW_BROWSERLESS_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 9 | .discipline/fitness/functions/F16-transport-hold-gate.mjs | rawBrowserlessLines | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 10 | .discipline/fitness/functions/F17-size-cap-doctrine.mjs | CAP_DECL_RE | ALREADY GONE | file deleted from master since the census |
| 11 | .discipline/fitness/functions/F19-no-service-anon-downgrade.mjs | DOWNGRADE_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 12 | .discipline/fitness/functions/F20-pause-flag-one-writer.mjs | WRITE_RES | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 13 | .discipline/fitness/functions/F20-pause-flag-one-writer.mjs | findPauseFlagWrite | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 14 | .discipline/fitness/functions/F21-single-grounding-entry.mjs | WORKFLOW_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 15 | .discipline/fitness/functions/F21-single-grounding-entry.mjs | GROUNDING_CALL_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 16 | .discipline/fitness/functions/F26-storage-ceiling-parity.mjs | NEXT_RE | ALREADY GONE | file deleted from master since the census |
| 17 | .discipline/fitness/functions/F26-storage-ceiling-parity.mjs | WORKER_RE | ALREADY GONE | file deleted from master since the census |
| 18 | .discipline/fitness/functions/F40-authed-api-fetch.mjs | GUARD_CALL_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 19 | .discipline/fitness/functions/F43-default-open-disclosure.mjs | nameWords | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 20 | .discipline/fitness/functions/F46-external-host-home.mjs | NOT_EXTERNAL_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 21 | .discipline/fitness/functions/F47-db-object-reference.mjs | MIGRATION_GLOBS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 22 | .discipline/fitness/functions/F47-db-object-reference.mjs | CODE_GLOBS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 23 | .discipline/fitness/functions/F47-db-object-reference.mjs | inCodeScope | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 24 | .discipline/fitness/functions/F51-no-shared-append.mjs | ENTRY_DIRS | ALREADY GONE | symbol absent from the file on master |
| 25 | .discipline/fitness/functions/F51-no-shared-append.mjs | COORDINATOR_ONLY_EXACT | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 26 | .discipline/fitness/functions/F69-model-id-literal.mjs | MODEL_ID_LITERAL_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 27 | .discipline/fitness/functions/F69-model-id-literal.mjs | modelIdLiteralLines | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 28 | .discipline/governance/closure-gate.mjs | RUNBOOK_INDEX_PATH | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 29 | .discipline/governance/closure-gate.mjs | RUNBOOK_STEP_DIR | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 30 | .discipline/governance/db-object-reference.mjs | codeWithoutComments | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 31 | .discipline/governance/db-object-reference.mjs | READ_HELPER_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 32 | .discipline/governance/doctrine-contradiction.mjs | SELF_GATE_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 33 | .discipline/governance/doctrine-contradiction.mjs | NEGATION_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 34 | .discipline/governance/doctrine-contradiction.mjs | CITATION_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 35 | .discipline/governance/memory-gate.mjs | gitMemoryDiffLines | ALREADY GONE | symbol absent; memory-gate.test.mjs:170 asserts it is undefined |
| 36 | .discipline/governance/skill-contract-map.mjs | ACCOUNT_LEVEL_SKILLS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 37 | .discipline/lib/no-npm-sandbox.mjs | CHECKOUT_ROOTS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 38 | .discipline/lib/no-npm-sandbox.mjs | BLOCKED_INSTALL_REALPATHS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 39 | .discipline/lib/predicates.mjs | isInvestigationOnly | ALREADY GONE | file deleted from master since the census |
| 40 | .discipline/lib/predicates.mjs | isHotfix | ALREADY GONE | file deleted from master since the census |
| 41 | .discipline/lib/predicates.mjs | isResearchOnly | ALREADY GONE | file deleted from master since the census |
| 42 | .discipline/lib/predicates.mjs | isConversationOnly | ALREADY GONE | file deleted from master since the census |
| 43 | scripts/connections/ratify-flag-to-census.mjs | RATIFY_CITE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 44 | scripts/drain/plan-drain.mjs | LEASE_LANE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 45 | scripts/entities/backfill-derivation-edges.mjs | loadLiveEmissionFactors | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 46 | scripts/entities/backfill-derivation-edges.mjs | loadCandidateSeriesKeys | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 47 | scripts/gen/fetch-desnz-factors.mjs | AIR_ENERGY_CARRIER | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 48 | scripts/gen/fetch-desnz-factors.mjs | OCEAN_ENERGY_CARRIER | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 49 | scripts/gen/fetch-desnz-factors.mjs | cellNumber | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 50 | scripts/lib/absent-tolerant.mjs | ABSENT_RE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 51 | scripts/lib/assemble-train.mjs | BRANCH_PREFIXES | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 52 | scripts/lib/assemble-train.mjs | runGateSet | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 53 | scripts/lib/batch-primitives.mjs | createPgPool | REFUTED, kept exported | not called anywhere (census put it in A2 because its name is in comments and an error string); it is the documented pool primitive in the remediation-discipline skill (Section 5, Example 1). Removing the export left an unused-var lint warning, so the export was restored; deleting it needs a skill edit |
| 54 | scripts/lib/changelog.mjs | DETECTED_BY_BY_FIELD | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 55 | scripts/lib/deferral.mjs | DISPOSITION_PATH_KEYWORDS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 56 | scripts/lib/deferral.mjs | normalizeReason | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 57 | scripts/lib/exclusion-audit.mjs | unreliableIds | ALREADY GONE | file deleted from master since the census |
| 58 | scripts/lib/export-harness-ledger.mjs | DEFAULT_OUT_PATH | REFUTED, skipped | export-harness-ledger.test.mjs:6 imports it (importer appeared after the census) |
| 59 | scripts/lib/fetch-negative-probe.mjs | auditFetchNegative | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 60 | scripts/lib/flag-age.mjs | STANDING_DEBT | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 61 | scripts/lib/funded-pass-lock.mjs | LOCK_KEY | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 62 | scripts/lib/funded-pass-lock.mjs | STALE_SECONDS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 63 | scripts/lib/r14-held-producer-cli.mjs | buildDefectsFromRefusals | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 64 | scripts/lib/surface-registry.mjs | FETCH_AUDIT_METHOD | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 65 | scripts/maintenance/capture-static-primaries.mjs | STATIC_TEXT_HOSTS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 66 | scripts/maintenance/close-run-logs.mjs | AUTHORSHIP_RUN_SUMMARY_WORDS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 67 | scripts/maintenance/close-run-logs.mjs | CITATION_HARVEST_RUN_SUMMARY_WORDS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 68 | scripts/maintenance/forward-events-retext.mjs | DELETE_CITE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 69 | scripts/maintenance/forward-events-retext.mjs | IDS_ARG_PREFIX | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 70 | scripts/maintenance/host-verdicts/load-host-verdicts.mjs | HOST_VERDICT_SOURCE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 71 | scripts/maintenance/lineage-gap-targets.mjs | writeArtifactFile | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 72 | scripts/maintenance/record-hollow-sweep.mjs | TITLE_FACT_PREFIX | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 73 | scripts/maintenance/resolve-error-body-gate.mjs | DEFAULT_WORKLIST_RELATIVE_PATH | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 74 | scripts/maintenance/timeline-backfill.mjs | CHANGELOG_CITE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 75 | scripts/mint/heal-provenance.mjs | buildCaptureIndex | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 76 | scripts/mint/heal-provenance.mjs | getCaptureIndex | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 77 | scripts/mint/heal-provenance.mjs | containsCaseInsensitiveCached | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 78 | scripts/mint/heal-provenance.mjs | locateSpanInTextIndexed | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 79 | scripts/mint/heal-provenance.mjs | locateSpanInTextCached | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 80 | scripts/mint/screen-worklist.mjs | loadRows | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 81 | scripts/research/research-walker.mjs | WALKER_NAME | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 82 | scripts/research/research-walker.mjs | HOLDINGS_NEED_PER_PAGE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 83 | scripts/spec09/indexation-producer.mjs | WORKED_EXAMPLE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 84 | scripts/turns/apply-record-briefs.mjs | TERMS_CITE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 85 | scripts/turns/apply-record-briefs.mjs | buildTermWriters | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 86 | scripts/turns/dry-run-structured-actions.mjs | runDryRun | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 87 | scripts/turns/import-stranded-harness-branches.mjs | listStrandedBranches | ALREADY GONE | file deleted from master since the census |
| 88 | scripts/turns/io-preflight.mjs | SAMPLE_GAP_MS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 89 | scripts/turns/needs-search/data.mjs | FLAG_COLUMNS_FULL | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 90 | scripts/turns/needs-search/data.mjs | satisfiesFor | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 91 | scripts/turns/question-answers/schema.mjs | ANSWER_STATUS_TOKENS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 92 | scripts/turns/question-answers/schema.mjs | validateAnswerEntry | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 93 | scripts/turns/run-fetch-drain.mjs | FETCH_DRAIN_GOVERNING_FILES | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 94 | scripts/turns/run-fetch-drain.mjs | repoRelative | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 95 | scripts/turns/run-propagation-drain.mjs | MAX_REPLAY_RANGE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 96 | scripts/turns/theme-briefs/artifact.mjs | DEFAULT_FAMILY_DIR | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 97 | scripts/turns/theme-briefs/artifact.mjs | buildThemeBriefsArtifact | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 98 | scripts/verify/defect-signature-scan.mjs | WAVE2_CUTOFF | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 99 | scripts/verify/lib/duplicate-table-scan.mjs | STRUCTURAL_COLUMNS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 100 | scripts/verify/lib/duplicate-table-scan.mjs | MIN_SIGNIFICANT_SHARED | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 101 | scripts/verify/lib/duplicate-table-scan.mjs | SCORE_WEIGHTS | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 102 | scripts/verify/lib/rls-adversarial-probe.mjs | DENY_SQLSTATE | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 103 | scripts/verify/lib/rls-adversarial-probe.mjs | classifyProbe | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 104 | scripts/verify/population-report.mjs | DEFAULT_LEDGER_VERDICTS_DIR | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 105 | scripts/verify/population-report.mjs | DEFAULT_BRIEF_APPLY_HARNESS_RUNS_DIR | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 106 | scripts/verify/population-report.mjs | countBriefsOwed | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 107 | scripts/verify/population-report.mjs | FLAG_FAMILY_PREDICATES | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 108 | scripts/verify/population-report.mjs | countOpenFlagsByFamily | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 109 | scripts/verify/population-report.mjs | countFetchDrainQueued | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 110 | scripts/verify/population-report.mjs | describeFetchDrainQueueState | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 111 | scripts/verify/population-report.mjs | countLegalConfirmationRows | EXPORT REMOVED | `export` keyword dropped; used inside its file |
| 112 | scripts/verify/population-report.mjs | countCoverageReflections | EXPORT REMOVED | `export` keyword dropped; used inside its file |

## Verification

| Gate | Before (clean master tree 12c69634) | After |
|---|---|---|
| `run-test-suite.sh` (no-npm suite) | 10446 tests, 10397 pass, 0 fail, 1 cancelled, 48 skipped | 10446 tests, 10397 pass, 0 fail, 1 cancelled, 48 skipped |
| per-test name list (pass/fail lines, timings stripped) | | identical to before (diff empty); 0 tests deleted |
| `run-npmtest-suites.sh` | not re-run on master; no npmtest edited | 1944 tests, 1944 pass, 0 fail |
| fitness runner | | 52 functions, 0 violations |
| invariant-coverage meta-gate | | PASS (153 invariants, 63 doctrines) |
| eslint on the changed files | | 0 errors; the one warning (`createPgPool` unused after un-export) is why that export was restored |
| tsc | | not run: no `.ts` or `.tsx` file touched |

- The one cancelled test in both runs is `C3-migrations-reality.test.mjs` "RACE: C3 and F64 live tests run concurrently ten times", which hits its own
  300 s timeout when the machine is loaded; run alone it passes in 263 s on master and about 270 s on this branch. It is timing, not this change.
- An earlier baseline run in the main checkout (10607 tests, 1 fail) is not comparable: that checkout carries untracked files. The clean baseline
  above was run in this worktree with the change stashed, then restored.
- Red-then-green: this lane adds no behaviour, so there is no new test. The equivalent proof is the identical per-test result list before and after
  and the uncapped zero-importer evidence in the tables.

## Read and reused

CLAUDE.md, `docs/dispatches/lane-common-contract.md`, the census sections 2a and 2b, `docs/ops/session-log.d/2026-10-08-dead1-whole-file.md` (DEAD-1
method and report shape), `scripts/harness-runs/CONVENTION.md` (GATE-3 marker retirement), `.discipline/lib/no-npm-sandbox.mjs` (read in full around
the loader hook), and every definition and use site of each symbol before editing. Reused the repo's own suite, fitness runner and meta-gate; no new tooling.

## NOT done

- Census sections 2a/2b rows under `src/**` (DEAD-1c), `scripts/proof/**`, `scripts/producers/**`, `scripts/migrations/**`, `.discipline/rendering/**` (other lanes).
- Census 2c test-only, 2d and 2e are not part of this lane.
- `IN_CHUNK`, `VALIDATE_MINT_PAYLOAD_KIT_VERSION`, `createPgPool` and `DEFAULT_OUT_PATH` stay (see tables).

## Open items

- `IN_CHUNK` (analyze-corpus.mjs) is dead as code but cited by comments at `scripts/turns/consume-turn-requests.mjs:354` and `:429` and
  `scripts/connections/propose-tags.mjs:470`; deleting it cleanly needs those three comments edited (NEEDS WRITE-SET EXPANSION: those two files).
- `createPgPool` (scripts/lib/batch-primitives.mjs) has no caller anywhere; the remediation-discipline skill documents it as a library primitive,
  so deleting it is a skill edit plus a skill-ack, which this lane does not own.
- `VALIDATE_MINT_PAYLOAD_KIT_VERSION` has no code reader; MINT-RUNBOOK.md and the provenance-heal runbook tell a maintainer to bump it. Either the
  runbooks drop the instruction or a reader is wired; a coordinator ruling.
