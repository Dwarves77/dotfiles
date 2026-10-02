# Lane briefs, 2026-10-02 - Research build lanes L3, L5, L6, L7, L8, L9 (complete-build-plan Wave 2)

Written by coordinator lane BRIEFS-RESEARCH, docs-only. Built from `CLAUDE.md`, `docs/plans/complete-
build-plan-2026-10-01.md`, `docs/decisions/ADR-039-complete-build-rulings-2026-10-01.md`,
`docs/specs/03-research.md`, `docs/specs/08-flywheel-design.md` (signposts DDL), `docs/dispatches/lane-
common-contract.md`, the 2026-09-19 lane-briefs set (style precedent; `wave2b-lanes-2026-09-29.md` does
not exist on master or in any branch history searched, so the 2026-09-19 set is used instead, noted as an
open item below), and the live diff of branch `origin/lane/w2r-research-assessment` (PR #887, OPEN, not
merged) against `origin/master`.

Each brief in this directory (`brief-l3.md`, `brief-l5.md`, `brief-l6.md`, `brief-l7.md`, `brief-l8.md`,
`brief-l9.md`) is self-contained per the lane common contract. Amendments are appended in place inside
each brief, never rewritten, per the 2026-09-19 convention this directory follows.

## Open questions for the coordinator (read before dispatching any lane below)

**1. The entire scope these briefs describe depends on an unmerged branch.** `lane/w2r-research-
assessment` (PR #887, state OPEN as of this reading, authored 2026-10-02T16:58 UTC) carries migration
344 (`research_assessments`), `src/lib/research/assess.mjs`, `read-assessments.mjs`, the research-
assessment producer, the new "Horizon assessment" rail card on `ResearchFindingDetailSurface.tsx`, and
`docs/decisions/ADR-038-research-built-now.md`. None of this exists on `origin/master`. `docs/decisions/
ADR-039-...md`'s own "related" frontmatter cites a file named `ADR-038-research-assessment-model.md`,
which does not exist anywhere; the real file, read from the branch, is `ADR-038-research-built-now.md`.
**Every one of L3, L5, L6, L7, L8 and L9 below has `lane/w2r-research-assessment` merged as a hard
dependency** (L3 and L5 write to columns/rail cards that branch creates; L6, L7, L8, L9 read or extend
tables and modules that branch creates). Each brief's worktree-setup step therefore cuts its branch from
`origin/lane/w2r-research-assessment`, not from `origin/master`, and says so; if the coordinator merges
#887 before dispatch, each lane rebases onto `origin/master` instead at the same commit depth. **Question
for the coordinator: merge #887 first, or dispatch these six lanes against the branch and rebase at
landing?** This brief set assumes the branch (fewer merge conflicts across six lanes touching one
branch's new files), but the coordinator may prefer to merge first.

**2. Migration-number collision between this dispatch's assignment and the complete-build-plan's own
table.** The setup brief for this coordinator session assigns L3=346, L5=347, L6=348, L7=349, L8=350,
L9=351. But `docs/plans/complete-build-plan-2026-10-01.md` section 2 already assigns migration **346 to
its own L6** (the signposts table, the same lane as this dispatch's L6), **349 to L17** (obligations,
Wave 6), and **350/351 to L18** (portfolio, Wave 6). Of the six lanes here, the plan's own table says
only **L6 needs a migration at all** (signposts); L3, L5, L7, L8 and L9 are each marked "Migrations
requested: none" in the plan. Assigning 347/349/350/351 to lanes the plan itself says need no schema
change reserves numbers that collide with Wave 6 lanes if those run concurrently. **Each brief below
states the plan's own "none" or "346" as the number it actually expects to consume, flags the setup
brief's assigned number as reserved-but-likely-unused, and tells the lane to ask the coordinator before
applying for a migration number outside this flag.** The coordinator should resolve the 346-vs-348
collision for the signposts table specifically before L6 is dispatched (two different numbers now point
at the same table in two different documents).

**3. Spec 08's signposts DDL does not fit migration 344's schema.** `docs/specs/08-flywheel-design.md`
section 1.2 defines `signposts.assessment_id text NOT NULL REFERENCES entities(entity_id)` - the
signpost watches an entity, and is itself anchored to an "assessment" that spec 08 (drafted before ADR-
038) implicitly assumed would be an `entities`-spine row with a text `entity_id`. Migration 344's real
`research_assessments` table (built after spec 08, per ADR-038) is a plain uuid-keyed table outside the
entities spine entirely; no `research_assessments` row is, or is planned to become, an `entities` row.
**This is a genuine, unresolved schema mismatch between two governing documents, not something this
dispatch invents an answer for.** L6's brief states this at its top as the open question the lane must
raise before writing its own migration, with two named candidate resolutions, neither chosen here.

**4. `wave2b-lanes-2026-09-29.md` does not exist.** Searched `docs/dispatches/`, `git log --all` for that
path, and the lane-briefs directory tree; no match on master or on any branch. The closest and most
recent precedent actually in the repo is `docs/dispatches/lane-briefs/2026-09-19/` (README + per-lane
brief files, e.g. `brief-n2.md`), which is what this set's structure follows. Flagging rather than
guessing at a file that may have been renamed, squashed, or never committed.

## Lane summaries

- **L3 - Research source-authority client.** Spec 03S4 (authority-score half only). New `scripts/
  research/openalex-client.mjs` + `authority-score.mjs`, free OpenAlex/ROR/ORCID reads, writing a
  distribution (never a mean) into the `credibility_authority_score` jsonb column migration 344 already
  reserves. Depends on `lane/w2r-research-assessment` merged for the column to exist.

- **L5 - Research surface: dissent panel, signposts list, assessment-history ledger.** Spec 03S7
  components 6, 8, 11 (narrowed; the maturity/horizon/credibility rail card is the in-flight branch's own
  scope). Three new components mounted into the detail page the branch already extends. Depends on L3
  (a real distribution to render dissent from) and L6 (signposts to list).

- **L6 - Research signposts as machine-watchable entities.** Spec 03S7 #8, spec 08S1.2's `signposts`
  DDL, self-closing per the no-editorial-queue ruling. Carries open question 3 above at its head.

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
