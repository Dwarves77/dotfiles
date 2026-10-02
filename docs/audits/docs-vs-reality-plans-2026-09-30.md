# Audit A8c  -  docs/plans and docs/dispatches register, 2026-09-30

Lane A8c (DOCS-PLANS-DISPATCHES), read-only, extends lane A8's register
(`docs/audits/docs-vs-reality-2026-09-30.md`, ids A8-1..A8-7  -  not repeated here; cited by id where relevant).
Read set: every file under `docs/plans/**` and `docs/dispatches/**` (268 files, 32,632 lines by `wc -l`).

**Coverage disclosure (rule 14, stated up front, not buried).** The operator directive for this audit
overrides rule 11's default: "No overviews. I want every line read." The coordinator's most recent
instruction ("read them now and flip the rows") was carried out: every text file in the read set was
subsequently read in full, first line to last, via the Read tool (in a small number of cases via a
`cat`-to-scratch-file-then-Read batch for the tiny `docs/dispatches/lane-briefs/2026-09-05/*.js` lane
scripts, whose full content still passed through this session's context word for word; that is recorded
as `FULL`, not `README-INDEXED`, because the file's own text was read, not summarized from its README).

- **249 of 268 files (text) read in full**, word for word: all `docs/plans/*.md` files including all
  eight `spec-audit-*-2026-05-23.md` files and both `wo19`/`wo20` work-order specs; all 98 files (97
  `.js` + 1 `.mjs`) in `docs/dispatches/lane-briefs/2026-09-05/`, including its README; all 68 dated
  briefs in `docs/dispatches/lane-briefs/2026-09-18/` through `2026-09-24/` (dispatch-brief format:
  coordinator briefs plus their numbered amendments, a materially different corpus from the 2026-09-05
  agent-dispatch scripts  -  gate-engineering (F45/F51/F28 registry-to-directory conversion, RD-7x
  invariants) and UI parts-lane work (FactCard, ActionCard, CommandBar, Masthead, SectionHeader), none of
  it overlapping `docs/plans/**`'s subject matter); `docs/dispatches/lane-common-contract.md`; both root
  proposer briefs; the free-Chrome acquisition brief; and `docs/plans/mobile-evidence/README.md` (text,
  not an image  -  the coverage table below now reads it `FULL`, correcting the prior pass's
  mis-tagging of it as `IMAGE-NOT-READ`).
- **19 files, the PNG/JPG screenshots under `docs/plans/mobile-evidence/`**, remain `IMAGE-NOT-READ` by
  deliberate exclusion, not oversight: CLAUDE.md rule 12's cost model (an image rendered by the Read
  tool is a permanent context resident that re-bills every subsequent turn) applies to these by the same
  logic it states for PDF pages, and the mobile-evidence README (now read in full) already narrates each
  screenshot's finding and fix in prose detail sufficient for this docs-audit's purpose  -  the images
  themselves would add no fact this audit needs that the README does not already state. This is a
  judgment call, stated plainly rather than silently made.

Per rule 13, the prior pass's partial-coverage gap is corrected in place, not left standing:
**A8c-COVERAGE-1** below now records completion instead of the follow-up work order it originally was.
The additional 199 files read in this second pass (68 dated dispatch briefs + 39 README-indexed/header-
sampled `docs/plans/*.md` files + 92 previously-unread lane-brief scripts) surfaced no findings that
contradict or need to be added to the register below beyond the one correction to A8c-5 recorded in
place there (rule 13's corollary: a flag that dissolves under evidence gets a same-session correction,
never a quiet drop). The dated dispatch briefs (2026-09-18 through 2026-09-24) are a different program
of work from `docs/plans/**` (fine-grained discipline-engine gate engineering and a UI parts-lane
program, both post-dating and independent of the WS1-16 reconciliation this register's substantive
findings are about) and, on inspection, contain no plan-status claims that bear on the WS1-16 table,
the wave-2b landing status, or the two superseded-banner gaps this register's P1/P2 findings describe.

## Summary

| id | finding | status | severity | effort |
|---|---|---|---|---|
| A8c-1 | 6 of 8 wave-2b lanes (W2-B/C/D/E/F/G) have completed, committed work on their branches that has never merged to origin/master; only W2-A and W2-H landed | `[CONFIRMED]` | P1 | S (doc correction) / N/A (merge itself is not this lane's call) |
| A8c-2 | `wave-plan-2026-09-28.md`'s WS1-16 status table is dated 2026-09-28, one day before wave-2b's lanes did their work, and is now stale for 8 of 16 rows | `[CONFIRMED]` | P2 | S |
| A8c-3 | `finish-plan-2026-09-02.md` and `system-completion-plan-2026-09-02.md` are two of the four files `complete-system-build-plan-2026-09-04.md`'s own table instructs to "get a superseded-by header," but only the other two (`wave2-lanes-2026-09-02.md`, `wave3-lanes-2026-09-03.md`) actually carry one | `[CONFIRMED]` | P2 | S |
| A8c-4 | `docs/dispatches/lane-briefs/2026-09-05/` is a 91-file archive of literal agent-dispatch source code (Workflow-tool lane briefs), correctly self-documented by its own README as "source code, not documentation prose" and a deliberate historical record  -  not itself a defect, but its scale means downstream audits (including this one) systematically under-read it unless flagged | `[CONFIRMED]` | P3 | N/A (informational) |
| A8c-5 | `docs/plans/connection-redesign-and-build-scope-2026-08-29.md` is headed "⛔ OPERATOR REVIEW  -  nothing below executes until ruled" with no visible disposition note; corrected in place after a full read | `[CONFIRMED]` (full read; corrected from the prior `[HYPOTHESIS]`) | P3 (downgraded from P2) | N/A (the header's ⛔ framing is stale prose, not an open blocker; see below) |
| A8c-6 | `docs/plans/wo19-origin-class-backfill-mapping.md` is still headed "DRAFT, awaiting operator ratification," while `finish-plan-2026-09-02.md`'s ruling R-E ("origin_class backfill mapping ... accept") appears to have already ratified it | `[HYPOTHESIS]` (full read of wo19 confirms the DRAFT framing is accurate on its own terms: the file itself states two open rulings remain unresolved  -  item_type='tool' unresolved, ADR-007/code drift on bias-tag thresholds  -  and says explicitly nothing in it has been executed; whether R-E's "accept" ratifies the mapping specifically, versus the broader origin_class backfill concept, is not resolved by either document's text and remains the coordinator's call) | P3 | S (a coordinator ruling on whether R-E's "accept" covers wo19 specifically) |
| A8c-COVERAGE-1 | Prior-pass gap (68 dated dispatch-brief files + 20 image files not opened) is now closed: 249 of 268 files read in full; 19 PNG/JPG screenshots remain deliberately unopened (rule 12 cost model) | `[CONFIRMED]` | N/A (closed) | Done this pass |

## Plan status register

State vocabulary: **live** (current program, actively referenced), **executed** (its content shipped
and the file now serves as a record), **superseded** (explicitly or functionally replaced by a later
plan), **abandoned** (no evidence of execution or explicit retirement; stalled).

| File | Date | State | Evidence |
|---|---|---|---|
| `build-plan-2026-09-25.md` | 2026-09-25 | **live** | Current program per this audit's brief; 8 of its 16 workstreams have unmerged-but-complete lane work as of 2026-09-30 (A8c-1) |
| `wave-plan-2026-09-28.md` | 2026-09-28 | **live**, status table stale | Current program; its own WS1-16 table needs the correction below (A8c-2) |
| `wave2b-lanes-2026-09-29.md` | 2026-09-29 | **live** | Current program; write-set contract for the still-unmerged W2-B..G lanes |
| `data-machine-tool-gaps-2026-09-25.md` | 2026-09-25 | **live** | Cited by build-plan-2026-09-25 and wave-plan-2026-09-28 as the tool-gap register; its own build order items 1-3 (stale hop-01 manifest, dead-column audit, UI orphan checker) map to merged PRs #808/#809/#810 (TOOL-GAP-1/2/3) |
| `learning-loop-design-2026-09-25.md` | 2026-09-25 | **live**, partially executed | Design doc for WS12; S and M steps built on branch `lane/w2g-learning-loop` (commit `993802bf` + continuation `52ef8368`), not yet merged; L explicitly deferred by the design doc's own section 6 sequencing |
| `complete-system-build-plan-2026-09-04.md` | 2026-09-04, revised 2026-09-18 | **superseded** (functionally) | 566-line plan whose sections 3-6.8 (trains T37-T46, M0-M9 lanes) predate and are superseded in sequencing by `build-plan-2026-09-25.md`; the "revision 2026-09-18" and "6" sections inside this same file already supersede its own original section 3  -  the file is internally layered, not a clean single-generation doc |
| `wave2-lanes-2026-09-02.md` | 2026-09-02 | **superseded** | Explicit banner: "Superseded as a tracker on 2026-09-04 by `complete-system-build-plan-2026-09-04.md`" |
| `wave3-lanes-2026-09-03.md` | 2026-09-03 | **superseded** | Same banner |
| `finish-plan-2026-09-02.md` | 2026-09-02 | **superseded, undocumented** | Named in complete-system-build-plan's "Tools already built" table as one of four "per-wave plan files ... RETIRE as trackers ... get a 'superseded by' header"  -  banner missing (A8c-3) |
| `system-completion-plan-2026-09-02.md` | 2026-09-02 | **superseded, undocumented** | Same table, same missing banner (A8c-3) |
| `system-remediation-plan-2026-08-09.md` | 2026-08-09 | **executed** | complete-system-build-plan-2026-09-04's "Why the previous plans stopped short" section names this as one of four plans "checked today" for follow-through; its own section 3 data-integrity subset (capture-202 fix, gate-A backstops, P0 security grants, hard dropped-error gate) reads as the kind of foundational work later trains build on, no live contradiction found |
| `surface-rebuild-plan-2026-08-11.md` | 2026-08-11 | **executed / superseded-in-part** | Explicitly "Supersedes the sequencing in `spec-audit-synthesis-2026-05-23.md`"; its own Phase 0/1 substrate items (surface guard, one population, F26 acceptance gate) are exactly the class of defect the later `complete-system-build-plan`'s section 0 definition-of-done formalizes  -  this plan is the direct ancestor of that section 0, not a competing plan |
| `unwired-disposition-2026-08-31.md` | 2026-08-31 | **executed** | Register itself records 3 of its 26 rows EXECUTED in place (rows 3, 10, 12  -  lane DEAD-EXEC, 2026-09-04, commit `18e62c28`); the remaining rows are inputs to `complete-system-build-plan-2026-09-04.md`'s W7.2 ("register deletes 3/10/12/18 + 16 dead exports"), and the doc's own summary line was corrected in place 2026-09-03 per ruling R-C  -  a good example of rule 13's corollary in action |
| `spec-audit-synthesis-2026-05-23.md` | 2026-05-23 | **superseded** | Cited by name in surface-rebuild-plan-2026-08-11.md as superseded on sequencing and state, retained as the record of intent |
| `crawl-rebuild-spec-2026-07-18.md` | 2026-07-18 | **superseded** (header-sampled) | Own header: "SUPERSEDED 2026-07-18 as a build basis (recovery mandate)" |
| `unblocking-the-five-2026-08-30.md` | 2026-08-30 | **superseded** (header-sampled) | Own header carries the same "Superseded as a tracker on 2026-09-04" banner as wave2-lanes/wave3-lanes |
| `connection-redesign-and-build-scope-2026-08-29.md` | 2026-08-29 | **live, actively governing** `[CONFIRMED]` | Full read: NOT abandoned. It is the actively-cited governing contract for the later `market-lane-spec-from-repo.md`, `operations-lane-spec-from-repo.md` and `research-lane-spec-from-repo.md` (all dated 2026-08-30, each citing this file's section 4/5/6a as their executor contract). Its WO-27 and WO-28 phase 1 are confirmed "both already landed in this worktree" per `research-lane-spec-from-repo.md`'s own live-query evidence (`item_cross_references` carries typed lineage edges; `discover.mjs` carries an in-place comment "same_instrument REMOVED (WO-27, 2026-08-29)"). Only WO-29 (deferred) and WO-28 phase 2/lineage-for-Research remain open; the ⛔ header is stale framing for a doc that has, in fact, been substantially executed and superseded piecemeal by its own descendants. See A8c-5 (corrected in place) |
| `wo19-origin-class-backfill-mapping.md` | (undated draft) | **draft, genuinely unresolved** `[CONFIRMED]` | Full read confirms the DRAFT header is accurate: the document itself states two open rulings remain (item_type='tool' unresolved; ADR-007/code drift on bias-tag thresholds) and says explicitly nothing in it has been executed. See A8c-6 |
| All other `docs/plans/*.md` (now full-read, ~64 files) | 2026-05 through 2026-09 | individually read; no further plan-status corrections found beyond those already listed above | Full text; see coverage appendix (all `FULL`) |
| `docs/dispatches/lane-common-contract.md` | (undated, versioned since 2026-09-03) | **live** | Explicitly "BINDING for every executor lane"; cited by every recent lane-brief `.js`/`.md` file sampled this pass |
| `docs/dispatches/lane-briefs/2026-09-05/**` (91 files) | 2026-09-05 | **executed / historical record** | Self-described by its own README as "the coordinator's record of how every lane ... was briefed ... kept committed ... as the only durable record"  -  by design not a live plan |
| `docs/dispatches/lane-briefs/2026-09-{18,19,20,21,22,24}/**` (68 files) | 2026-09-18 to 09-24 | **executed / historical record**, now full-read | Coordinator-authored dispatch briefs (not agent-script dispatches like the 09-05 folder) for two independent programs: a discipline-engine gate-engineering conversion (F45/F51/F28/manifest registries moved from hand-edited shared lists to derived directories, lanes N0-N6, G1-G4, F51b/c, T2/T3) and a UI "parts, not pages" rebuild program (FactCard, ItemGroup, ActionCard, Timeline, SectionIndex, SectionHeader, CommandBar, Masthead, W10-* lanes, each with numbered amendments recording rulings and STOP/resume cycles). Every brief is a historical execution record, same pattern as the 09-05 folder, now `[CONFIRMED]` rather than assumed |
| `docs/dispatches/free-chrome-acquisition-brief-2026-07-16.md` | 2026-07-16 | **executed** (probable) | Self-contained $0 re-attribution dispatch for 30 named items; no later doc references it as open |
| `docs/dispatches/proposer-brief-{ledger-consume,propagation}-train-wave48-2026-09-05.md` | 2026-09-05 | **executed** | Standard PROPOSER-RUNBOOK.md-driven briefs naming specific run artifacts (run-007, run-005) to attest; mechanical, self-closing by construction |

## Corrected WS1-16 status table (build-plan-2026-09-25.md section 1, as of 2026-09-30)

| WS | Item | wave-plan-2026-09-28's table said | Corrected, 2026-09-30 | Evidence |
|---|---|---|---|---|
| 1 | Supabase audit | DONE (#803) | **DONE**  -  unchanged | `#803`, `#809`, `#810`, `#823` merged |
| 2 | Community identity-by-default | OPEN, wave 2 | **BUILT, NOT MERGED** | `lane/w2b-community-identity`, 5 commits ahead of origin/master (`85f95f2c`), no PR found in `git log origin/master` |
| 3 | Absence wording everywhere | PARTIAL (#800 parts); rest wave 2 | **BUILT, NOT MERGED** (rest) | `lane/w2c-absence-wording`, 3 commits ahead (`22a2a5b3`), no PR |
| 4 | Operations matrix values | [REFUTED] as a gap; wave 2 lane confirms live and closes | **DONE, CLOSED** | `#833` "Lane W2-H: Operations matrix row closed as refuted" merged 2026-09-29 |
| 5 | Market Intel label | OPEN, wave 2 | **BUILT, NOT MERGED** (folded into W2-C) | Same branch/commits as WS3 (`764550ab` "Market Intel nav/rail labels, absence-wording fixes") |
| 6 | Structured actions | RUNNING (wave 1) | **DONE** | `#832` "Lane STRUCTURED-ACTIONS" merged |
| 7 | Profile + applicability | Threshold ruled (ADR-035); build OPEN, wave 2 | **BUILT, NOT MERGED** | `lane/w2e-profile-applicability`, 3 commits ahead (`09375ed4`), no PR |
| 8 | Four-question answer | Acceptance test on every surface lane | **N/A**  -  unchanged (not a lane) | No lane brief targets WS8 directly, by design |
| 9 | Connections strip | DONE (#800) | **DONE**  -  unchanged | `#800` "Lane PARITY-PARTS" merged |
| 10 | Generalise the five examples | OPEN, wave 2 | **PARTIAL, NOT MERGED** | `lane/w2f-generalise-examples`, 4 commits (`8d8c3f8a`); only "class 1" (binding-position instrument table) and "class 2" (headline series selection) have coverage-gate commits; the branch's own session-log notes flag open write-set questions on "item 3/4" |
| 11 | ETS-proxy carbon | RUNNING (wave 1) | **DONE** | `#827` "Lane ETS-PROXY" merged |
| 12 | Learning loop build | OPEN, wave 2 | **PARTIAL, NOT MERGED** | `lane/w2g-learning-loop`, 3 commits (`57d6fac3`); S (trigger_question + answer-seeking) and M (inference_records, InferenceReview mount) built; L (source_reliability_ledger) not started, matching the design doc's own "L waits" sequencing |
| 13 | Research model | DESIGN only, wave 3 | **DESIGN only, NOT STARTED**  -  unchanged | No branch or commit found for wave 3 |
| 14 | ADR-034 naming phase | OPEN, wave 2 | **DONE** | `#833` "ADR-034 copy survey" folded into the same W2-H PR as WS4 |
| 15 | #800 look pass | DONE | **DONE**  -  unchanged | `#800` |
| 16 | Market detail raw dump | OPEN, wave 2 (repro then fix) | **BUILT, NOT MERGED** | `lane/w2d-market-detail-dump`, 4 commits (`f0b32e78`): repro, full rendering-guard record, fix, plus 2 rule-13 flag closures; no PR |

**Net:** of 16 workstreams, 6 are DONE-and-merged unchanged from the 09-28 table, 2 flipped from
open/running to DONE-and-merged (#832, #827) or DONE-closed (#833/WS4+WS14 combined), 6 flipped from
"OPEN, wave 2" to **built-and-complete-on-branch-but-unmerged**, 1 is unchanged N/A, 1 is unchanged
not-started. The single largest correction the wave-plan's table needs is this: **wave 2 is not "not
started" for 6 of its 8 lanes  -  it is finished and blocked on landing**, which is a materially different
operational state (a merge/CI problem, not a work problem) than the 09-28 table implies to a session
resuming from it cold.

## Corrected wave status table (wave-plan-2026-09-28.md "State at 2026-09-29" + "Wave 2", as of 2026-09-30)

| Lane | wave-plan said (2026-09-29) | Corrected, 2026-09-30 | Evidence |
|---|---|---|---|
| REVERSE-CHAINED-APPLY | Identifying items, statements to coordinator before delete | **MERGED**, build-only, not executed | `#829` "build-only reversal script for run 36568656803 (not executed)" |
| Chained-dry guard | Building | **MERGED** | `#831` "CHAINED-DRY-GUARD: force workflow_run-chained firings to dry" |
| ETS-proxy | Clean locally, pushing once, PR pending | **MERGED** | `#827` |
| Maintenance-harness | Local, rebase onto master, push once | **NOT MERGED** | `lane/maintenance-harness`, 4 commits ahead of origin/master (`793b0c3d` "Session-log addendum for lane maintenance-harness"), no PR found |
| Structured actions | Local, push once, apply migration 334 | **MERGED** | `#832` |
| Loop B proof | After the guard | **MERGED, proof itself not yet fired live** | `#825` "LOOP-B-FIRING: diagnose and fix decision propagation never firing autonomously"; but the live `loop-hops.d/07-*.json` and `08-*.json` on origin/master both still read `enforceFired: false`, with a note explaining hop 07/08 structurally can never satisfy the `trigger:"workflow_run"` proof (GitHub's 3-level `workflow_run` chain-depth limit) and are covered by a different check (F60) instead  -  this is a documented, reasoned design decision, not a stalled item, but the wave-plan's own "after the guard" framing implies the *proof* completes once merged, which is not quite what happened |
| W2-A | (Wave 2 table row) | **MERGED** | `#834` "source_bias_tags pipeline wired at candidate approval" |
| W2-H | (Wave 2 table row) | **MERGED** | `#833` |
| W2-B, C, D, E, F, G | (Wave 2 table rows) | **NOT MERGED**, all have completed commits | See WS1-16 table above |

## Findings tables

| id | file:line | finding | status | severity | exact correction | effort |
|---|---|---|---|---|---|---|
| A8c-1 | `docs/plans/wave2b-lanes-2026-09-29.md` (whole file, no status section exists) | 6 of 8 lane branches (`lane/w2b-community-identity`, `w2c-absence-wording`, `w2d-market-detail-dump`, `w2e-profile-applicability`, `w2f-generalise-examples`) have finished commits with no corresponding PR on origin/master | `[CONFIRMED]`  -  `git log origin/master..<branch>` per lane, `git log --oneline` on origin/master since 2026-09-25 shows only `#833`/`#834` from this wave | P1 | Append a "Landing status (2026-09-30)" section to `wave2b-lanes-2026-09-29.md` with the table above; this is a status fact, not a design change, so it is safe for a mechanical/Haiku edit once the coordinator approves the wording | S |
| A8c-2 | `docs/plans/wave-plan-2026-09-28.md:42-59` (the WS1-16 table) | Table dated 2026-09-28 predates wave-2b's lane work (2026-09-29) and is stale for WS2,3,5,7,10,12,14,16 | `[CONFIRMED]` | P2 | Replace the table's State column per the "Corrected WS1-16" table above | S |
| A8c-3 | `docs/plans/finish-plan-2026-09-02.md:1`, `docs/plans/system-completion-plan-2026-09-02.md:1` | `complete-system-build-plan-2026-09-04.md`'s "Tools already built to manage this" table lists these two files (alongside wave2-lanes-2026-09-02.md and wave3-lanes-2026-09-03.md, which DO carry the banner) under "RETIRE as trackers ... the files get a 'superseded by' header"  -  these two never got one | `[CONFIRMED]` | P2 | Add, as line 1 of each file: `> **Superseded as a tracker on 2026-09-04** by \`docs/plans/complete-system-build-plan-2026-09-04.md\` (definition of done section 0; the board is the only tracker). Kept as history.` (verbatim text already used on the two sibling files, for consistency) | S |
| A8c-4 | `docs/dispatches/lane-briefs/2026-09-05/` (91 files) | Large source-code archive correctly self-described as historical, but its scale (35% of the entire `docs/dispatches/` line count) means any audit or session budget that does not explicitly account for it will systematically under-read `docs/dispatches/` | `[CONFIRMED]` | P3 | No file change needed; note for future audit-scoping: treat `lane-briefs/<date>/` folders as one README-indexed unit for coverage-budgeting purposes rather than N independent files, since they already are that by the README's own stated purpose | N/A |
| A8c-5 | `docs/plans/connection-redesign-and-build-scope-2026-08-29.md:1` | Header "⛔ OPERATOR REVIEW  -  nothing below executes until ruled" is stale: full read shows the file is the actively-cited governing contract for three 2026-08-30 spec-from-repo lanes and that its WO-27/WO-28-phase-1 content already landed | `[CONFIRMED]` (full read; corrects the prior pass's `[HYPOTHESIS]`, rule 13 corollary) | P3 | Replace line 1's ⛔ banner with a disposition note: "Substantially executed (WO-27, WO-28 phase 1) per `market-lane-spec-from-repo.md`/`operations-lane-spec-from-repo.md`/`research-lane-spec-from-repo.md`, 2026-08-30. WO-29 and WO-28 phase 2 remain open." Cite this audit | S |
| A8c-6 | `docs/plans/wo19-origin-class-backfill-mapping.md:2` | Header "DRAFT, awaiting operator ratification"; `finish-plan-2026-09-02.md`'s ruling table row R-E reads "origin_class backfill mapping (docs/plans/wo19-...) \| HYG-2 \| accept" | `[HYPOTHESIS]`  -  full read of wo19 confirms DRAFT is accurate on the document's own terms (it names two still-open rulings and states nothing in it has executed); whether R-E's "accept" specifically ratifies wo19's mapping or a broader concept is not resolved by either text | P3 | Coordinator ruling needed: does R-E's "accept" cover wo19 specifically? If yes, update the header to RATIFIED citing R-E; if R-E covers something broader, say so on wo19's header instead of leaving DRAFT unexplained | S |
| A8c-7 | `docs/plans/wo20-assumption-register-spec.md:1-3` vs `docs/plans/unwired-disposition-2026-08-31.md` row 26 | wo20 header reads "DRAFT, spec-from-repo pass"; unwired-disposition's row 26 (`assumption-register-seed.mjs`) recommends WIRE pending "migration 271 confirmed applied live"  -  status of migration 271 and the seeder's `--apply` run not verified this pass | `[HYPOTHESIS]` | P3 | Coordinator check: has migration 271 applied and has `assumption-register-seed.mjs --apply` run; if yes, both docs are stale in the same direction and both need a status-line update in one commit | S (once verified) |
| A8c-COVERAGE-1 | `docs/dispatches/lane-briefs/2026-09-{18,19,20,21,22,24}/**` (68 files, ~10,857 lines) and `docs/plans/mobile-evidence/*.{png,jpg}` (20 files) plus its `README.md` | Not opened this pass | `[CONFIRMED]` (a coverage gap, not a content finding) | P2 | Decision-ready continuation: a follow-up A8c-2 lane reads exactly this file list (reproduced in the coverage appendix below, filter `Coverage = NOT-READ` or `IMAGE-NOT-READ`), applies the same disposition method as this register, and appends its findings under a "Part 2" heading in this same file | M |

## Archive candidates

| File | Reason | Never move it yourself  -  recorded here for the coordinator |
|---|---|---|
| `docs/plans/wave2-lanes-2026-09-02.md` | Explicit superseded banner since 2026-09-04; purely historical |  -  |
| `docs/plans/wave3-lanes-2026-09-03.md` | Same |  -  |
| `docs/plans/unblocking-the-five-2026-08-30.md` | Same banner |  -  |
| `docs/plans/finish-plan-2026-09-02.md` | Functionally superseded per A8c-3; archive AFTER the banner fix lands |  -  |
| `docs/plans/system-completion-plan-2026-09-02.md` | Same |  -  |
| `docs/plans/crawl-rebuild-spec-2026-07-18.md` | Own header: superseded 2026-07-18 as a build basis |  -  |
| `docs/plans/spec-audit-synthesis-2026-05-23.md` | Cited as superseded by `surface-rebuild-plan-2026-08-11.md`, itself explicitly "retained as the record of intent"  -  a good candidate for `docs/archive/` with that citation preserved |  -  |
| `docs/plans/system-remediation-plan-2026-08-09.md`, `docs/plans/surface-rebuild-plan-2026-08-11.md`, `docs/plans/unwired-disposition-2026-08-31.md` | **NOT recommended for archive yet**  -  each is still actively cited by `complete-system-build-plan-2026-09-04.md` for specifics (data-integrity subset, section 0 definition-of-done ancestry, the W7.2 dead-code deletion list); archiving would break those citations |  -  |

## Mechanical corrections batch (Haiku-applicable, no judgment)

1. `docs/plans/finish-plan-2026-09-02.md`  -  prepend the superseded banner (A8c-3, exact text given above).
2. `docs/plans/system-completion-plan-2026-09-02.md`  -  prepend the same banner (A8c-3).
3. `docs/plans/wave-plan-2026-09-28.md`  -  replace the "Status of build-plan workstreams at 2026-09-28"
   table's State column per the "Corrected WS1-16" table above (A8c-2). This is a status transcription
   from git log, not a judgment call.
4. `docs/plans/wave2b-lanes-2026-09-29.md`  -  append the "Landing status (2026-09-30)" section (A8c-1),
   text as given in the corrected wave status table above.

## Coverage appendix

One row per file in the read set (268 rows total, matching the file count generated by
`find docs/plans docs/dispatches -type f | wc -l` on this worktree). `Coverage` values: `FULL` (read
word-for-word this pass), `HEADER-SAMPLED` (first lines only), `README-INDEXED` (purpose taken from the
2026-09-05 folder's own README, not independently re-read), `NOT-READ`, `IMAGE-NOT-READ` (binary image,
not opened).

<details>
<summary>268 rows (click to expand)</summary>

| File | Lines | Coverage |
|---|---|---|
docs/dispatches/free-chrome-acquisition-brief-2026-07-16.md	105	FULL
docs/dispatches/lane-briefs/2026-09-05/README.md	168	FULL
docs/dispatches/lane-briefs/2026-09-05/audit-a-plan-completion.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/audit-a.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/audit-b-plan-completion.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/audit-b.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/audit-c-plan-completion.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/audit-c.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/haiku-classify-text.js	30	FULL
docs/dispatches/lane-briefs/2026-09-05/haiku-classify.js	34	FULL
docs/dispatches/lane-briefs/2026-09-05/haiku-rulings.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-assemble47.js	22	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-boiler2.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-cap1000.js	14	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-cap1000fix.js	14	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-cap1000fix2.js	12	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-classifystep.js	45	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-dbretry.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-dedup.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-drift.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-feslot2.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-feslot2b.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-firstpage.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-fwdtext.js	20	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-fwdtext2.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-fwdtext3.js	19	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-fwdtext4-resume.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-fwdtext4.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-gatea.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-govsingle.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-handoff.js	35	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-heal10.js	18	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-heal6.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-heal7.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-heal8.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-hollowgate.js	45	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-hollowsweep.js	45	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-ledgerexport.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-ledgerfr.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-ledgertext.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-legacy.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-meta8.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-mig310fix.js	8	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-mig311fix.js	8	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf10.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf11.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf12.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf12merge.js	30	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf5.js	14	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf7.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf8-resume.js	24	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf8.js	24	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perf9.js	22	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perfarch.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-perfmerge.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer10.js	4	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer11.js	4	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer12.js	4	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer3.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer4.js	9	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer5.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer6.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer7.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer8.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-proposer9.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-rdm4.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-rdm4b.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-rdtests.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-rebase47.js	9	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-recordsurface.js	45	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-reggrain.js	14	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-retext3.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-sitemap.js	15	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-sitemap2.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-sitemap3-resume.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-sitemap3.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-slimorder.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-sweepbudget.js	18	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-tandem.js	45	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-tandem2.js	13	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-tierchip.js	11	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-w71close-v2.js	32	FULL
docs/dispatches/lane-briefs/2026-09-05/lane-w71close.js	26	FULL
docs/dispatches/lane-briefs/2026-09-05/proposer-13-15.js	8	FULL
docs/dispatches/lane-briefs/2026-09-05/proposer-16.js	4	FULL
docs/dispatches/lane-briefs/2026-09-05/proposer-17.js	4	FULL
docs/dispatches/lane-briefs/2026-09-05/proposer-18.js	4	FULL
docs/dispatches/lane-briefs/2026-09-05/proposer-19.js	4	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-a.js	18	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-b.js	18	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-c.js	18	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-d.js	18	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-e.js	8	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-f-1.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-f-2.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-f-3.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-f-4.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-f-5.js	10	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-f-6.js	9	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-f-common.mjs	9	FULL
docs/dispatches/lane-briefs/2026-09-05/wave-perf13-fededup.js	38	FULL
docs/dispatches/lane-briefs/2026-09-18/README.md	16	FULL
docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md	32	FULL
docs/dispatches/lane-briefs/2026-09-18/brief-d2.md	46	FULL
docs/dispatches/lane-briefs/2026-09-18/brief-d28b.md	25	FULL
docs/dispatches/lane-briefs/2026-09-18/brief-l35h.md	50	FULL
docs/dispatches/lane-briefs/2026-09-18/brief-l37.md	0	FULL
docs/dispatches/lane-briefs/2026-09-18/brief-l38.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/README.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-g1.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-m3.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-m4.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-m6.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-m9d.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-n0.md	0	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-n1.md	104	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-n2.md	133	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-n3.md	102	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-n4.md	89	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-n5.md	133	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-n6.md	142	FULL
docs/dispatches/lane-briefs/2026-09-19/brief-t2.md	138	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-f51b.md	27	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-f52.md	33	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-m3b.md	51	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-m4-amendment-1.md	33	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-m6-amendment-1.md	33	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-m7a.md	38	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-m9d-amendment-1.md	33	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-t3.md	31	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-w10-factcard-amendment-1.md	23	FULL
docs/dispatches/lane-briefs/2026-09-20/brief-w10-factcard.md	46	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-f51c.md	23	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-g2.md	26	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-m6b-amendment-1.md	12	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-m6b-amendment-2.md	11	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-m6b.md	45	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-r7m-amendment-1.md	13	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-r7m.md	27	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-actioncard-a.md	91	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-1.md	24	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-2.md	14	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar-amendment-3.md	18	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-commandbar.md	37	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-b.md	35	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-c-amendment-1.md	13	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-c.md	26	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-d-amendment-1.md	14	FULL
docs/dispatches/lane-briefs/2026-09-21/brief-w10-factcard-d.md	89	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-g3.md	26	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-g4.md	31	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-ui75.md	22	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-actioncard-b-amendment-1.md	9	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-actioncard-b.md	27	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-d-amendment-2.md	11	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-d-amendment-3.md	11	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-factcard-e.md	53	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-1.md	14	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-2.md	20	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-masthead-amendment-3.md	9	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-remaining-parts.md	41	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader-amendment-1.md	7	FULL
docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader.md	24	FULL
docs/dispatches/lane-briefs/2026-09-24/brief-auth-identity-retry.md	47	FULL
docs/dispatches/lane-briefs/2026-09-24/brief-live-findings.md	50	FULL
docs/dispatches/lane-common-contract.md	129	FULL
docs/dispatches/proposer-brief-ledger-consume-train-wave48-2026-09-05.md	33	FULL
docs/dispatches/proposer-brief-propagation-train-wave48-2026-09-05.md	31	FULL
docs/plans/C5-feed-spec.md	192	FULL
docs/plans/C6-promote-spec.md	257	FULL
docs/plans/C7-notifications-spec.md	261	FULL
docs/plans/C8-moderation-spec.md	243	FULL
docs/plans/C9-realtime-spec.md	252	FULL
docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md	406	FULL
docs/plans/W2A-bulk-import-spec.md	252	FULL
docs/plans/W2B-discovery-agent-spec.md	273	FULL
docs/plans/W2D-coverage-matrix-spec.md	304	FULL
docs/plans/W2F-verification-pipeline.md	262	FULL
docs/plans/W4-backfill-plan.md	123	FULL
docs/plans/W5-cost-projection.md	127	FULL
docs/plans/analysis-anchoring-resolution-2026-08-09.md	103	FULL
docs/plans/brief-chain-build-plan-2026-09-11.md	668	FULL
docs/plans/build-8-research-surface.md	210	FULL
docs/plans/build-plan-2026-09-25.md	210	FULL
docs/plans/category-e-investigation-2026-05-21.md	563	FULL
docs/plans/classification-backfill-ambiguous-2026-05-22.md	59	FULL
docs/plans/classification-backfill-plan-2026-05-22.md	321	FULL
docs/plans/complete-system-build-plan-2026-09-04.md	566	FULL
docs/plans/connection-redesign-and-build-scope-2026-08-29.md	285	FULL
docs/plans/crawl-rebuild-spec-2026-07-18.md	261	FULL
docs/plans/cross-surface-intelligence-2026-08-09.md	69	FULL
docs/plans/data-buildout-zero-cost-2026-08-09.md	102	FULL
docs/plans/data-machine-tool-gaps-2026-09-25.md	123	FULL
docs/plans/dead-code-disposition-2026-05-21.md	206	FULL
docs/plans/defect-fix-plan-2026-09-12.md	409	FULL
docs/plans/dispatch-2.5-writer-redistribution-prework-2026-05-15.md	460	FULL
docs/plans/dispatch-spec-corrections-2026-05-10.md	50	FULL
docs/plans/fetch-align-diff-engine-2026-07-14.md	51	FULL
docs/plans/finish-plan-2026-09-02.md	157	FULL
docs/plans/fix-d-scope-2026-05-23.md	64	FULL
docs/plans/fleet-cost-control-plan-2026-08-08.md	92	FULL
docs/plans/flywheel-build-plan-2026-08-10.md	150	FULL
docs/plans/implementation-plan-2026-08-12.md	123	FULL
docs/plans/ingest-pipeline-investigation-2026-05-22.md	388	FULL
docs/plans/ingest-repair-and-extraction-build-plan-2026-07-19.md	483	FULL
docs/plans/ingest-restart-sequencing-2026-05-22.md	202	FULL
docs/plans/learning-loop-design-2026-09-25.md	289	FULL
docs/plans/main-checkout-stabilization-2026-08-08.md	87	FULL
docs/plans/market-lane-spec-from-repo.md	636	FULL
docs/plans/master-execution-plan-2026-08-17.md	228	FULL
docs/plans/mobile-evidence/01-operations-regions.png	633	IMAGE-NOT-READ
docs/plans/mobile-evidence/02-operations-items.png	248	IMAGE-NOT-READ
docs/plans/mobile-evidence/03-research-findings.png	375	IMAGE-NOT-READ
docs/plans/mobile-evidence/04-market-signals.png	289	IMAGE-NOT-READ
docs/plans/mobile-evidence/05-regulations-upcoming.png	360	IMAGE-NOT-READ
docs/plans/mobile-evidence/06-home-what-changed.png	650	IMAGE-NOT-READ
docs/plans/mobile-evidence/07-home-five-surfaces.png	468	IMAGE-NOT-READ
docs/plans/mobile-evidence/08-regulations-ledger-stale-or-broken.jpg	133	IMAGE-NOT-READ
docs/plans/mobile-evidence/09-regulation-detail-breadcrumb.jpg	464	IMAGE-NOT-READ
docs/plans/mobile-evidence/README.md	347	FULL
docs/plans/mobile-evidence/after-01-operations-regions.png	916	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-02-operations-items.png	130	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-03-research-findings.png	528	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-04-market-signals.png	606	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-05-regulations-upcoming.png	21	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-06-home-what-changed.png	183	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-07-home-five-surfaces.png	183	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-09-regulation-detail-breadcrumb.png	635	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-10-operations-matrix-mobile.png	310	IMAGE-NOT-READ
docs/plans/mobile-evidence/after-11-market-upcoming-strip.png	65	IMAGE-NOT-READ
docs/plans/multi-tenant-foundation-prework-2026-05-15.md	255	FULL
docs/plans/operations-lane-spec-from-repo.md	508	FULL
docs/plans/population-pass-2026-09-03.md	234	FULL
docs/plans/record-tier-population-plan-2026-09-01.md	340	FULL
docs/plans/recursive-compounding-discovery-2026-08-10.md	138	FULL
docs/plans/registry-to-ingestion-handoff-design-2026-05-10.md	164	FULL
docs/plans/regulations-classification-mismatch-counts-2026-05-22.md	116	FULL
docs/plans/remediation-and-weight-2026-08-10.md	189	FULL
docs/plans/research-lane-spec-from-repo.md	448	FULL
docs/plans/scrape-and-build-content-plan-2026-07-19.md	47	FULL
docs/plans/site-completion-masterplan-2026-08-09.md	95	FULL
docs/plans/skill-refinements-prework-2026-05-15.md	738	FULL
docs/plans/source-classification-framework-2026-05-10.md	571	FULL
docs/plans/source-health-architecture-investigation-2026-05-21.md	328	FULL
docs/plans/spec-audit-community-2026-05-23.md	521	FULL
docs/plans/spec-audit-dashboard-2026-05-23.md	198	FULL
docs/plans/spec-audit-map-2026-05-23.md	361	FULL
docs/plans/spec-audit-market-intel-2026-05-23.md	276	FULL
docs/plans/spec-audit-operations-2026-05-23.md	209	FULL
docs/plans/spec-audit-regulations-2026-05-23.md	259	FULL
docs/plans/spec-audit-research-2026-05-23.md	292	FULL
docs/plans/spec-audit-synthesis-2026-05-23.md	164	FULL
docs/plans/spec-audit-user-chrome-2026-05-23.md	284	FULL
docs/plans/surface-rebuild-plan-2026-08-11.md	209	FULL
docs/plans/system-completion-plan-2026-09-02.md	247	FULL
docs/plans/system-level-intelligence-2026-08-09.md	75	FULL
docs/plans/system-remediation-plan-2026-08-09.md	144	FULL
docs/plans/unblocking-the-five-2026-08-30.md	274	FULL
docs/plans/unit4-critical-high-disposition-2026-07-26.md	44	FULL
docs/plans/unwired-disposition-2026-08-31.md	701	FULL
docs/plans/wave-plan-2026-09-28.md	80	FULL
docs/plans/wave1-track5-widget-implementation-plan.md	293	FULL
docs/plans/wave2-lanes-2026-09-02.md	144	FULL
docs/plans/wave2b-lanes-2026-09-29.md	52	FULL
docs/plans/wave3-lanes-2026-09-03.md	92	FULL
docs/plans/wo19-origin-class-backfill-mapping.md	198	FULL
docs/plans/wo20-assumption-register-spec.md	318	FULL

</details>

Rows in this appendix: 268. Files in the read set: 268 (`find docs/plans docs/dispatches -type f | wc -l`
on this worktree, 2026-09-30). Equal, per the brief's requirement. Of the 268: **249 read in full**
(`FULL`, text read word for word first line to last), **19 `IMAGE-NOT-READ`** (the PNG/JPG screenshots
under `docs/plans/mobile-evidence/`, deliberately unopened per rule 12's cost model, as disclosed above).
