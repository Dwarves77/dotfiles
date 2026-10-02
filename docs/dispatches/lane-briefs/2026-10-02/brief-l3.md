# Lane L3: Research source-authority client (narrowed to the authority-score half)

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full (it binds you,
including its "Read before you write" section 1-6); `docs/plans/complete-build-plan-2026-10-01.md`
section 1.3 (row 03S4) and its L3 entry in section 2; `docs/specs/03-research.md` section 4's "Score 2,
source authority" table in full; then `docs/decisions/ADR-038-research-built-now.md` and the migration
file named below, in full.

**Precondition (coordinator ruling, 2026-10-02): this lane dispatches only after `lane/w2r-research-
assessment` (PR #887) has merged to `origin/master`.** Confirm `docs/decisions/ADR-038-research-built-
now.md` and `fsi-app/supabase/migrations/344_research_assessments.sql` exist on `origin/master` before
you branch; if either is missing, STOP, do not branch from the unmerged PR as a workaround, report the
precondition unmet.

Lane id: `l3`. Branch: cut from `origin/master`. Branch name:
`lane/l3-research-authority-client-2026-10-02`. Model: Sonnet. You execute exactly this brief. Anything
it does not cover, or any statement here that is wrong against the code, is a STOP: report it, do not
solve it.

## Objective and requirement IDs

Closes spec 03S4's authority-score half only: a free, no-LLM, no-key module that computes the
`credibility_authority_score` jsonb column (migration 344) as a **distribution, never a mean** - role
class, topic-scoped institutional/author standing, funding independence, reception via FWCI with the
under-24-months velocity substitute, and an integrity/retraction check, per spec 03 section 4's
component table. The evidence x agreement half (`credibility_evidence_score`) is `assess.mjs`'s own
scope (lane W2-R, PR #887) and is explicitly NOT this lane's work - do not touch it.

## Operator rulings that bind you

- **ADR-038** (`docs/decisions/ADR-038-research-built-now.md`, on master post-#887): Research is built now,
  data machine first. Your module feeds a column that ADR-038's own migration 344 reserves for you; you
  do not redesign that column's shape, you populate it.
- **CLAUDE.md rule 2** (never fabricate): a source with no retrievable authority signal renders as
  `unknown`, never a guessed tier. Rule 18 (a figure with a source is rated, never refused) does not
  apply here directly (you are not gating a customer-facing figure), but its spirit does: an OpenAlex
  institution with zero in-topic works is a real `unknown`, not a reason to drop the source from the
  distribution.
- **Doctrine `research-is-horizon-scan`** (2026-07-12 ruling): no editorial queue, no human-approval
  affordance anywhere in this module's path. It is a pure computation from API responses to a jsonb
  shape; it does not hold anything for review.
- **Spec 03 section 4's own warning**: "never let absence of a citation footprint read as low
  authority; that is a coverage artefact, not a quality signal" - grey-literature sources (IEA, ICCT,
  TRID, Smart Freight Centre, IMO, EASA, national ministries) route through the non-citation authority
  model named in that section, not the OpenAlex citation path, when no DOI/author identity exists.

## Exact write set

- `fsi-app/scripts/research/openalex-client.mjs` (new) - thin fetch wrapper: `/works`, `/authors`,
  `/institutions` endpoints, polite-pool email header, no API key, retry/backoff on 429, `deps`-injected
  `fetch` so tests run with no network (pattern: `fsi-app/scripts/mint/screen-reconcile-records.mjs`'s
  injected-deps shape - read it first, do not reinvent the pattern).
- `fsi-app/scripts/research/authority-score.mjs` (new) - pure function from a resolved set of OpenAlex/
  ROR/ORCID records to the jsonb distribution shape: role class, topic-scoped institutional standing,
  author standing, funding independence (`independent | dependent | unknown`, per spec section 4's own
  three-state rule - never collapse `unknown` into `dependent`), reception (FWCI or the under-24-months
  velocity substitute, never raw `cited_by_count`), integrity flag. Also implements the grey-literature,
  non-citation authority path for sources with no OpenAlex identity.
- `fsi-app/scripts/research/openalex-client.test.mjs`, `fsi-app/scripts/research/authority-score.test.mjs`
  (new) - fixture-based, no network, no DB credential.
- `docs/ops/session-log.d/2026-10-02-l3.md` (new).

Do not touch `fsi-app/src/lib/research/assess.mjs`, `read-assessments.mjs`, the producer, or migration
344 itself. Your module is consumed BY the producer (a later wiring step this brief does not include -
see "Dependencies" below); you do not wire the consumption yourself unless the coordinator amends this
brief.

## READ FIRST (every write-set file's importers/imports, migrations, generated inventories)

1. The write-set files above do not exist yet - there is nothing upstream to read for them beyond the
   pattern file named (`screen-reconcile-records.mjs`).
2. `fsi-app/supabase/migrations/344_research_assessments.sql` (on `origin/master`, in full) - the exact
   shape of `credibility_authority_score jsonb` you are feeding, and the comment block explaining why it
   is jsonb, not scalar.
3. `fsi-app/src/lib/research/assess.mjs` (on `origin/master`, in full) - the "degenerate one-source
   distribution from source tier" your module replaces for sources it can actually resolve via OpenAlex/
   ROR/ORCID; confirm by reading, do not assume, exactly which function produces today's placeholder so
   your report can name the line the later wiring step will change.
4. `grep -rn "openalex\|OpenAlex\|ror\.org\|ORCID" fsi-app/src fsi-app/scripts` before writing a line -
   prior-art check per the lane common contract section "Prior art" (binding, 2026-09-17). Report the
   result even if empty.
5. `grep -rln "authority-score\|credibility_authority_score"` across `fsi-app/src` and `fsi-app/scripts`
   once your module exists, to confirm nothing else already reads that column with a different shape
   assumption.
6. `docs/inventories/migrations.md` - confirm migration 344's row (added by lane W2-R) states the column
   you are feeding; do not regenerate this inventory yourself (you are not touching the migration).

Report "read and reused" naming each file above and what, if anything, you reused rather than
reimplemented (per the operator's 2026-10-02 read-before-you-build instruction).

## Migration number

The complete-build-plan's own table (section 2, lane L3) states "Migrations requested: none (writes to
the column the schema already carries)". Per the coordinator's 2026-10-02 ruling (README table), this
dispatch reserves **361** for this lane - RESERVED, not to be consumed: this lane's acceptance test does
not require a schema change. If your work genuinely needs one you did not anticipate, STOP and ask the
coordinator by name before writing any migration file; do not apply for 361 by default.

## Harness and flywheel wiring (rule 17: nothing runs alone)

Your module is a pure library, not a standing process - it has no harness family of its own in this
lane. The producer that calls it (`research-assessment-producer.mjs`, on master post-#887, harness
family `research-assessment`) is NOT in your write set and this lane does NOT wire the call. State explicitly in
your report that the wiring (the producer importing `authority-score.mjs` and writing its output instead
of the placeholder) is an **open item for the coordinator or a follow-on lane**, named by file:line in
`assess.mjs`, so it is not silently left "built, dormant" per the lane common contract's definition-of-
done item 1 (Reachable). Do not wire it yourself without a brief amendment: the producer file is outside
your declared write set.

## R14 compliance

Tools before data: this lane ships a tool (the client + scorer), not a data-population run. No `--apply`
flag exists because this module performs no writes of its own; it returns a value the (future) caller
writes through the guarded path. $0: OpenAlex, ROR, ORCID are free, no key, polite-pool email only - no
Anthropic SDK call, no paid service anywhere in this module.

## Tests, and the fire-once requirement

- `node --test fsi-app/scripts/research/*.test.mjs`: fixture-based, zero network, zero DB credential.
- Negative test: the module never renders raw `cited_by_count` as a credibility signal anywhere in its
  output (grep the output object's keys in the test, not just eyeball it).
- Fixture proving FWCI suppression under 24 months with the velocity substitute present instead.
- "Test what you build" (operator, 2026-09-26): run `openalex-client.mjs` once, for real, against the
  live public OpenAlex API for a single known DOI (free, no credential, no rate-limit risk at n=1), by
  hand from the worktree, and paste the raw response shape (not the full body) in your report. This is
  the one real fire the rule requires; it is not a harness run (no harness family exists for a client
  module) and leaves no run artifact - say so explicitly rather than inventing one.

## UX compliance

Not applicable - this lane touches no `.tsx`/`.css` file.

## Dependencies

`lane/w2r-research-assessment` (PR #887) merged to `origin/master` - hard precondition, stated above, not
a thing to work around. No dependency on L5, L6, L7, L8 or L9.

## Report format

Per the lane common contract's "Report" section: `git log --oneline origin/master..HEAD`, file-by-file
what was built, consumers checked (name them even when none found), ADRs checked (name them), gate
outputs, corrections, open items including the un-wired producer call named above. State "the push gate
ran clean" or name the exact failing step; do not say "ready to push" unless every gate in the lane
common contract's "Gates before handoff" section actually passed.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md` - leave a "COORDINATOR ACTION NEEDED" line in your own session-log file instead. No new
allowlist entry without a named ruling. No DB credential, no live write.
