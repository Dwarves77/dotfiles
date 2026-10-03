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

**Earlier-wave (Wave 0, remediation plan numbering) lanes the board still shows as not DONE, 2026-10-02
resume pointer:**
- Remediation Lane 7 (wire ESLint into CI/pre-push) - IN PROGRESS, coordinator-reported, no PR/branch
  independently verifiable as of the pointer's own check.
- Two unnamed lint lanes (coordinator-reported alongside Lane 7) - IN PROGRESS, scope not yet named to
  the board.
- Remediation Lane 10 (consistency-backstop required-check promotion) - OPEN, not covered by PR 863-884.
- Remediation Lane 21 (fix PostgREST `.or()` filter-injection pattern) - OPEN, not covered by PR 863-884.

These four are not part of this dispatch's write set (this dispatch is Wave 3 of the complete-build plan,
not the remediation plan) and are listed here only so the gap is not silently dropped, per rule 13. The
coordinator should disposition them separately; none of L10/L11/L12 below depends on them.

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

## Open question - read before dispatching L10 or L11 (not invented an answer)

`docs/plans/finish-plan-2026-09-02.md` (Wave 2, lane CORR) rules, verbatim: **"Lead-time chart stays
ruled out (no data source) and is named as such on the surface."** `CarbonCostOverlay.tsx`'s own header
restates the same ruling in its own prose (section 6 item 5 of spec 02, section 5 of the finish-plan -
paraphrased here, not quoted verbatim, to avoid the section-sign glyph its header uses): the lead-time
chart stays ruled out for lack of a data source, and the overlay's own footer names that explicitly on
the same surface. `docs/specs/02-market-intel.md` section 7 names SBTi Target Dashboard as a free,
no-login weekly source and states
explicitly "this is the diffusion engine behind the lead-time chart" - SBTi has no other named use in
spec 02. `docs/plans/complete-build-plan-2026-10-01.md`'s L10 and L11 instruct building the lead-time
chart and the SBTi producer that feeds it, dated 2026-10-01, one month after the finish-plan ruling, and
do not cite or mention the finish-plan ruling at all.

This is a genuine conflict between two dated standing documents, not a stale note the newer plan silently
corrects (the newer plan shows no sign of having read the older ruling). The coordinator does not resolve
this unilaterally. **Both L10's lead-time-chart half and L11's SBTi-producer half are held pending an
operator ruling: does "no data source" still hold now that a free SBTi weekly source has been named
explicitly in spec 02 section 7, or does the finish-plan ruling stand and the complete-build-plan's own
rows were written without re-checking it?** Each brief below states this as its own open item at the top
and ships only the part of its scope that does not depend on the answer.

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

- **L10 - Market Intel signal/fact chip (verification only) + lead-time chart (held).** The chip-
  inversion fix is already built and live (see "What is already built" item 1); this lane's work is a
  verification pass with a live regression check that the exact named defect does not recur, plus a UX
  smoke registration if one does not already exist. The lead-time-chart half is held on the open question
  above; the brief states exactly what to build once answered, and builds nothing until then.

- **L11 - EIA v2 unblock (real remaining work) + SBTi producer (held).** The EIA producer is code-
  complete; this lane's real work is preparing the exact `gh secret set` command and the operator
  checklist to register `EIA_API_KEY`, then a single dry-run-to-apply verification once the operator
  confirms the secret is set. The SBTt producer half is held on the same open question as L10.

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
- No standing cron or schedule armed by any lane (rule 16).
- No lane builds the lead-time chart or the SBTi producer before the open question above is answered by
  the operator; a lane that reaches that fork STOPs and reports it, it does not pick a side.

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
