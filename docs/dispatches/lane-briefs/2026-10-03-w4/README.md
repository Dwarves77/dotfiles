# Lane briefs, 2026-10-03 - Operations completion lanes L13, L14, plus L-CORRIDOR (complete-build-plan Wave 4)

Written by coordinator lane BRIEFS-W4, docs-only. Built from `CLAUDE.md`, `docs/plans/complete-build-
plan-2026-10-01.md` (full read, all 7 waves), `docs/decisions/ADR-038-research-built-now.md` and
`ADR-039-complete-build-rulings-2026-10-01.md` (frontmatter and full text), `docs/dispatches/lane-common-
contract.md` in full, `docs/dispatches/lane-briefs/2026-10-03/README.md` and its three briefs (brief-l10,
brief-l11, brief-l12 - the style precedent for this dispatch), `docs/ops/session-log.d/2026-10-03-l12.md`
in full (names the item-to-corridor capability gap L-CORRIDOR below closes), `docs/PROGRAM-BOARD.md`, and
`docs/specs/04-operations.md` in full.

## Why this wave

The plan's section 2 orders waves 0-7. Wave 3 (L10, L11, L12, Market Intel completion) is landed or
landing per the 2026-10-03 dispatch: PR #904 (L10), PR #903 (L12), L11 pending per the coordinator's own
framing of this task. **Wave 4 is Operations completion (spec 04): L13 (fully-loaded labour chain) and
L14 (feasibility gates + materials-PPWR join).** This dispatch drafts exactly those two lanes, plus one
lane the plan does not carry: L-CORRIDOR, closing the item-to-corridor gap `docs/ops/session-log.d/
2026-10-03-l12.md`'s addendum named as "COORDINATOR ACTION NEEDED... scoped into the next wave as its own
lane," with the exact five input fields `carbonCostPerFeu()` requires, cited directly from that file.

No earlier-wave lane under the complete-build-plan's own L-series numbering is open per the board as read
this session. Wave 0 (remediation plan) items outside this plan's L-series are not re-checked here; the
2026-10-03 README already recorded their state for that dispatch and this one does not duplicate that
check.

## Open questions (gaps become questions, never inventions)

1. **L13's labour-chain data dependency.** The plan's own L13 text states the chain's acceptance test is
   "fixture-based until that data lands" because the EU/US `regional_data_facts` producer for labour cost
   levels is itself R14-held (migration 332/333 extend `state_cost_facts`/`derivation_edges`; no live
   producer confirmed landed this session). This brief ships the component and chain-math module against
   fixtures per the plan's own framing; it does NOT claim live labour data exists. The coordinator should
   confirm whether the state-cost producer lane has landed live rows before L13's acceptance test is
   treated as anything beyond fixture-proven.
2. **L14's PPWR numeric confirmation.** Spec 04 section 8 states plainly: "UNCONFIRMED and required
   before building the join: the recycled-content percentages for 2030 and 2040, the empty-space ratio,
   and the transport-packaging reuse targets. The DG ENV page did not carry them. These are numeric spec
   inputs and must be read from the Regulation text directly." `grep -ril ppwr docs/decisions/` finds no
   ADR confirming these numbers. L14's brief makes confirming them against Regulation (EU) 2025/40's text
   directly the lane's own first step (as the plan's own dependency note already says), not an invented
   placeholder. If the lane cannot reach the Regulation text, it STOPs and reports rather than guessing.
3. **L-CORRIDOR's realistic acceptance ceiling.** `seed-corridors.mjs`'s own header and
   `select-modal-factor.mjs`'s WO-24 ruling both establish, read in full this session, that
   `intelligence_items.jurisdiction_iso` carries no origin/destination role and may never be mined for
   one. The only non-fabricating match this brief can specify is: an item's jurisdiction set exactly
   equals (as an unordered set) an EXISTING seeded corridor entity's `{origin country, dest country}`
   set, with the item's own recorded mode matching that corridor's mode - direction is read from the
   already-minted entity, never assigned by this lane. Given today's live data (per `carbon-cost-per-feu.
   test.mjs`'s own confirmed state: the one seeded example corridor, CNSHA-NLRTM, has no factor row
   either), this resolver may legitimately return `no_corridor_identity` for every live item today. That
   is the honest result, not a lane failure - confirmed to the coordinator explicitly in L-CORRIDOR's own
   acceptance test, which is a fixture proof of the matching LOGIC, not a claim that a live item resolves.

## Migration numbering

Plan numbering is authoritative. The plan's own highest assignment (L0-L28) is 360. The 2026-10-02
dispatch reserved 361-365 (not consumed). Migration 346 is the highest APPLIED migration on current
`origin/master` (`fsi-app/supabase/migrations/346_research_assessments_entity_spine_signposts.sql`,
confirmed by directory listing this session). The plan's own table states "Migrations requested: none"
for both L13 and L14 (L13 is a rendering/chain-math component over existing/fixture data; L14 is a
rendering component plus a read-only join query over existing tables) - neither requests a number here,
matching the plan.

**Mapping for the one lane the plan does not carry:**

| Lane | Plan's own number | This dispatch's number | Note |
|---|---|---|---|
| L13 | none requested (plan text) | none requested | No schema touched; fixture/existing-data only |
| L14 | none requested (plan text) | none requested | No schema touched; read-only join over existing tables |
| L-CORRIDOR | not in the plan (unnumbered) | **366** (reserved by this brief; next free number above the plan's highest and above the 2026-10-02 dispatch's 361-365 reservation) | Reserved only in case the resolver's own fixture test needs a narrow lookup table for seeded-corridor candidate sets distinct from `entities`; if the lane's own read of `entities`/`seed-corridors.mjs` output is sufficient with no new table, it reports "366 not consumed" rather than writing a migration file. The lane does not assume it needs 366 - it checks first. |

If any lane below finds, against this brief, that it genuinely needs a different migration, it STOPs and
asks the coordinator by name before writing one.

## Lane summaries

- **L13 - Fully-loaded labour chain component.** Spec refs 04S5, S6 #5. New `LabourChain.tsx` component
  rendering the chain base wage -> + employer contributions -> + leave/absence -> + turnover/recruitment ->
  + shift premium / productive hours = EUR (or USD) per productive hour, wired as a drill-down into the
  existing `RegionDimensionMatrix.tsx`, never a new page. Fixture-proven per the plan's own framing
  (open question 1 above).

- **L14 - Feasibility gate layer + materials-PPWR join.** Spec refs 04S6 #8-9. New `FeasibilityGateStrip.
  tsx` (blocked/conditional/clear, never a score, type-enforced with no numeric field) and a read-only
  join query (`materials-ppwr-join.ts`) pairing `regional_data_facts` materials rows against confirmed
  PPWR thresholds. PPWR numeric confirmation is this lane's own first step (open question 2 above), not a
  separate lane, per the plan's own sizing.

- **L-CORRIDOR - Item-to-corridor resolver for the carbon-cost-per-FEU figure.** Not in the plan; closes
  the gap `docs/ops/session-log.d/2026-10-03-l12.md`'s addendum named and scoped into "the next wave as
  its own lane." Builds a three-state resolver (`resolved` / `ambiguous` / `no_corridor_identity`)
  matching a `market_signal` item to an EXISTING seeded corridor entity by unordered jurisdiction-set and
  mode match, never inventing a `cl:corridor:*` id (WO-24). Feeds `carbonCostPerFeu()`'s own `corridor =
  {origin, dest, mode}` input directly - no second implementation of the cost math.

## Harness and flywheel wiring (rule 17 - nothing runs alone)

- **L13**: pure rendering + chain-math over props the region matrix already assembles server-side (same
  posture as `AutomateVsHireCalculator.tsx`, spec 08 S6's shipped pattern); no harness family of its own.
  Once the EU/US labour producer (open question 1) lands live `regional_data_facts` rows, L13's chain
  becomes this build's downstream consumer automatically - no second wiring pass, because the component
  reads the same table the producer writes, the same reuse pattern `LeadTimeChart.tsx` (L10) uses against
  L11's producer.
- **L14**: `FeasibilityGateStrip.tsx` is read-time, computed from existing regulation/obligation data; the
  materials-PPWR join is a read-only query over two already-populated tables (`regional_data_facts`,
  the regulation items carrying PPWR thresholds once confirmed) - no new write path, no harness family.
- **L-CORRIDOR**: pure function, no DB write, no harness family of its own - it is a read-time resolver
  consumed by whichever future lane wires `carbonCostPerFeu()` onto the detail page (not this lane's own
  scope; this lane proves the resolver in isolation against fixture corridor entities and fixture items).

## R14 compliance (every lane below)

No DB credentials in any worktree. No `--apply` path in any of the three lanes (none write to the
database). $0: no LLM calls, no paid services. Tools before data: L13 and L-CORRIDOR are explicitly
fixture-proven ahead of their respective live-data dependencies (the EU/US labour producer; any live item
whose jurisdiction set happens to match a seeded corridor), per CLAUDE.md rule 2's never-fabricate
discipline and the plan's own "tools before data" sequencing.

## Tests and fire-once (every lane below)

Every lane fires its own module/component at least once against fixture data (dry CLI or a one-off
harness render, per `docs/ops/session-log.d/2026-10-03-l12.md`'s own precedent for a credential-less
worktree) and pastes the real output in its report, not a description of it. No lane claims a live-data
result it did not run.

## Touched-tests-only line

Every lane below runs only the tests for the files it actually touched during the work (named in each
brief's own "Tests" section); the pre-push hook (`DISCIPLINE_HOOK_TRAMPOLINE=1 sh fsi-app/.discipline/
hooks/pre-push`) runs the full suite before any push and is the real gate, per the lane common contract's
"Gates before handoff" section.

## UX requirements for `.tsx` (every lane below that writes one)

L13 and L14 each write at least one `.tsx` component. Both read `docs/design/ux-laws.md` in full and
`docs/design/design-principles.md` DP-2 before writing it, per the lane common contract's UX contract
section, and both carry a "UX compliance" section in their report (primary goal, path in steps, one
primary action, feedback state per async action) plus the row/ledger/card UX-smoke-spec requirement
(`data-guard-title`, a smoke spec, F35's `ROW_COMPONENTS` line) for any new row/card component.
L-CORRIDOR touches no `.tsx`/`.css` file - not applicable.

## Report format and the one-round status rule

Each lane's report follows the lane common contract's "Report" format exactly: git log, file-by-file
build, consumers/ADRs checked (named), gate output lines, corrections, open items. Per the lane common
contract's own binding addition (2026-10-03): **a lane answers a coordinator status request within one
tool round, even mid-gate.** This dispatch (BRIEFS-W4) is itself held to that same rule for any
coordinator status request about this planning pass.

## Standing prohibitions (every lane, restated from the lane common contract and CLAUDE.md)

- No nested agents - each lane does its own work, never delegates to the Agent tool.
- No `--no-verify`, ever.
- No edits to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or `docs/INDEX.md` directly - each lane
  writes its own `docs/ops/session-log.d/YYYY-MM-DD-<lane>.md` file and leaves a "COORDINATOR ACTION
  NEEDED" line naming the INDEX.md entry it needs, if any.
- No new allowlist entry (shared-writer registry, governing-files list, PINNED_MANIFEST) without a named
  ruling or ADR citing it.
- No DB credentials, no live writes without the three-gate R14 shape; every script is dry by default
  (though none of these three lanes is expected to need `--apply` at all).
- No standing cron or schedule armed by any lane (rule 16).
- No fabricated PPWR numeric threshold (L14), no fabricated corridor direction (L-CORRIDOR), no fabricated
  labour-chain term where live data is absent (L13) - every gap renders honestly, per CLAUDE.md rule 2.
- No em dashes, en dashes or the section-sign glyph in added prose (rule 022); an unavoidable, verbatim
  glyph is disclosed with the `glyph:verbatim` marker on the same line.
