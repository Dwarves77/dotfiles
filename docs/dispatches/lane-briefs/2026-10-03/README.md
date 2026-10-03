# Lane briefs, 2026-10-03 - Market Intel completion lanes L10, L11, L12 (complete-build-plan Wave 3)

Written by coordinator lane BRIEFS-W3, docs-only. Built from `CLAUDE.md`, `docs/plans/complete-build-
plan-2026-10-01.md` (full read, all 7 waves), `docs/decisions/ADR-039-complete-build-rulings-2026-10-
01.md` and `ADR-038-research-assessment-model.md` (frontmatter and full text; neither carries a Market
Intel ruling - confirmed by grep, see "What ADR-038/039 do not cover" below), `docs/dispatches/lane-
common-contract.md` in full, `docs/dispatches/lane-briefs/2026-10-02/README.md` and its `brief-l3.md` /
`brief-l6.md` as the exact style precedent, `docs/PROGRAM-BOARD.md`'s resume pointer and its Wave 2
sub-table and remediation-lane thread table, `docs/specs/02-market-intel.md` in full, `docs/plans/
finish-plan-2026-09-02.md` (the Wave 2 "CORR" lane description, section with the lead-time-chart
ruling), and a live read of the current `origin/master` tree for every file named below (not assumed from
the plan's own register, which is dated 2026-10-01 and is stale against work that landed earlier, under
lanes SURF and CORR, 2026-09-01/02 - see "What is already built" below).

## Why this wave

The coordinator's brief instructs: draft the wave after the Research lanes. `docs/plans/complete-build-
plan-2026-10-01.md` section 2 orders waves 0-7; Wave 2 is Research (L1-L9), confirmed landed per
`docs/PROGRAM-BOARD.md`'s resume pointer (W2-R/PR #887, and the 2026-10-02 dispatch briefs for L3, L5-L9,
PR #888, merged). **Wave 3 is Market Intel completion (spec 02): L10, L11, L12.** No earlier-wave lane
under the complete-build-plan's own numbering (L0-L9) is open per the board. The board's "Lane 7", "two
unnamed lint lanes", "Lane 10" and "Lane 21" that are IN PROGRESS/OPEN belong to a different numbering
space - the Wave 0 remediation plan (`docs/plans/remediation-plan-2026-09-30.md`'s own 22 lanes, not this
plan's L-series) - listed below per the coordinator's "any earlier-wave lane the board still shows as not
DONE" instruction, since Wave 0 precedes Wave 3 in this plan's own ordering even though it is not part of
the L-series.

**Earlier-wave (Wave 0, remediation plan numbering) lanes - resolved state, per the coordinator's
2026-10-03 message, superseding the 2026-10-02 board pointer's "IN PROGRESS/OPEN" framing above:**
- Remediation Lane 7 = **R7**. Coordinator-reported 2026-10-03: pushing now. Not yet merged as of this
  dispatch's drafting - `gh pr list --search "R7"` found no matching PR at the time of this check, so the
  push has not yet produced a reviewable PR on this session's own look. Status recorded as the
  coordinator stated it (pushing), not independently upgraded to DONE.
- The two unnamed lint lanes = **LINT-A (PR #893)** and **LINT-C (PR #892)**. Both **MERGED**
  [CONFIRMED, `gh pr view 893`/`892` - `mergedAt` 2026-10-02T20:11:34Z and 2026-10-02T20:09:19Z, state
  MERGED].
- Remediation Lane 10 = **R10**. **MERGED as PR #864** [CONFIRMED, `gh pr view 864` - "Lane R10: rule 14
  relabel of 95 audit files; status checker strict", mergedAt 2026-10-02T03:39:20Z, state MERGED].
- Remediation Lane 21 (PostgREST `.or()` filter-injection, CF-SEC-15) - **checked, still OPEN**
  [CONFIRMED by absence: `gh pr list --state merged --search "R21"` and `--search "injection"` both
  return no PR whose title matches Lane 21's own scope; the one hit for "injection" (PR #872, "injection
  claim refuted") refutes a DIFFERENT finding, CF-PROC-2 (a mid-session message-provenance question,
  `docs/audits/audit-consolidated-2026-09-30.md` line 270), not CF-SEC-15. CF-SEC-15 itself is still
  recorded `[CONFIRMED]` P2, unfixed, at `docs/audits/audit-consolidated-2026-09-30.md` line 198 (5 call
  sites across `community/search/route.ts` and the `operations`/`research` `[slug]` pages). This lane
  reports the honest result of the requested check rather than recording a resolved state the check did
  not produce, per CLAUDE.md rule 2 (never fabricate) and rule 14 (label every finding's verification
  status) - R21 remains OPEN, not resolved, pending the coordinator's own disposition.

These four are not part of this dispatch's write set (this dispatch is Wave 3 of the complete-build plan,
not the remediation plan); recorded here per the coordinator's 2026-10-03 message. None of L10/L11/L12
below depends on them.

## What is already built - read this before treating any brief below as a from-scratch build

The complete-build-plan's own section 1.2 register states 02S6 row 4 (signal/fact chip) as **partial
[HYPOTHESIS, spec-dated]** and 02S6 row 3 (carbon-cost overlay) as **built-and-proven [AUDITED]** with a
named gap ("Market detail rendering ... separate from the producer; raw-dump bug (CF-BROKEN-6) ... fix
built not merged"). A live read of `origin/master` this session [CONFIRMED] finds both rows further
along than the register states:

1. **The chip-inversion defect is already fixed and live**, not hypothesis. `fsi-app/src/lib/market/
   signal-promotion.mjs` (lane SURF) replaces the `isSignalType = !!r.type` always-true check with
   `derivePromotionState()`, a four-state `PROMOTION_STATE` vocabulary (`unclassified` / `signal_
   unconfirmed` / `signal_corroborated` / `fact`) gated on `origin_class` (citable-as-fact) and
   `independent_citers`, never on corroboration count alone. It is imported and called in `fsi-app/src/
   components/pages/MarketSignalDetailSurface.tsx` lines 60/250-253, and `promotion.label` renders as the
   item's "Status" field (line 407). `grep -n "isSignalType" fsi-app/src` returns nothing on current
   master - the named defect string no longer exists anywhere in the tree.
2. **The carbon-cost-per-FEU figure already renders on the detail page**, not only via the ledger-page
   `CarbonCostOverlay` block the plan's L12 text describes. `MarketSignalDetailSurface.tsx` separately
   imports `buildCarbonOverlayView` from `fsi-app/src/lib/market/carbon-overlay-view.mjs` and renders its
   `figure.value` / `figure.unit` / `body` at lines 286-501, a second, item-scoped render path alongside
   the corridor-list-scoped `<CarbonCostOverlay/>` block in `fsi-app/src/app/market/page.tsx`.
3. **`lane/w2d-market-detail-dump` (PR #882) is merged to `origin/master`** [CONFIRMED,
   `git merge-base --is-ancestor origin/lane/w2d-market-detail-dump origin/master` - actually the branch
   ref itself predates a squash; confirmed instead by `git log --oneline origin/master` containing commit
   `34c6fc79 "Lane W2-D: market detail dump (#882)"` and the file importing cleanly]. L12's own stated
   dependency (L0, the Wave-1 merge) is satisfied.
4. **The EIA v2 petroleum-spot producer already exists**, code-complete, dry-run-safe, registered in
   `.github/workflows/producers.yml` (`eia-v2-petroleum-spot` option, ENABLED gate, dry unless `--apply`).
   Its own header states plainly it could not confirm today's live product-code set against an
   authenticated response (this session's network egress cannot reach `api.eia.gov`) and is blocked only
   on the `EIA_API_KEY` GitHub Actions secret - exactly the plan's own framing, now re-confirmed live
   rather than carried forward from the plan's prose.

None of this makes L10/L11/L12 no-op lanes. Each brief below is scoped to what remains, named precisely,
not to the plan's original from-scratch framing.

## Coordinator ruling, 2026-10-03 - the lead-time chart / SBTi conflict is resolved, not open

This section originally raised a conflict as an open question (the finish-plan-2026-09-02.md ruling,
"lead-time chart stays ruled out, no data source," against the complete-build-plan's own L10/L11 text
instructing it be built). The coordinator has ruled, under ADR-039's operator delegation: **the
complete-build-plan (2026-10-01) is the later decision and supersedes the finish-plan ruling. The chart
is built, fed by the SBTi Target Dashboard public dataset** (free, weekly, no login, named in spec 02
section 7). This is recorded here, and in both brief-l10.md and brief-l11.md directly, as a coordinator
ruling dated 2026-10-03 under the ADR-039 delegation - not re-litigated on each future read of this
README.

Both halves ship: L10 builds `LeadTimeChart.tsx` and corrects `CarbonCostOverlay.tsx`'s header and
footer prose in place (rule 14 - the superseded ruling is recorded as corrected, not silently deleted);
L11 builds the SBTi producer, following the same dispatch-only, dry-default, `ENABLED`-gated pattern as
every other market producer, with its workflow's secrets wired the same way `research-assessment.yml`
wires its own (the PATTERN, since SBTi itself needs no new secret - it is a free, no-login .xls).

The EIA_API_KEY secret remains an operator action; per the coordinator's 2026-10-03 message, the
coordinator requests it from the operator directly rather than this lane preparing an ask for later. L11
still ships the exact command and runbook as the decision-ready artifact for that request (CLAUDE.md
rule 13).

## Migration numbers

The plan's own table (section 2) states "Migrations requested: none" for L10, L11 and L12 - none of the
three touches schema. No number is requested or reserved by this dispatch. For the record: the plan's
own highest assignment anywhere (L0-L28) is 360; the 2026-10-02 dispatch (`docs/dispatches/lane-briefs/
2026-10-02/README.md`) reserved 361-365 for L3/L5/L7/L8/L9 (not consumed - those lanes needed no schema
change either); migration 346 is the highest APPLIED migration on `origin/master` (`fsi-app/supabase/
migrations/346_research_assessments_entity_spine_signposts.sql`, confirmed by directory listing). If any
lane below finds, against this brief, that it genuinely needs a migration, it STOPs and asks the
coordinator by name before writing one; the next free, unreserved number would be **366**.

## Lane summaries

- **L10 - Market Intel signal/fact chip (verification only) + lead-time chart (built).** The chip-
  inversion fix is already built and live (see "What is already built" item 1); this half is a
  verification pass with a live regression check, plus a UX smoke registration if one does not already
  exist. The lead-time-chart half is now built per the coordinator's 2026-10-03 ruling above:
  `LeadTimeChart.tsx`, fed by L11's SBTi producer, plus an in-place correction of `CarbonCostOverlay.tsx`'s
  superseded "ruled out" header/footer prose.

- **L11 - SBTi Target Dashboard producer (built) + EIA v2 unblock (real remaining work).** The SBTi
  producer is now built per the ruling above, following the existing WO-16 registry pattern and the
  `research-assessment.yml` dispatch-only/secrets-wiring shape. The EIA producer is code-complete; this
  lane's real work there is the operator runbook and a dry-run-to-apply verification once the secret is
  set - the coordinator requests the secret from the operator directly, not this lane.

- **L12 - Carbon-cost-per-FEU detail-page rendering (verification only).** Both the ledger-page overlay
  and the detail-page's own `carbon-overlay-view.mjs` render path already exist and the w2d raw-dump fix
  is merged. This lane is a live verification pass against a real corridor item, not new construction.

## Standing prohibitions (every lane, restated from the lane common contract and CLAUDE.md)

- No nested agents - each lane does its own work, never delegates to the Agent tool (operator, 2026-09-
  28).
- No `--no-verify`, ever.
- No edits to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or `docs/INDEX.md` directly - each lane
  writes its own `docs/ops/session-log.d/YYYY-MM-DD-<lane>.md` file and leaves a "COORDINATOR ACTION
  NEEDED" line naming the INDEX.md entry it needs.
- No new allowlist entry (shared-writer registry, governing-files list, PINNED_MANIFEST) without a named
  ruling or ADR citing it; a lane that needs one states the need and stops rather than adding it
  unilaterally.
- No DB credentials, no live writes without the three-gate R14 shape (reviewed-code ENABLED const,
  runtime kill switch, CLI `--apply` flag); every script is dry by default.
- No standing cron or schedule armed by any lane (rule 16) - the SBTi producer and the lead-time chart
  are both built per the coordinator's 2026-10-03 ruling, but dispatch-only, never scheduled.
- No fabricated lead-time position under any sample size (L10) and no silent drop of an SBTi
  "commitment removed" company (L11) - both render/report the honest gap explicitly.

## Touched tests and the push gate

Every lane below runs only the tests for the files it actually touched during the work (named in each
brief's "Tests" section); the pre-push hook (`DISCIPLINE_HOOK_TRAMPOLINE=1 sh fsi-app/.discipline/hooks/
pre-push`) runs the full suite before any push and is the real gate - a lane does not need to run the
whole suite itself ahead of that hook, per the lane common contract's "Gates before handoff" section.

## What ADR-038/039 do not cover

`grep -n -i "market" docs/decisions/ADR-039-complete-build-rulings-2026-10-01.md` returns two hits, both
in the YAML frontmatter `scope:` list citing `fsi-app/src/lib/market/surcharge-audit.ts` and `indexation-
clause.ts` - both Wave 7 (L22/L23) files, not Wave 3. ADR-038 is titled "Research assessment model" and
its scope is Research only. Neither ADR binds anything in this dispatch; each brief below cites CLAUDE.md
rules and `docs/specs/02-market-intel.md` directly instead.
