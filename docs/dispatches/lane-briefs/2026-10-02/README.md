# Lane briefs, 2026-10-02 - Research build lanes L3, L5, L6, L7, L8, L9 (complete-build-plan Wave 2)

Written by coordinator lane BRIEFS-RESEARCH, docs-only. Built from `CLAUDE.md`, `docs/plans/complete-
build-plan-2026-10-01.md`, `docs/decisions/ADR-039-complete-build-rulings-2026-10-01.md`,
`docs/specs/03-research.md`, `docs/specs/08-flywheel-design.md` (signposts DDL), `docs/dispatches/lane-
common-contract.md`, `docs/plans/wave2b-lanes-2026-09-29.md` (style precedent - the coordinator's
correction, 2026-10-02: this file lives under `docs/plans/`, not `docs/dispatches/`, where this brief
set's first draft searched for it and found nothing), and the diff of branch `origin/lane/w2r-research-
assessment` (PR #887) against `origin/master` as read during drafting.

Each brief in this directory (`brief-l3.md`, `brief-l5.md`, `brief-l6.md`, `brief-l7.md`, `brief-l8.md`,
`brief-l9.md`) is self-contained per the lane common contract. Amendments are appended in place inside
each brief, never rewritten, per the 2026-09-19 lane-briefs directory's own convention, which this
directory also follows.

## Coordinator rulings, 2026-10-02 (binding; supersede the open questions this README originally carried)

**1. Precondition: PR #887 merges first.** All six lanes below (L3, L5, L6, L7, L8, L9) dispatch ONLY
after `lane/w2r-research-assessment` (PR #887) has merged to `origin/master`. This is not a branch
dependency to work around; it is a hard precondition on dispatch. Every brief in this set therefore cuts
its worktree from `origin/master` and reads its upstream files (migration 344, `assess.mjs`,
`read-assessments.mjs`, the research-assessment producer, the "Horizon assessment" rail card on
`ResearchFindingDetailSurface.tsx`, `docs/decisions/ADR-038-research-built-now.md`) at their master
paths, not at a branch path. If any lane is somehow dispatched before #887 merges, it STOPs immediately
and reports the precondition unmet rather than proceeding against the branch.

**2. Migration numbers: the complete-build-plan's own assignment table is authoritative.** Re-read
`docs/plans/complete-build-plan-2026-10-01.md` section 2 in full. Of the six lanes in this dispatch, the
plan assigns a number to exactly one: **L6 = 346** (the signposts table). The plan explicitly states
"Migrations requested: none" for L3, L5, L7, L8 and L9. The plan's highest assignment anywhere in its
full lane list (L0-L28) is **360** (lane L28, EUDR/custody). Per the coordinator's ruling, each lane the
plan left unnumbered gets the next free number above that ceiling, assigned in ascending lane order and
recorded here rather than re-derived per brief:

| Lane | Plan's own number | This dispatch's number | Basis |
|---|---|---|---|
| L3 | none | **361** | next free above the plan's ceiling (360) |
| L5 | none | **362** | next free |
| L6 | **346** | **346** | plan's own assignment, authoritative; reserved for the signpost table only - see ruling 3 |
| L7 | none | **363** | next free |
| L8 | none | **364** | next free |
| L9 | none | **365** | next free |

The coordinator's prior 346-to-351 sequence (this README's first draft) is withdrawn entirely and does
not appear anywhere below. A lane whose own acceptance test proves it needs no schema change at all
(true for L3, L5, L7, L8 and L9 per the plan's own "none" rows) treats its number above as RESERVED, not
consumed - it does not write a migration file merely because a number exists for it.

**3. L6 schema: research assessments join the entity spine (ADR-039(e)).** Spec 08's `signposts` DDL
(`assessment_id text NOT NULL REFERENCES entities(entity_id)`) predates migration 344's real,
uuid-keyed `research_assessments` table, which sits outside the entity spine. Ruling: `research_
assessments` joins the spine via a PROGRESSIVE RE-KEYING column, the exact pattern migration 283
(`283_entity_refs.sql`) already uses for `intelligence_items.instrument_entity_id` and
`sources.organisation_entity_id` - a nullable `entity_id text REFERENCES public.entities(entity_id)`
column added beside the table's existing uuid PK, backfilled separately, additive only, zero rows
populated at apply time. This lets a research assessment be found FROM the entity (corridor, instrument,
technology) it is about, without making "assessment" a tenth entity kind (ADR-039(e) closed the spine at
nine kinds; this ruling does not reopen that). Separately, and more simply, **`signposts.assessment_id`
is a plain `uuid NOT NULL REFERENCES research_assessments(id)`** - a direct FK to the real table, not a
detour through the entity spine for the signpost-to-assessment link itself; `signposts.watches` keeps its
original `text REFERENCES entities(entity_id)` shape (that half of the original DDL was never in
question). The candidate this ruling REJECTS: minting a dedicated `entities` row per assessment so
`signposts.assessment_id` could reference `entities(entity_id)` directly, as spec 08's literal DDL
implied - rejected because it is the larger, unnecessary scope change (a tenth entity-kind-shaped object
ADR-039(e) did not ask for) where the progressive-re-keying column gets the same cross-surface
discoverability at a fraction of the cost. L6's brief below carries this as the chosen fix, not an open
question; the STOP this README's first draft put at the top of that brief is removed.

**4. Precedent path.** `docs/dispatches/wave2b-lanes-2026-09-29.md` is the correct precedent path (the
coordinator's correction, 2026-10-02); this brief set's structural resemblance to the 2026-09-19 lane-
briefs set stands as drafted and needs no change.

## Lane summaries

- **L3 - Research source-authority client.** Spec 03S4 (authority-score half only). New `scripts/
  research/openalex-client.mjs` + `authority-score.mjs`, free OpenAlex/ROR/ORCID reads, writing a
  distribution (never a mean) into the `credibility_authority_score` jsonb column migration 344 (on
  master, post-#887) already reserves.

- **L5 - Research surface: dissent panel, signposts list, assessment-history ledger.** Spec 03S7
  components 6, 8, 11 (narrowed; the maturity/horizon/credibility rail card is #887's own scope). Three
  new components mounted into the detail page #887 already extends. Depends on L3 (a real distribution
  to render dissent from) and L6 (signposts to list).

- **L6 - Research signposts as machine-watchable entities.** Spec 03S7 #8, spec 08S1.2's `signposts`
  DDL. Carries the coordinator's ruling 3 above as its chosen fix (research_assessments joins the spine
  via a progressive re-keying column; signposts.assessment_id is a direct uuid FK to
  research_assessments.id), not an open question.

- **L7 - Research-role source registration + the research walker, dispatch-callable only.** Spec 03S8.
  Build-mode rule 16 forbids arming a cadence; this lane builds the runtime, armed later by explicit
  operator action, same pattern as the propagation drain.

- **L8 - Research theme classification backfill.** Spec 03's own-finding (47 null-theme rows silently
  hidden). Haiku batch classification + an `Unclassified` band so a future miss is visible, never
  invisible.

- **L9 - Research Summary brief generation wired to the assessment model.** Spec 03S1 (the atom is the
  assessment; "a card that cannot populate `planning_assumption_shifted` does not ship as a card").
  Extends the existing format-dispatch brief generator; never a parallel generator.

## Standing prohibitions (every lane, restated from the lane common contract and CLAUDE.md)

- No nested agents - each lane does its own work, never delegates to the Agent tool (operator, 2026-09-
  28).
- No `--no-verify`, ever.
- No edits to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or `docs/INDEX.md` directly - each
  lane writes its own `docs/ops/session-log.d/YYYY-MM-DD-<lane>.md` file and leaves a "COORDINATOR ACTION
  NEEDED" line naming the INDEX.md entry it needs, exactly as lane W2-R did.
- No new allowlist entry (shared-writer registry, governing-files list, PINNED_MANIFEST) without a named
  ruling or ADR citing it; a lane that needs one states the need and stops rather than adding it
  unilaterally.
- No DB credentials, no live writes without the three-gate R14 shape (reviewed-code ENABLED const,
  runtime kill switch, CLI `--apply` flag); every script is dry by default.
- No standing cron or schedule armed by any lane (rule 16); L7 in particular builds a dispatch-callable
  runtime only.
