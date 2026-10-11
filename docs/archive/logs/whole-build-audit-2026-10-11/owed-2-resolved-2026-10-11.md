# OWED-2 resolved backlog, 2026-10-11 (fact lane owed2-resolve-backlog)

Basis: origin/master 38de6adc7 (git grep, git show, git ls-tree; nothing executed). Input: fsi-app/scripts/tmp/owed-list-2026-10-11.md. Read-only lane; this is the only file created.

## 0. Method and corrections to the input register

- The input register lists only 50 of the 419 WORK rows, 50 of 156 deferrals and 50 of 550 HYPOTHESIS rows ("... and N more"). All rows were regenerated from origin/master: `git grep -n "[WORK:"` over docs/ gives exactly 419 rows, matching the register count. Deferral-shaped NOT-WORK: 625 `[NOT-WORK:` rows exist; the reason filter (build-mode hold, Stage 9, population, operator item, live question, rule 16, needs live/production/browser/chained, production, dispatch, network, credential, dev server) applied to rows outside the DISPO-1 log gives exactly 156. [CONFIRMED by count match]
- The eighteen subsystems are in section 2 of docs/runbooks/audit-catalogue.md ("The subsystems the lenses apply to"); section 1 is the ten lenses. Section 2 was used.
- 245 of the 419 WORK rows are not independent findings: 223 sit in the DISPO-1 pass-2 proposal table (docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md, "not applied"; each names a target file:line that has since been dispositioned in place), 19 are lane-log ledger lines of the form "target:line -> [TOKEN]" (RULES-X-2, TESTS-1, TESTS-2 logs) and 3 are DISPO-1 prose lines that mention a token. Table rows were resolved through their target line (or a continuation line within 8 lines that carries the token). The register overcounts by these; the unique count is in section 1.
- The register's lane-to-log match (literal string) is replaced by a normalised id match: lane id lowercased, punctuation stripped, matched as a prefix of the session-log stem (digits must end) and of the merged PR title id or head branch. 1061 merged PRs were read (`gh pr list --state merged --limit 1500`). The `owed`, `coordinator` and `<...>` tokens name no lane and are UNASSIGNED.
- LANE-LEFT-OWED: the merged lane's own log ledger line (`target:line -> [WORK: ...]`) states the row stays owed after the merge; these rows are in the groups. COVERED (lane ledger: [CLOSED/NOT-WORK/REFUTED]) is the reverse.
- COVERED / NOT-EVIDENT is a plausibility test, not code verification. COVERED (log cites file:line) means the lane log names the row's own `file:line` (strongest). COVERED (title/log head shares ...) means at least 3 distinctive words are shared by the row text and the PR title or the log first 20 lines (weaker; a human should skim these). NOT-EVIDENT means neither.
- Subsystem assignment is keyword-based on the row text then the file name; it is a first cut for wave-3 briefing and should be skimmed. Rows no keyword reaches fall in "Unclassified (cross-cutting)".

## 1. Summary

**419 WORK rows = 174 direct + 245 mirror rows.** Unique findings: 175 (174 direct + 1 table rows whose target carries no direct row).

STATE of the 419 as the register lists them, by what each row is:

| Row kind | Count | Disposition |
|---|---|---|
| DIRECT inline token | 174 | resolved below |
| DISPO1-META | 3 | ledger/meta mention |
| DISPO1-TABLE | 92 | duplicate of a direct row (state inherited) |
| DISPO1-TABLE | 1 | orphan table row (no direct row at target) |
| DISPO1-TABLE | 73 | superseded-closed |
| DISPO1-TABLE | 45 | superseded-not-work |
| DISPO1-TABLE | 12 | superseded-refuted |
| LEDGER-MENTION | 19 | ledger/meta mention |

STATE of the 175 unique rows (direct + orphan table rows):

| STATE | Rows |
|---|---|
| MERGED / COVERED | 87 |
| OPEN | 47 |
| UNASSIGNED | 26 |
| MERGED / LANE-LEFT-OWED | 7 |
| MERGED / NOT-EVIDENT | 6 |
| LOG-ONLY | 2 |

Of the 419, the register's "LANE-NO-LOG 395" is wrong: with normalised matching the lane resolves for the lanes below. The DISPO-1 table rows that are SUPERSEDED were resolved in place by later lanes (CLOSED PR n, REFUTED, or NOT-WORK) and are not owed:

| Table-row outcome | Rows |
|---|---|
| SUPERSEDED-CLOSED | 73 |
| SUPERSEDED-NOT-WORK | 45 |
| duplicate of a direct row | 92 |
| SUPERSEDED-REFUTED | 12 |
| orphan (kept as a row) | 1 |

Deferral-shaped NOT-WORK: 156 rows (148 direct, 8 RULES-X-2 ledger mentions). They are held by rule 16 / COMMON rules / Stage 9, not workable until the hold lifts.

### 1a. Group table (wave-3 lane candidates)

Work rows = unique rows that are OPEN, UNASSIGNED, LOG-ONLY or MERGED with NOT-EVIDENT. Deferral rows = the held NOT-WORK rows.

| # | Subsystem | Work rows | Deferral rows | Register files involved |
|---|---|---|---|---|
| 1 | Commit rules | 1 | 0 | 2026-10-10-cimin0-phase0-minutes |
| 2 | Hooks | 2 | 3 | 2026-10-07-par2-bands-typography, 2026-10-08-gate2-hooks, 2026-10-08-smoke2-content-invariants, aud-at3-gates-attacked-2026-10-08, session-log |
| 4 | Fitness functions | 6 | 18 | 2026-10-02-l3, 2026-10-07-proof3-chain-steps, 2026-10-07-rules1-gate-precision, 2026-10-08-alias1-entity-hierarchy, 2026-10-08-daudit1-mounts, 2026-10-08-daudit2-design-audit, 2026-10-08-dispo3-remaining-build-register, 2026-10-08-gate5-baseline-and-race, 2026-10-08-gate7-honest-forms, 2026-10-08-rulerange1-squash-verdict, 2026-10-08-sec7-policy-roles, 2026-10-08-wire1-gate-wiring-owned, 2026-10-09-cifix1, 2026-10-09-loopid1-test-isolation, 2026-10-09-proof6, 2026-10-09-proof7-oracle-roles, 2026-10-09-rulesx2-register-residue, 2026-10-10-cifix2, 2026-10-10-dead1c-src-and-remaining-symbols, 2026-10-10-docs5, 2026-10-10-gatefix2-bash-edits-and-paths, 2026-10-10-tests2-owed-tests-residue, aud-at4-gates-attacked-2026-10-08, aud-at5-gates-attacked-2026-10-08 |
| 5 | Governance gates | 10 | 12 | 2026-10-03-l-corridor, 2026-10-04-s1c-tier-movement, 2026-10-05-s1e-source-chain, 2026-10-06-g5-terms, 2026-10-07-g5-search, 2026-10-07-proof1-stack-and-replay, 2026-10-08-daudit3-ci-generated-results, 2026-10-08-flag1-disposition-gate, 2026-10-08-gate6-guard-container, 2026-10-08-sec5-profiles-read, 2026-10-08-verd1-stale-verdicts, 2026-10-10-harness1, 2026-10-10-proof8-roles-filter, dead-code-census-2026-10-08, remaining-build-register-2026-10-06, session-log |
| 6 | Rendering guard | 1 | 5 | 2026-10-07-par1-rows-meter, 2026-10-07-s8a-notes-assignment, 2026-10-08-sec2-profile-status-columns, 2026-10-08-sec3b-table-policies, 2026-10-08-sec6-admin-flag, 2026-10-10-tests2-owed-tests-residue |
| 7 | CI workflow | 4 | 13 | 2026-10-02-l6, 2026-10-04-s1b-host-verdicts, 2026-10-06-auth1-repeated-signup, 2026-10-07-chain1-artifact-handoff, 2026-10-07-chain2-loop-run-id, 2026-10-07-trustret, 2026-10-08-audwire1-orphan-audit, 2026-10-08-gate6-guard-container, 2026-10-08-smoke2-content-invariants, 2026-10-09-dormant1-never-run-closed, 2026-10-10-cimin1-jobs-scoped-to-inputs, 2026-10-10-tests1-owed-tests-and-fixtures, remaining-build-register-2026-10-06, session-log |
| 8 | Chain workflows and hops | 4 | 10 | 2026-10-02-l5, 2026-10-05-l4a-questions-on-change, 2026-10-05-s1e-source-chain, 2026-10-08-chain4-downstream-edges, 2026-10-08-daudit2-design-audit, 2026-10-08-proof5b-oracle-statements, 2026-10-09-chain5-chain-steps-on-stack, 2026-10-09-dormant1-never-run-closed, 2026-10-09-proof6, 2026-10-10-proof9-oracle-gate, remaining-build-register-2026-10-06, verify1-register-unknowns-2026-10-08 |
| 9 | Harness families | 2 | 11 | 2026-10-02-l8, 2026-10-06-g6-drain, 2026-10-06-p4-live-smoke-1, 2026-10-07-proof2-subset, 2026-10-08-daudit1-mounts, 2026-10-08-proof5-oracle-superuser, 2026-10-08-smoke2-content-invariants, 2026-10-09-dormant1-never-run-closed, 2026-10-10-smoke4-list-side-chooser, aud-at5-gates-attacked-2026-10-08 |
| 10 | Migrations and ledger | 10 | 15 | 2026-10-03-l14, 2026-10-04-s3a-intersections, 2026-10-05-l4a-questions-on-change, 2026-10-05-l4d-predictions-reliability, 2026-10-05-s3b-cross-page-surfaces, 2026-10-06-c-toggle-promote, 2026-10-06-g7-ui, 2026-10-07-g5-need, 2026-10-07-proof4-attacks, 2026-10-08-docs3-pass, 2026-10-08-mig374-owed-schema, 2026-10-08-migci-apply-on-stack, 2026-10-08-mkt1-market-components, 2026-10-08-obl2-obligation-objects, 2026-10-08-qoc1-emitting-table-entries, 2026-10-08-s8e6-grid-queue, 2026-10-09-dfix2-surface-defects-residue, 2026-10-09-mighist2-replay-residue, 2026-10-10-dead1d-orphan-fetchers-and-stale-fixtures, remaining-build-register-2026-10-06, session-log, verify1-register-unknowns-2026-10-08 |
| 11 | RLS and grants | 2 | 0 | 2026-10-10-cimin1-jobs-scoped-to-inputs, aud-at1-rls-grants-attacked-2026-10-08 |
| 13 | API routes | 1 | 3 | 2026-10-05-s3b-cross-page-surfaces, 2026-10-07-s8f2-statements-build, 2026-10-08-cov1-coverage-surface, aud-at2-route-guard-register-2026-10-08 |
| 14 | Components | 3 | 12 | 2026-10-02-l5, 2026-10-04-s3c-theme-brief-batches, 2026-10-05-g7-tier, 2026-10-05-l4b-question-answers, 2026-10-05-p1-source-rating-display, 2026-10-05-s3b-cross-page-surfaces, 2026-10-06-auth2-provision-heal, 2026-10-07-par1-rows-meter, 2026-10-07-par1b-meter-spec, 2026-10-07-s8f2-statements-build, 2026-10-08-alias1-entity-hierarchy, 2026-10-08-daudit1-mounts, 2026-10-10-daudit4-spec-values-follow-system |
| 15 | Scripts | 8 | 11 | 2026-10-01-r68-gates, 2026-10-02-model-ids, 2026-10-05-g7-corrections, 2026-10-05-gates2-live-smoke, 2026-10-06-auth2-provision-heal, 2026-10-06-g6-drain, 2026-10-07-proof1-stack-and-replay, 2026-10-08-cov1-coverage-surface, 2026-10-08-daudit2-design-audit, 2026-10-08-s8e6-grid-queue, 2026-10-10-tests1-owed-tests-and-fixtures, 2026-10-10-tests2-owed-tests-residue, dead-code-census-2026-10-08 |
| 16 | Producers | 19 | 25 | 2026-10-02-l3, 2026-10-02-l6, 2026-10-02-l8, 2026-10-02-l9, 2026-10-03-external-only, 2026-10-03-l-corridor, 2026-10-03-l10, 2026-10-03-l11, 2026-10-03-l13, 2026-10-03-l14, 2026-10-04-s1a-source-register, 2026-10-04-s1d-walker-registers, 2026-10-04-s3c-theme-brief-batches, 2026-10-05-l4b-question-answers, 2026-10-07-g5-read, 2026-10-07-ops1-maintenance-health, 2026-10-07-s8a-notes-assignment, 2026-10-07-s8b-tag-attribution, 2026-10-07-s8d-portfolio, 2026-10-07-s8f-industry-statements, 2026-10-07-s8f2-statements-build, 2026-10-08-alias1-entity-hierarchy, 2026-10-08-cov1-coverage-surface, 2026-10-08-dispo3-remaining-build-register, 2026-10-08-s8e5-aux-energy, 2026-10-08-s8e6-grid-queue, 2026-10-09-cifix1, 2026-10-10-harness1, obl1-obligations-register-2026-10-08, remaining-build-register-2026-10-06, verify1-register-unknowns-2026-10-08 |
| 17 | Docs and INDEX | 10 | 1 | 2026-10-03-l11, 2026-10-04-s0b-baseline-renewal-tool, 2026-10-08-audit-catalogue, 2026-10-10-cifix2, 2026-10-10-cimin0-phase0-minutes, 2026-10-10-docs5, 2026-10-10-tests2-owed-tests-residue, plan2-build-status-2026-10-09, verify1-register-unknowns-2026-10-08 |
| 18 | Skills, dispatch contracts and the doctrine's own claims | 1 | 1 | 2026-10-10-docs5, remaining-build-register-2026-10-06 |
| - | Unclassified (cross-cutting) | 4 | 8 | 2026-10-02-ra-wf, 2026-10-05-gates2-live-smoke, 2026-10-08-dispo3-remaining-build-register, remaining-build-register-2026-10-06 |
| | **Total** | **88** | **148** | |

### 1b. HYPOTHESIS rows (not resolved, counted only)

- `[HYPOTHESIS` occurrences in top-level docs/audits/*.md: 620 in 98 files (the register says 550; the per-file counts for its top 15 match mine, e.g. dead-code-census 45, prodsrc 40, aud-at2 32, so the register used the same method on a narrower selection I could not reproduce; difference 70). A further 432 occurrences in 39 files sit in docs/audits subdirectories (full-read-2026-08-31/ and similar) that the register did not scan. Many occurrences are backticked mentions of the token word in method sections, not findings. These are counted, not verified.

Top 10 files (top-level docs/audits, occurrences):

| Rank | File | Occurrences | Subsystem (by file subject) |
|---|---|---|---|
| 1 | docs/audits/dead-code-census-2026-10-08.md | 45 | 15 Scripts |
| 2 | docs/audits/prodsrc-public-datasets-2026-10-08.md | 40 | 16 Producers |
| 3 | docs/audits/aud-at2-route-guard-register-2026-10-08.md | 32 | 13 API routes |
| 4 | docs/audits/app-audit-a5b-migrations-001-170-2026-09-30.md | 25 | 10 Migrations and ledger |
| 5 | docs/audits/audit-consolidated-2026-09-30.md | 25 | - Unclassified (cross-cutting) |
| 6 | docs/audits/app-audit-a6-discipline-tests-2026-09-30.md | 21 | 5 Governance gates |
| 7 | docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md | 19 | 15 Scripts |
| 8 | docs/audits/gate-evaluation-2026-10-08.md | 19 | 5 Governance gates |
| 9 | docs/audits/SESSION-AUDIT-2026-05-05.md | 19 | 10 Migrations and ledger |
| 10 | docs/audits/caros-ledge-supabase-schema-audit-2026-05-15.md | 18 | 10 Migrations and ledger |

Top 10 files including subdirectories (for reference):

- 1. docs/audits/dead-code-census-2026-10-08.md: 45
- 2. docs/audits/prodsrc-public-datasets-2026-10-08.md: 40
- 3. docs/audits/full-read-2026-08-31/L13-scripts-A.md: 34
- 4. docs/audits/aud-at2-route-guard-register-2026-10-08.md: 32
- 5. docs/audits/full-read-2026-08-31/L14-scripts-B.md: 30
- 6. docs/audits/app-audit-a5b-migrations-001-170-2026-09-30.md: 25
- 7. docs/audits/audit-consolidated-2026-09-30.md: 25
- 8. docs/audits/full-read-2026-08-31/L11-lib-C.md: 25
- 9. docs/audits/full-read-2026-08-31/L04-api-B.md: 22
- 10. docs/audits/app-audit-a6-discipline-tests-2026-09-30.md: 21

Per subsystem (by file subject; top-level files, then subdirectory files):

| # | Subsystem | Top-level occurrences | Subdirectory occurrences |
|---|---|---|---|
| 1 | Commit rules | 11 | 0 |
| 4 | Fitness functions | 2 | 0 |
| 5 | Governance gates | 57 | 62 |
| 7 | CI workflow | 8 | 0 |
| 9 | Harness families | 2 | 0 |
| 10 | Migrations and ledger | 96 | 13 |
| 11 | RLS and grants | 18 | 0 |
| 13 | API routes | 34 | 36 |
| 14 | Components | 60 | 81 |
| 15 | Scripts | 105 | 124 |
| 16 | Producers | 65 | 3 |
| 17 | Docs and INDEX | 46 | 4 |
| 18 | Skills, dispatch contracts and the doctrine's own claims | 1 | 0 |
| - | Unclassified (cross-cutting) | 115 | 109 |

Per file (top-level docs/audits, all 98 files):

dead-code-census-2026-10-08.md 45; prodsrc-public-datasets-2026-10-08.md 40; aud-at2-route-guard-register-2026-10-08.md 32; app-audit-a5b-migrations-001-170-2026-09-30.md 25; audit-consolidated-2026-09-30.md 25; app-audit-a6-discipline-tests-2026-09-30.md 21; app-audit-a4-scripts-workflows-2026-09-30.md 19; gate-evaluation-2026-10-08.md 19; SESSION-AUDIT-2026-05-05.md 19; caros-ledge-supabase-schema-audit-2026-05-15.md 18; docs-vs-reality-2026-09-30.md 18; docs-vs-reality-ops-2026-09-30.md 17; classification-rules-audit-2026-05-09.md 16; perf-load-times-2026-09-03.md 16; privilege-census-2026-10-08.md 15; obl1-obligations-register-2026-10-08.md 14; supabase-integrity-and-wiring-audit-2026-09-25.md 13; rulesx1-honest-operations-2026-10-09.md 11; caros-ledge-product-audit-2026-05-15.md 10; app-audit-a2-components-2026-09-30.md 9; REGIONAL-DATA-COLLECTION-AUDIT.md 7; remaining-build-register-2026-10-06.md 7; source-map-existence-check-2026-05-10.md 7; verify1-register-unknowns-2026-10-08.md 7; app-audit-a2b-components-m-z-2026-09-30.md 5; app-audit-a2bc-components-completion-2026-09-30.md 5; app-audit-a4b-scripts-mint-lib-verify-2026-09-30.md 5; app-audit-a5-database-2026-09-30.md 5; app-audit-a5c-migrations-171-339-2026-09-30.md 5; architecture-review-2026-09-30.md 5; docs-vs-reality-plans-2026-09-30.md 5; full-read-audit-2026-08-31.md 5; WORKER-ACTIVATION-AUDIT-2026-05-08.md 5; acquisition-ladder-post-mortem-2026-07-14.md 4; app-audit-a4cc-scripts-completion-2026-09-30.md 4; docs-vs-reality-board-and-remainder-2026-09-30.md 4; full-code-reading-audit-2026-08-09.md 4; functional-purpose-audit-2026-05-24.md 4; ISR-WRITE-INVESTIGATION.md 4; mechanical-checkers-2026-09-30.md 4; migration-history-2026-10-07.md 4; remediation-close-2026-07-15.md 4; source-coverage-diagnostic-2026-05-09.md 4; wiring-audit-2026-09-04.md 4; app-audit-a10-remainder-2026-09-30.md 3; app-audit-a3c-lib-community-market-2026-09-30.md 3; app-audit-a4bc-scripts-completion-2026-09-30.md 3; app-audit-a4c-scripts-remainder-2026-09-30.md 3; aud-at5-gates-attacked-2026-10-08.md 3; DESIGN-AUDIT-2026-05.md 3; in-filter-audit-2026-09-06.md 3; ingest-behavioral-read-2026-07-18.md 3; PERF-AUDIT.md 3; perf-waterfall-2026-09-04.md 3; primitives-audit-2026-05-09.md 3; rendering-guard-local-vs-ci-2026-09-12.md 3; source-map-from-esgtoday-2026-05-09.md 3; system-review-2026-09-01.md 3; access-method-triage-2026-05-12.md 2; app-audit-a1-routes-2026-09-30.md 2; aud-at1-rls-grants-attacked-2026-10-08.md 2; aud-at4-gates-attacked-2026-10-08.md 2; blind-ci-window-audit-2026-07-08.md 2; comprehensive-site-audit-2026-05-25.md 2; db-layer-census-2026-08-11.md 2; full-code-audit-2026-08-09.md 2; INTEGRITY-TRIAGE-REPORT.md 2; migration-drift-investigation-2026-05-12.md 2; null-tier-host-ruling-2026-08-11.md 2; plan2-build-status-2026-10-09.md 2; product-code-wiring-truth-2026-08-09.md 2; quarantine-and-human-flag-writers-2026-09-12.md 2; runtime-clock-inventory-2026-08-10.md 2; system-health-audit-2026-09-17.md 2; VISUAL-RECONCILIATION-2026-05-06.md 2; wave1b-stub-quality-investigation-2026-05-11.md 2; wave2-archive-collision-reconciliation-2026-07-15.md 2; app-audit-a3-lib-2026-09-30.md 1; app-audit-a6b-discipline-full-2026-09-30.md 1; auth-architecture-audit-2026-05-10.md 1; dashboard-payload-audit-2026-05-11.md 1; data-duplicate-census-2026-09-18.md 1; dormant-systems-audit-2026-07-18.md 1; dormant-systems-section7-results-2026-07-18.md 1; E2E-VERIFICATION.md 1; font-usage-audit-2026-05-11.md 1; four-page-architecture-survey-2026-05-09.md 1; goldens-wiring-truth-2026-08-09.md 1; hotfix-3-perf-audit-2026-05-07.md 1; jurisdiction-normalization-audit-2026-05-11.md 1; perf-clickthrough-2026-09-04.md 1; PERF-PROFILING-FINDINGS.md 1; skill-vs-runtime-analysis-delta-2026-08-09.md 1; spend-authority-disarm-case-file-2026-07-30.md 1; supabase-structure-audit-2026-07-19.md 1; topic-relevance-investigation-2026-05-09.md 1; W1B-approval-handler-analysis.md 1; wave2-concurrent-race-incident-2026-07-15.md 1

Per file (subdirectories, 39 files):

full-read-2026-08-31/L13-scripts-A.md 34; full-read-2026-08-31/L14-scripts-B.md 30; full-read-2026-08-31/L11-lib-C.md 25; full-read-2026-08-31/L04-api-B.md 22; full-read-2026-08-31/L07-comp-C.md 18; full-read-2026-08-31/L10-lib-sources.md 18; full-read-2026-08-31/L08-comp-D.md 17; full-read-2026-08-31/L16-disc-B.md 17; plan-completion-audit-2026-09-05/skills-rules-doctrine.md 16; full-read-2026-08-31/L01-app.md 15; full-read-2026-08-31/L05-comp-A1.md 15; stage-audit-2026-09-18/s5-publish.md 15; full-read-2026-08-31/L03-api-A.md 14; full-read-2026-08-31/L06-comp-B.md 14; wiring-audit-2026-09-04/A1-runtimes.md 14; full-read-2026-08-31/L05-comp-A2.md 13; full-read-2026-08-31/L15-disc-A.md 13; plan-completion-audit-2026-09-05/loop-harness-flywheel-one-unit.md 12; plan-completion-audit-2026-09-05/tools-inventory-unused-duplicates.md 11; plan-completion-audit-2026-09-05/W5-W6-W7-surfaces-community-discipline.md 9; full-read-2026-08-31/L09-lib-agent.md 8; full-read-2026-08-31/L17-misc.md 8; full-read-2026-08-31/L18-migrations-A.md 7; full-read-2026-08-31/L19-migrations-B.md 6; plan-completion-audit-2026-09-05/W1-W2-intake-population.md 6; stage-audit-2026-09-18/s6-gates-harness.md 6; wiring-audit-2026-09-04/B2-data-layer.md 6; wiring-audit-2026-09-04/C2-rulings-vs-implementation.md 6; plan-completion-audit-2026-09-05/W3-W4-sourcing-propagation.md 5; stage-audit-2026-09-18/s2-mint-gate.md 5; full-read-2026-08-31/L12-lib-D.md 4; full-read-2026-08-31/REC-2-plans.md 4; stage-audit-2026-09-18/s3-evaluate.md 4; plan-completion-audit-2026-09-05/README.md 3; stage-audit-2026-09-18/README.md 3; stage-audit-2026-09-18/s1-collect.md 3; wiring-audit-2026-09-04/C1-loop-map.md 3; full-read-2026-08-31/REC-1-specs-decisions.md 2; stage-audit-2026-09-18/s4-propagate.md 1

## 2. Lane resolution

Counts are unique work rows (direct + orphan table rows). MERGED rows show COVERED/NOT-EVIDENT counts.

| Lane id | STATE | Evidence | Rows | COVERED | NOT-EVIDENT | LANE-LEFT-OWED |
|---|---|---|---|---|---|---|
| DOCS-5 | MERGED | PR 1104 2026-10-11, PR 1099 2026-10-11 | 42 | 42 | 0 | 0 |
| PLAN-2 | OPEN | no log, no PR for PLAN-2 | 34 | - | - | - |
| TESTS-2 | MERGED | PR 1101 2026-10-11 | 28 | 20 | 1 | 7 |
| (owed) | UNASSIGNED | token names no lane: owed | 18 | - | - | - |
| DORMANT-1 | MERGED | PR 1056 2026-10-09 | 9 | 5 | 4 | 0 |
| GATE-FIX-2 | MERGED | PR 1096 2026-10-11 | 8 | 8 | 0 | 0 |
| EXEC-4 | OPEN | no log, no PR for EXEC-4 | 7 | - | - | - |
| (coordinator) | UNASSIGNED | token names no lane: coordinator | 5 | - | - | - |
| EXEMPT-1 | OPEN | no log, no PR for EXEMPT-1 | 2 | - | - | - |
| CIFIX-2 | MERGED | PR 1097 2026-10-11 | 2 | 2 | 0 | 0 |
| DEAD-1d | MERGED | PR 1093 2026-10-11 | 2 | 1 | 1 | 0 |
| DISPO-1 | LOG-ONLY | log 2026-10-09-dispo1-dispositions.md; PR 1054 (FLAG-1 branch) is CLOSED unmerged; the log | 2 | - | - | - |
| WIRE-2 | OPEN | no log, no PR for WIRE-2 | 2 | - | - | - |
| DEAD-1c | MERGED | PR 1087 2026-10-10 | 1 | 1 | 0 | 0 |
| DAUDIT-4 | MERGED | PR 1092 2026-10-11 | 1 | 1 | 0 | 0 |
| DFIX-2 | MERGED | PR 1073 2026-10-09 | 1 | 1 | 0 | 0 |
| (coordinator-disposition-batch) | UNASSIGNED | token names no lane: coordinator-disposition-batch | 1 | - | - | - |
| (<lane id or PR N>) | UNASSIGNED | token names no lane: <lane id or PR N> | 1 | - | - | - |
| CHAIN-5 | MERGED | PR 1072 2026-10-09 | 1 | 1 | 0 | 0 |
| (<lane>) | UNASSIGNED | token names no lane: <lane> | 1 | - | - | - |
| MIG-HIST-2 | MERGED | PR 1085 2026-10-10 | 1 | 1 | 0 | 0 |
| EXEC-3 | OPEN | no log, no PR for EXEC-3 | 1 | - | - | - |
| SEC-8 | MERGED | PR 1071 2026-10-09 | 1 | 1 | 0 | 0 |
| GATE-FIX-3 | OPEN | no log, no PR for GATE-FIX-3 | 1 | - | - | - |
| SMOKE-4 | MERGED | PR 1094 2026-10-11 | 1 | 1 | 0 | 0 |
| TESTS-1 | MERGED | PR 1088 2026-10-10 | 1 | 1 | 0 | 0 |
| DORMANT-2 | MERGED | PR 1089 2026-10-10 | 1 | 1 | 0 | 0 |

Notes: PLAN-2 has no lane, log or PR; its rows are tracked by docs/audits/plan2-build-status-2026-10-09.md (a status register), so they are OPEN. DISPO-1 (PR 1054) was closed unmerged; its log is on master. GATE-PRECISION is a proposed lane name only (nearest: RULES-1 gate-precision log, PR 977), and appears only in table rows that were superseded. TESTS-2, GATE-FIX-2, DOCS-5 (PRs 1099 and 1104) and DORMANT-1 merged but their `[WORK: ...]` tokens have not yet been flipped to CLOSED, so those rows remain in the register until the executor applies dispositions.

## 3. Groups (rows by subsystem, then by file)

Format: `file:line | first 80 chars | STATE (lane or hold reason)`. Table rows are listed at their target file:line with the DISPO-1 table location in brackets. Deferral rows are marked DEFERRAL.

### 1. Commit rules: 1 work rows, 0 deferral rows

**docs/ops/session-log.d/2026-10-10-cimin0-phase0-minutes.md** (1)
- docs/ops/session-log.d/2026-10-10-cimin0-phase0-minutes.md:22 | [HYPOTHESIS] The repository squash setting is `COMMIT_MESSAGES` with title `COMM | UNASSIGNED (owed)

### 2. Hooks: 2 work rows, 3 deferral rows

**docs/audits/aud-at3-gates-attacked-2026-10-08.md** (1)
- docs/audits/aud-at3-gates-attacked-2026-10-08.md:512 | Settings precedence and switches that sit above the hook command (a project `.cl | DEFERRAL (needs a throwaway Claude Code session started with)

**docs/ops/session-log.d/2026-10-07-par2-bands-typography.md** (1)
- docs/ops/session-log.d/2026-10-07-par2-bands-typography.md:29 | The Connected intelligence "stated coupling" callout tint is not built here. Rea | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-08-gate2-hooks.md** (1)
- docs/ops/session-log.d/2026-10-08-gate2-hooks.md:40 | No full pre-push (`DISCIPLINE_PREPUSH_FULL=1`), no fitness runner, no suite run  | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md** (1)
- docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md:85 | selector fault, because each selector is the hook the component itself renders.  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.md** (1)
- docs/ops/session-log.md:24692 | Staged DOCS-5 doc edits to the rest of the gate-removal prose (invariants.d text | UNASSIGNED (owed)

### 4. Fitness functions: 6 work rows, 18 deferral rows

**docs/audits/aud-at4-gates-attacked-2026-10-08.md** (1)
- docs/audits/aud-at4-gates-attacked-2026-10-08.md:459 | F24 and the live-only DDL class: the gate reads a committed snapshot of the data | DEFERRAL (the live-catalog leg needs the production database)

**docs/audits/aud-at5-gates-attacked-2026-10-08.md** (1)
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:242 | OWED-3 DS27 actionlint binary: `which actionlint` returns nothing and there is n | DEFERRAL (no actionlint binary on this machine and no networ)

**docs/ops/session-log.d/2026-10-02-l3.md** (1)
- docs/ops/session-log.d/2026-10-02-l3.md:167 [2026-10-09-dispo1-dispositions.md:110] | **NEEDS COORDINATOR ACTION: F25 module-liveness violation on both new files, nee | UNASSIGNED (<lane>)

**docs/ops/session-log.d/2026-10-07-proof3-chain-steps.md** (1)
- docs/ops/session-log.d/2026-10-07-proof3-chain-steps.md:28 | Not fired, as briefed. PROOF-2 (subset export and load, PR 974) has since merged | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-rules1-gate-precision.md** (1)
- docs/ops/session-log.d/2026-10-07-rules1-gate-precision.md:98 | No whole suite or fitness runner run; the touched test files were run with `node | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md** (1)
- docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md:43 | `F47` (db-object-reference) and `F25` (module-liveness) were reasoned about, not | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-daudit1-mounts.md** (1)
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:199 | Not run locally, per COMMON rule 9: the whole suite, the fitness runner, tsc and | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md** (1)
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:172 | Not run locally, per COMMON rule 9: the whole suite, the fitness runner, tsc, li | DEFERRAL (hold: COMMON rule 9: CI is the gate)

**docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md** (1)
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:54 | The full suite and the fitness runner were not run locally; CI is the gate. [NOT | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-gate5-baseline-and-race.md** (1)
- docs/ops/session-log.d/2026-10-08-gate5-baseline-and-race.md:35 | Full suite and fitness runner not run locally (CI is the gate, ADR-040). [NOT-WO | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-gate7-honest-forms.md** (1)
- docs/ops/session-log.d/2026-10-08-gate7-honest-forms.md:195 | Not run locally, per COMMON rule 9 and ADR-040: the full suite, the fitness runn | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-rulerange1-squash-verdict.md** (1)
- docs/ops/session-log.d/2026-10-08-rulerange1-squash-verdict.md:28 | The rest of the discipline suite and the fitness runner were not run locally (CI | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-sec7-policy-roles.md** (1)
- docs/ops/session-log.d/2026-10-08-sec7-policy-roles.md:119 | Not run: the whole suite, the fitness runner, tsc (CI is the gate, ADR-040). [NO | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-wire1-gate-wiring-owned.md** (1)
- docs/ops/session-log.d/2026-10-08-wire1-gate-wiring-owned.md:28 | Not run locally per COMMON rule 9: the whole suite, the fitness runner, tsc. The | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-09-cifix1.md** (1)
- docs/ops/session-log.d/2026-10-09-cifix1.md:25 | Not run locally per COMMON rule 9: the whole suite and the fitness runner. [NOT- | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-09-loopid1-test-isolation.md** (1)
- docs/ops/session-log.d/2026-10-09-loopid1-test-isolation.md:26 | No run of the whole suite or the fitness runner (CI is the gate). The `ledger` s | DEFERRAL (hold: COMMON rule 9: CI is the gate)

**docs/ops/session-log.d/2026-10-09-proof6.md** (1)
- docs/ops/session-log.d/2026-10-09-proof6.md:36 | Not run locally per COMMON rule 9: the whole suite, the fitness runner, tsc. No  | DEFERRAL (hold: COMMON rules 5 and 9)

**docs/ops/session-log.d/2026-10-09-proof7-oracle-roles.md** (1)
- docs/ops/session-log.d/2026-10-09-proof7-oracle-roles.md:36 | Not run locally per COMMON rule 9: the whole suite, the fitness runner, tsc; no  | DEFERRAL (hold: COMMON rules 5 and 9)

**docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md** (1)
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:116 | The F64 RLS_ENABLE_ALLOWLIST entry for `intelligence_items_domain_backfill_audit | OPEN (EXEMPT-1)

**docs/ops/session-log.d/2026-10-10-cifix2.md** (1)
- docs/ops/session-log.d/2026-10-10-cifix2.md:34 | Not run locally per COMMON rule 9: the whole suite and the fitness runner; CI is | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-10-dead1c-src-and-remaining-symbols.md** (1)
- docs/ops/session-log.d/2026-10-10-dead1c-src-and-remaining-symbols.md:15 | `src/lib/supabase-server.ts` self-duplication (DFIX-1 F45 row) deduped: one aggr | MERGED, NOT-EVIDENT (DEAD-1d, PR 1093 2026-10-11)

**docs/ops/session-log.d/2026-10-10-docs5.md** (1)
- docs/ops/session-log.d/2026-10-10-docs5.md:137 | The two registers (rulesx1, plan2) are not landed in docs/audits, the INDEX, MAI | UNASSIGNED (coordinator)

**docs/ops/session-log.d/2026-10-10-gatefix2-bash-edits-and-paths.md** (1)
- docs/ops/session-log.d/2026-10-10-gatefix2-bash-edits-and-paths.md:32 | gate8:44 is about 110 accepted attack ids over about 35 functions (F6 to F68, cl | OPEN (GATE-FIX-3)

**docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md** (1)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:58 | Register row P18 in `docs/audits/aud-at2-route-guard-register-2026-10-08.md` is  | UNASSIGNED (owed)

### 5. Governance gates: 10 work rows, 12 deferral rows

**docs/audits/dead-code-census-2026-10-08.md** (1)
- docs/audits/dead-code-census-2026-10-08.md:1708 | intelligence_items_domain_backfill_audit [2026-10-01] (review: 2026-10-01): lane | OPEN (EXEMPT-1)

**docs/audits/remaining-build-register-2026-10-06.md** (3)
- docs/audits/remaining-build-register-2026-10-06.md:352 | 26. Closure-gate registration for `layout-baseline-renewal` (needs write-set exp | MERGED, NOT-EVIDENT (DORMANT-1, PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:392 | [ ] `execution-wiring.mjs` reports zero cited-but-unrun verifiers; the closure g | MERGED, NOT-EVIDENT (DORMANT-1, PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:416 | 1. [HYPOTHESIS] `maintenance:recompute-tiers` and the Stage 1 maintenance steps  | MERGED, NOT-EVIDENT (DORMANT-1, PR 1056 2026-10-09)

**docs/ops/session-log.d/2026-10-03-l-corridor.md** (1)
- docs/ops/session-log.d/2026-10-03-l-corridor.md:146 | separately per their own request; this worktree still holds no credentials to ru | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-04-s1c-tier-movement.md** (1)
- docs/ops/session-log.d/2026-10-04-s1c-tier-movement.md:30 | No live run, no DB read (brief rule 5). `maintenance:recompute-tiers` shows NEVE | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-s1e-source-chain.md** (1)
- docs/ops/session-log.d/2026-10-05-s1e-source-chain.md:57 | No live dispatch, no DB read, no data written (build mode, operator ruling 2026- | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-06-g5-terms.md** (1)
- docs/ops/session-log.d/2026-10-06-g5-terms.md:69 | OWED to lane G5-READ: the brief-author prompt (`system-prompt.ts`) does not yet  | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-07-g5-search.md** (2)
- docs/ops/session-log.d/2026-10-07-g5-search.md:68 | Nothing ran live: no dispatch, no database read or write, no network. [NOT-WORK: | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)
- docs/ops/session-log.d/2026-10-07-g5-search.md:73 | the parents still absent (not exercised on live data). [NOT-WORK: build-mode hol | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md** (1)
- docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md:33 | Not fired. The replay has never run against a real database: which files cannot  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-daudit3-ci-generated-results.md** (1)
- docs/ops/session-log.d/2026-10-08-daudit3-ci-generated-results.md:29 | No local run of the generator (no node_modules in the worktree, no browser); the | DEFERRAL (COMMON rule 9, CI is the gate; proven by the dispa)

**docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md** (4)
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:11 | disposition check: exactly one of `[WORK: <lane id or PR N>]`, `[CLOSED: PR N]`, | UNASSIGNED (<lane id or PR N>)
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:908 | No finding was dispositioned by this lane, as briefed; the coordinator dispositi | LOG-ONLY (DISPO-1)
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:909 | `--strict` does not fail on session-log or register findings (the brief scopes i | DEFERRAL (the brief scopes the push gate to docs/audits; the)
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:914 | The gate now refuses every dispatch from the main checkout until the 699 are dis | LOG-ONLY (DISPO-1)

**docs/ops/session-log.d/2026-10-08-gate6-guard-container.md** (1)
- docs/ops/session-log.d/2026-10-08-gate6-guard-container.md:70 | in the image; unproven until dispatched. [NOT-WORK: layout-baseline-renewal.yml  | DEFERRAL (layout-baseline-renewal.yml is dispatch-only, exer)

**docs/ops/session-log.d/2026-10-08-sec5-profiles-read.md** (1)
- docs/ops/session-log.d/2026-10-08-sec5-profiles-read.md:98 | No rendering-guard or UX smoke run locally (CI runs them; Playwright is not set  | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-verd1-stale-verdicts.md** (1)
- docs/ops/session-log.d/2026-10-08-verd1-stale-verdicts.md:37 | Nothing applied, no live row touched, no stale batch authored (the first real st | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-10-harness1.md** (1)
- docs/ops/session-log.d/2026-10-10-harness1.md:28 | `structured-actions-run-003.json` still sits in the coord-tokens-384 worktree un | UNASSIGNED (owed)

**docs/ops/session-log.d/2026-10-10-proof8-roles-filter.md** (1)
- docs/ops/session-log.d/2026-10-10-proof8-roles-filter.md:22 | The chain-proof fire has not been re-run with this fix; a fire is the coordinato | DEFERRAL (build mode, every runtime by explicit dispatch)

**docs/ops/session-log.md** (1)
- docs/ops/session-log.md:24691 | Staged DOCS-5 code edits with no exact text in the staging log: `.discipline/ren | UNASSIGNED (owed)

### 6. Rendering guard: 1 work rows, 5 deferral rows

**docs/ops/session-log.d/2026-10-07-par1-rows-meter.md** (1)
- docs/ops/session-log.d/2026-10-07-par1-rows-meter.md:89 | by the UX smoke slot; the CI Rendering guard job is the gate for the routes. [NO | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md** (1)
- docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md:136 | (generated from the artboard; the full rendering guard passes with the card gone | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-08-sec2-profile-status-columns.md** (1)
- docs/ops/session-log.d/2026-10-08-sec2-profile-status-columns.md:61 | No rendering-guard or UI smoke run (CI runs them); `tsc --noEmit` ran locally wi | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-sec3b-table-policies.md** (1)
- docs/ops/session-log.d/2026-10-08-sec3b-table-policies.md:88 | No rendering-guard or UX smoke run locally (CI runs them); no local tsc run (CI  | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-08-sec6-admin-flag.md** (1)
- docs/ops/session-log.d/2026-10-08-sec6-admin-flag.md:36 | No local tsc or eslint (CI runs them, ADR-040); no rendering guard (no .tsx touc | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md** (1)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:52 | daudit1:196 and daudit1:203: the HARNESS ROT group (fixture props for factcard,  | UNASSIGNED (owed)

### 7. CI workflow: 4 work rows, 13 deferral rows

**docs/audits/remaining-build-register-2026-10-06.md** (3)
- docs/audits/remaining-build-register-2026-10-06.md:333 | 9. Ledger-block rows (data-audit block rows) from first live `section-marker-aud | DEFERRAL (Stage 9 precondition, CLAUDE.md rule 16)
- docs/audits/remaining-build-register-2026-10-06.md:335 | 11. Stored-body marker count: never measured / gates2-live-smoke [HYPOTHESIS: pe | DEFERRAL (Stage 9 precondition, CLAUDE.md rule 16)
- docs/audits/remaining-build-register-2026-10-06.md:369 | 37. `fsi-app/scripts/tmp/claude-design-request-2026-10-06.md`: 16 artboard secti | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-02-l6.md** (1)
- docs/ops/session-log.d/2026-10-02-l6.md:102 | job), same posture as `scripts/entities/backfill-entities.mjs` for migration 283 | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md** (2)
- docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md:25 | No real verdict batch authored; no live run; no workflow edit (resolve-provision | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)
- docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md:26 | Local run limited to the touched test files; CI is the gate. [NOT-WORK: build-mo | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-06-auth1-repeated-signup.md** (1)
- docs/ops/session-log.d/2026-10-06-auth1-repeated-signup.md:24 | tsc and lint left to CI. [NOT-WORK: build-mode hold, COMMON rule 9] | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-07-chain1-artifact-handoff.md** (1)
- docs/ops/session-log.d/2026-10-07-chain1-artifact-handoff.md:28 | Not proven live: nothing here ran in GitHub Actions or against the database (com | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-chain2-loop-run-id.md** (1)
- docs/ops/session-log.d/2026-10-07-chain2-loop-run-id.md:36 | Not proven live: nothing here ran in GitHub Actions or against the database (com | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-trustret.md** (1)
- docs/ops/session-log.d/2026-10-07-trustret.md:31 | First dry dispatch is the R14 proof: `gh workflow run maintenance.yml -f step=re | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-audwire1-orphan-audit.md** (1)
- docs/ops/session-log.d/2026-10-08-audwire1-orphan-audit.md:26 | No live field list. There is no live access in this lane (COMMON rule 5), so the | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-gate6-guard-container.md** (1)
- docs/ops/session-log.d/2026-10-08-gate6-guard-container.md:71 | `live-smoke.yml` runs on a Production deployment or by dispatch; not exercised b | DEFERRAL (live-smoke.yml runs on a Production deployment or )

**docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md** (1)
- docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md:88 | First live-smoke run with content checks on: read its report for any `content-*` | DEFERRAL (needs a live production smoke run; build mode hold)

**docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md** (1)
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:57 | The first record job firing of each of the seven workflows has not happened (the | UNASSIGNED (owed)

**docs/ops/session-log.d/2026-10-10-cimin1-jobs-scoped-to-inputs.md** (1)
- docs/ops/session-log.d/2026-10-10-cimin1-jobs-scoped-to-inputs.md:30 | migration-proof.yml is not wired (`wired: false` in the table). `fsi-app/scripts | UNASSIGNED (owed)

**docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md** (1)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:46 | Three consecutive CI runs of the split race test: the executor cites three CI ru | OPEN (EXEC-4)

**docs/ops/session-log.md** (1)
- docs/ops/session-log.md:24690 | `docs/inventories/db-check-constraints.json` regeneration: the generator reads t | OPEN (EXEC-4)

### 8. Chain workflows and hops: 4 work rows, 10 deferral rows

**docs/audits/remaining-build-register-2026-10-06.md** (2)
- docs/audits/remaining-build-register-2026-10-06.md:355 | 29. `loop-fired-evidence` for hops 12 and 13 until a chained row lands / s1e-sou | DEFERRAL (needs a chained production row in loop-fired-evide)
- docs/audits/remaining-build-register-2026-10-06.md:374 | 40. L18 portfolio, L19 entity tables, L20 branch-database chain proof, L21 to L2 | OPEN (PLAN-2)

**docs/audits/verify1-register-unknowns-2026-10-08.md** (1)
- docs/audits/verify1-register-unknowns-2026-10-08.md:77 | S-6 "open [H: no evidence found]": [REFUTED] in part, derivation storage exists  | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-02-l5.md** (1)
- docs/ops/session-log.d/2026-10-02-l5.md:105 | 4. `fetchAssessmentHistoryChain`'s real-chain walk is correct and tested, but ev | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md** (1)
- docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md:59 | `workflow_run` branch requests `apply`, and the step then writes. Nothing to cha | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-s1e-source-chain.md** (2)
- docs/ops/session-log.d/2026-10-05-s1e-source-chain.md:58 | `enforceFired` for hops 12 and 13 stays false until a chained row lands in `loop | DEFERRAL (needs a chained production row; build mode holds d)
- docs/ops/session-log.d/2026-10-05-s1e-source-chain.md:59 | The chained firing off Brief apply or Research walker was not exercised on a rea | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-chain4-downstream-edges.md** (1)
- docs/ops/session-log.d/2026-10-08-chain4-downstream-edges.md:50 | Not proven live: nothing ran in GitHub Actions or against the database (common t | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md** (1)
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:183 | Coordinator: a Claude Design list from the 59 DESIGN CHANGES OWED rows, includin | DEFERRAL (operator item, Claude Design list)

**docs/ops/session-log.d/2026-10-08-proof5b-oracle-statements.md** (1)
- docs/ops/session-log.d/2026-10-08-proof5b-oracle-statements.md:25 | Not run against a live stack or real psql. [INFERRED] from psql's documented beh | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-09-chain5-chain-steps-on-stack.md** (1)
- docs/ops/session-log.d/2026-10-09-chain5-chain-steps-on-stack.md:36 | The next chain proof fire (the first observation of the served function, the sch | DEFERRAL (hold: workflow dispatch is the executor's, CLAUDE.)

**docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md** (1)
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:60 | chain-proof recording into harness_runs. [NOT-WORK: no production write credenti | DEFERRAL (no production write credential by design, ADR-045;)

**docs/ops/session-log.d/2026-10-09-proof6.md** (1)
- docs/ops/session-log.d/2026-10-09-proof6.md:47 | The first chain-proof fire on master after merge is the proof of the container s | OPEN (EXEC-3)

**docs/ops/session-log.d/2026-10-10-proof9-oracle-gate.md** (1)
- docs/ops/session-log.d/2026-10-10-proof9-oracle-gate.md:36 | The acldefault typing is a [HYPOTHESIS] fix; whether it is the whole cause is pr | OPEN (EXEC-4)

### 9. Harness families: 2 work rows, 11 deferral rows

**docs/audits/aud-at5-gates-attacked-2026-10-08.md** (1)
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:246 | OWED-7 live legs: `loop-fired-evidence-audit.mjs` (compares evidence entries wit | DEFERRAL (needs production credentials)

**docs/ops/session-log.d/2026-10-02-l8.md** (1)
- docs/ops/session-log.d/2026-10-02-l8.md:480 | `recordHarnessRun()` integration mechanism end-to-end against a fake client, not | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-06-g6-drain.md** (1)
- docs/ops/session-log.d/2026-10-06-g6-drain.md:24 | Nothing is applied, no scheduled task, switch off. The plan's export of ledger c | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-06-p4-live-smoke-1.md** (1)
- docs/ops/session-log.d/2026-10-06-p4-live-smoke-1.md:27 | Nothing was run against the real site; the coordinator re-runs Live smoke after  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-proof2-subset.md** (1)
- docs/ops/session-log.d/2026-10-07-proof2-subset.md:24 | Size and time are measured on the first real run, not here. Whether ON CONFLICT  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-daudit1-mounts.md** (2)
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:196 | The harness-rot rows above are not fixed (needs spec and further mount edits plu | MERGED, LANE-LEFT-OWED (TESTS-2, PR 1101 2026-10-11; lane ledger: [WORK: owed])
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:203 | Coordinator: a lane for the HARNESS ROT group (fixture props: `factcard`, `impac | MERGED, LANE-LEFT-OWED (TESTS-2, PR 1101 2026-10-11; lane ledger: [WORK: owed])

**docs/ops/session-log.d/2026-10-08-proof5-oracle-superuser.md** (1)
- docs/ops/session-log.d/2026-10-08-proof5-oracle-superuser.md:29 | Not run against a live stack (no container runtime here, no network). The `supab | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md** (1)
- docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md:82 | what exists today is fail-fast, not skip. Not altered. [NOT-WORK: scope statemen | DEFERRAL (scope statement; a workflow fails loud on missing )

**docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md** (3)
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:58 | No run id exists for this lane to export. [NOT-WORK: no dispatch was made; the w | DEFERRAL (no dispatch was made; the workflows with in-window)
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:59 | source-monitoring, spot-check-monthly and data-audit-lane stay disabled on GitHu | DEFERRAL (build mode holds them off, standing rule 16, coord)
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:62 | design-audit pull_request firings leave no harness_runs row. [NOT-WORK: a pull_r | DEFERRAL (a pull_request job must not hold the production cr)

**docs/ops/session-log.d/2026-10-10-smoke4-list-side-chooser.md** (1)
- docs/ops/session-log.d/2026-10-10-smoke4-list-side-chooser.md:29 | The first production run after this merges shows whether titles chosen by the ch | DEFERRAL (needs a production run of live-smoke.yml, which a )

### 10. Migrations and ledger: 10 work rows, 15 deferral rows

**docs/audits/remaining-build-register-2026-10-06.md** (1)
- docs/audits/remaining-build-register-2026-10-06.md:354 | 28. Production dependencies of `plan-drain.mjs` proven on fakes only; `db-catalo | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/audits/verify1-register-unknowns-2026-10-08.md** (1)
- docs/audits/verify1-register-unknowns-2026-10-08.md:76 | 00S1.3 "still unverified": now [CONFIRMED] missing (hierarchy) and partial (alia | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-03-l14.md** (1)
- docs/ops/session-log.d/2026-10-03-l14.md:74 | threshold-only gap rows. Option B (a structured column or vocabulary) was ruled  | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-04-s3a-intersections.md** (1)
- docs/ops/session-log.d/2026-10-04-s3a-intersections.md:28 | No live run, no migration, no apply. [NOT-WORK: build-mode hold, CLAUDE.md rule  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md** (1)
- docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md:53 | No question is answered (lane L4-B). No migration, no live run, nothing applied. | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-l4d-predictions-reliability.md** (1)
- docs/ops/session-log.d/2026-10-05-l4d-predictions-reliability.md:40 | Nothing applied; migrations 352 and 353 were not run against any Postgres. [NOT- | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md** (1)
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:145 | pre-migration-351 lineage pair also resolves (lineage passed), but this was prov | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-06-c-toggle-promote.md** (2)
- docs/ops/session-log.d/2026-10-06-c-toggle-promote.md:34 | Data migration, population-stage, two-track note: schema DDL applies via Supabas | OPEN (PLAN-2)
- docs/ops/session-log.d/2026-10-06-c-toggle-promote.md:35 | Owed migration: `notifications_kind_check` (migration 032 L48) still allows `'pr | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-06-g7-ui.md** (1)
- docs/ops/session-log.d/2026-10-06-g7-ui.md:27 | Nothing was run against a database or the real site; the pages were exercised on | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-g5-need.md** (1)
- docs/ops/session-log.d/2026-10-07-g5-need.md:70 | Nothing runs live: no migration 355 applied here, no dispatch, no data written.  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-proof4-attacks.md** (1)
- docs/ops/session-log.d/2026-10-07-proof4-attacks.md:22 | Not fired. Every SQL statement is checked against the migration files (table and | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-docs3-pass.md** (1)
- docs/ops/session-log.d/2026-10-08-docs3-pass.md:36 | The applied-migrations list in the addendum stops at the ledger sync of 13:24:44 | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-mig374-owed-schema.md** (1)
- docs/ops/session-log.d/2026-10-08-mig374-owed-schema.md:35 | A step-2 failure inside `fireSignpost` (outbox row not written after `fired_at`  | OPEN (WIRE-2)

**docs/ops/session-log.d/2026-10-08-migci-apply-on-stack.md** (1)
- docs/ops/session-log.d/2026-10-08-migci-apply-on-stack.md:257 | Branch protection is not edited (repository setting): the coordinator adds `Migr | DEFERRAL (operator item, repository setting recorded on the )

**docs/ops/session-log.d/2026-10-08-mkt1-market-components.md** (1)
- docs/ops/session-log.d/2026-10-08-mkt1-market-components.md:211 | No migration, no producer change, no live read or write. [NOT-WORK: build-mode h | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-obl2-obligation-objects.md** (1)
- docs/ops/session-log.d/2026-10-08-obl2-obligation-objects.md:54 | No population, no live read or write, no migration applied. [NOT-WORK: build-mod | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-qoc1-emitting-table-entries.md** (1)
- docs/ops/session-log.d/2026-10-08-qoc1-emitting-table-entries.md:20 | No migration, no live access, no change to any other file. [NOT-WORK: build-mode | DEFERRAL (hold: COMMON rule 5 no live access)

**docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md** (1)
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:71 | Nothing applied or run live; the source row is not registered; migration 379 not | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5; migration)

**docs/ops/session-log.d/2026-10-09-dfix2-surface-defects-residue.md** (1)
- docs/ops/session-log.d/2026-10-09-dfix2-surface-defects-residue.md:40 | fireSignpost still makes its writes as separate requests: stamping `fired_at` an | OPEN (WIRE-2)

**docs/ops/session-log.d/2026-10-09-mighist2-replay-residue.md** (2)
- docs/ops/session-log.d/2026-10-09-mighist2-replay-residue.md:35 | The first live run of the object check needs the production database (credential | DEFERRAL (build-mode production read, run by the data-audit )
- docs/ops/session-log.d/2026-10-09-mighist2-replay-residue.md:44 | [CONFIRMED: map read] 10 `outside:` entries (006_rls_multi_tenant, 007_full_brie | OPEN (EXEC-4)

**docs/ops/session-log.d/2026-10-10-dead1d-orphan-fetchers-and-stale-fixtures.md** (2)
- docs/ops/session-log.d/2026-10-10-dead1d-orphan-fetchers-and-stale-fixtures.md:33 | Migration 387 is NOT APPLIED; the executor applies it, then the EXEC-4 catalog r | OPEN (EXEC-4)
- docs/ops/session-log.d/2026-10-10-dead1d-orphan-fetchers-and-stale-fixtures.md:35 | db-catalog.json still lists `acquisition_backlog_v` and lacks the 14 tables, 1 v | OPEN (EXEC-4)

**docs/ops/session-log.md** (1)
- docs/ops/session-log.md:24693 | Dispatch of the `schema-vocabulary-inventory` maintenance step (register row g5- | OPEN (EXEC-4)

### 11. RLS and grants: 2 work rows, 0 deferral rows

**docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md** (1)
- docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md:73 | 8. The six lenses other than ATTACKED are owed for subsystem 11. [WORK: TESTS-2] | MERGED, LANE-LEFT-OWED (TESTS-2, PR 1101 2026-10-11; lane ledger: [WORK: owed])

**docs/ops/session-log.d/2026-10-10-cimin1-jobs-scoped-to-inputs.md** (1)
- docs/ops/session-log.d/2026-10-10-cimin1-jobs-scoped-to-inputs.md:37 | The first coordinator PR after this one is the live proof: on a docs-only PR the | UNASSIGNED (owed)

### 13. API routes: 1 work rows, 3 deferral rows

**docs/audits/aud-at2-route-guard-register-2026-10-08.md** (1)
- docs/audits/aud-at2-route-guard-register-2026-10-08.md:74 | Every other lens on subsystem 13: not run. [WORK: TESTS-2] | MERGED, LANE-LEFT-OWED (TESTS-2, PR 1101 2026-10-11; lane ledger: [WORK: owed])

**docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md** (1)
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:142 | Browser look at the real routes (Definition of done item 4) is not done here: no | DEFERRAL (browser look at the real routes needs a dev server)

**docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md** (1)
- docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md:44 | No browser look at the live route (no database here); the layout was measured on | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md** (1)
- docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md:97 | No live database read and no deploy: the page, loader and routes are proven on f | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

### 14. Components: 3 work rows, 12 deferral rows

**docs/ops/session-log.d/2026-10-02-l5.md** (1)
- docs/ops/session-log.d/2026-10-02-l5.md:101 | 0. **DESIGN CHANGES OWED** (kept per the coordinator's explicit instruction, eve | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md** (2)
- docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:75 | No real brief authored, nothing applied, no database touched. [NOT-WORK: build-m | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)
- docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:77 | find a drifted brief it must select all `theme_briefs` rows with `member_ids` (n | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-05-g7-tier.md** (1)
- docs/ops/session-log.d/2026-10-05-g7-tier.md:35 | No live database access or apply; nothing run against data. [NOT-WORK: build-mod | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-l4b-question-answers.md** (1)
- docs/ops/session-log.d/2026-10-05-l4b-question-answers.md:78 | No real answer authored; no batch under `batches/`. [NOT-WORK: build-mode hold,  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-p1-source-rating-display.md** (1)
- docs/ops/session-log.d/2026-10-05-p1-source-rating-display.md:117 | Claim matching against live rows is unverified (see Decisions). No live read was | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md** (2)
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:141 | unknown to this lane; the section renders from whatever exists and nothing when  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:149 | Ruling needed: the shelved `SectorSynopsisView` and `IntelligenceMetadataStrip`  | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md** (1)
- docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md:91 | design"; the artboard should be revised to match. [NOT-WORK: operator item, reco | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-07-par1-rows-meter.md** (1)
- docs/ops/session-log.d/2026-10-07-par1-rows-meter.md:85 | Artboard 22 is not in `docs/design`, so nothing was compared against its frames; | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-07-par1b-meter-spec.md** (1)
- docs/ops/session-log.d/2026-10-07-par1b-meter-spec.md:35 | The visible list-row value, pending the design answer above. [NOT-WORK: operator | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md** (1)
- docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md:43 | `RegionDimensionMatrix.tsx` was not changed to share the implied-base rule (outs | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md** (1)
- docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md:38 | Live assertions 1 (free text), 7, 11, 17 and the UI assertions are skipped by de | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-daudit1-mounts.md** (1)
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:197 | `ui/ActionCard` has no audit spec; the two retired specs' artboard values (03, 0 | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-10-daudit4-spec-values-follow-system.md** (1)
- docs/ops/session-log.d/2026-10-10-daudit4-spec-values-follow-system.md:30 | The seventh dimension row (D7 grid_intensity) is not on artboard 08, which draws | DEFERRAL (operator item, DESIGN CHANGES OWED list)

### 15. Scripts: 8 work rows, 11 deferral rows

**docs/audits/dead-code-census-2026-10-08.md** (2)
- docs/audits/dead-code-census-2026-10-08.md:1822 | 770596e6-aeb2-46f9-ad29-a83e16f06fad: eFTI 2020/1056, pre-cutover manual-intake  | DEFERRAL (hold: population after all layers, CLAUDE.md rule )
- docs/audits/dead-code-census-2026-10-08.md:1823 | 68af8b45-fbbf-4ba1-add8-2c1761d2d120: waste 2024/1157, pre-cutover manual-intake | DEFERRAL (hold: population after all layers, CLAUDE.md rule )

**docs/ops/session-log.d/2026-10-01-r68-gates.md** (1)
- docs/ops/session-log.d/2026-10-01-r68-gates.md:309 | subsequent verification used scoped `--function=` runs and touched test files on | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-02-model-ids.md** (1)
- docs/ops/session-log.d/2026-10-02-model-ids.md:106 | "ready to push." [NOT-WORK: build-mode hold, COMMON rule 9] | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-05-g7-corrections.md** (1)
- docs/ops/session-log.d/2026-10-05-g7-corrections.md:36 | The SQL has not run against any database (none available to the lane). It is cov | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md** (1)
- docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md:29 | Stored bodies that carry a marker today are neither repaired nor counted here: n | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md** (2)
- docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md:78 | Not applied anywhere; no live read or write. The repair script has not been run. | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)
- docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md:86 | `node fsi-app/scripts/maintenance/repair-smoke-account.mjs --arg <account email> | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-06-g6-drain.md** (1)
- docs/ops/session-log.d/2026-10-06-g6-drain.md:25 | Not run live: no database or network. Production deps in `plan-drain.mjs` (`runE | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md** (1)
- docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md:34 | Supabase CLI key names, Postgres version, `supabase status -o env` key names (`S | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md** (1)
- docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md:98 | The SeriesProvenance swap in the methodology drawer (see ruling 7). [WORK: PLAN- | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md** (2)
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:174 | `operations-matrix.json` still has a forbid on `td:not(:has(.cl-absence))` ("no  | MERGED, LANE-LEFT-OWED (TESTS-2, PR 1101 2026-10-11; lane ledger: [WORK: owed])
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:175 | `open-state-sweep.mjs` and `overflow-sweep.mjs` (not in the write set) iterate e | MERGED, LANE-LEFT-OWED (TESTS-2, PR 1101 2026-10-11; lane ledger: [WORK: owed])

**docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md** (1)
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:72 | EPN and SPN release files were not fetched (their parsing is the same code, prov | DEFERRAL (hold: COMMON rule 5 no network fetches)

**docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md** (1)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:47 | AT1 item 6 view and function probes (derived_values_admissible, research_assessm | MERGED, NOT-EVIDENT (TESTS-2, PR 1101 2026-10-11)

**docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md** (4)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:51 | audit-catalogue:43: the 47 empty and 31 partial cells (O-001 to O-047, P-001 to  | UNASSIGNED (owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:53 | daudit2:174: the stale `td:not(:has(.cl-absence))` exclusion clause in `operatio | UNASSIGNED (owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:54 | daudit2:175: whether `open-state-sweep.mjs` and `overflow-sweep.mjs` should swee | UNASSIGNED (owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:60 | [auth.email] enable_signup=false in fsi-app/supabase/config.toml disables email  | UNASSIGNED (owed)

### 16. Producers: 19 work rows, 25 deferral rows

**docs/audits/obl1-obligations-register-2026-10-08.md** (7)
- docs/audits/obl1-obligations-register-2026-10-08.md:246 | Whether any of the four instruments has rows in live `obligations` or `item_forw | DEFERRAL (live question, answered at population, rule 16)
- docs/audits/obl1-obligations-register-2026-10-08.md:247 | Which `compliance_object_tags` the four live items carry. [HYPOTHESIS] [NOT-WORK | DEFERRAL (live question, answered at population, rule 16)
- docs/audits/obl1-obligations-register-2026-10-08.md:248 | Whether item 9566075e is the Empowering Consumers directive. [HYPOTHESIS] [NOT-W | DEFERRAL (live question, answered at population, rule 16)
- docs/audits/obl1-obligations-register-2026-10-08.md:249 | Whether `origin/master` differs from the checkout at 6028b228 (not fetched). [NO | DEFERRAL (live question, answered at population, rule 16)
- docs/audits/obl1-obligations-register-2026-10-08.md:255 | CountEmissions EU (item cd1083c9; the earlier item 7aaecc81 shows 0 events). [NO | DEFERRAL (hold: population after all layers, CLAUDE.md rule )
- docs/audits/obl1-obligations-register-2026-10-08.md:260 | importer of record, Empowering Consumers as the forwarder's own marketing claims | DEFERRAL (hold: population after all layers, CLAUDE.md rule )
- docs/audits/obl1-obligations-register-2026-10-08.md:276 | banner) is not evidenced as met for any instrument. [NOT-WORK: build-mode hold,  | DEFERRAL (hold: population after all layers, CLAUDE.md rule )

**docs/audits/remaining-build-register-2026-10-06.md** (1)
- docs/audits/remaining-build-register-2026-10-06.md:332 | 8. Whole-corpus typing backfill (23,709 untyped edges) / system map; buildout st | DEFERRAL (Stage 9 precondition, CLAUDE.md rule 16)

**docs/audits/verify1-register-unknowns-2026-10-08.md** (1)
- docs/audits/verify1-register-unknowns-2026-10-08.md:67 | 8. 01S4 #1 banner form, #2 applicability panel and recorded exclusion, #4 T-90/T | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-02-l3.md** (2)
- docs/ops/session-log.d/2026-10-02-l3.md:187 | resolves) is explicitly OUT of this lane's write set per the brief and is a foll | OPEN (PLAN-2)
- docs/ops/session-log.d/2026-10-02-l3.md:197 | 5. No DB credential used anywhere in this lane; no live write of any kind. [NOT- | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-02-l6.md** (2)
- docs/ops/session-log.d/2026-10-02-l6.md:104 | brief's own R14 compliance section). [NOT-WORK: build-mode hold, CLAUDE.md rule  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)
- docs/ops/session-log.d/2026-10-02-l6.md:108 | lane's write set). [WORK: PLAN-2] | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-02-l8.md** (1)
- docs/ops/session-log.d/2026-10-02-l8.md:477 | guarded-update + read-back-verify pattern. [NOT-WORK: build-mode hold, CLAUDE.md | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-02-l9.md** (1)
- docs/ops/session-log.d/2026-10-02-l9.md:152 | coordinator's own landing pass run the full suite once, cleanly, before merge. [ | DEFERRAL (hold: COMMON rule 9)

**docs/ops/session-log.d/2026-10-03-external-only.md** (2)
- docs/ops/session-log.d/2026-10-03-external-only.md:59 | Their producers keep an operator `--csv` path only. [WORK: PLAN-2] | OPEN (PLAN-2)
- docs/ops/session-log.d/2026-10-03-external-only.md:65 | verified badge. Whether to keep the key derivation is a separate ruling. [WORK:  | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-03-l-corridor.md** (1)
- docs/ops/session-log.d/2026-10-03-l-corridor.md:253 | 1. **Live state-distribution run** - not performed, no DB credentials; see Adden | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-03-l10.md** (1)
- docs/ops/session-log.d/2026-10-03-l10.md:127 | supabase-server.ts` was not in this lane's write set. [WORK: PLAN-2] | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-03-l11.md** (1)
- docs/ops/session-log.d/2026-10-03-l11.md:294 | the producer permanently dry-only. Decision-ready either way: the mechanism exis | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-03-l13.md** (1)
- docs/ops/session-log.d/2026-10-03-l13.md:201 | this same dispatch. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-03-l14.md** (1)
- docs/ops/session-log.d/2026-10-03-l14.md:76 | passes none and every class reads absent. [WORK: PLAN-2] | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-04-s1a-source-register.md** (1)
- docs/ops/session-log.d/2026-10-04-s1a-source-register.md:20 | No live run, no data population (operator ruling 2026-10-04). Pending marker `br | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-04-s1d-walker-registers.md** (1)
- docs/ops/session-log.d/2026-10-04-s1d-walker-registers.md:43 | No live run, no DB access, no apply. [NOT-WORK: build-mode hold, CLAUDE.md rule  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md** (1)
- docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:79 | (corpus-turn step 6); the coordinator decides. [WORK: PLAN-2] | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-05-l4b-question-answers.md** (1)
- docs/ops/session-log.d/2026-10-05-l4b-question-answers.md:77 | population-turn raises them at mint (the generator is a population-turn flywheel | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-07-g5-read.md** (1)
- docs/ops/session-log.d/2026-10-07-g5-read.md:100 | Adopted `term` and `material` kinds have no other reader yet (material only mint | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-07-ops1-maintenance-health.md** (1)
- docs/ops/session-log.d/2026-10-07-ops1-maintenance-health.md:70 | Live timing of any of this: confirmed after merge by the coordinator's executor. | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md** (1)
- docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md:129 | The data move is staged, not run (no population before every layer is complete). | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-s8b-tag-attribution.md** (1)
- docs/ops/session-log.d/2026-10-07-s8b-tag-attribution.md:23 | No live-data check; no data population. [NOT-WORK: build-mode hold, CLAUDE.md ru | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-s8d-portfolio.md** (3)
- docs/ops/session-log.d/2026-10-07-s8d-portfolio.md:32 | Add-to-portfolio controls on the detail pages: owed to a follow-up after S8-A la | OPEN (PLAN-2)
- docs/ops/session-log.d/2026-10-07-s8d-portfolio.md:33 | The scope chip, triggers and cross-surface digest (the rest of L18). [WORK: PLAN | OPEN (PLAN-2)
- docs/ops/session-log.d/2026-10-07-s8d-portfolio.md:34 | Entity canonical page (see above). [WORK: PLAN-2] | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-07-s8f-industry-statements.md** (1)
- docs/ops/session-log.d/2026-10-07-s8f-industry-statements.md:19 | No live counts were re-queried (no database). Every count is marked `[HYPOTHESIS | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md** (1)
- docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md:45 | The dimension facet does not scope the block (decision above); the coordinator m | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md** (1)
- docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md:37 | No seed values (levels, relations, aliases): population is another lane. No scre | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md** (1)
- docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md:96 | `suppressed` has no live call site. `ObligationRegisterFilterBar` states no hidd | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md** (1)
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:31 | Items 6 to 11 (population-stage repairs and measurements) are `[NOT-WORK: Stage  | DEFERRAL (Stage 9 precondition, CLAUDE.md rule 16)

**docs/ops/session-log.d/2026-10-08-s8e5-aux-energy.md** (1)
- docs/ops/session-log.d/2026-10-08-s8e5-aux-energy.md:123 | Nothing applied; no live row; no scrape or population. [NOT-WORK: build-mode hol | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md** (3)
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:73 | Offers made/accepted (PastConnectionActivity) are not mapped. [WORK: PLAN-2] | OPEN (PLAN-2)
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:78 | A bulk insert writes one outbox row per substation (384 for three areas), each n | DEFERRAL (Stage 9 precondition, producer population residue,)
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:79 | The first live dry dispatch (`producer=registry registry_producer=ukpn-capacity- | DEFERRAL (Stage 9 precondition, producer population residue,)

**docs/ops/session-log.d/2026-10-09-cifix1.md** (1)
- docs/ops/session-log.d/2026-10-09-cifix1.md:36 | Template-prefix and cross-statement doc reads are not detected by the scan (see  | UNASSIGNED (owed)

**docs/ops/session-log.d/2026-10-10-harness1.md** (1)
- docs/ops/session-log.d/2026-10-10-harness1.md:27 | The `mint-run-004` row still reads `execute` until the executor runs the correct | UNASSIGNED (owed)

### 17. Docs and INDEX: 10 work rows, 1 deferral rows

**docs/audits/plan2-build-status-2026-10-09.md** (1)
- docs/audits/plan2-build-status-2026-10-09.md:4 | Scope: every `[WORK: PLAN-2]` line on origin/master under docs/audits and docs/o | OPEN (PLAN-2)

**docs/audits/verify1-register-unknowns-2026-10-08.md** (1)
- docs/audits/verify1-register-unknowns-2026-10-08.md:80 | 00S4 "Coverage Index exists, first-class surface unverified": the Index is admin | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-03-l11.md** (1)
- docs/ops/session-log.d/2026-10-03-l11.md:296 | lane prepared the runbook, did not chase the ask itself. [NOT-WORK: operator ite | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-04-s0b-baseline-renewal-tool.md** (1)
- docs/ops/session-log.d/2026-10-04-s0b-baseline-renewal-tool.md:45 | expiry date untouched. [WORK: DORMANT-1] | MERGED, NOT-EVIDENT (DORMANT-1, PR 1056 2026-10-09)

**docs/ops/session-log.d/2026-10-08-audit-catalogue.md** (1)
- docs/ops/session-log.d/2026-10-08-audit-catalogue.md:43 | Owed: 47 empty cells and 31 partial-only cells, listed in section 3e of the runb | MERGED, LANE-LEFT-OWED (TESTS-2, PR 1101 2026-10-11; lane ledger: [WORK: owed])

**docs/ops/session-log.d/2026-10-10-cifix2.md** (1)
- docs/ops/session-log.d/2026-10-10-cifix2.md:33 | A docs path that reaches a read only through array iteration or an object field  | UNASSIGNED (owed)

**docs/ops/session-log.d/2026-10-10-cimin0-phase0-minutes.md** (1)
- docs/ops/session-log.d/2026-10-10-cimin0-phase0-minutes.md:23 | Vercel behaviour for the token is unconfirmed in `docs/runbooks/dispatch-discipl | UNASSIGNED (owed)

**docs/ops/session-log.d/2026-10-10-docs5.md** (3)
- docs/ops/session-log.d/2026-10-10-docs5.md:139 | `docs/inventories/db-check-constraints.json` is not regenerated: the generator r | UNASSIGNED (coordinator)
- docs/ops/session-log.d/2026-10-10-docs5.md:140 | The ADR-XXX draft in `TRAIN-ASSEMBLY-RUNBOOK.md` is neither adopted nor dropped  | UNASSIGNED (coordinator)
- docs/ops/session-log.d/2026-10-10-docs5.md:141 | The identity of the "two standing reds" is not recorded (see staged item 6). [WO | UNASSIGNED (coordinator)

**docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md** (1)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:50 | aud-at1:73 and aud-at2:74: the six lenses other than ATTACKED for subsystem 11 a | UNASSIGNED (owed)

### 18. Skills, dispatch contracts and the doctrine's own claims: 1 work rows, 1 deferral rows

**docs/audits/remaining-build-register-2026-10-06.md** (1)
- docs/audits/remaining-build-register-2026-10-06.md:342 | 16. GUARD-1 token (ADR-016 item b); provenance-heal `+strip-unprovable` opt-in / | DEFERRAL (operator item, recorded on the board)

**docs/ops/session-log.d/2026-10-10-docs5.md** (1)
- docs/ops/session-log.d/2026-10-10-docs5.md:138 | The code and root `CLAUDE.md` edits in staged item 7 are outside this lane's wri | UNASSIGNED (coordinator)

### -. Unclassified (cross-cutting): 4 work rows, 8 deferral rows

**docs/audits/remaining-build-register-2026-10-06.md** (7)
- docs/audits/remaining-build-register-2026-10-06.md:330 | 6. Strip ledger blocks in 5 `full_brief` rows and 4 section rows (ids in P3 log) | DEFERRAL (Stage 9 precondition, CLAUDE.md rule 16)
- docs/audits/remaining-build-register-2026-10-06.md:331 | 7. Re-author the 9 pre-contract theme briefs (pre-351 shape) / s3c-theme-brief-b | DEFERRAL (Stage 9 precondition, CLAUDE.md rule 16)
- docs/audits/remaining-build-register-2026-10-06.md:334 | 10. `origin_class` NULL on 1,222 items; `source_role` NULL on 874 sources (2026- | DEFERRAL (Stage 9 precondition, CLAUDE.md rule 16)
- docs/audits/remaining-build-register-2026-10-06.md:346 | 20. Per-claim tier matching against live rows unverified / p1-source-rating-disp | DEFERRAL (hold: COMMON rule 5 (no live read))
- docs/audits/remaining-build-register-2026-10-06.md:363 | 33. EIA secret `EIA_API_KEY`; EEX licence; SBTi licence for apply / system map [ | DEFERRAL (operator item, recorded on the board)
- docs/audits/remaining-build-register-2026-10-06.md:364 | 34. Public-source intake for auxiliary energy and indexation mechanics / buildou | OPEN (PLAN-2)
- docs/audits/remaining-build-register-2026-10-06.md:373 | 39. All of Stage 8 (items S8-1 to S8-5, S8-8 to S8-10) [WORK: PLAN-2] | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-02-ra-wf.md** (1)
- docs/ops/session-log.d/2026-10-02-ra-wf.md:166 | printed candidate count. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON  | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)

**docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md** (2)
- docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md:31 | Nothing was dispatched, and no real site was signed in to. [NOT-WORK: build-mode | DEFERRAL (hold: CLAUDE.md rule 16 / COMMON rule 5)
- docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md:37 | Previews are excluded from the automatic trigger; a protection bypass header is  | OPEN (PLAN-2)

**docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md** (2)
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:53 | No live read was made; the register's counts (23,709 untyped edges, 1,222 NULL ` | DEFERRAL (hold: COMMON rule 5)
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:58 | The ten provisional rows above await the coordinator's confirmation of lane. [WO | UNASSIGNED (coordinator-disposit)

## 4. Appendix: every row of the 419 and the 156

One line per row: `file:line | STATE | detail`. Mirror rows show what they mirror.

### 4a. WORK rows (419)

- docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md:71 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md:73 | MERGED / LANE-LEFT-OWED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at2-route-guard-register-2026-10-08.md:73 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at2-route-guard-register-2026-10-08.md:74 | MERGED / LANE-LEFT-OWED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at2-route-guard-register-2026-10-08.md:75 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at3-gates-attacked-2026-10-08.md:510 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at3-gates-attacked-2026-10-08.md:514 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at3-gates-attacked-2026-10-08.md:528 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/audits/aud-at4-gates-attacked-2026-10-08.md:457 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:240 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:241 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:244 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:247 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:248 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/audits/dead-code-census-2026-10-08.md:1511 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/audits/dead-code-census-2026-10-08.md:1553 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/audits/dead-code-census-2026-10-08.md:1708 | OPEN (EXEMPT-1; no log, no PR for EXEMPT-1)
- docs/audits/plan2-build-status-2026-10-09.md:4 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/remaining-build-register-2026-10-06.md:44 | MERGED / COVERED (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:305 | MERGED / COVERED (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:307 | MERGED / COVERED (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:312 | MERGED / COVERED (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:340 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/audits/remaining-build-register-2026-10-06.md:352 | MERGED / NOT-EVIDENT (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:353 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/audits/remaining-build-register-2026-10-06.md:364 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/remaining-build-register-2026-10-06.md:373 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/remaining-build-register-2026-10-06.md:374 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/remaining-build-register-2026-10-06.md:390 | MERGED / COVERED (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:392 | MERGED / NOT-EVIDENT (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/remaining-build-register-2026-10-06.md:416 | MERGED / NOT-EVIDENT (DORMANT-1; PR 1056 2026-10-09)
- docs/audits/verify1-register-unknowns-2026-10-08.md:67 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/verify1-register-unknowns-2026-10-08.md:76 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/verify1-register-unknowns-2026-10-08.md:77 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/verify1-register-unknowns-2026-10-08.md:80 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/audits/verify1-register-unknowns-2026-10-08.md:84 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/audits/verify1-register-unknowns-2026-10-08.md:85 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/audits/verify1-register-unknowns-2026-10-08.md:87 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-01-r11-checks.md:144 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-02-l3.md:187 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-02-l6.md:108 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-02-model-ids.md:104 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-03-external-only.md:59 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-03-external-only.md:65 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-03-l10.md:127 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-03-l13.md:203 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/ops/session-log.d/2026-10-03-l14.md:74 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-03-l14.md:76 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-03-l14.md:77 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-03-rw-wf.md:131 | MERGED / COVERED (CIFIX-2; PR 1097 2026-10-11)
- docs/ops/session-log.d/2026-10-04-s0b-baseline-renewal-tool.md:45 | MERGED / NOT-EVIDENT (DORMANT-1; PR 1056 2026-10-09)
- docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md:24 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:77 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:79 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-05-g6-gates.md:79 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-05-g6-gates.md:84 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md:37 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md:65 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-05-l4b-question-answers.md:77 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:149 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-06-c-toggle-promote.md:34 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-06-c-toggle-promote.md:35 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-06-c-toggle-promote.md:36 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-06-g5-terms.md:69 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-07-dead2-schema.md:28 | MERGED / COVERED (DEAD-1d; PR 1093 2026-10-11)
- docs/ops/session-log.d/2026-10-07-g5-read.md:99 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-07-g5-read.md:100 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-07-idx1-section-index.md:46 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-07-mighist1-recover.md:67 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-07-par1-rows-meter.md:87 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-07-par2-bands-typography.md:29 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-07-par2-bands-typography.md:30 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md:134 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-07-s8b-tag-attribution.md:24 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-07-s8c-count-membership.md:31 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-07-s8d-portfolio.md:32 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-07-s8d-portfolio.md:33 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-07-s8d-portfolio.md:34 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-07-s8f-industry-statements.md:23 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md:43 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md:45 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md:37 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-08-audit-catalogue.md:43 | MERGED / LANE-LEFT-OWED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-audwire1-orphan-audit.md:27 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/ops/session-log.d/2026-10-08-chain4-downstream-edges.md:51 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md:96 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md:98 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:196 | MERGED / LANE-LEFT-OWED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:203 | MERGED / LANE-LEFT-OWED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:173 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:174 | MERGED / LANE-LEFT-OWED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:175 | MERGED / LANE-LEFT-OWED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-dead3-docs.md:100 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-dead3-docs.md:101 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-dead3-docs.md:102 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-dead3-docs.md:106 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-dead3-docs.md:107 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-dfix1-surface-defects.md:51 | MERGED / COVERED (DEAD-1c; PR 1087 2026-10-10)
- docs/ops/session-log.d/2026-10-08-dfix1-surface-defects.md:59 | MERGED / COVERED (DAUDIT-4; PR 1092 2026-10-11)
- docs/ops/session-log.d/2026-10-08-dfix1-surface-defects.md:63 | MERGED / COVERED (DFIX-2; PR 1073 2026-10-09)
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:58 | UNASSIGNED (token names no lane: coordinator-disposi)
- docs/ops/session-log.d/2026-10-08-docs3-pass.md:35 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-docs3-pass.md:40 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-docs3-pass.md:41 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-docs3-pass.md:42 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-docs4-pass.md:30 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-docs4-pass.md:34 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-docs4-pass.md:35 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:11 | UNASSIGNED (token names no lane: <lane id or PR N>)
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:908 | LOG-ONLY (DISPO-1; log 2026-10-09-dispo1-dispositions.md; P)
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:914 | LOG-ONLY (DISPO-1; log 2026-10-09-dispo1-dispositions.md; P)
- docs/ops/session-log.d/2026-10-08-gate1-rules.md:35 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-gate1-rules.md:36 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-gate2-hooks.md:38 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-gate2-hooks.md:39 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-gate8-fitness-honest-forms.md:44 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/ops/session-log.d/2026-10-08-mig374-owed-schema.md:35 | OPEN (WIRE-2; no log, no PR for WIRE-2)
- docs/ops/session-log.d/2026-10-08-migci-apply-on-stack.md:258 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-08-routes1-guard-fixes.md:80 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:73 | OPEN (PLAN-2; no log, no PR for PLAN-2)
- docs/ops/session-log.d/2026-10-08-sec4-definer-hygiene.md:69 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-08-skillslim1-core-and-references.md:90 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-09-chain5-chain-steps-on-stack.md:14 | MERGED / COVERED (CHAIN-5; PR 1072 2026-10-09)
- docs/ops/session-log.d/2026-10-09-cifix1.md:24 | MERGED / COVERED (CIFIX-2; PR 1097 2026-10-11)
- docs/ops/session-log.d/2026-10-09-cifix1.md:36 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-09-dfix2-surface-defects-residue.md:40 | OPEN (WIRE-2; no log, no PR for WIRE-2)
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:10 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:56 now [CLOSED: PR 997])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:11 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:58 now [NOT-WORK: historic firing record, no action])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:12 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:72 now [CLOSED: PR 997])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:13 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:125 now [CLOSED: PR 1086])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:14 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:129 now [NOT-WORK: historic CI firing classification; the t])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:15 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:161 now [CLOSED: PR 998])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:16 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:162 now [NOT-WORK: history of an already fixed defect, no a])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:17 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:175 now [CLOSED: PR 998])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:18 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:179 now [CLOSED: PR 998])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:19 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:250 now [CLOSED: PR 997])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:20 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:260 now [CLOSED: PR 998])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:21 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:243 now [NOT-WORK: overlap statement; ADR-046 holds the per])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:22 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:261 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:23 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:409 now [CLOSED: PR 1039])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:24 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:507 now [CLOSED: PR 1039])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:25 | SUPERSEDED-CLOSED (target gate-evaluation-2026-10-08:382 now [CLOSED: PR 1002])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:26 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:393 now [NOT-WORK: overlap statement; the allowlist expiry ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:27 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:411 now [NOT-WORK: overlap statement; the train counter fin])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:28 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:493 now [NOT-WORK: overlap statement, ADR-046 dispositions ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:29 | SUPERSEDED-NOT-WORK (target gate-evaluation-2026-10-08:495 now [NOT-WORK: overlap statement, ADR-046 dispositions ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:30 | SUPERSEDED-CLOSED (target aud-at1-rls-grants-attacked-2026-10-08:66 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:31 | SUPERSEDED-CLOSED (target aud-at1-rls-grants-attacked-2026-10-08:67 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:32 | SUPERSEDED-CLOSED (target aud-at1-rls-grants-attacked-2026-10-08:70 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:33 | DUP of audits/aud-at1-rls-grants-attacked-2026-10-08.md:71 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:34 | DUP of audits/aud-at1-rls-grants-attacked-2026-10-08.md:73 => MERGED / LANE-LEFT-OWED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:35 | SUPERSEDED-CLOSED (target aud-at1-rls-grants-attacked-2026-10-08:245 now [CLOSED: PR 1071])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:36 | SUPERSEDED-REFUTED (target aud-at1-rls-grants-attacked-2026-10-08:247 now [REFUTED: profiles, org_memberships, organizations])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:37 | DUP of audits/aud-at3-gates-attacked-2026-10-08.md:510 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:38 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:511 now [NOT-WORK: no blocking claim to attack, each hook e])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:39 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:512 now [NOT-WORK: needs a throwaway Claude Code session st])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:40 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:513 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:41 | DUP of audits/aud-at3-gates-attacked-2026-10-08.md:514 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:42 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:515 now [NOT-WORK: the path form a live Claude Code session])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:43 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:521 now [NOT-WORK: ADR-046 2026-10-08 addendum: editing the])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:44 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:522 now [NOT-WORK: ADR-046 addendum: --no-verify, core.hook])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:45 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:523 now [NOT-WORK: ADR-046 addendum: deleting refs/remotes/])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:46 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:524 now [NOT-WORK: ADR-046 addendum: --no-verify, core.hook])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:47 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:526 now [CLOSED: PR 1042])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:48 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:527 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:49 | DUP of audits/aud-at3-gates-attacked-2026-10-08.md:528 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:50 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:529 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:51 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:530 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:52 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:531 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:53 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:532 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:54 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:533 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:55 | SUPERSEDED-CLOSED (target aud-at3-gates-attacked-2026-10-08:534 now [CLOSED: PR 1040])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:56 | SUPERSEDED-NOT-WORK (target aud-at3-gates-attacked-2026-10-08:535 now [NOT-WORK: a junction nested one level inside a rea])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:57 | DUP of audits/aud-at4-gates-attacked-2026-10-08.md:457 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:58 | SUPERSEDED-CLOSED (target aud-at4-gates-attacked-2026-10-08:458 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:59 | SUPERSEDED-NOT-WORK (target aud-at4-gates-attacked-2026-10-08:459 now [NOT-WORK: the live-catalog leg needs the productio])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:60 | SUPERSEDED-CLOSED (target aud-at4-gates-attacked-2026-10-08:460 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:61 | SUPERSEDED-CLOSED (target aud-at4-gates-attacked-2026-10-08:461 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:62 | DUP of audits/aud-at5-gates-attacked-2026-10-08.md:240 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:63 | DUP of audits/aud-at5-gates-attacked-2026-10-08.md:241 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:64 | SUPERSEDED-NOT-WORK (target aud-at5-gates-attacked-2026-10-08:242 now [NOT-WORK: no actionlint binary on this machine and])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:65 | SUPERSEDED-NOT-WORK (target aud-at5-gates-attacked-2026-10-08:243 now [NOT-WORK: browser-only leg, no browser in a lane; ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:66 | DUP of audits/aud-at5-gates-attacked-2026-10-08.md:244 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:67 | SUPERSEDED-NOT-WORK (target aud-at5-gates-attacked-2026-10-08:245 now [NOT-WORK: GitHub branch protection is a repository])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:68 | SUPERSEDED-NOT-WORK (target aud-at5-gates-attacked-2026-10-08:246 now [NOT-WORK: needs production credentials])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:69 | DUP of audits/aud-at5-gates-attacked-2026-10-08.md:247 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:70 | DUP of audits/aud-at5-gates-attacked-2026-10-08.md:248 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:71 | SUPERSEDED-CLOSED (target aud-at5-gates-attacked-2026-10-08:254 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:72 | DUP of audits/aud-at2-route-guard-register-2026-10-08.md:73 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:73 | DUP of audits/aud-at2-route-guard-register-2026-10-08.md:74 => MERGED / LANE-LEFT-OWED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:74 | DUP of audits/aud-at2-route-guard-register-2026-10-08.md:75 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:82 | DUP of audits/verify1-register-unknowns-2026-10-08.md:67 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:83 | DUP of audits/verify1-register-unknowns-2026-10-08.md:76 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:84 | SUPERSEDED-REFUTED (target verify1-register-unknowns-2026-10-08:77 now [REFUTED: ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:85 | SUPERSEDED-CLOSED (target verify1-register-unknowns-2026-10-08:79 now [CLOSED: PR 1024])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:86 | DUP of audits/verify1-register-unknowns-2026-10-08.md:80 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:87 | SUPERSEDED-CLOSED (target verify1-register-unknowns-2026-10-08:70 now [CLOSED: PR 1024])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:88 | DUP of audits/verify1-register-unknowns-2026-10-08.md:84 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:89 | DUP of audits/verify1-register-unknowns-2026-10-08.md:85 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:90 | DUP of audits/verify1-register-unknowns-2026-10-08.md:87 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:91 | SUPERSEDED-NOT-WORK (target migration-history-2026-10-07:33 now [NOT-WORK: publishable anon key, replaced by a Vaul])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:92 | SUPERSEDED-NOT-WORK (target migration-history-2026-10-07:35 now [NOT-WORK: the contract now forbids a lane writing ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:93 | SUPERSEDED-CLOSED (target migration-history-2026-10-07:37 now [CLOSED: PR 1085])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:101 | DUP of audits/dead-code-census-2026-10-08.md:1511 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:102 | DUP of audits/dead-code-census-2026-10-08.md:1553 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:103 | SUPERSEDED-NOT-WORK (target dead-code-census-2026-10-08:1629 now [NOT-WORK: F34 ALLOWLIST entry with its reason reco])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:104 | SUPERSEDED-NOT-WORK (target dead-code-census-2026-10-08:1691 now [NOT-WORK: F54 EXEMPT_STEPS entry with its reason r])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:105 | DUP of audits/dead-code-census-2026-10-08.md:1708 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:108 | DUP of ops/session-log.d/2026-10-01-r11-checks.md:144 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:110 | ORPHAN UNASSIGNED ()
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:111 | DUP of ops/session-log.d/2026-10-02-l3.md:187 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:112 | SUPERSEDED-CLOSED (target 2026-10-02-l3:188(+6) now [CLOSED: PR 1059])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:113 | SUPERSEDED-REFUTED (target 2026-10-02-l5:102 now [REFUTED: `git grep -n tagsFacet origin/master -- ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:114 | SUPERSEDED-CLOSED (target 2026-10-02-l5:103 now [CLOSED: PR 1039])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:115 | DUP of ops/session-log.d/2026-10-02-l6.md:108 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:116 | SUPERSEDED-NOT-WORK (target 2026-10-02-l7:131(+3) now [NOT-WORK: scope statement, no defect])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:117 | DUP of ops/session-log.d/2026-10-02-model-ids.md:104 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:118 | SUPERSEDED-CLOSED (target 2026-10-02-ra-wf:167(+3) now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:119 | DUP of ops/session-log.d/2026-10-03-external-only.md:59 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:120 | SUPERSEDED-REFUTED (target 2026-10-03-external-only:60(+3) now [REFUTED: PLANNING_ASSUMPTION_SHIFT_ABSENCE = "no ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:121 | DUP of ops/session-log.d/2026-10-03-external-only.md:65 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:122 | SUPERSEDED-NOT-WORK (target 2026-10-03-external-only:66(+1) now [NOT-WORK: regenerated by the rendering job])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:123 | SUPERSEDED-NOT-WORK (target 2026-10-03-external-only:68(+1) now [NOT-WORK: regenerated by the executor refresh])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:124 | DUP of ops/session-log.d/2026-10-03-l10.md:127 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:125 | SUPERSEDED-NOT-WORK (target 2026-10-03-l11:297(+2) now [NOT-WORK: scope statement, no defect])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:126 | SUPERSEDED-NOT-WORK (target 2026-10-03-l11:300 now [NOT-WORK: scope statement, no defect])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:127 | SUPERSEDED-REFUTED (target 2026-10-03-l12:160(+3) now [REFUTED: already fixed by the L12 addendum, showF])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:128 | SUPERSEDED-REFUTED (target 2026-10-03-l12:164(+2) now [REFUTED: already fixed by the L12 addendum, index])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:129 | DUP of ops/session-log.d/2026-10-03-l13.md:203 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:130 | DUP of ops/session-log.d/2026-10-03-l14.md:74 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:131 | DUP of ops/session-log.d/2026-10-03-l14.md:76 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:132 | DUP of ops/session-log.d/2026-10-03-l14.md:77 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:133 | SUPERSEDED-CLOSED (target 2026-10-03-rw-wf:116(+6) now [CLOSED: PR 1056])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:134 | DUP of ops/session-log.d/2026-10-03-rw-wf.md:131 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:135 | DUP of ops/session-log.d/2026-10-04-s0b-baseline-renewal-tool.md:45 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:136 | SUPERSEDED-CLOSED (target 2026-10-04-s0b-baseline-renewal-tool:50(+5) now [CLOSED: PR 1056])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:137 | SUPERSEDED-CLOSED (target 2026-10-04-s1a-source-register:21 now [CLOSED: PR 1073])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:138 | DUP of ops/session-log.d/2026-10-04-s1b-host-verdicts.md:24 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:139 | SUPERSEDED-CLOSED (target 2026-10-04-s1c-tier-movement:32 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:140 | DUP of ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:77 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:141 | DUP of ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:79 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:142 | DUP of ops/session-log.d/2026-10-05-g6-gates.md:79 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:143 | DUP of ops/session-log.d/2026-10-05-g6-gates.md:84 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:144 | SUPERSEDED-CLOSED (target 2026-10-05-g7-corrections:37 now [CLOSED: PR 1073])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:145 | SUPERSEDED-CLOSED (target 2026-10-05-g7-corrections:38 now [CLOSED: PR 1073])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:146 | DUP of ops/session-log.d/2026-10-05-gates2-live-smoke.md:37 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:147 | DUP of ops/session-log.d/2026-10-05-l4a-questions-on-change.md:65 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:148 | DUP of ops/session-log.d/2026-10-05-l4b-question-answers.md:77 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:149 | SUPERSEDED-CLOSED (target 2026-10-05-l4d-predictions-reliability:39 now [CLOSED: PR 1046])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:150 | SUPERSEDED-CLOSED (target 2026-10-05-p1-source-rating-display:114(+1) now [CLOSED: PR 947])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:151 | SUPERSEDED-REFUTED (target 2026-10-05-p1-source-rating-display:116 now [REFUTED: PAR-1 (2026-10-07) replaced the 768 to 1])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:152 | SUPERSEDED-REFUTED (target 2026-10-05-p2-grade-inference-chips:106(+2) now [REFUTED: PAR-1 (2026-10-07) replaced the 768 to 1])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:153 | SUPERSEDED-CLOSED (target 2026-10-05-p2-grade-inference-chips:109 now [CLOSED: PR 1059])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:154 | SUPERSEDED-NOT-WORK (target 2026-10-05-s1e-source-chain:58 now [NOT-WORK: needs a chained production row; build mo])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:155 | SUPERSEDED-CLOSED (target 2026-10-05-s1e-source-chain:60 now [CLOSED: PR 980])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:156 | SUPERSEDED-NOT-WORK (target 2026-10-05-s3b-cross-page-surfaces:142 now [NOT-WORK: browser look at the real routes needs a ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:157 | SUPERSEDED-CLOSED (target 2026-10-05-s3b-cross-page-surfaces:143 now [CLOSED: PR 1073])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:158 | DUP of ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:149 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:159 | SUPERSEDED-NOT-WORK (target 2026-10-06-auth2-provision-heal:85(+1) now [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COM])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:160 | DUP of ops/session-log.d/2026-10-06-c-toggle-promote.md:34 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:161 | DUP of ops/session-log.d/2026-10-06-c-toggle-promote.md:35 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:162 | DUP of ops/session-log.d/2026-10-06-c-toggle-promote.md:36 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:163 | DUP of ops/session-log.d/2026-10-06-g5-terms.md:69 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:164 | SUPERSEDED-CLOSED (target 2026-10-06-g7-ui:28 now [CLOSED: PR 1073])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:165 | DUP of ops/session-log.d/2026-10-07-dead2-schema.md:28 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:166 | SUPERSEDED-CLOSED (target 2026-10-07-dead2-schema:33 now [CLOSED: PR 1087])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:167 | DUP of ops/session-log.d/2026-10-07-g5-read.md:99 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:168 | DUP of ops/session-log.d/2026-10-07-g5-read.md:100 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:169 | SUPERSEDED-CLOSED (target 2026-10-07-g5-search:70(+1) now [CLOSED: PR 1073])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:170 | SUPERSEDED-NOT-WORK (target 2026-10-07-g5-search:77 now [NOT-WORK: scope statement, no defect])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:171 | SUPERSEDED-REFUTED (target 2026-10-07-gate4-ci:91(+1) now [REFUTED: gh api branches/master/protection lists ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:172 | SUPERSEDED-NOT-WORK (target 2026-10-07-gate4-ci:93(+1) now [NOT-WORK: scope statement; live-tree tests run in ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:173 | DUP of ops/session-log.d/2026-10-07-idx1-section-index.md:46 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:178 | DUP of ops/session-log.d/2026-10-07-par1-rows-meter.md:87 => MERGED / NOT-EVIDENT
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:179 | DUP of ops/session-log.d/2026-10-07-par2-bands-typography.md:29 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:180 | DUP of ops/session-log.d/2026-10-07-par2-bands-typography.md:30 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:181 | SUPERSEDED-CLOSED (target 2026-10-07-proof3-chain-steps:33 now [CLOSED: PR 1072])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:182 | SUPERSEDED-CLOSED (target 2026-10-07-proof3-chain-steps:34 now [CLOSED: PR 1072])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:183 | SUPERSEDED-CLOSED (target 2026-10-07-proof3-chain-steps:36 now [CLOSED: PR 1072])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:184 | SUPERSEDED-CLOSED (target 2026-10-07-proof3-chain-steps:37 now [CLOSED: PR 1072])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:185 | SUPERSEDED-CLOSED (target 2026-10-07-proof4-attacks:23 now [CLOSED: PR 992])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:186 | SUPERSEDED-CLOSED (target 2026-10-07-proof4-attacks:24 now [CLOSED: PR 992])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:187 | SUPERSEDED-REFUTED (target 2026-10-07-rules1-gate-precision:93 now [REFUTED: governance/generated-files.mjs no longer])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:188 | SUPERSEDED-REFUTED (target 2026-10-07-rules1-gate-precision:94(+1) now [REFUTED: F51 check 5 was deleted by GATE-3, same ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:189 | SUPERSEDED-CLOSED (target 2026-10-07-rules1-gate-precision:96(+1) now [CLOSED: PR 1039])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:190 | SUPERSEDED-REFUTED (target 2026-10-07-rules1-gate-precision:102(+2) now [REFUTED: the collision came from F51 check 5, del])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:191 | DUP of ops/session-log.d/2026-10-07-s8a-notes-assignment.md:134 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:192 | DUP of ops/session-log.d/2026-10-07-s8b-tag-attribution.md:24 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:193 | DUP of ops/session-log.d/2026-10-07-s8c-count-membership.md:31 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:194 | DUP of ops/session-log.d/2026-10-07-s8d-portfolio.md:32 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:195 | DUP of ops/session-log.d/2026-10-07-s8d-portfolio.md:33 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:196 | DUP of ops/session-log.d/2026-10-07-s8d-portfolio.md:34 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:197 | SUPERSEDED-CLOSED (target 2026-10-07-s8e0-producer-registry:42(+2) now [CLOSED: PR 986])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:198 | SUPERSEDED-CLOSED (target 2026-10-07-s8e0-producer-registry:45(+2) now [CLOSED: PR 986])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:199 | SUPERSEDED-CLOSED (target 2026-10-07-s8e0-producer-registry:48 now [CLOSED: PR 986])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:200 | SUPERSEDED-CLOSED (target 2026-10-07-s8e0-producer-registry:52 now [CLOSED: PR 986])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:201 | SUPERSEDED-NOT-WORK (target 2026-10-07-s8f-industry-statements:20 now [NOT-WORK: scope statement, no defect])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:202 | DUP of ops/session-log.d/2026-10-07-s8f-industry-statements.md:23 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:203 | DUP of ops/session-log.d/2026-10-07-s8f2-statements-build.md:43 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:204 | DUP of ops/session-log.d/2026-10-07-s8f2-statements-build.md:45 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:205 | DUP of ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md:37 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:206 | SUPERSEDED-CLOSED (target 2026-10-08-alias1-entity-hierarchy:42 now [CLOSED: PR 1059])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:207 | DUP of ops/session-log.d/2026-10-08-audit-catalogue.md:43 => MERGED / LANE-LEFT-OWED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:208 | DUP of ops/session-log.d/2026-10-08-audwire1-orphan-audit.md:27 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:209 | DUP of ops/session-log.d/2026-10-08-chain4-downstream-edges.md:51 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:210 | DUP of ops/session-log.d/2026-10-08-cov1-coverage-surface.md:96 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:211 | DUP of ops/session-log.d/2026-10-08-cov1-coverage-surface.md:98 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:212 | DUP of ops/session-log.d/2026-10-08-daudit1-mounts.md:196 => MERGED / LANE-LEFT-OWED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:213 | SUPERSEDED-CLOSED (target 2026-10-08-daudit1-mounts:198 now [CLOSED: PR 1049])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:214 | DUP of ops/session-log.d/2026-10-08-daudit1-mounts.md:203 => MERGED / LANE-LEFT-OWED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:215 | SUPERSEDED-CLOSED (target 2026-10-08-daudit1-mounts:204 now [CLOSED: PR 1049])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:219 | DUP of ops/session-log.d/2026-10-08-dead3-docs.md:100 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:220 | DUP of ops/session-log.d/2026-10-08-dead3-docs.md:101 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:221 | DUP of ops/session-log.d/2026-10-08-dead3-docs.md:102 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:222 | DUP of ops/session-log.d/2026-10-08-dead3-docs.md:106 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:223 | DUP of ops/session-log.d/2026-10-08-dead3-docs.md:107 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:224 | DUP of ops/session-log.d/2026-10-08-docs3-pass.md:35 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:225 | DUP of ops/session-log.d/2026-10-08-docs3-pass.md:40 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:226 | DUP of ops/session-log.d/2026-10-08-docs3-pass.md:41 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:227 | DUP of ops/session-log.d/2026-10-08-docs3-pass.md:42 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:228 | DUP of ops/session-log.d/2026-10-08-docs4-pass.md:30 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:229 | DUP of ops/session-log.d/2026-10-08-docs4-pass.md:34 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:230 | DUP of ops/session-log.d/2026-10-08-docs4-pass.md:35 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:231 | DUP of ops/session-log.d/2026-10-08-gate1-rules.md:35 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:232 | DUP of ops/session-log.d/2026-10-08-gate1-rules.md:36 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:233 | DUP of ops/session-log.d/2026-10-08-gate2-hooks.md:38 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:234 | DUP of ops/session-log.d/2026-10-08-gate2-hooks.md:39 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:235 | SUPERSEDED-NOT-WORK (target 2026-10-08-gate6-guard-container:68(+2) now [NOT-WORK: layout-baseline-renewal.yml is dispatch-])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:236 | SUPERSEDED-NOT-WORK (target 2026-10-08-gate6-guard-container:71 now [NOT-WORK: live-smoke.yml runs on a Production depl])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:238 | DUP of ops/session-log.d/2026-10-08-gate8-fitness-honest-forms.md:44 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:239 | SUPERSEDED-CLOSED (target 2026-10-08-gate8-fitness-honest-forms:45 now [CLOSED: PR 1042])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:240 | SUPERSEDED-NOT-WORK (target 2026-10-08-gate8-fitness-honest-forms:46 now [NOT-WORK: ADR-040, CI is the gate; F9 runs in the ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:241 | SUPERSEDED-CLOSED (target 2026-10-08-gate8-fitness-honest-forms:51 now [CLOSED: PR 1069])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:242 | DUP of ops/session-log.d/2026-10-08-mig374-owed-schema.md:35 => OPEN
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:243 | SUPERSEDED-CLOSED (target 2026-10-08-proof5-oracle-superuser:30 now [CLOSED: PR 1072])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:244 | DUP of ops/session-log.d/2026-10-08-routes1-guard-fixes.md:80 => MERGED / COVERED
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:245 | SUPERSEDED-NOT-WORK (target 2026-10-08-rulerange1-squash-verdict:27 now [NOT-WORK: ADR-046 RULE-RANGE-1 addendum: a push ra])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:246 | SUPERSEDED-CLOSED (target 2026-10-08-s8e5-aux-energy:124(+1) now [CLOSED: PR 1059])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:247 | SUPERSEDED-NOT-WORK (target 2026-10-08-s8e5-aux-energy:126 now [NOT-WORK: regenerated by the executor refresh])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:248 | SUPERSEDED-NOT-WORK (target 2026-10-08-s8e5-aux-energy:128 now [NOT-WORK: scope statement, no defect])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:249 | SUPERSEDED-CLOSED (target 2026-10-08-sec2-profile-status-columns:60 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:250 | SUPERSEDED-CLOSED (target 2026-10-08-sec5-profiles-read:105 now [CLOSED: PR 1059])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:251 | SUPERSEDED-NOT-WORK (target 2026-10-08-smoke2-content-invariants:80(+2) now [NOT-WORK: scope statement; a workflow fails loud o])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:252 | SUPERSEDED-NOT-WORK (target 2026-10-08-smoke2-content-invariants:88 now [NOT-WORK: needs a live production smoke run; build])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:253 | SUPERSEDED-CLOSED (target 2026-10-08-testfix1-cwd-fixtures:37 now [CLOSED: PR 1088])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:254 | SUPERSEDED-CLOSED (target 2026-10-08-wire1-gate-wiring-owned:26 now [CLOSED: PR 1045])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:255 | SUPERSEDED-CLOSED (target 2026-10-08-wire1-gate-wiring-owned:27 now [CLOSED: PR 1045])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:256 | SUPERSEDED-CLOSED (target 2026-10-08-wire1-gate-wiring-owned:41 now [CLOSED: PR 1045])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:257 | SUPERSEDED-NOT-WORK (target 2026-10-08-wire1-gate-wiring-owned:42 now [NOT-WORK: Claude Code client behaviour, not observ])
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:258 | DISPO1-META => UNASSIGNED 
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:265 | DISPO1-META => UNASSIGNED 
- docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md:291 | DISPO1-META => OPEN PLAN-2
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:57 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-09-mighist2-replay-residue.md:3 | MERGED / COVERED (MIG-HIST-2; PR 1085 2026-10-10)
- docs/ops/session-log.d/2026-10-09-mighist2-replay-residue.md:44 | OPEN (EXEC-4; no log, no PR for EXEC-4)
- docs/ops/session-log.d/2026-10-09-proof6.md:35 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-09-proof6.md:47 | OPEN (EXEC-3; no log, no PR for EXEC-3)
- docs/ops/session-log.d/2026-10-09-proof7-oracle-roles.md:37 | MERGED / COVERED (DOCS-5; PR 1104 2026-10-11, PR 1099 2026-10-11)
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:24 | LEDGER-MENTION => MERGED / NOT-EVIDENT GATE-FIX-2
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:36 | LEDGER-MENTION => OPEN EXEMPT-1
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:66 | LEDGER-MENTION => MERGED / NOT-EVIDENT GATE-FIX-2
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:68 | LEDGER-MENTION => UNASSIGNED 
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:72 | LEDGER-MENTION => UNASSIGNED 
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:83 | LEDGER-MENTION => MERGED / NOT-EVIDENT GATE-FIX-2
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:88 | LEDGER-MENTION => MERGED / COVERED GATE-FIX-2
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:107 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:108 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:115 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:116 | OPEN (EXEMPT-1; no log, no PR for EXEMPT-1)
- docs/ops/session-log.d/2026-10-09-sec8-read-policy-scope.md:3 | MERGED / COVERED (SEC-8; PR 1071 2026-10-09)
- docs/ops/session-log.d/2026-10-10-cifix2.md:33 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-cimin0-phase0-minutes.md:22 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-cimin0-phase0-minutes.md:23 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-cimin1-jobs-scoped-to-inputs.md:30 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-cimin1-jobs-scoped-to-inputs.md:37 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-dead1c-src-and-remaining-symbols.md:15 | MERGED / NOT-EVIDENT (DEAD-1d; PR 1093 2026-10-11)
- docs/ops/session-log.d/2026-10-10-dead1d-orphan-fetchers-and-stale-fixtures.md:33 | OPEN (EXEC-4; no log, no PR for EXEC-4)
- docs/ops/session-log.d/2026-10-10-dead1d-orphan-fetchers-and-stale-fixtures.md:35 | OPEN (EXEC-4; no log, no PR for EXEC-4)
- docs/ops/session-log.d/2026-10-10-docs5.md:137 | UNASSIGNED (token names no lane: coordinator)
- docs/ops/session-log.d/2026-10-10-docs5.md:138 | UNASSIGNED (token names no lane: coordinator)
- docs/ops/session-log.d/2026-10-10-docs5.md:139 | UNASSIGNED (token names no lane: coordinator)
- docs/ops/session-log.d/2026-10-10-docs5.md:140 | UNASSIGNED (token names no lane: coordinator)
- docs/ops/session-log.d/2026-10-10-docs5.md:141 | UNASSIGNED (token names no lane: coordinator)
- docs/ops/session-log.d/2026-10-10-gatefix2-bash-edits-and-paths.md:15 | MERGED / COVERED (GATE-FIX-2; PR 1096 2026-10-11)
- docs/ops/session-log.d/2026-10-10-gatefix2-bash-edits-and-paths.md:32 | OPEN (GATE-FIX-3; no log, no PR for GATE-FIX-3)
- docs/ops/session-log.d/2026-10-10-harness1.md:27 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-harness1.md:28 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-proof9-oracle-gate.md:36 | OPEN (EXEC-4; no log, no PR for EXEC-4)
- docs/ops/session-log.d/2026-10-10-smoke3-conditional-invariants.md:48 | MERGED / COVERED (SMOKE-4; PR 1094 2026-10-11)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:3 | MERGED / COVERED (TESTS-1; PR 1088 2026-10-10)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:27 | LEDGER-MENTION => MERGED / COVERED TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:28 | LEDGER-MENTION => MERGED / NOT-EVIDENT TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:29 | LEDGER-MENTION => MERGED / COVERED TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:30 | LEDGER-MENTION => MERGED / COVERED TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:31 | LEDGER-MENTION => MERGED / COVERED TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:32 | LEDGER-MENTION => MERGED / COVERED TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:33 | LEDGER-MENTION => MERGED / COVERED TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:35 | LEDGER-MENTION => MERGED / COVERED TESTS-2
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:45 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:46 | OPEN (EXEC-4; no log, no PR for EXEC-4)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:47 | MERGED / NOT-EVIDENT (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:48 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:52 | MERGED / COVERED (DORMANT-2; PR 1089 2026-10-10)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:3 | MERGED / COVERED (TESTS-2; PR 1101 2026-10-11)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:20 | LEDGER-MENTION => UNASSIGNED 
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:21 | LEDGER-MENTION => UNASSIGNED 
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:26 | LEDGER-MENTION => UNASSIGNED 
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:27 | LEDGER-MENTION => UNASSIGNED 
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:50 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:51 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:52 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:53 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:54 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:58 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.d/2026-10-10-tests2-owed-tests-residue.md:60 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.md:24690 | OPEN (EXEC-4; no log, no PR for EXEC-4)
- docs/ops/session-log.md:24691 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.md:24692 | UNASSIGNED (token names no lane: owed)
- docs/ops/session-log.md:24693 | OPEN (EXEC-4; no log, no PR for EXEC-4)

### 4b. Deferral-shaped NOT-WORK rows (156)

- docs/audits/aud-at3-gates-attacked-2026-10-08.md:512 | needs a throwaway Claude Code session started with each sett | sub 2
- docs/audits/aud-at4-gates-attacked-2026-10-08.md:459 | the live-catalog leg needs the production database | sub 4
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:242 | no actionlint binary on this machine and no network to fetch | sub 4
- docs/audits/aud-at5-gates-attacked-2026-10-08.md:246 | needs production credentials | sub 9
- docs/audits/dead-code-census-2026-10-08.md:1822 | build-mode hold, population after all layers, CLAUDE.md rule | sub 15
- docs/audits/dead-code-census-2026-10-08.md:1823 | build-mode hold, population after all layers, CLAUDE.md rule | sub 15
- docs/audits/obl1-obligations-register-2026-10-08.md:246 | live question, answered at population, rule 16 | sub 16
- docs/audits/obl1-obligations-register-2026-10-08.md:247 | live question, answered at population, rule 16 | sub 16
- docs/audits/obl1-obligations-register-2026-10-08.md:248 | live question, answered at population, rule 16 | sub 16
- docs/audits/obl1-obligations-register-2026-10-08.md:249 | live question, answered at population, rule 16 | sub 16
- docs/audits/obl1-obligations-register-2026-10-08.md:255 | build-mode hold, population after all layers, CLAUDE.md rule | sub 16
- docs/audits/obl1-obligations-register-2026-10-08.md:260 | build-mode hold, population after all layers, CLAUDE.md rule | sub 16
- docs/audits/obl1-obligations-register-2026-10-08.md:276 | build-mode hold, population after all layers, CLAUDE.md rule | sub 16
- docs/audits/remaining-build-register-2026-10-06.md:330 | Stage 9 precondition, CLAUDE.md rule 16 | sub -
- docs/audits/remaining-build-register-2026-10-06.md:331 | Stage 9 precondition, CLAUDE.md rule 16 | sub -
- docs/audits/remaining-build-register-2026-10-06.md:332 | Stage 9 precondition, CLAUDE.md rule 16 | sub 16
- docs/audits/remaining-build-register-2026-10-06.md:333 | Stage 9 precondition, CLAUDE.md rule 16 | sub 7
- docs/audits/remaining-build-register-2026-10-06.md:334 | Stage 9 precondition, CLAUDE.md rule 16 | sub -
- docs/audits/remaining-build-register-2026-10-06.md:335 | Stage 9 precondition, CLAUDE.md rule 16 | sub 7
- docs/audits/remaining-build-register-2026-10-06.md:342 | operator item, recorded on the board | sub 18
- docs/audits/remaining-build-register-2026-10-06.md:346 | build-mode hold, COMMON rule 5 (no live read) | sub -
- docs/audits/remaining-build-register-2026-10-06.md:354 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/audits/remaining-build-register-2026-10-06.md:355 | needs a chained production row in loop-fired-evidence.json;  | sub 8
- docs/audits/remaining-build-register-2026-10-06.md:363 | operator item, recorded on the board | sub -
- docs/audits/remaining-build-register-2026-10-06.md:369 | operator item, recorded on the board | sub 7
- docs/ops/session-log.d/2026-10-01-r68-gates.md:309 | build-mode hold, COMMON rule 9 | sub 15
- docs/ops/session-log.d/2026-10-02-l3.md:197 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-02-l5.md:101 | operator item, recorded on the board | sub 14
- docs/ops/session-log.d/2026-10-02-l5.md:105 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 8
- docs/ops/session-log.d/2026-10-02-l6.md:102 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 7
- docs/ops/session-log.d/2026-10-02-l6.md:104 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-02-l8.md:477 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-02-l8.md:480 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 9
- docs/ops/session-log.d/2026-10-02-l9.md:152 | build-mode hold, COMMON rule 9 | sub 16
- docs/ops/session-log.d/2026-10-02-model-ids.md:106 | build-mode hold, COMMON rule 9 | sub 15
- docs/ops/session-log.d/2026-10-02-ra-wf.md:166 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub -
- docs/ops/session-log.d/2026-10-03-l-corridor.md:146 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 5
- docs/ops/session-log.d/2026-10-03-l-corridor.md:253 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-03-l11.md:294 | operator item, recorded on the board | sub 16
- docs/ops/session-log.d/2026-10-03-l11.md:296 | operator item, recorded on the board | sub 17
- docs/ops/session-log.d/2026-10-03-l13.md:201 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-04-s1a-source-register.md:20 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md:25 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 7
- docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md:26 | build-mode hold, COMMON rule 9 | sub 7
- docs/ops/session-log.d/2026-10-04-s1c-tier-movement.md:30 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 5
- docs/ops/session-log.d/2026-10-04-s1d-walker-registers.md:43 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-04-s3a-intersections.md:28 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md:75 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 14
- docs/ops/session-log.d/2026-10-05-g7-corrections.md:36 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 15
- docs/ops/session-log.d/2026-10-05-g7-tier.md:35 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 14
- docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md:29 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 15
- docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md:31 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub -
- docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md:53 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md:59 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 8
- docs/ops/session-log.d/2026-10-05-l4b-question-answers.md:78 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 14
- docs/ops/session-log.d/2026-10-05-l4d-predictions-reliability.md:40 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-05-p1-source-rating-display.md:117 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 14
- docs/ops/session-log.d/2026-10-05-s1e-source-chain.md:57 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 5
- docs/ops/session-log.d/2026-10-05-s1e-source-chain.md:58 | needs a chained production row; build mode holds dispatch (r | sub 8
- docs/ops/session-log.d/2026-10-05-s1e-source-chain.md:59 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 8
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:141 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 14
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:142 | browser look at the real routes needs a dev server and data, | sub 13
- docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md:145 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-06-auth1-repeated-signup.md:24 | build-mode hold, COMMON rule 9 | sub 7
- docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md:78 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 15
- docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md:86 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 15
- docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md:91 | operator item, recorded on the board | sub 14
- docs/ops/session-log.d/2026-10-06-g6-drain.md:24 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 9
- docs/ops/session-log.d/2026-10-06-g6-drain.md:25 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 15
- docs/ops/session-log.d/2026-10-06-g7-ui.md:27 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-06-p4-live-smoke-1.md:27 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 9
- docs/ops/session-log.d/2026-10-07-chain1-artifact-handoff.md:28 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 7
- docs/ops/session-log.d/2026-10-07-chain2-loop-run-id.md:36 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 7
- docs/ops/session-log.d/2026-10-07-g5-need.md:70 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-07-g5-search.md:68 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 5
- docs/ops/session-log.d/2026-10-07-g5-search.md:73 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 5
- docs/ops/session-log.d/2026-10-07-ops1-maintenance-health.md:70 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-07-par1-rows-meter.md:85 | operator item, recorded on the board | sub 14
- docs/ops/session-log.d/2026-10-07-par1-rows-meter.md:89 | build-mode hold, COMMON rule 9 | sub 6
- docs/ops/session-log.d/2026-10-07-par1b-meter-spec.md:35 | operator item, recorded on the board | sub 14
- docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md:33 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 5
- docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md:34 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 15
- docs/ops/session-log.d/2026-10-07-proof2-subset.md:24 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 9
- docs/ops/session-log.d/2026-10-07-proof3-chain-steps.md:28 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 4
- docs/ops/session-log.d/2026-10-07-proof4-attacks.md:22 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-07-rules1-gate-precision.md:98 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md:129 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md:136 | operator item, recorded on the board | sub 6
- docs/ops/session-log.d/2026-10-07-s8b-tag-attribution.md:23 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-07-s8f-industry-statements.md:19 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md:44 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 13
- docs/ops/session-log.d/2026-10-07-trustret.md:31 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 7
- docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md:38 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 14
- docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md:43 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-08-audwire1-orphan-audit.md:26 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 7
- docs/ops/session-log.d/2026-10-08-chain4-downstream-edges.md:50 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 8
- docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md:97 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 13
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:197 | operator item, recorded on the board | sub 14
- docs/ops/session-log.d/2026-10-08-daudit1-mounts.md:199 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:172 | build-mode hold, COMMON rule 9: CI is the gate | sub 4
- docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md:183 | operator item, Claude Design list | sub 8
- docs/ops/session-log.d/2026-10-08-daudit3-ci-generated-results.md:29 | COMMON rule 9, CI is the gate; proven by the dispatched run | sub 5
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:31 | Stage 9 precondition, CLAUDE.md rule 16 | sub 16
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:53 | build-mode hold, COMMON rule 5 | sub -
- docs/ops/session-log.d/2026-10-08-dispo3-remaining-build-register.md:54 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-08-docs3-pass.md:36 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-08-flag1-disposition-gate.md:909 | the brief scopes the push gate to docs/audits; the dispatch  | sub 5
- docs/ops/session-log.d/2026-10-08-gate2-hooks.md:40 | build-mode hold, COMMON rule 9 | sub 2
- docs/ops/session-log.d/2026-10-08-gate5-baseline-and-race.md:35 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-08-gate6-guard-container.md:70 | layout-baseline-renewal.yml is dispatch-only, exercised only | sub 5
- docs/ops/session-log.d/2026-10-08-gate6-guard-container.md:71 | live-smoke.yml runs on a Production deployment or by dispatc | sub 7
- docs/ops/session-log.d/2026-10-08-gate7-honest-forms.md:195 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-08-migci-apply-on-stack.md:257 | operator item, repository setting recorded on the board | sub 10
- docs/ops/session-log.d/2026-10-08-mkt1-market-components.md:211 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-08-obl2-obligation-objects.md:54 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 10
- docs/ops/session-log.d/2026-10-08-proof5-oracle-superuser.md:29 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 9
- docs/ops/session-log.d/2026-10-08-proof5b-oracle-statements.md:25 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 8
- docs/ops/session-log.d/2026-10-08-qoc1-emitting-table-entries.md:20 | build-mode hold, COMMON rule 5 no live access | sub 10
- docs/ops/session-log.d/2026-10-08-rulerange1-squash-verdict.md:28 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-08-s8e5-aux-energy.md:123 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 16
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:71 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5; migratio | sub 10
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:72 | build-mode hold, COMMON rule 5 no network fetches | sub 15
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:78 | Stage 9 precondition, producer population residue, CLAUDE.md | sub 16
- docs/ops/session-log.d/2026-10-08-s8e6-grid-queue.md:79 | Stage 9 precondition, producer population residue, CLAUDE.md | sub 16
- docs/ops/session-log.d/2026-10-08-sec2-profile-status-columns.md:61 | build-mode hold, COMMON rule 9 | sub 6
- docs/ops/session-log.d/2026-10-08-sec3b-table-policies.md:88 | build-mode hold, COMMON rule 9 | sub 6
- docs/ops/session-log.d/2026-10-08-sec5-profiles-read.md:98 | build-mode hold, COMMON rule 9 | sub 5
- docs/ops/session-log.d/2026-10-08-sec6-admin-flag.md:36 | build-mode hold, COMMON rule 9 | sub 6
- docs/ops/session-log.d/2026-10-08-sec7-policy-roles.md:119 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md:82 | scope statement; a workflow fails loud on missing credential | sub 9
- docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md:85 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 2
- docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md:88 | needs a live production smoke run; build mode holds live dis | sub 7
- docs/ops/session-log.d/2026-10-08-verd1-stale-verdicts.md:37 | build-mode hold, CLAUDE.md rule 16 / COMMON rule 5 | sub 5
- docs/ops/session-log.d/2026-10-08-wire1-gate-wiring-owned.md:28 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-09-chain5-chain-steps-on-stack.md:36 | build-mode hold, workflow dispatch is the executor's, CLAUDE | sub 8
- docs/ops/session-log.d/2026-10-09-cifix1.md:25 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:58 | no dispatch was made; the workflows with in-window evidence  | sub 9
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:59 | build mode holds them off, standing rule 16, coordinator rul | sub 9
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:60 | no production write credential by design, ADR-045; live-run  | sub 8
- docs/ops/session-log.d/2026-10-09-dormant1-never-run-closed.md:62 | a pull_request job must not hold the production credential;  | sub 9
- docs/ops/session-log.d/2026-10-09-loopid1-test-isolation.md:26 | build-mode hold, COMMON rule 9: CI is the gate | sub 4
- docs/ops/session-log.d/2026-10-09-mighist2-replay-residue.md:35 | build-mode production read, run by the data-audit lane | sub 10
- docs/ops/session-log.d/2026-10-09-proof6.md:36 | build-mode hold, COMMON rules 5 and 9 | sub 4
- docs/ops/session-log.d/2026-10-09-proof7-oracle-roles.md:36 | build-mode hold, COMMON rules 5 and 9 | sub 4
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:60 | LEDGER-MENTION | needs a chained production row in loop-fired-evidence.json;  | sub 17
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:70 | LEDGER-MENTION | needs a chained production row; build mode holds dispatch (r | sub 8
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:94 | LEDGER-MENTION | scope statement; a workflow fails loud on missing credential | sub 1
- docs/ops/session-log.d/2026-10-09-rulesx2-register-residue.md:95 | LEDGER-MENTION | needs a live production smoke run; build mode holds live dis | sub 1
- docs/ops/session-log.d/2026-10-10-cifix2.md:34 | build-mode hold, COMMON rule 9 | sub 4
- docs/ops/session-log.d/2026-10-10-daudit4-spec-values-follow-system.md:30 | operator item, DESIGN CHANGES OWED list | sub 14
- docs/ops/session-log.d/2026-10-10-proof8-roles-filter.md:22 | build mode, every runtime by explicit dispatch | sub 5
- docs/ops/session-log.d/2026-10-10-smoke4-list-side-chooser.md:29 | needs a production run of live-smoke.yml, which a lane never | sub 9
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:30 | LEDGER-MENTION | the live-catalog leg needs the production database | sub 15
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:31 | LEDGER-MENTION | no actionlint binary on this machine and no network to fetch | sub 7
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:32 | LEDGER-MENTION | browser look at the real routes needs a dev server and data, | sub 15
- docs/ops/session-log.d/2026-10-10-tests1-owed-tests-and-fixtures.md:34 | LEDGER-MENTION | layout-baseline-renewal.yml is dispatch-only, exercised only | sub 15
