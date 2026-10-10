# 2026-10-09 lane RULES-X-2 (rulesx2-register-residue): register residue X11, X13, pair 7, pair 4 and the 71 open RULES-X-1 rows

## Accomplished (confirmed)

- X11 (rule 022 on a rename the renamer does not pair). `fsi-app/.discipline/lib/context.mjs`: the removal pool is range wide. New `pairAcrossDiff` pairs an added line that no hunk paired and no identical removal explains with the removed line it most resembles anywhere in the same diff (token similarity at or above EDIT_SIMILARITY, best score first, one removal per added line). A 7-line file arriving as delete plus add with its glyph line edited now passes; a removal that carried no glyph still charges; one removed glyph line excuses one edited line, not two; a new glyph line still fails. Red first: with the old module `context.test.mjs` runs 36 tests and 4 of the 5 new ones fail (32 pass, 4 fail); all 36 pass after.
- X13 (F25 expiry oracle on the closure ledger clock). `fitness/functions/F25-module-liveness.mjs`: `auditLiveness` takes `now` (a Date from closure-gate `ledgerClock(readHarnessLedgerExport(root))`), not the frozen waveN counter. An entry carries `reviewBy` (ISO date) and is red once the clock reaches it, or `permanent: true`; no date and no flag is red. 12 entries got `reviewBy: '2026-12-31'`; the 4 test doubles and fixtures (types.contractable-barrier.check.ts, null-tier-host-ruling.mjs, is-main-fixture.mjs, fake-supabase.mjs) are `permanent: true`. `latestTrainWave` stays exported because F38, RD-63 and the rendering exemption lists import it (section 5, not this lane's). Red first: with the old module the F25 test file passes 63 and fails 5; after, 68 of 68 pass. Attack tests: an entry past its reviewBy is red on the ledger clock, an undated entry is red, an old numeric `expiry` is red.
- Pair 7 (skill gate). `governance/pretooluse-skill-gate.mjs`: `isolationAsk(cmd, ctx)` allows `git worktree add ...` and `git merge origin/master` (plain flags only) when the payload cwd, or the `-C` directory, is an existing directory inside a linked worktree under `.claude/worktrees/` or `.worktrees/` (its nearest `.git` is a file). Still asked: the main checkout, `-C` into it, `--git-dir` or `--work-tree`, a `cd` or `pushd` in the same command, a second branch-moving invocation, any other merge target, any raw command containing a backslash, a `-C` target that does not exist. Red first: the allowed-forms test fails on the old gate; after, 152 of 153 pass, the 1 failure is the pre-existing 300 ms timing test (it fails on the unmodified gate too, 340 to 420 ms cold).
- Pair 4: closed by PR 1056 (DORMANT-1): `NEVER_RUN_DORMANT` is empty (zero keys on this tree), so the stale-entry-versus-exemption two-edit sequence has no entry to apply to.
- The 71 open RULES-X-1 rows, each mapped below.

## Read and reused

COMMON.md and batch2.md (RULES-X-2); rulesx1 sections 3, 4 and the section 5 table (counts only); `lib/context.mjs` (`buildIntroduced`, `pairHunk`, `similarity`, `tokenBag`, `EDIT_SIMILARITY`, `SIMILARITY_CELL_LIMIT` reused as is); rule 022 header; `closure-gate.mjs` `ledgerClock` and `run-artifact.mjs` `readHarnessLedgerExport` (reused, no second clock); the skill gate's `gitInvocations` and `argvOnly`; ADR-046 and its GATE-7 and GATE-8 addenda; the GATE-7 attack-disposition table; `memory-gate.mjs`, `C4-worktrees-reality.mjs`, `F51-no-shared-append.mjs`, `coverage-scan.mjs`, `design-audit.yml`, the S8-E0 registry files; branch protection read with `gh api` (read only).

## Row dispositions (file:line -> token)

Rows in docs/audits/aud-at3-gates-attacked-2026-10-08.md
- 521 -> [NOT-WORK: ADR-046 2026-10-08 addendum: editing the engine in the same commit is an intent form, out of scope]
- 522 -> [NOT-WORK: ADR-046 addendum: --no-verify, core.hooksPath, env and plumbing are intent forms; A-H2-11, -13, -14 are flagged by the post-commit run since PR 1040]
- 523 -> [NOT-WORK: ADR-046 addendum: deleting refs/remotes/origin/master is an intent form]
- 524 -> [NOT-WORK: ADR-046 addendum: --no-verify, core.hooksPath and a replaced installed hook are intent forms; the rename classing part closed by PR 1040]
- 526 -> [CLOSED: PR 1042] (memory-gate.test.mjs "VC-4: a one-byte file, a bare heading ... are NOT evidence"; PR 1039 "memory B7-11" widened CODE to workflows, functions and the build config)
- 527 -> [CLOSED: PR 1040] (A-P1-2 refused; A-P1-1 an untracked ordinary file is scratch until added, GATE-7 ruling)
- 528 -> [WORK: owed]
- 529 -> [CLOSED: PR 1040] (check-pretooluse-wired REQUIRED list carries the seven tools; A-P3c-2 is a forged wrapper, intent)
- 530 -> [CLOSED: PR 1040] (pretooluse-scope.mjs is in the repo and the matcher routes the seven tools; A-PT-S5, S6, S7 name no project path, ruled not attributable)
- 531 -> [CLOSED: PR 1040] (A-PT-B1 to B8, B10 to B15, B17, B19, B20, B22, B23 and E1 to E9 refused; B24 to B27 recorded under NOT done)
- 532 -> [CLOSED: PR 1040] (A-PT-M1 to M5 and T2 refused; T2 Read evidence also PR 1067; A-PT-T1 forged skill name is intent)
- 533 -> [CLOSED: PR 1040] (A-PT-I2, I3, I4, I6, I7 ask; I1 is a git-config alias, I5 intent)
- 534 -> [CLOSED: PR 1040] (A-H1-1 to A-H1-6 and A-H3-2, A-H3-3; A-H1-7 plumbing fires no hook)
- 535 -> [NOT-WORK: a junction nested one level inside a real node_modules directory and a forged next/package.json are constructed intent forms]

Rows in docs/audits/dead-code-census-2026-10-08.md (exemption lists, section 5 territory)
- 1629 -> [NOT-WORK: F34 ALLOWLIST entry with its reason recorded at F34-bundle-safe-module-evaluation.mjs lines 20 to 38]
- 1691 -> [NOT-WORK: F54 EXEMPT_STEPS entry with its reason recorded; F25 is the failing enforcement for the class]
- 1708 -> [WORK: owed]

Rows in docs/audits/gate-evaluation-2026-10-08.md
- 56 -> [CLOSED: PR 997] (rule 012 reads ctx.introducedLines, rules/012 header)
- 58 -> [NOT-WORK: historic firing record, no action]
- 72 -> [CLOSED: PR 997] (rule 015 reads introduced lines, rules/015 header)
- 125 -> [CLOSED: PR 1086] (this PR: X11 range wide pool; the introduced-lines scope itself is PR 997)
- 129 -> [NOT-WORK: historic CI firing classification; the two-dot range defect was fixed by lane R23, recorded in runner.mjs]
- 161 -> [CLOSED: PR 998] (C4 prints a worktree outside the repository path as a note, C4-worktrees-reality.mjs header)
- 162 -> [NOT-WORK: history of an already fixed defect, no action]
- 175 -> [CLOSED: PR 998] (no readable transcript on a write path is an ask, skill gate header)
- 179 -> [CLOSED: PR 998] (DANGER runs over the command's own argv; NOT_DANGER tests in pretooluse-skill-gate.test.mjs; honest read-only forms again in PR 1067)
- 243 -> [NOT-WORK: overlap statement; ADR-046 holds the per-gate disposition and rule 016 was removed by PR 997]
- 250 -> [CLOSED: PR 997] (rules 012, 015, 017, 019 read introduced lines; 016 removed)
- 260 -> [CLOSED: PR 998]
- 261 -> [CLOSED: PR 1040] (lib/firing-log.mjs, local hook firings in the gitignored .hook-firings.log, ADR-046)
- 382 -> [CLOSED: PR 1002] (the F28 pending-marker convention is retired by GATE-3)
- 393 -> [NOT-WORK: overlap statement; the allowlist expiry part is X13 of this PR]
- 411 -> [NOT-WORK: overlap statement; the train counter finding is already closed by PR 1039]
- 493 -> [NOT-WORK: overlap statement, ADR-046 dispositions govern]
- 495 -> [NOT-WORK: overlap statement, ADR-046 dispositions govern]

Other audit rows
- docs/audits/migration-history-2026-10-07.md:35 -> [NOT-WORK: the contract now forbids a lane writing under docs/audits (COMMON rule 4), so the coordinator landing it is the rule]
- docs/audits/remaining-build-register-2026-10-06.md:355 -> [NOT-WORK: needs a chained production row in loop-fired-evidence.json; build mode holds dispatch (rule 16)]
- docs/audits/verify1-register-unknowns-2026-10-08.md:70 -> [CLOSED: PR 1024] (RD-95 cites audit:ui-orphan-audit.mjs, run by the data-audit lane, register uploaded by data-audit-lane.yml)
- docs/audits/verify1-register-unknowns-2026-10-08.md:79 -> [CLOSED: PR 1024]

Rows in docs/ops/session-log.d
- 2026-10-02-l3.md:178 -> [CLOSED: PR 891] (the lane merged through CI, which runs the pre-push set)
- 2026-10-03-l13.md:203 -> [WORK: owed]
- 2026-10-03-rw-wf.md:122 -> [CLOSED: PR 1056] (DORMANT-1 table: research-walker ledger rows, newest 2026-10-07)
- 2026-10-03-rw-wf.md:131 -> [WORK: owed]
- 2026-10-04-s0b-baseline-renewal-tool.md:55 -> [CLOSED: PR 1056] (closure-gate HARNESS_FAMILY_BY_WORKFLOW maps layout-baseline-renewal.yml)
- 2026-10-05-s1e-source-chain.md:58 -> [NOT-WORK: needs a chained production row; build mode holds dispatch (rule 16)]
- 2026-10-05-s1e-source-chain.md:60 -> [CLOSED: PR 980] (trust-recompute.yml retired, recompute-trust-scores step kept)
- 2026-10-07-dead2-schema.md:28 -> [WORK: owed]
- 2026-10-07-gate4-ci.md:92 -> [REFUTED: gh api branches/master/protection lists the Rendering guard job among 8 required contexts, strict true]
- 2026-10-07-gate4-ci.md:94 -> [NOT-WORK: scope statement; live-tree tests run in the unit-test job by design (ADR-040)]
- 2026-10-07-rules1-gate-precision.md:93 -> [REFUTED: governance/generated-files.mjs no longer exists (deleted by GATE-3, F51-no-shared-append.mjs header), so there is no registry to hold an entry]
- 2026-10-07-rules1-gate-precision.md:95 -> [REFUTED: F51 check 5 was deleted by GATE-3, same header]
- 2026-10-07-rules1-gate-precision.md:97 -> [CLOSED: PR 1039] (coverage-scan.mjs decides update, upsert and delete by rule 015 rawWriteHits)
- 2026-10-07-rules1-gate-precision.md:104 -> [REFUTED: the collision came from F51 check 5, deleted by GATE-3; maintenance.yml already commits db-check-constraints.json]
- 2026-10-07-s8e0-producer-registry.md:44 -> [CLOSED: PR 986] (producer-summary-wiring.test.mjs passes 10 of 10 on this tree)
- 2026-10-07-s8e0-producer-registry.md:47 -> [CLOSED: PR 986] (F25 reads scripts/producers/registry entries as dispatch roots, F25 lines 362 to 368)
- 2026-10-07-s8e0-producer-registry.md:48 -> [CLOSED: PR 986] (the runbook dispatches producer=registry)
- 2026-10-07-s8e0-producer-registry.md:52 -> [CLOSED: PR 986]
- 2026-10-08-audwire1-orphan-audit.md:27 -> [WORK: owed]
- 2026-10-08-daudit1-mounts.md:198 -> [CLOSED: PR 1049] (design-audit.yml runs audit:design in CI)
- 2026-10-08-daudit1-mounts.md:204 -> [CLOSED: PR 1049]
- 2026-10-08-daudit2-design-audit.md:182 -> [CLOSED: PR 1049] (design-audit.yml fails the job when the results errors list is not empty, lines 134 to 136)
- 2026-10-08-gate8-fitness-honest-forms.md:42 -> [NOT-WORK: ADR-046 addendum: intent forms are out of scope]
- 2026-10-08-gate8-fitness-honest-forms.md:44 -> [WORK: owed]
- 2026-10-08-gate8-fitness-honest-forms.md:45 -> [CLOSED: PR 1042] (discipline.yml uploads governance-firings.json)
- 2026-10-08-gate8-fitness-honest-forms.md:46 -> [NOT-WORK: ADR-040, CI is the gate; F9 runs in the fitness job with dependencies installed]
- 2026-10-08-gate8-fitness-honest-forms.md:51 -> [CLOSED: PR 1069] (harness-ledger-export.json committed, 239 runs)
- 2026-10-08-rulerange1-squash-verdict.md:27 -> [NOT-WORK: ADR-046 RULE-RANGE-1 addendum: a push range is judged per commit by design]
- 2026-10-08-skillslim1-core-and-references.md:89 -> [NOT-WORK: an option, no defect named; the gate demands the core and SKILL-SLIM-1 shipped the references]
- 2026-10-08-smoke2-content-invariants.md:82 -> [NOT-WORK: scope statement; a workflow fails loud on missing credentials and a local run self-skips, the same contract as record-harness-run.mjs]
- 2026-10-08-smoke2-content-invariants.md:88 -> [NOT-WORK: needs a live production smoke run; build mode holds live dispatch (rule 16)]
- 2026-10-08-wire1-gate-wiring-owned.md:42 -> [NOT-WORK: Claude Code client behaviour, not observable in the repo]

Counts: 71 rows. CLOSED 34 (PR 1040 x8, 998 x4, 986 x4, 997 x3, 1049 x3, 1042 x2, 1024 x2, 1056 x2, and one each for 1069, 1039, 1002, 980, 891 and 1086 (this PR)), REFUTED 4, NOT-WORK 26, WORK owed 7.

## Decisions

- Every non permanent F25 allowlist entry shares `reviewBy: '2026-12-31'` because no entry carries a date of its own; the gate then forces a wire, delete or fresh dated reason per entry on that day. A shared date clusters the review (the X3 shape), recorded so a coordinator can stagger it.
- A raw command containing a backslash never earns the pair 7 exemption, because `argvOnly` unescapes it.

## NOT done

- Bash edits of governed files (`sed -i`, `>>`, `python -c`, `git apply`, A-PT-B24 to B27) are not seen by the skill gate; GATE-7 left them outside its brief. [WORK: owed]
- A Windows backslash `-C` path hides the subcommand from the isolation belt: `argvOnly` turns `git -C C:\x merge origin/master` into text where the subcommand reads as `sers`, so the command is not asked at all [CONFIRMED: ran argvOnly]. Pre-existing; found while attacking pair 7. [WORK: owed]
- Section 5 exemption lists were not touched; current counts: closure NEVER_RUN_DORMANT 0, exemptions.EXEMPTIONS 19, F25 LEGACY_ALLOWLIST 17, F36 PRE_EXISTING_ALLOWLIST 14, F64 RLS_ENABLE_ALLOWLIST 12, F21 SANCTIONED 7, F9 ALLOWED_TSCONFIG_EXCLUDES 6, F15 LEGACY_ALLOWLIST 5, F40 BEARER_BUILDER_ALLOWLIST 3, F47 ALLOWLIST 2. [NOT-WORK: scope statement, section 5 lists are not this lane's]
- The skill gate test "the gate stays under 300 ms" fails locally (340 to 420 ms cold scan) on the unmodified gate as well; CI decides. [NOT-WORK: fact, load dependent timing, unchanged by this PR]
- A `git stash` run in this worktree interleaved with sibling lanes (the stash list is shared by every worktree): one pop applied another lane's `brief-candidates.mjs` edit here and into the chain5 worktree, and my own stash was popped elsewhere. I removed the stray copy from this worktree; the chain5 worktree still holds a copy of the dfix2 edit. [WORK: owed]

## Open items

- Consistency-Override accepts any non-empty rationale and any future date (aud-at3 line 528). [WORK: owed]
- The F64 RLS_ENABLE_ALLOWLIST entry for `intelligence_items_domain_backfill_audit` states the table was never applied; migration 101 is in APPLIED-MAP and migration 219 drops the table, so the reason is false and the check should treat a dropped table as out of scope [CONFIRMED: read F64 lines 196 to 198, APPLIED-MAP line 96, migration 219 line 48]. [WORK: owed]
