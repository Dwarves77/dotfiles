# Lane L6: Research signposts as machine-watchable entities, self-closing (no editorial queue)

Read first, in this order: this file, INCLUDING the schema ruling immediately below before you write
one line of schema; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/complete-build-plan-
2026-10-01.md` section 1.3 and its L6 entry in section 2; `docs/specs/08-flywheel-design.md` section 1.2
(entities, obligations, signposts DDL) in full; `docs/specs/03-research.md` section 7 component 8; then
`docs/decisions/ADR-038-research-built-now.md` and `docs/decisions/ADR-039-complete-build-rulings-2026-
10-01.md` part (e) (spine scope for v1).

**Precondition (coordinator ruling, 2026-10-02): this lane dispatches only after `lane/w2r-research-
assessment` (PR #887) has merged to `origin/master`.** See L3's brief for the full statement; it applies
identically here, and this lane's own schema ruling below additionally requires `migration 344_research_
assessments.sql` to be live on master before you write migration 346.

Lane id: `l6`. Branch: cut from `origin/master`. Branch name: `lane/l6-research-signposts-2026-10-02`.
Model: Sonnet.

## Schema ruling (coordinator, 2026-10-02) - the chosen fix, not an open question

The original draft of this brief carried a STOP here because `docs/specs/08-flywheel-design.md`'s own
DDL (section 1.2) types `signposts.assessment_id text NOT NULL REFERENCES entities(entity_id)` - a text
key into the entity spine - while migration 344's real `research_assessments` table is a plain `uuid
PRIMARY KEY` table outside that spine. **The coordinator has ruled; this is now the build, not a
question.**

**Ruling, under ADR-039(e) (the spine covers all nine entity kinds; this does not add a tenth):**
`research_assessments` joins the entity spine via a PROGRESSIVE RE-KEYING column - the exact pattern
`fsi-app/supabase/migrations/283_entity_refs.sql` already uses for `intelligence_items.instrument_
entity_id` and `sources.organisation_entity_id`. Read migration 283 in full before writing your own; it
is the pattern you copy, named explicitly so you do not re-derive it from spec prose:

1. Your migration (346) `ALTER TABLE public.research_assessments ADD COLUMN IF NOT EXISTS entity_id
   text REFERENCES public.entities(entity_id)` - nullable, additive, no backfill in this migration
   (same "additive-only proof" self-check shape as 283: zero non-null values of this column at apply
   time, asserted in a `DO $$` block, not merely stated in a comment). A partial index
   (`WHERE entity_id IS NOT NULL`), same as 283's two indexes. This is what lets a research assessment
   be found FROM the entity (corridor, instrument, technology) it is about; it does NOT make
   "assessment" an entity kind itself - `research_assessments` keeps its own `uuid` PK, unchanged, same
   as `intelligence_items` and `sources` keep theirs after 283 added their FK columns. A separate,
   later, guarded backfill script (not this lane's job; name it as a follow-on in your report) populates
   the column, same two-step posture as 283's own `scripts/entities/backfill-entities.mjs`.
2. `signposts.assessment_id` is a direct **`uuid NOT NULL REFERENCES public.research_assessments(id)`**
   - not a detour through the entity spine for the signpost-to-assessment link itself. `signposts.
   watches` keeps its original `text NOT NULL REFERENCES entities(entity_id)` shape (that half of spec
   08's DDL was never in question; the entity spine already has corridor/jurisdiction/instrument/
   organisation entities backfilled per the complete-build-plan's own 00S1 row, so `watches` resolves
   against real rows).

**Candidate rejected, kept here for the record (rule 14 - a correction stays visible, not deleted):**
minting a dedicated `entities` row per `research_assessments` row, so `signposts.assessment_id` could
reference `entities(entity_id)` directly exactly as spec 08's literal DDL states it. Rejected because it
is the larger, unnecessary scope change - a tenth entity-kind-shaped object ADR-039(e) did not ask for -
where the progressive-re-keying column gives the same cross-surface discoverability (an assessment
reachable from "its" entity) at a fraction of the cost, matching the pattern this codebase already
chose twice (283) rather than inventing a third shape for the same kind of problem.

Build the ruling above. Do not re-open the question; if you find a fact that genuinely contradicts this
ruling (for example, migration 344 has already changed shape since this brief was written), STOP and
report the contradiction rather than silently reverting to either candidate.

## Objective and requirement IDs

Spec 03S7 #8, spec 08S1.2's `signposts` table (built per the schema ruling above), the platform-intent
doctrine `research-is-horizon-scan`'s binding "no editorial queue" clause.

## Operator rulings that bind you

- **Doctrine `research-is-horizon-scan`** (2026-07-12): editorial curation queues are FORBIDDEN. Your
  watcher fires and transitions state autonomously; it has zero approve/reject/feature affordance
  anywhere in its path. Grep-and-assert this in your own test (per the plan's own acceptance test for
  this lane).
- **CLAUDE.md rule 16** (build mode holds the scrape cadence off): the watcher you build evaluates
  predicates against the propagation drain's EXISTING invalidation pass - you are not arming a new
  standing cron. If your design requires a new scheduled trigger, STOP; it is out of scope for build
  mode.
- **CLAUDE.md rule 17** (nothing runs alone): a signpost firing must write a `propagation_events` row
  AND transition the parent assessment's lifecycle state in the same pass - a watcher that fires and
  leaves the assessment's state untouched is exactly the defect rule 17 names ("a runtime that ends
  without triggering its downstream is a defect in the runtime").
- **ADR-039(e)**: all nine entity kinds are in scope for v1; signpost is one of the two (with
  obligation, lane L17) that "gate the most other work" and build first. This lane's acceptance test
  closes one-ninth of ADR-039(e)'s own completion criterion. The schema ruling above does not reopen
  ADR-039(e)'s "nine kinds, not ten" framing - confirm this in your report by stating the entity_kind
  enum is unchanged by your migration.

## Exact write set

- New migration 346 (per the README's migration-number table): (a) the `research_assessments.entity_id`
  progressive-re-keying column per the schema ruling, (b) the `signposts` table per spec 08's DDL as
  amended by the schema ruling (`assessment_id uuid NOT NULL REFERENCES research_assessments(id)`,
  `watches text NOT NULL REFERENCES entities(entity_id)`, the rest of the DDL unchanged).
- `fsi-app/src/lib/propagation/methods/signpost-watch.ts` (new), registered in the EXISTING `fsi-app/src/
  lib/propagation/methods/index.ts` registry via its side-effect import convention (read that file's own
  header first - it documents exactly why registration happens there and nowhere else).
- `fsi-app/src/lib/propagation/methods/signpost-watch.test.mjs` (new).
- `fsi-app/supabase/migrations/346_research_assessments_entity_spine_signposts.test.mjs` (new, the
  migration's own self-check test) - following migration 344's own pattern (`344_research_assessments.
  test.mjs` - a text-parsing proof that a self-check literal and the real column/constraint count cannot
  drift apart; read that file on `origin/master` before writing yours) AND migration 283's "additive-
  only proof" pattern (zero non-null `entity_id` values asserted at apply time).
- `docs/ops/session-log.d/2026-10-02-l6.md` (new).

Do not touch `drain.ts` itself beyond what registering a new method in `methods/index.ts` already
requires (the plan's own framing: "reuse of the pattern spec 08 S6 already shipped for
`carbon_intensity_tkm`" - read that method file as the exact pattern, do not redesign the seam).

## READ FIRST

1. `fsi-app/src/lib/propagation/methods/index.ts`, IN FULL - the registration seam, its own header
   explaining why it owns registration and not method bodies.
2. `fsi-app/src/lib/propagation/methods/carbon-intensity.ts` and its `.test.mjs` - the exact shipped
   pattern this lane's method file follows. Also skim `automate-vs-hire.ts` as a second example of the
   same shape.
3. `fsi-app/src/lib/propagation/drain.ts`, IN FULL (306 lines per the build plan's own citation) - how a
   registered method gets invoked, what `MethodContext` it receives, what it must return
   (`MethodResult`), and specifically how `propagation_events` rows get written - you are relying on this
   existing mechanism, not building a parallel one.
4. `fsi-app/supabase/migrations/282_entities.sql` and `283_entity_refs.sql`, BOTH IN FULL - 283 is the
   exact pattern your migration's entity-spine half copies (`instrument_entity_id`/`organisation_
   entity_id`, the additive-only self-check, the partial index, the separate guarded backfill script).
   Name the specific lines you copied in your report.
5. `fsi-app/supabase/migrations/344_research_assessments.sql`, on `origin/master`, IN FULL - the real
   current shape of `research_assessments` (uuid PK, no entity_id yet) your migration adds the column to.
6. `grep -rn "entity_kind\b" fsi-app/supabase/migrations fsi-app/src/lib` - every place the nine-kind
   enum is asserted, to confirm your migration does not touch it (the schema ruling is explicit that it
   must not).
7. `docs/inventories/migrations.md` - regenerate this file's entry for migration 346 (same pattern lane
   W2-R used for 344); do not hand-edit other rows.

Report "read and reused" naming each file above, and specifically which lines of migration 283 you
copied for the entity-spine half of your own migration.

## Migration number

**346**, per the complete-build-plan's own table (section 2) and the coordinator's 2026-10-02 ruling
(README migration-number table) - the plan's own assignment is authoritative here; there is no
remaining collision to resolve.

## R14 compliance

Tools before data. This lane builds the table, the entity-spine column, and the watcher method; it does
not populate either with real data (the `research_assessments.entity_id` backfill and real signposts are
both later, data-population passes - the backfill gated by nothing beyond "a separate guarded script
exists", the signposts population gated by the R14 lift criteria in the complete-build-plan section 3,
specifically criterion 6, the fixture-database proof - neither is this lane's job). No `--apply` path of
your own exists beyond the migration itself, which the coordinator applies via Supabase CLI per the
two-track policy (CLAUDE.md rule 3) - you author DDL-sketch-only, same posture as migrations 283 and 344.

## Tests and the fire-once requirement

- `node --test fsi-app/src/lib/propagation/methods/signpost-watch.test.mjs` and the migration's own
  self-check test.
- The plan's own acceptance test, verbatim: a fixture signpost with a `date_passed` predicate fires when
  its watched entity's date is seeded past; the firing writes a `propagation_events` row and transitions
  the parent assessment's lifecycle state per spec 08 S3.1's table; **zero editorial-approval affordance
  exists anywhere in the firing path**, grepped and asserted in the test, not merely absent by omission.
- "Test what you build": run the registered method once through the existing drain's own test harness
  (whatever fixture-driven invocation `drain.test.mjs` already uses for `carbon_intensity_tkm`), adapted
  to your fixture signpost, and paste the result. No live DB write; this is a fixture-only fire.

## UX compliance

Not applicable - this lane touches no `.tsx`/`.css` file.

## Dependencies

`lane/w2r-research-assessment` (PR #887) merged to `origin/master` - hard precondition, stated above
(needs `research_assessments` to exist before this lane can add a column to it). The existing drain
(spec 08S2, already built). None of L3, L5, L7, L8, L9.

## Report format

Per the lane common contract. Your report's FIRST section, before anything else, confirms the schema
ruling was built as stated (both halves: the entity_id column, and signposts.assessment_id as a direct
uuid FK) or names the contradiction that stopped you.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration number other than 346. No new entity-kind value added to any enum (the
schema ruling is explicit: this is a progressive re-keying column, not a tenth kind). No DB credential,
no live write.
