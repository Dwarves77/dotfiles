# Build overview, 2026-09-30

One-page state of the Caro's Ledge build. Sources: `docs/audits/audit-consolidated-2026-09-30.md`
(OUTPUT 1 of this consolidation), `docs/audits/architecture-review-2026-09-30.md` (A7, merged #837),
`docs/audits/mechanical-checkers-2026-09-30.md` (A9, merged #836), `git log --oneline --first-parent
origin/master --since=2026-09-25`, `gh pr list --state open`, and the three plan documents named in the
consolidation brief. Every cell below cites the proving artifact; a cell with no PR/branch citation is
not asserted as built.

## Table 1: by customer surface

| Surface | State | Proving artifact |
|---|---|---|
| Regulations | Built and proven | A7 section 4: live populated pages, shares `ListSurfaceShell`/`useListSurfaceFilter`/`liveFacetCounts` with the other 3 intelligence surfaces (`RegulationsLedger.tsx`, 350 lines, read in full); structured-action extraction (WS6) merged #832, closing the "what must I do" gap; not confirmed rendering on the detail page this pass (`[HYPOTHESIS]`, A7) |
| Market Intel | Partial | 3 live producers write real rows to `published_price_statistics` (A7 section 1); nav label still wrong ("Market" not "Market Intel" at `Sidebar.tsx:76`, `DashboardBrief.tsx:361`, W2-C scoped, not merged); raw-dump bug reported, not yet reproduced (CF-BROKEN-6, `[HYPOTHESIS]`, W2-D scoped, not merged) |
| Research | Built-unproven for format, missing for assessment | Horizon-scan format built (spec 03); the distance/maturity/credibility assessment model is correctly still DESIGN ONLY, gated behind the four-question rebuild (build-plan WS13, wave 3) |
| Operations | Built and proven | Region×dimension matrix envelope-reader gap investigated and REFUTED (`fetchOperationsCoverage` selects all 11 columns, `supabase-server.ts:3376-3396`; closed by lane W2-H, merged #833); generalization beyond the one automate-vs-hire example is W2-F, partial, not merged |
| Community | Partial | Identity-by-default ruled (R8.7) but the anonymity opt-in columns (migration 336) and the composer 400 fix are W2-B's scope, branch `lane/w2b-community-identity`, not merged as of `c55cfb2e` |
| Dashboard | Built, one dead component | `DashboardBrief.tsx`/`DashboardMasthead.tsx` live; `home/DashboardTopPriority.tsx` (513 lines, drag-and-drop priority list) is fully built and unmounted (CF-DEAD-2) |
| Map | Built, minor polish debt | `/map` renders; raw hex colors in `MapView.tsx` (6 sites) bypass the semantic token system (A2b B1, P2, cosmetic) |
| Assistant | Built | `AskAssistant.tsx` (526 lines) read in full, no findings (A2); Ask mode ON in production per `brief-chain-build-plan-2026-09-11` Part 4 Task 4.3, carried KEEP by build-plan-2026-09-25 section 2 |

## Table 2: by data-machine stage

| Stage | State | Proving artifact |
|---|---|---|
| Collect (source-sweep to fetch-drain) | Built and wired | A7 section 1; hop `sweep-to-fetch-drain` wired in `fetch-drain.yml`; not independently re-verified fired this pass beyond the hop-01 staleness fix already landed 2026-09-25 |
| Consume (ledger-consume, corpus-turn) | Built and wired, proven fired | A4 CHECK 3: `sweep-to-ledger-consume` is the one hop with live `gh run list` evidence of a real `workflow_run`-triggered firing (36611354387, 2026-09-29); the same evidence includes the cancelled chained-apply incident on the same hop (36568656803), see CF-BROKEN-7 |
| Mint (canonical-pipeline.ts, mint-item.ts) | Built and proven, one moat defect | A7: `canonical-pipeline.ts` (2,256 lines) read in full, judged sound with load-bearing coupling in its grounding stage; A3b: `officialness.mjs`'s STEP 2 anti-fabrication check is a structural no-op (CF-BROKEN-1, P1, unfixed as of this document) |
| Analyse and connect (propagation, entity spine, connections) | Built; autonomous firing proven once, under an incident | Entity spine sound (`entities=2880` live, A7 section 3); `propagation/drain.ts` (306 lines) read in full, sound; Loop B (decision propagation) populated only by hand-dispatch through 2026-09-28; first genuine autonomous chained fire attempt on 2026-09-29 was caught mid-flight by the operator, not by an automated gate (CF-BROKEN-7); the class fix (chained-dry-guard) landed same day, merged #831 |
| Produce (brief-export/apply, structured actions) | Built | Structured-action extraction shipped 2026-09-29, merged #832; mint chokepoint's single write site (`writeSynthesizedBrief`) read in full by A7, sound |
| Publish (surface rendering) | Built for 3 of 5 surfaces (see Table 1) | See Table 1 rows Regulations/Operations (built) vs Market Intel/Community (partial) vs Research (design only) |
| Harness record | Built and proven | `harness_runs` (migration 331, header-corrected to APPLIED per Lane 4 of the remediation plan) is the sole run-of-record after the 2026-09-26 "no Actions PRs" ruling, merged #813; F50 loop-wiring gate green (0 violations, A9) |

## Table 3: workstreams WS1-16 and Wave 2 lanes W2-A..H

Reconciled against `git log --oneline --first-parent origin/master --since=2026-09-25` and `gh pr list
--state open` at this document's HEAD (`c55cfb2e`), per lane A8c's own corrected tables, restated here.

| WS | Item | State | Evidence |
|---|---|---|---|
| 1 | Supabase audit | DONE | #803, #809, #810, #823 merged |
| 2 | Community identity-by-default | BUILT, NOT MERGED | `lane/w2b-community-identity`, 5 commits ahead, no open PR found under that head ref in `gh pr list` |
| 3 | Absence wording everywhere | BUILT, NOT MERGED | `lane/w2c-absence-wording`, 3 commits ahead |
| 4 | Operations matrix values | DONE, CLOSED | #833 "Lane W2-H: Operations matrix row closed as refuted", merged 2026-09-29 |
| 5 | Market Intel label | BUILT, NOT MERGED (folded into W2-C) | same branch as WS3 |
| 6 | Structured actions | DONE | #832 merged |
| 7 | Profile + applicability | BUILT, NOT MERGED | `lane/w2e-profile-applicability`, 3 commits ahead |
| 8 | Four-question answer | N/A (acceptance test, not a lane) | unchanged |
| 9 | Connections strip | DONE | #800 merged |
| 10 | Generalise the five examples | PARTIAL, NOT MERGED | `lane/w2f-generalise-examples`, 4 commits; only 2 of the 5 example classes have coverage-gate commits per A8c |
| 11 | ETS-proxy carbon | DONE | #827 merged |
| 12 | Learning loop build | PARTIAL, NOT MERGED | `lane/w2g-learning-loop`, 3 commits; S+M built (trigger_question, inference_records, InferenceReview mount), L (source_reliability_ledger) not started, matching the design doc's own sequencing |
| 13 | Research model | DESIGN only, NOT STARTED | no branch or commit found |
| 14 | ADR-034 naming phase | DONE | #833, folded into the same PR as WS4 |
| 15 | #800 look pass | DONE | #800 merged |
| 16 | Market detail raw dump | BUILT, NOT MERGED | `lane/w2d-market-detail-dump`, 4 commits: repro, rendering-guard record, fix, 2 rule-13 flag closures |

| Wave-2 lane | Scope | State | Evidence |
|---|---|---|---|
| W2-A | Audit-triage WIRE items | DONE (folded pre-wave-2b) | #834 "source_bias_tags pipeline wired at candidate approval" merged |
| W2-B | Community identity-by-default (WS2) | BUILT, NOT MERGED | see WS2 above |
| W2-C | Absence wording + Market Intel label (WS3, WS5) | BUILT, NOT MERGED | see WS3/WS5 above |
| W2-D | Market detail raw dump (WS16) | BUILT, NOT MERGED | see WS16 above |
| W2-E | Profile + applicability (WS7) | BUILT, NOT MERGED | see WS7 above |
| W2-F | Generalise examples (WS10) | PARTIAL, NOT MERGED | see WS10 above |
| W2-G | Learning loop S-M-L (WS12) | PARTIAL, NOT MERGED | see WS12 above |
| W2-H | ADR-034 naming + Operations matrix (WS14, WS4) | DONE | #833 merged |

**Net, restated from A8c:** of 16 workstreams, 6 are DONE-and-merged, 6 are built-and-complete-on-branch
but unmerged (a merge/landing problem, not a work problem), 1 is partial-not-merged, 1 is unchanged N/A, 1
is unchanged not-started, 1 (WS10/W2-F) is partial-not-merged. Of the 8 wave-2b lanes, only W2-A and W2-H
have landed on `origin/master`; W2-B through W2-G are finished-or-partial commits sitting on unmerged
branches.

## Table 4: what is left, as a finish line (no dates)

**Wave A, land what already exists (smallest, highest-value; nothing here needs new design work):**
- Merge W2-B, W2-C, W2-D, W2-E, W2-F, W2-G (6 branches, finished-or-partial commits, CI-parity already
  proven for the wave-1 lanes that used the same pipeline).
- Execute the chained-apply reversal (`--apply --archive` under operator approval, Lane 1 of the
  remediation plan).
- PROGRAM-BOARD resync (Lane 15 of the remediation plan).

**Wave B, close the confirmed P1 defects (remediation-plan Lanes 2, 3, 4, 7, 8):**
- Fix the `officialness.mjs` anti-fabrication moat no-op.
- Add `guardedUpsert` and migrate the 2 known bypass sites.
- Migration header truth pass (4 confirmed, 7 to verify) plus a standing check.
- Wire ESLint into CI/pre-push; add the bracket-path test guard.

**Wave C, finish Wave 2's remaining scope plus Wave 3:**
- WS10 (generalise the 5 hard-coded examples): 3 of 5 classes still need their coverage test.
- WS12 (learning loop): L tier (`source_reliability_ledger`) not started, waits on ADR-036's own
  sequencing.
- WS13 (research assessment model): design only; build gated behind the four-question structure landing
  everywhere else first, per decision 4.
- Remaining M1-M9 lanes from `complete-system-build-plan-2026-09-04.md` section 6.1 not already covered.
- Proof run 6.2 and the 6.3 data population, both gated behind R14 ("tools before data") until the tool
  gaps above close, not behind any calendar date.

**Wave D, class-fix backlog (remediation-plan Lanes 5, 6, 9, 10, 11, 14, and the docs lanes 16-18):**
- `db-catalog.json` refresh, `inference_records` disposition, `sources.reliability_score` drop.
- RLS/admin-gate class lint.
- Consistency-backstop required-check promotion.
- Rule-14 backlog relabel (123 files) and hard-gate flip.
- Clock-fragility and exit(0) standing checks; the `scripts/verify/**` coverage gap A4b names as its own
  top finding (159 of 235 files not read at full depth this audit wave).
- Duplication class fixes (5 pairs).
- Mechanical docs corrections batch, corrected WS/wave status tables, the 4-month-old followups
  reconciliation.

**Explicitly not scoped for any wave above, by standing rule:** live-data population beyond what R14
already permits (the tools-before-data hold), any new customer surface beyond the five already
specified, and any change to an artboard's visual system (artboard divergences get a Design Changes Owed
entry per rule 20, not a code fix).

## What a customer can use today, and what they cannot

A customer visiting Caro's Ledge today can read live, populated Regulations and Operations pages built on
a genuinely shared architecture (one list shell, one filter model, one facet-count derivation across all
four intelligence surfaces), get a structured "what must I do" action list on Regulations items shipped
2 days before this document, and use the Assistant in production. Community shows the platform's identity
model in principle but not yet the anonymity controls the design already specifies, and its composer has a
known error. Market Intel has real data flowing from 3 live producers but ships a wrong nav label and an
unreproduced visual bug that would read as a credibility failure to anyone who hits it. Research shows the
horizon-scan format but not yet the underlying assessment model that would let a customer judge how far
out or how credible a signal is, by design, that is sequenced to land after the four-question rebuild
finishes everywhere else. Nothing a customer sees today depends on the autonomous data-machine loop
actually running unattended, every mint on the site so far reached a customer by way of a human- or
coordinator-triggered workflow, not the self-propagating chain the architecture is built toward; the one
attempt at that autonomous chain this month wrote 33 rows that had to be quarantined and are still
sitting in production awaiting the approved reversal.

The three things that would most change what a customer sees, in order of leverage: first, landing the 6
already-finished Wave-2 branches, which alone closes the Community anonymity gap, the Market Intel label
and raw-dump bug, and the profile/applicability build, all of which are done and waiting on a merge, not
on more work. Second, fixing the `officialness.mjs` anti-fabrication moat gap, because it is the one
confirmed defect in this audit wave that sits directly on the promise the whole platform makes about facts
never being fabricated, even though no customer-visible symptom has been traced to it yet. Third, proving
the autonomous loop end to end on a fixture or branch database rather than live, so the next mint the site
performs is provably self-propagating rather than another hand-dispatched, individually-watched run.
