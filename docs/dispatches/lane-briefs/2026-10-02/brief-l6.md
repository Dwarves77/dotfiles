# Lane L6: Research signposts as machine-watchable entities, self-closing (no editorial queue)

Read first, in this order: this file, INCLUDING the open question immediately below before you write
one line of schema; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/complete-build-plan-
2026-10-01.md` section 1.3 and its L6 entry in section 2; `docs/specs/08-flywheel-design.md` section 1.2
(entities, obligations, signposts DDL) in full; `docs/specs/03-research.md` section 7 component 8; then,
on your branch, `docs/decisions/ADR-038-research-built-now.md` and `docs/decisions/ADR-039-complete-
build-rulings-2026-10-01.md` part (e) (spine scope for v1).

Lane id: `l6`. Branch: cut from `origin/lane/w2r-research-assessment` (PR #887; confirm merge state
first). Branch name: `lane/l6-research-signposts-2026-10-02`. Model: Sonnet.

## OPEN QUESTION FOR THE COORDINATOR - read and get a ruling before writing migration SQL

`docs/specs/08-flywheel-design.md`'s own DDL (section 1.2) defines:

```sql
CREATE TABLE signposts (
  entity_id     text PRIMARY KEY REFERENCES entities(entity_id),
  assessment_id text NOT NULL REFERENCES entities(entity_id),
  watches       text NOT NULL REFERENCES entities(entity_id),
  predicate     jsonb NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('confirms','refutes','delays')),
  fired_at      timestamptz,
  ...
);
```

`assessment_id` is typed to reference `entities(entity_id)` - a text key into the entity spine
(migration 282). But migration 344's real `research_assessments` table, built after this spec section
was drafted (per ADR-038), is a plain `uuid PRIMARY KEY` table entirely outside the entity spine; no
`research_assessments` row is, or is currently planned to become, an `entities` row. **Spec 08 and
migration 344 disagree about what an "assessment" is identified by, and nobody has reconciled this
since ADR-038 landed.** This lane cannot literally build spec 08's DDL as written without first
resolving it. Two candidate resolutions, neither chosen here (this brief does not invent an answer, per
rule 13/14 and the setup brief's own instruction):

- **(a)** `signposts.assessment_id uuid NOT NULL REFERENCES research_assessments(id)` - signposts attach
  directly to the real table, spec 08's DDL is corrected in place (rule 14: a spec's own drafted DDL
  that predates a later ADR is a finding to correct, not a contract to force-fit).
- **(b)** `research_assessments` rows get their own `entities` row (a new entity kind, or reuse of an
  existing one) so spec 08's DDL can stand unmodified - this is a larger scope change (ADR-039(e)
  already closed "all nine entity kinds" without naming a tenth for assessments) and probably wrong for
  that reason, but it is the coordinator's call, not this lane's.

**STOP before writing migration SQL. Report this question to the coordinator and wait for a ruling (or
proceed only if the coordinator has already ruled before this lane starts, in which case the ruling and
its ADR number go here as an amendment).** If forced to proceed without a ruling, build candidate (a)
(it is the smaller, more defensible change and matches this plan's own "narrowed" framing elsewhere) but
flag in bold in your report that you proceeded without a ruling and why.

`watches text NOT NULL REFERENCES entities(entity_id)` has no such conflict - the entity spine already
exists (migration 282/283) and corridor/jurisdiction/instrument/organisation entities are already
backfilled per the complete-build-plan's own 00S1 row. Build that column as spec 08 states it.

## Objective and requirement IDs

Spec 03S7 #8, spec 08S1.2's `signposts` table (built for real, modulo the open question above), the
platform-intent doctrine `research-is-horizon-scan`'s binding "no editorial queue" clause.

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
  closes one-ninth of ADR-039(e)'s own completion criterion.

## Exact write set

- New migration creating `signposts` per spec 08's DDL, modulo the open question's resolution. File name
  depends on the migration-number resolution below.
- `fsi-app/src/lib/propagation/methods/signpost-watch.ts` (new), registered in the EXISTING `fsi-app/src/
  lib/propagation/methods/index.ts` registry via its side-effect import convention (read that file's own
  header first - it documents exactly why registration happens there and nowhere else).
- `fsi-app/src/lib/propagation/methods/signpost-watch.test.mjs` (new).
- New migration's own `.test.mjs` self-check, following migration 344's own pattern (`344_research_
  assessments.test.mjs` - a text-parsing proof that a self-check literal and the real column/constraint
  count cannot drift apart; read that file on the branch before writing yours).
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
4. `fsi-app/supabase/migrations/282_entities.sql`, `283_entity_refs.sql` - the entity spine's real
   current shape, to resolve the open question above with facts, not assumption.
5. `fsi-app/supabase/migrations/344_research_assessments.sql`, on the branch, IN FULL - what an
   assessment actually is today (uuid PK, no entity_id), the exact fact the open question rests on.
6. `grep -rn "entity_kind\b" fsi-app/supabase/migrations fsi-app/src/lib` - every place the nine-kind
   enum is asserted, so your migration's self-check (if it adds a tenth kind under resolution (b)) does
   not silently diverge from ADR-039(e)'s "all nine" framing without flagging that divergence loudly.
7. `docs/inventories/migrations.md` - regenerate this file's entry for your new migration number once
   assigned (same pattern lane W2-R used for 344); do not hand-edit other rows.

Report "read and reused" naming each file above.

## Migration number

The complete-build-plan's own table (section 2) assigns **346** to this lane (signposts). The
coordinator's separate dispatch assignment for this session names **348**. **These two numbers both
point at the same table in two different governing documents - this is the collision named in this
brief set's README, open question 2.** Do not pick one yourself. STOP and ask the coordinator which
number to apply for before writing the migration file; state both candidate numbers in your report and
wait.

## R14 compliance

Tools before data. This lane builds the table and the watcher method; it does not populate the table
with real signposts (that is a later, data-population pass, gated by the R14 lift criteria in the
complete-build-plan section 3, specifically criterion 6, the fixture-database proof - not this lane's
job). No `--apply` path of your own exists beyond the migration itself, which the coordinator applies
via Supabase CLI per the two-track policy (CLAUDE.md rule 3) - you author DDL-sketch-only, same posture
as migration 344's own header.

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

`lane/w2r-research-assessment` merged (needs `research_assessments` to attach signposts to - and is the
direct subject of the open question above). The existing drain (spec 08S2, already built). None of L3,
L5, L7, L8, L9.

## Report format

Per the lane common contract. Your report's FIRST section, before anything else, restates the open
question above and its disposition (ruled by the coordinator before you started, ruled mid-session, or
proceeded under candidate (a) with the flag). Do not bury this in the middle of the report.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration number applied without the coordinator's resolution of the 346-vs-348
collision. No new entity-kind value added to any enum without the coordinator's resolution of the open
question. No DB credential, no live write.
