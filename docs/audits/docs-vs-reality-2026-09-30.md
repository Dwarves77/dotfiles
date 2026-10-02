# Docs-vs-reality register , 2026-09-30

Audit lane A8 (DOCS-VS-REALITY). Read-only. Worktree `audit/a8-docs` off `origin/master`
(`2550ebbc`). Operator question: "Where are we in the build? Does it need to be updated?"
Every finding below carries a status token per CLAUDE.md rule 14: `[CONFIRMED]` (method named),
`[HYPOTHESIS]`, or `[REFUTED]`. Run `node scripts/verify/audit-finding-status.mjs` on this file
before treating it as closed.

## Summary

| # | Finding | Status | Severity | Effort |
|---|---|---|---|---|
| A8-1 | PROGRAM-BOARD.md's last dated entry is 2026-09-11 ("W9 ... PLANNED, awaiting operator go"); no thread row reflects the 19 days / ~150+ commits of work in `docs/ops/session-log.md` and git log since, including the entire 2026-09-24/25 ruling set and the whole Wave-2/W2-A..H lane program | `[CONFIRMED]` , git log, session-log.md tail, line-count of PROGRAM-BOARD.md | P0 | M |
| A8-2 | Section 1a row "Operations matrix shows values" is stuck OPEN on the live board although a lane closed it with code-read evidence on 2026-09-29, then reverted the board edit per write-set rule (PROGRAM-BOARD is coordinator-only) and left the exact replacement text for the coordinator, which was never applied | `[CONFIRMED]` , commit `7690ddbf`, `docs/ops/session-log.d/2026-09-29-w2h.md:41-53` | P1 | S |
| A8-3 | 88 broken markdown relative links across 9 files in the read set (excluding `docs/archive/`), concentrated in `docs/sprint-1/`, `docs/sprint-2/`, and 4 audit files | `[CONFIRMED]` , link-resolution script run against the tree, see Check 3 | P2 | S-M |
| A8-4 | `docs/inventories/migrations.md` is current through migration 335, matching `fsi-app/supabase/migrations/` exactly (335 is the highest file on disk); migrations 336-339 named in ADR-036 and the Wave-2 lane contract do not yet exist anywhere , this is in-progress work, not a doc defect | `[REFUTED]` (the dispatch brief's premise of a 336-339 gap) , directory listing + grep, see Check 5 | , | , |
| A8-5 | `fsi-app/STATUS.md` and the CLAUDE.md loading-priority carve-out for it are internally consistent and current; no drift found | `[CONFIRMED]` , CLAUDE.md text vs STATUS.md header | , | , |
| A8-6 | ADR-006 and ADR-009 frontmatter is well-formed (id/title/status/date/scope/supersedes/related present) despite `status: deprecated`; spot-checked, not exhaustive over all 36 ADRs | `[HYPOTHESIS]` (2 of 36 ADRs checked) | P2 | S |
| A8-7 | `docs/ops/session-log.d/` addenda (29 files, 2026-09-13 through 2026-09-25+) are not individually linked from INDEX.md or PROGRAM-BOARD.md, but this matches the documented convention (CLAUDE.md's table: `docs/ops/` = "followups, session-log.md, operational logs") , not an orphan defect, addenda are cited by filename from session-log.md and PROGRAM-BOARD.md inline | `[CONFIRMED]` , grep of citations | , | , |

## Check 1 , Contradictions between living docs

| ID | Doc A | Doc B | Contradiction | Which is current | Status |
|---|---|---|---|---|---|
| C1-1 | `docs/PROGRAM-BOARD.md` section 1a line "Operations matrix shows values … OPEN" | `docs/ops/session-log.d/2026-09-29-w2h.md` (lane W2-H close) | Board says OPEN; the lane's own evidence and the coordinator's accepted close (referenced by the revert commit message: "corrected in their close") treat it as resolved code-read `[CONFIRMED - code read]`, `[REFUTED]` for the underlying UI-1 finding | The session-log entry , see exact replacement text at `2026-09-29-w2h.md:41-53` | `[CONFIRMED]` |
| C1-2 | `docs/PROGRAM-BOARD.md` (no entry past 2026-09-11) | `docs/ops/session-log.md` (dated entries through 2026-09-24, e.g. "2026-09-24, coordinator (addendum after close)") and git log (commits through `#835`, 2026-09-30-adjacent) | The board's own header claims it is "the resume state" reconstructed and standing-rule-maintained ("every session that opens/closes a thread updates it in the same PR" per INDEX.md's board line); reality shows 19 days of unrecorded closes | session-log.md / git log | `[CONFIRMED]` |

## Check 2 , Stale state presented as current

| ID | File:line | Finding | Status | Severity | Exact correction | Effort |
|---|---|---|---|---|---|---|
| S2-1 | `docs/PROGRAM-BOARD.md:2032-2036` ("W9 … PLANNED, awaiting operator go (2026-09-11)") | W9 was long since superseded , `docs/plans/brief-chain-build-plan-2026-09-11.md` is cited from `docs/INDEX.md:105` as one part of the current build plan, and forward-events/timeline-harvest work under it shipped and is reflected in later session-log entries, but the board's own W9 section was never updated or closed | `[CONFIRMED]` , no later PROGRAM-BOARD section references W9's resolution; INDEX.md line 105 describes brief-chain-build-plan as folded into the "one plan for everything unfinished" | P1 | Add a closing row or a "superseded , see complete-system-build-plan-2026-09-04 section 6 and build-plan-2026-09-25" pointer under the W9 heading | S |
| S2-2 | `docs/PROGRAM-BOARD.md` section 1a, "Four-questions rebuild (2026-09-25) … OPEN" umbrella row and the 16-row sub-table under it | Several of the 16 rows are very likely closed by the Wave-2 work visible in git log (`W2-A` bias-tags pipeline, `W2-B` community-identity, `W2-C` Market Intel label fixes, `W2-E` applicability gate, `W2-G` learning loop S/M, `W2-H` operations matrix) but the sub-table still shows all as OPEN | `[HYPOTHESIS]` , inferred from commit subjects (`Lane W2-A…`, `Lane W2-C: Market Intel nav/rail labels`, `Lane W2-E: profile role/size dimensions + applicability gate`), not independently re-verified against the table's stated acceptance evidence | P1 | Coordinator pass: for each of the 16 rows, check the matching Wave-2 lane's close note in `session-log.d/2026-09-29-*.md` and flip state / add evidence | M |

## Check 3 , Broken links (non-archive docs/)

Method: node script resolving every `[text](path)` non-URL, non-anchor link in every `.md` under
`docs/` excluding `docs/archive/`, relative to the linking file. 1,072 links checked, **88 broken**.

By file:
- `docs/sprint-1/alignment-audit-2026-05-18.md` , 22 broken (all root-relative code paths written as `fsi-app/...` / `docs/...` instead of `../fsi-app/...` / `./...`) [HYPOTHESIS]
- `docs/sprint-1/system-audit-2026-05-18.md` , 20 broken (same pattern) [HYPOTHESIS]
- `docs/sprint-2/sprint-2-planning-2026-05-18.md` , 12 broken (same pattern) [HYPOTHESIS]
- `docs/sprint-1/critical-investigations-2026-05-18.md` , 4 broken [HYPOTHESIS]
- `docs/audits/wave1b-stub-quality-investigation-2026-05-11.md` , 17 broken (code-path links, same root-relative-vs-file-relative bug) [HYPOTHESIS]
- `docs/audits/functional-purpose-audit-2026-05-24.md` , 1 broken (code path) [HYPOTHESIS]
- `docs/decisions/ADR-010-docs-taxonomy-and-brain-conventions.md` , 2 broken, but these are the doc's own **worked examples** of the link convention (`relative/path.md`, and a doc-relative `decisions/ADR-002-tier-model.md` written without its `./` , illustrating the syntax, not a real citation) [HYPOTHESIS]
- `docs/ops/session-log.d/2026-09-20-t3.md`, `2026-09-20-w10-factcard.md` (×2) , regex/placeholder text captured as a link (`[^"']+`, `url`) by code fences, not real markdown links , script false positive
- `docs\ops\session-log.d\2026-09-25-supabase-audit-lane.md` → `audits/supabase-integrity-and-wiring-audit-2026-09-25.md` , real broken link, missing `../` prefix (should be `../audits/...`) [HYPOTHESIS]
- `docs\INDEX.md` → `./design/redesign/HANDOFF%20-%20Claude%20Code%20Prompt.md` , file most likely exists with literal spaces (URL-encoded); script does not decode `%20`, needs manual confirmation
- `docs\ops\gate-a-execution-state-2026-07-14.md` → `../../fsi-app/scripts/tmp/coverage-universe-input.txt` , real target: a gitignored scratch file (`fsi-app/scripts/tmp/`), expected to be absent per CLAUDE.md rule 5; not a doc defect [HYPOTHESIS]
- `docs\dispatches\lane-briefs\2026-09-18\brief-d2.md` → `./audits/data-duplicate-census-2026-09-18.md` , real broken link, missing `../../../` (brief is 3 dirs deep under `dispatches/lane-briefs/2026-09-18/`) [HYPOTHESIS]
- `docs\dispatches\lane-briefs\2026-09-20\brief-w10-factcard.md` → `url` (×2) , code-fence false positive, same as above

Findings:

| ID | File:line pattern | Status | Severity | Exact correction | Effort |
|---|---|---|---|---|---|
| L3-1 | `docs/sprint-1/*.md`, `docs/sprint-2/*.md` (58 links) | `[CONFIRMED]` , script + manual spot-check of 5 | P2 | These are 2026-05-18 sprint working docs, superseded by everything since; either (a) fix the ~58 links by adding the missing `../` since these live one level under `docs/`, or (b) mark the three files historical (header note) and move on , no functional cost, nobody navigates them | M if fixing links, S if just marking historical |
| L3-2 | `docs/audits/wave1b-stub-quality-investigation-2026-05-11.md` (17 links) | `[CONFIRMED]` | P2 | Same root-relative-vs-file-relative fix (`docs/audits/*.md` → target needs `../fsi-app/...`, already has it in most; the 17 broken ones point at files that were later renamed/moved, e.g. `first-fetch-classify.ts` , needs per-link verification, not a blanket regex fix | M |
| L3-3 | `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md` link to the audit | `[CONFIRMED]` | P1 (this one is a live 2026-09-25 doc, not a fossil) | Change `audits/supabase-integrity-and-wiring-audit-2026-09-25.md` to `../audits/supabase-integrity-and-wiring-audit-2026-09-25.md` | S |
| L3-4 | `docs/dispatches/lane-briefs/2026-09-18/brief-d2.md` link to the census doc | `[CONFIRMED]` | P2 | Change `./audits/data-duplicate-census-2026-09-18.md` to `../../../audits/data-duplicate-census-2026-09-18.md` | S |
| L3-5 | `docs/INDEX.md` → HANDOFF file with `%20` | `[HYPOTHESIS]` , needs manual filesystem check, not re-verified here | P2 | Confirm the exact filename (spaces vs `%20`) and either fix the encoding or rename the target for a normal link | S |

## Check 4 , Orphans

- No living doc in the read set was found with zero inbound references via INDEX.md or cross-links, beyond the sprint-1/2 fossils already noted in Check 3 (which link out but are not linked in from anywhere except their own sprint's planning doc , self-contained cluster, not truly orphaned).
- `docs/ops/session-log.d/*.md` are individually un-INDEXed by design (Check 1's table, "Memory conventions" scope) , not orphans, this is documented convention.
- INDEX.md lines were spot-checked against `docs/decisions/`, `docs/specs/`, `docs/runbooks/`, `docs/plans/` (first ~180 of 367 lines) and every target resolved to an existing file. The remaining ~187 lines (audits, census, doctrine, sprint, archive, etc.) were **not** individually verified , `[HYPOTHESIS]` that they are equally clean, based on the pattern held for the ~110 lines checked.

## Check 5 , Machine evidence / undated files / migrations gap

- No machine evidence (raw JSON, run logs) found sitting in `docs/` top level; `docs/archive/logs/` is the correct home and was not inspected in depth (out of scope, listed only).
- `docs/inventories/migrations.md` is current through 335 and matches the migrations directory exactly , `[REFUTED]`, the dispatch brief's premised "missing numbers 336-339" finding: those migrations are reserved-but-not-yet-written (named in ADR-036 / the 2026-09-29 Wave-2 lane contract as the write set for lanes still in flight per the git log), not missing from an existing inventory. `docs/inventories/migrations.md:306-311` documents 330-335 with real applied/not-applied state per row, which is the correct behavior.
- Point-in-time files in the read set are consistently dated in filenames (`-2026-MM-DD` suffix pattern held across every plan/audit/decision file sampled). No undated point-in-time doc found in the sample.

## PROGRAM-BOARD rows to update

| Row (current text location) | Current text | Replacement | Source |
|---|---|---|---|
| section 1a, "Operations matrix shows values" (`PROGRAM-BOARD.md` ~line 119) | `\| Operations matrix shows values (\`fetchOperationsCoverage\` envelope reader gap) \| OPEN \| PROGRAM-BOARD:1587 (this file, pre-2026-09-25 line) \|` | `\| Operations matrix shows values (\`fetchOperationsCoverage\` envelope reader gap) \| CLOSED \| \`[CONFIRMED - code read]\` \`supabase-server.ts:3376-3396\` selects all 11 envelope columns (\`value_numeric, unit, currency, derivation, origin_class, source_key, source_ref, n_observations, method_version, as_at_date, reference_period\`); \`RegionDimensionMatrix.tsx\` consumes them through \`region-grid.mjs\`'s \`buildRegionGrid\`/\`isEnvelopedFact\`. Matches this file's own WO-9 layer 2 entry (line ~1640, "fetchOperationsCoverage selects all 11 columns") and audit \`supabase-integrity-and-wiring-audit-2026-09-25.md\` finding UI-1 \`[REFUTED]\`. Live \`/operations\` view could not be checked directly: the route redirects to \`/login\`, auth blocked per lane rules (no credential entry) \|` | `docs/ops/session-log.d/2026-09-29-w2h.md:41-53` , the exact text a lane already staged for the coordinator, never applied |
| End of file, after "W9" section (`PROGRAM-BOARD.md:2032-2036`) | (nothing , file ends at line 2036) | Append a new dated section, e.g. `## 8. Session-log catch-up (2026-09-30 board resync)` summarizing every thread opened/closed in `docs/ops/session-log.md` between 2026-09-11 and today, with a pointer to `session-log.md`'s dated entries rather than re-transcribing them | This audit, Check 2 (S2-1, S2-2) |

## Mechanical corrections batch (Haiku-applicable, no judgment)

1. `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md` , fix link `audits/supabase-integrity-and-wiring-audit-2026-09-25.md` → `../audits/supabase-integrity-and-wiring-audit-2026-09-25.md`.
2. `docs/dispatches/lane-briefs/2026-09-18/brief-d2.md` , fix link `./audits/data-duplicate-census-2026-09-18.md` → `../../../audits/data-duplicate-census-2026-09-18.md`.
3. Apply the PROGRAM-BOARD row replacement in the table above verbatim (section 1a "Operations matrix shows values" row) , the exact text is already staged and reviewed, only needs to land.
4. Add a one-line historical-record header (matching the STATUS.md pattern already in CLAUDE.md) to `docs/sprint-1/alignment-audit-2026-05-18.md`, `docs/sprint-1/system-audit-2026-05-18.md`, `docs/sprint-2/sprint-2-planning-2026-05-18.md`, `docs/audits/wave1b-stub-quality-investigation-2026-05-11.md`: e.g. "**HISTORICAL** (2026-05, pre-redesign). Code paths cited below predate the redesign and many no longer resolve; retained as a record only." , cheaper and more honest than chasing 58+17 individually-broken relative links to files that mostly no longer exist. [HYPOTHESIS]

## Judgment corrections (needs the coordinator)

1. **A8-1 / S2-1 / S2-2**: The PROGRAM-BOARD resync itself. This requires reading `docs/ops/session-log.md` from the 2026-09-11 W9 entry forward (roughly 200+ KB of log) and the Wave-2 `session-log.d/2026-09-29-*.md` closes, and deciding which of the 1a sub-table's 16 rows are actually closed vs still open , a judgment call this read-only audit lane is not positioned to make definitively (rule 14: several are `[HYPOTHESIS]` here, not `[CONFIRMED]`). Recommend a dedicated coordinator pass, not a mechanical patch.
2. **A8-3 / L3-1, L3-2**: Whether to fix the ~75 sprint-1/2 + wave1b-stub broken links link-by-link or simply mark the three-plus files historical. This audit recommends the historical-header approach (mechanical batch item 4) but the coordinator may want the links fixed instead if those docs are still referenced for their code citations. [HYPOTHESIS]
3. **L3-5**: `docs/INDEX.md`'s `%20`-encoded HANDOFF link needs a human/agent with filesystem access to confirm the real filename before any edit.
4. Full re-verification of the remaining ~187 INDEX.md lines (audits/census/doctrine/sprint/archive sections) against the filesystem, which this audit sampled but did not exhaustively check given the context-metering constraint (CLAUDE.md rule 11).

## Coverage appendix , this lane's set (A8) vs the split (A8b/A8c/A8d)

Mid-task, a message arrived instructing this lane to read every file in the read set in full, not
grep-only. A follow-up ruling confirmed this overrides rule 11 for this audit specifically. A third
message split the read set across four lanes: **A8 (this lane) keeps `docs/decisions/` (ADRs),
`docs/specs/`, `docs/inventories/`, `docs/doctrine/`, `docs/ratifications/`, and `docs/runbooks/`**;
`docs/ops/**` is delegated to **A8b**; `docs/plans/**` and `docs/dispatches/**` to **A8c**; every
remaining directory (sprint-1, sprint-2, design, census, and top-level loose files including
`docs/INDEX.md` and `docs/PROGRAM-BOARD.md`) to **A8d**.

**This lane's set is now 78/78 files read in full, line by line**: all 36 ADRs, all 11 surface specs,
all 5 inventories (including `migrations.md`'s full 347 lines, read in chunked passes since single
lines in that file exceed the read tool's per-call token cap), both doctrine seeds, all 5 ratification
files, and all 19 runbooks (including `MAINTENANCE-RUNBOOK.md`, the largest single file in the entire
read set at 4,232 lines, read across ~14 chunked passes). That is 12,660 lines read in full for this
lane's set. `docs/INDEX.md` and `docs/PROGRAM-BOARD.md` were partially read by this lane before the
split (INDEX.md lines 1-186/367; PROGRAM-BOARD.md ~180/2036 plus the full section map) , those partial
reads and the findings they produced (A8-1, A8-2, the C1 contradiction) stand and are carried into
A8d's queue rather than repeated.

**What the full read of this lane's set changed or did not change in the findings above**: nothing in
the additional 42 files beyond the original 36 ADRs (11 specs, 4 remaining inventories, 2 doctrine
seeds, 5 ratifications, 13 remaining runbooks) contradicted, added to, or refuted any finding in
Checks 1-5. The 11 specs' own "current verdict" sections (each spec states plainly whether the built
surface matches its own contract, e.g. Market Intel "Violates", Operations "Violates", Research
"Violates on shape") are themselves already-labeled gap findings inside those documents, not drift
this audit needed to surface separately, and none contradicts PROGRAM-BOARD or any ADR.
`docs/inventories/migrations.md` read to its true end (line 347) confirms A8-4 exactly as before,
current through 335, with a "Records-truth corrections" section at the tail naming five files whose own
header comments are stale-but-frozen (101, 149, 152, 153, 157) , a minor, already-self-documented
staleness class the inventory itself discloses and corrects, not a new finding.
`MAINTENANCE-RUNBOOK.md` (the largest file read) documents 50+ maintenance steps built between
2026-09-02 and 2026-09-20, every one internally dated and cross-referenced to the plan/ruling that
authorized it, several explicitly correcting an earlier revision of the same section in place (the
same self-annealing discipline CLAUDE.md's protocol asks for) , consistent with, not contradicting,
the audit's top finding that PROGRAM-BOARD itself stopped being updated on 2026-09-11 while work of
exactly this density continued in the runbooks and session-log. No new contradiction, broken link, or
stale-state finding surfaced anywhere in this lane's 78-file set.

**Delegation counts, this split**: A8b (`docs/ops/**`) 162 files; A8c (`docs/plans/**` +
`docs/dispatches/**`) 150 files; A8d (everything else, including `docs/INDEX.md` and
`docs/PROGRAM-BOARD.md`'s remaining unread body) 41 files. 431 files total across the four lanes; this
lane's 78 plus the three delegated queues' 353 account for all of them.

| Doc | Lines | Coverage |
|---|---|---|
| `docs/INDEX.md` | 367 | DELEGATED to A8d (partial read this lane: lines 1-186/367) |
| `docs/PROGRAM-BOARD.md` | 2036 | DELEGATED to A8d (partial read this lane: ~180/2036, findings A8-1/A8-2 already filed) |
| `docs/census/gap-census-2026-07.md` | 388 | DELEGATED to A8d (remaining dirs) |
| `docs/data-audit-dispositions.md` | 47 | DELEGATED to A8d (remaining dirs) |
| `docs/decisions/ADR-001-platform-model.md` | 58 | FULL (lane A8, this report) |
| `docs/decisions/ADR-002-tier-model.md` | 65 | FULL (lane A8, this report) |
| `docs/decisions/ADR-003-server-centric-dual-write.md` | 58 | FULL (lane A8, this report) |
| `docs/decisions/ADR-004-auth-pattern-split.md` | 70 | FULL (lane A8, this report) |
| `docs/decisions/ADR-005-discipline-enforcement-layered-architecture.md` | 112 | FULL (lane A8, this report) |
| `docs/decisions/ADR-006-plan-skill-hybrid.md` | 54 | FULL (lane A8, this report) |
| `docs/decisions/ADR-007-bias-tag-threshold-per-dimension.md` | 57 | FULL (lane A8, this report) |
| `docs/decisions/ADR-008-urgency-score-default.md` | 94 | FULL (lane A8, this report) |
| `docs/decisions/ADR-009-adr-system-architecture.md` | 77 | FULL (lane A8, this report) |
| `docs/decisions/ADR-010-docs-taxonomy-and-brain-conventions.md` | 80 | FULL (lane A8, this report) |
| `docs/decisions/ADR-011-ddl-authority-delegation.md` | 64 | FULL (lane A8, this report) |
| `docs/decisions/ADR-012-intake-cadence-and-launch-exit-test.md` | 177 | FULL (lane A8, this report) |
| `docs/decisions/ADR-013-phase3-closure-and-scope-doctrine-tightening.md` | 87 | FULL (lane A8, this report) |
| `docs/decisions/ADR-014-wave-acceptance-sampling.md` | 99 | FULL (lane A8, this report) |
| `docs/decisions/ADR-015-restore-source-monitoring-supersede-adr-012.md` | 119 | FULL (lane A8, this report) |
| `docs/decisions/ADR-016-storage-side-uncap.md` | 93 | FULL (lane A8, this report) |
| `docs/decisions/ADR-017-provenance-verified-binding-by-derivation-depth.md` | 89 | FULL (lane A8, this report) |
| `docs/decisions/ADR-018-edge-directionality-canonicalize-at-reader.md` | 48 | FULL (lane A8, this report) |
| `docs/decisions/ADR-019-inverse-frequency-scenario-weighting.md` | 134 | FULL (lane A8, this report) |
| `docs/decisions/ADR-020-sustainability-first-vertical-scope.md` | 116 | FULL (lane A8, this report) |
| `docs/decisions/ADR-021-connection-classes-identity-is-not-grouping.md` | 53 | FULL (lane A8, this report) |
| `docs/decisions/ADR-022-specificity-wins-over-origin-ownership.md` | 95 | FULL (lane A8, this report) |
| `docs/decisions/ADR-023-producer-execution-model.md` | 153 | FULL (lane A8, this report) |
| `docs/decisions/ADR-024-decision-propagation.md` | 274 | FULL (lane A8, this report) |
| `docs/decisions/ADR-025-deterministic-derivations-auto-adopt.md` | 51 | FULL (lane A8, this report) |
| `docs/decisions/ADR-026-detail-cache-and-viewer-state-split.md` | 264 | FULL (lane A8, this report) |
| `docs/decisions/ADR-027-standard-fast-page-architecture.md` | 164 | FULL (lane A8, this report) |
| `docs/decisions/ADR-028-record-grade-is-transit.md` | 55 | FULL (lane A8, this report) |
| `docs/decisions/ADR-029-assistant-enabled-in-production.md` | 210 | FULL (lane A8, this report) |
| `docs/decisions/ADR-030-resolve-not-quarantine-and-every-item-dated.md` | 47 | FULL (lane A8, this report) |
| `docs/decisions/ADR-031-every-artifact-records-its-github-run-id.md` | 33 | FULL (lane A8, this report) |
| `docs/decisions/ADR-032-skill-gate-judges-the-acting-agent.md` | 32 | FULL (lane A8, this report) |
| `docs/decisions/ADR-033-regional-rooms-and-global-conversations.md` | 34 | FULL (lane A8, this report) |
| `docs/decisions/ADR-034-domain-agnostic-core-and-industry-packs.md` | 189 | FULL (lane A8, this report) |
| `docs/decisions/ADR-035-one-aggregate-anonymity-floor.md` | 37 | FULL (lane A8, this report) |
| `docs/decisions/ADR-036-learning-loop-forks.md` | 33 | FULL (lane A8, this report) |
| `docs/design/audit-2026-09-06/ASSESSMENT.md` | 629 | DELEGATED to A8d (remaining dirs) |
| `docs/design/audit-2026-09-06/README.md` | 33 | DELEGATED to A8d (remaining dirs) |
| `docs/design/decision-package-2026-07-06.md` | 115 | DELEGATED to A8d (remaining dirs) |
| `docs/design/design-principles.md` | 131 | DELEGATED to A8d (remaining dirs) |
| `docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md` | 4060 | DELEGATED to A8d (remaining dirs) |
| `docs/design/handoff-2026-09-06/DEVIATION-LOG.md` | 1616 | DELEGATED to A8d (remaining dirs) |
| `docs/design/handoff-2026-09-06/HANDOFF.md` | 203 | DELEGATED to A8d (remaining dirs) |
| `docs/design/handoff-2026-09-06/README.md` | 187 | DELEGATED to A8d (remaining dirs) |
| `docs/design/handoff-2026-09-06/SHARED-PART-REPORT-2026-09-08.md` | 385 | DELEGATED to A8d (remaining dirs) |
| `docs/design/handoff-2026-09-07/README.md` | 221 | DELEGATED to A8d (remaining dirs) |
| `docs/design/parts-brief-2026-09-18.md` | 248 | DELEGATED to A8d (remaining dirs) |
| `docs/design/parts-inventory.md` | 180 | DELEGATED to A8d (remaining dirs) |
| `docs/design/redesign/DESIGN-DEVIATIONS.md` | 8 | DELEGATED to A8d (remaining dirs) |
| `docs/design/redesign/README.md` | 19 | DELEGATED to A8d (remaining dirs) |
| `docs/design/ux-laws.md` | 127 | DELEGATED to A8d (remaining dirs) |
| `docs/dispatches/free-chrome-acquisition-brief-2026-07-16.md` | 105 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-05/README.md` | 168 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-18/README.md` | 16 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` | 32 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-18/brief-d2.md` | 46 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-18/brief-d28b.md` | 25 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-18/brief-l35h.md` | 50 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-18/brief-l37.md` | 30 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-18/brief-l38.md` | 28 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/README.md` | 15 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md` | 126 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-g1.md` | 77 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-m3.md` | 99 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-m4.md` | 53 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-m6.md` | 55 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-m9d.md` | 43 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-n0.md` | 111 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-n1.md` | 104 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-n2.md` | 133 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-n3.md` | 102 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-n4.md` | 89 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-n5.md` | 133 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-n6.md` | 142 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-19/brief-t2.md` | 138 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-f51b.md` | 27 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-f52.md` | 33 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-m3b.md` | 51 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-m4-amendment-1.md` | 33 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-m6-amendment-1.md` | 33 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-m7a.md` | 38 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-m9d-amendment-1.md` | 33 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-t3.md` | 31 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-w10-factcard-amendment-1.md` | 23 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-20/brief-w10-factcard.md` | 46 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-f51c.md` | 23 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-g2.md` | 26 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-m6b-amendment-1.md` | 12 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-m6b-amendment-2.md` | 11 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-m6b.md` | 45 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-r7m-amendment-1.md` | 13 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-r7m.md` | 27 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-actioncard-a.md` | 91 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-1.md` | 24 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-2.md` | 14 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-3.md` | 18 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar.md` | 37 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-b.md` | 35 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-c-amendment-1.md` | 13 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-c.md` | 26 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-d-amendment-1.md` | 14 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-d.md` | 89 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-g3.md` | 26 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-g4.md` | 31 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-ui75.md` | 22 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-actioncard-b-amendment-1.md` | 9 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-actioncard-b.md` | 27 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-d-amendment-2.md` | 11 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-d-amendment-3.md` | 11 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-e.md` | 53 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-1.md` | 14 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-2.md` | 20 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-3.md` | 9 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-remaining-parts.md` | 41 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader-amendment-1.md` | 7 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader.md` | 24 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-24/brief-auth-identity-retry.md` | 47 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-briefs/2026-09-24/brief-live-findings.md` | 50 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/lane-common-contract.md` | 129 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/proposer-brief-ledger-consume-train-wave48-2026-09-05.md` | 33 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/dispatches/proposer-brief-propagation-train-wave48-2026-09-05.md` | 31 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/doctrine/closure-gate.md` | 118 | FULL (lane A8, this report) |
| `docs/doctrine/worktree-isolation.md` | 90 | FULL (lane A8, this report) |
| `docs/inventories/components.md` | 52 | FULL (lane A8, this report) |
| `docs/inventories/discipline.md` | 209 | FULL (lane A8, this report) |
| `docs/inventories/migrations.md` | 347 | FULL (lane A8, this report) |
| `docs/inventories/out-of-band-objects.md` | 66 | FULL (lane A8, this report) |
| `docs/inventories/worktrees.md` | 94 | FULL (lane A8, this report) |
| `docs/ops/HANDOFF-2026-09-11.md` | 216 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/HANDOFF-2026-09-18.md` | 404 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/HANDOFF-2026-09-19-addendum.md` | 103 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/backup-posture.md` | 114 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/backup-restoration-2026-08-28.md` | 63 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/browser-verification-pending.md` | 62 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/build-phase-spend-regime-2026-07-15.md` | 66 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/chrome-audit-2026-07/traceability-matrix-2026-07-07.md` | 248 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/conservation-audit-2026-07/conservation-audit-2026-07-09.md` | 109 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/deletion-reclassification-log.md` | 78 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/dispatch-stop-conditions-protocol.md` | 68 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/flip-readiness-2026-07-08.md` | 42 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/CODE-1-register.md` | 289 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/CODE-2-register.md` | 322 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/CODE-3-register.md` | 340 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/CODE-4a-register.md` | 222 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/CODE-4b-register.md` | 260 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md` | 767 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md` | 289 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/DB-1-register.md` | 394 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/DB-2-register.md` | 466 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/DB-3-register.md` | 910 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/DB-4-register.md` | 477 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/INTENT-register.md` | 457 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/X-register.md` | 407 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/correction-plan.md` | 105 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/coverage-manifest.md` | 99 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/master-gap-register.md` | 164 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/full-system-audit-2026-07-11/pool-coverage-62.md` | 97 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/funded-pass-flight-state-2026-07-14.md` | 39 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/gate-a-execution-state-2026-07-14.md` | 54 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/gate-a-truth-basis-2026-07-14.md` | 70 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/gate-b-close-2026-07-14.md` | 105 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/handoff-2026-08-17.md` | 287 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/handoff-2026-09-05.md` | 614 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/hardening-resume-2026-07-16.md` | 61 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/hardening-rulings-2026-07-16.md` | 18 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/multi-tenant-foundation-followups-2026-05-15.md` | 120 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/observability-posture.md` | 70 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/program-closeout-2026-07-08.md` | 82 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/reattribution-worklist-2026-07-14.md` | 70 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/reconciliation-remediation-closeout-2026-07-11.md` | 107 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/registered-deferrals-2026-07-11.md` | 19 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/rendering-guard-followups-2026-07-11.md` | 63 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/root-cause-why-the-queue-2026-07-08.md` | 136 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/runbooks/date-chain-2026-09-11.md` | 215 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/secrets-topology.md` | 66 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-13-l18.md` | 37 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-18-m1.md` | 100 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-18-m2.md` | 173 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-18-m8.md` | 71 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-18-m9a.md` | 35 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-18-m9b.md` | 54 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-18-t1.md` | 27 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-18-w10a.md` | 116 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-d28b.md` | 40 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-g1.md` | 98 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-m3.md` | 274 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-n0.md` | 45 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-n1.md` | 72 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-n2.md` | 19 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-n3.md` | 39 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-n4.md` | 135 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-n5.md` | 178 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-n6.md` | 53 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-p7.md` | 50 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-19-t2.md` | 82 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-f51b.md` | 75 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-f52.md` | 125 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-m3b.md` | 69 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-m4.md` | 122 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-m7a.md` | 206 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-m9d.md` | 171 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-r22.md` | 72 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-t3.md` | 192 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-20-w10-factcard.md` | 246 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-g2.md` | 52 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-m6.md` | 66 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-m6b.md` | 59 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-r6t.md` | 43 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-r7m.md` | 49 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-w10-actioncard-a.md` | 125 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-w10-commandbar.md` | 153 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-w10-factcard-b.md` | 168 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-w10-factcard-c.md` | 102 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-21-w10-factcard-d.md` | 166 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-f51c.md` | 60 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-g3-audit.md` | 159 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-g3.md` | 59 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-g3b.md` | 79 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-g4.md` | 59 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-ui75.md` | 112 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-w10-actioncard-b.md` | 240 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-w10-factcard-e.md` | 137 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-w10-listrow.md` | 132 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-w10-masthead-amendment-1.md` | 135 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-w10-masthead.md` | 189 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-22-w10-sectionheader.md` | 182 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-23-w10-commandbar-parts.md` | 128 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-23-w10-navcard.md` | 125 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-23-w10-railcard.md` | 136 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-23-w10-statenote-remaining.md` | 119 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-23-w10-statenote.md` | 139 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-24-auth-identity.md` | 124 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-24-masthead-auth.md` | 103 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-24-parity-parts.md` | 243 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-24-reg-redirect.md` | 10 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-adr-034.md` | 46 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-adr-035.md` | 15 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-artboards.md` | 15 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-coordinator-close.md` | 216 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-operator-ruling-r14.md` | 17 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-parity-parts-look-only.md` | 183 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-sec1-derivation-edges-rls.md` | 64 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md` | 62 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-tool-gap-1.md` | 83 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-tool-gap-2.md` | 204 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-25-tool-gap-3.md` | 273 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-26-gate-a-rescan-fix.md` | 137 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-26-harness-landing.md` | 116 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-26-master-022.md` | 96 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-26-operator-ruling-no-actions-prs.md` | 36 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-26-state-cost-producer.md` | 131 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-27-harness-runs-db-design.md` | 263 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-27-state-cost-dag.md` | 62 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-27-worktree-node-modules.md` | 29 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-audit-triage.md` | 200 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-ci-parity.md` | 124 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-clock-test.md` | 94 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-coordinator-close.md` | 52 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-ets-proxy.md` | 134 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-loop-b-firing.md` | 112 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-quarantine-disposition.md` | 122 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-statutory-writer.md` | 137 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-28-structured-actions.md` | 127 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-chained-apply-incident.md` | 37 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-chained-dry-guard.md` | 91 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-drop-placeholders.md` | 109 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-loop-b-firing.md` | 92 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md` | 64 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-statutory-writer.md` | 114 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-w2a.md` | 240 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/2026-09-29-w2h.md` | 96 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.d/README.md` | 37 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/session-log.md` | 24302 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/site-gap-register-2026-07-09.md` | 100 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/spend-watch-disposition-2026-07-15.md` | 54 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/sweep-ledger.md` | 79 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/token-spend-2026-08-09.md` | 73 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/u6-theme-briefs-run-2026-08-21.md` | 93 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wave-alpha-closeout-2026-07-11/baseline.md` | 29 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wave-alpha-closeout-2026-07-11/c7-outcome.md` | 28 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wave-alpha-closeout-2026-07-11/closeout.md` | 127 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wave-alpha-closeout-2026-07-11/ddl-application-evidence.md` | 88 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md` | 334 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wave-alpha-closeout-2026-07-11/f1-verdict.md` | 46 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wave-alpha-closeout-2026-07-11/track-b-proofs.md` | 277 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wo26-scope-remediation-2026-08-21.md` | 107 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wo5-orphan-disposition-2026-08-20.md` | 31 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wo6-tag-gap-diagnosis-2026-08-20.md` | 60 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wo7-tag-backfill-run-2026-08-20.md` | 47 | DELEGATED to A8b (docs/ops/**) |
| `docs/ops/wo8-flywheel-rerun-2026-08-21.md` | 64 | DELEGATED to A8b (docs/ops/**) |
| `docs/plans/C5-feed-spec.md` | 192 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/C6-promote-spec.md` | 257 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/C7-notifications-spec.md` | 261 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/C8-moderation-spec.md` | 243 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/C9-realtime-spec.md` | 252 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md` | 406 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/W2A-bulk-import-spec.md` | 252 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/W2B-discovery-agent-spec.md` | 273 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/W2D-coverage-matrix-spec.md` | 304 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/W2F-verification-pipeline.md` | 262 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/W4-backfill-plan.md` | 123 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/W5-cost-projection.md` | 127 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/analysis-anchoring-resolution-2026-08-09.md` | 103 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/brief-chain-build-plan-2026-09-11.md` | 668 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/build-8-research-surface.md` | 210 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/build-plan-2026-09-25.md` | 210 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/category-e-investigation-2026-05-21.md` | 563 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/classification-backfill-ambiguous-2026-05-22.md` | 59 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/classification-backfill-plan-2026-05-22.md` | 321 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/complete-system-build-plan-2026-09-04.md` | 566 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/connection-redesign-and-build-scope-2026-08-29.md` | 285 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/crawl-rebuild-spec-2026-07-18.md` | 261 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/cross-surface-intelligence-2026-08-09.md` | 69 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/data-buildout-zero-cost-2026-08-09.md` | 102 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/data-machine-tool-gaps-2026-09-25.md` | 123 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/dead-code-disposition-2026-05-21.md` | 206 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/defect-fix-plan-2026-09-12.md` | 409 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/dispatch-2.5-writer-redistribution-prework-2026-05-15.md` | 460 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/dispatch-spec-corrections-2026-05-10.md` | 50 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/fetch-align-diff-engine-2026-07-14.md` | 51 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/finish-plan-2026-09-02.md` | 157 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/fix-d-scope-2026-05-23.md` | 64 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/fleet-cost-control-plan-2026-08-08.md` | 92 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/flywheel-build-plan-2026-08-10.md` | 150 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/implementation-plan-2026-08-12.md` | 123 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/ingest-pipeline-investigation-2026-05-22.md` | 388 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/ingest-repair-and-extraction-build-plan-2026-07-19.md` | 483 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/ingest-restart-sequencing-2026-05-22.md` | 202 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/learning-loop-design-2026-09-25.md` | 289 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/main-checkout-stabilization-2026-08-08.md` | 87 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/market-lane-spec-from-repo.md` | 636 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/master-execution-plan-2026-08-17.md` | 228 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/mobile-evidence/README.md` | 347 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/multi-tenant-foundation-prework-2026-05-15.md` | 255 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/operations-lane-spec-from-repo.md` | 508 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/population-pass-2026-09-03.md` | 234 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/record-tier-population-plan-2026-09-01.md` | 340 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/recursive-compounding-discovery-2026-08-10.md` | 138 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/registry-to-ingestion-handoff-design-2026-05-10.md` | 164 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/regulations-classification-mismatch-counts-2026-05-22.md` | 116 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/remediation-and-weight-2026-08-10.md` | 189 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/research-lane-spec-from-repo.md` | 448 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/scrape-and-build-content-plan-2026-07-19.md` | 47 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/site-completion-masterplan-2026-08-09.md` | 95 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/skill-refinements-prework-2026-05-15.md` | 738 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/source-classification-framework-2026-05-10.md` | 571 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/source-health-architecture-investigation-2026-05-21.md` | 328 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-community-2026-05-23.md` | 521 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-dashboard-2026-05-23.md` | 198 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-map-2026-05-23.md` | 361 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-market-intel-2026-05-23.md` | 276 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-operations-2026-05-23.md` | 209 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-regulations-2026-05-23.md` | 259 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-research-2026-05-23.md` | 292 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-synthesis-2026-05-23.md` | 164 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/spec-audit-user-chrome-2026-05-23.md` | 284 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/surface-rebuild-plan-2026-08-11.md` | 209 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/system-completion-plan-2026-09-02.md` | 247 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/system-level-intelligence-2026-08-09.md` | 75 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/system-remediation-plan-2026-08-09.md` | 144 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/unblocking-the-five-2026-08-30.md` | 274 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/unit4-critical-high-disposition-2026-07-26.md` | 44 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/unwired-disposition-2026-08-31.md` | 701 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/wave-plan-2026-09-28.md` | 80 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/wave1-track5-widget-implementation-plan.md` | 293 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/wave2-lanes-2026-09-02.md` | 144 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/wave2b-lanes-2026-09-29.md` | 52 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/wave3-lanes-2026-09-03.md` | 92 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/wo19-origin-class-backfill-mapping.md` | 198 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/plans/wo20-assumption-register-spec.md` | 318 | DELEGATED to A8c (docs/plans/**, docs/dispatches/**) |
| `docs/ratifications/2026-09/README.md` | 178 | FULL (lane A8, this report) |
| `docs/ratifications/2026-09/RULING-2026-09-06.md` | 183 | FULL (lane A8, this report) |
| `docs/ratifications/2026-09/proposed/README.md` | 91 | FULL (lane A8, this report) |
| `docs/ratifications/2026-09/proposed/RULINGS-1-summary.md` | 471 | FULL (lane A8, this report) |
| `docs/ratifications/2026-09/proposed/RULINGS-2-summary.md` | 119 | FULL (lane A8, this report) |
| `docs/runbooks/CORPUS-TURN-RUNBOOK.md` | 1304 | FULL (lane A8, this report) |
| `docs/runbooks/FUELEU-STATUTORY-RUNBOOK.md` | 173 | FULL (lane A8, this report) |
| `docs/runbooks/INTEGRITY-TRIAGE-PROCEDURE.md` | 145 | FULL (lane A8, this report) |
| `docs/runbooks/MAINTENANCE-RUNBOOK.md` | 4232 | FULL (lane A8, this report) |
| `docs/runbooks/PERF-PLAYBOOK.md` | 139 | FULL (lane A8, this report) |
| `docs/runbooks/POPULATION-TURN-RUNBOOK.md` | 347 | FULL (lane A8, this report) |
| `docs/runbooks/PROPAGATION-DRAIN-RUNBOOK.md` | 119 | FULL (lane A8, this report) |
| `docs/runbooks/SPOT-CHECK-PROCEDURE.md` | 123 | FULL (lane A8, this report) |
| `docs/runbooks/TRAIN-ASSEMBLY-RUNBOOK.md` | 158 | FULL (lane A8, this report) |
| `docs/runbooks/dispatch-discipline-protocol.md` | 105 | FULL (lane A8, this report) |
| `docs/runbooks/fleet-budget-control.md` | 97 | FULL (lane A8, this report) |
| `docs/runbooks/fleet-charters/authorship-worker.md` | 50 | FULL (lane A8, this report) |
| `docs/runbooks/fleet-charters/citation-harvest.md` | 34 | FULL (lane A8, this report) |
| `docs/runbooks/fleet-charters/legacy-remediation.md` | 39 | FULL (lane A8, this report) |
| `docs/runbooks/fleet-charters/summary-sweep.md` | 50 | FULL (lane A8, this report) |
| `docs/runbooks/live-source-anti-fabrication-audit.md` | 63 | FULL (lane A8, this report) |
| `docs/runbooks/run-structure-protocol.md` | 48 | FULL (lane A8, this report) |
| `docs/runbooks/sprint4-dataops-ledger.md` | 92 | FULL (lane A8, this report) |
| `docs/runbooks/warm-static-detail-routes.md` | 102 | FULL (lane A8, this report) |
| `docs/specs/00-foundation-the-spine.md` | 324 | FULL (lane A8, this report) |
| `docs/specs/01-regulations.md` | 276 | FULL (lane A8, this report) |
| `docs/specs/02-market-intel.md` | 240 | FULL (lane A8, this report) |
| `docs/specs/03-research.md` | 252 | FULL (lane A8, this report) |
| `docs/specs/04-operations.md` | 232 | FULL (lane A8, this report) |
| `docs/specs/05-community.md` | 158 | FULL (lane A8, this report) |
| `docs/specs/06-gap-register-and-sequence.md` | 181 | FULL (lane A8, this report) |
| `docs/specs/07-page-walkthrough.md` | 423 | FULL (lane A8, this report) |
| `docs/specs/08-flywheel-design.md` | 701 | FULL (lane A8, this report) |
| `docs/specs/09-domain-extensions.md` | 354 | FULL (lane A8, this report) |
| `docs/specs/10-v1-seed-plan.md` | 215 | FULL (lane A8, this report) |
| `docs/sprint-1/alignment-audit-2026-05-18.md` | 434 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/critical-investigations-2026-05-18.md` | 285 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/followups.md` | 1439 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/intelligence-assistant-audit-2026-05-18.md` | 187 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/onboarding-audit-2026-05-18.md` | 242 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/perf-1-design.md` | 140 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-1-admin-signals.md` | 245 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-2-dedup-plan.md` | 358 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-3-jurisdiction-vocabulary.md` | 218 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-3-operator-decision.md` | 162 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-4-migrations-summary.md` | 154 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-4b-design.md` | 126 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-4b-sql-review-final.md` | 110 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-5-design.md` | 315 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/phase-7-scope-amendment.md` | 89 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md` | 463 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-1/system-audit-2026-05-18.md` | 338 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-2/Phase-1.5-consumer-migration-list.md` | 178 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-2/category-routing-wiring-notes.md` | 142 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-2/source-credibility-model-decisions-2026-05-19.md` | 492 | DELEGATED to A8d (remaining dirs) |
| `docs/sprint-2/sprint-2-planning-2026-05-18.md` | 622 | DELEGATED to A8d (remaining dirs) |
| `docs/tech-debt-log.md` | 328 | DELEGATED to A8d (remaining dirs) |
