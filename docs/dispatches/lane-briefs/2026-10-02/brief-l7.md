# Lane L7: Research-role source registration + the research walker as a dispatch-callable runtime

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.3 (row 03S8) and its L7 entry in section 2; `docs/specs/03-
research.md` section 8 (free intake and credibility stack) in full; the `caros-ledge-platform-intent`
skill's RESEARCH section; then `fsi-app/src/lib/agent/canonical-pipeline.ts`'s mint chokepoint (read
enough to find and name the single write site, not the whole file unless your work touches more of it).

Lane id: `l7`. Branch: cut from `origin/master` directly (this lane does not depend on `lane/w2r-
research-assessment`'s schema - it writes `intelligence_items` rows through the existing mint
chokepoint, not `research_assessments` - confirm this independence by reading the chokepoint before you
start; if you find a real dependency this brief missed, STOP and report it rather than assuming). Branch
name: `lane/l7-research-walker-2026-10-02`. Model: Sonnet.

## Objective and requirement IDs

Spec 03S8: the free intake stack (OpenAlex, ROR, ORCID, Crossref, Semantic Scholar, DOAJ, CORDIS, TRID,
OpenAIRE) as a dispatch-callable runtime, never a standing schedule during build mode. Closes R14 lift
criterion 8 (research-role source registration exists and the research walker has fired at least twice
by explicit dispatch, logged to `harness_runs`).

## Operator rulings that bind you

- **CLAUDE.md rule 16** (build mode holds the scrape cadence off, verbatim, restated 2026-09-03): "no
  session proposes flipping it." This lane builds the runtime and a `--dispatch` CLI flag; it adds NO
  cron entry, NO workflow `schedule:` block, NO GitHub Actions cron trigger anywhere. If you find
  yourself writing a schedule, stop - that is out of scope regardless of how convenient it would be.
- **Doctrine `research-is-horizon-scan`**: feedstock is autonomous machine intake from research-role
  sources; editorial curation queues are forbidden. Your walker writes candidate items; it never stages
  them for human sign-off.
- **CLAUDE.md rule 17** (nothing runs alone): a candidate item your walker mints is not "done" until it
  has passed through the SAME flywheel connection and harness-recording path every other mint goes
  through - this lane does not get a shortcut path because it is new. State explicitly in your report
  which downstream hops (forward events, analysis, tags) a minted research_finding item triggers today,
  and which it does not yet (an honest gap, not a thing to silently skip).
- **Spec 03 section 8's own list**: the grey-literature sources (IEA, ICCT, a university transport
  institute, named in the plan's own acceptance test) route through the non-citation authority model,
  not the OpenAlex citation path - this lane's walker registers them as `sources` rows with the correct
  role class; it does not need L3's authority-score module to register a source, only to later score it.

## Exact write set

- `fsi-app/scripts/research/research-walker.mjs` (new) - OpenAlex/ROR/ORCID/Crossref client (reuse
  `openalex-client.mjs` from L3 if it has landed by the time you start; if not, build the minimal fetch
  you need and name the duplication risk in your report for the coordinator to reconcile later - do not
  block on L3). Writes candidate `research_finding` items through the existing mint chokepoint named in
  `canonical-pipeline.ts`, never a second write path. `--dispatch` CLI flag; no schedule block anywhere.
- New `sources` registration rows for the 3 named research-role sources (IEA, ICCT, a named university
  transport institute) - via the EXISTING sources registry/table, not a new table. Identify the exact
  insert path by reading the existing registry's own registration script or admin flow first; reuse it.
- `fsi-app/scripts/research/research-walker.test.mjs` (new) - dry-run fixture tests, zero network, zero
  DB credential.
- `.github/workflows/research-walker.yml` (new, if the coordinator wants a workflow entry point at all;
  otherwise a CLI-only dispatch is sufficient - read `.github/workflows/research-assessment.yml` on the
  `lane/w2r-research-assessment` branch first, as the exact "explicit-dispatch, no schedule, chained-
  dry-guard step included" pattern to copy, and state in your report whether you added the workflow file
  or judged the CLI flag alone sufficient).
- `fsi-app/scripts/harness-runs/research-walker/family.json` (new) - registers the new harness family
  per the `family-registry.mjs` convention (read `CONVENTION.md`'s "Registering a family" section first
  - a lane after 2026-09-19 adds ONLY this one descriptor file, nothing else).
- `docs/ops/session-log.d/2026-10-02-l7.md` (new).

## READ FIRST

1. `fsi-app/src/lib/agent/canonical-pipeline.ts` - find and name the single mint write site (the
   "chokepoint... never a second write path" the plan's own L7 row requires you to reuse). Do not read
   the whole file if you can name the site from a targeted grep; but confirm by reading the function
   itself, not by assumption.
2. `grep -rn "sources\b" fsi-app/scripts/lib fsi-app/src/lib | grep -i regist` - the existing sources-
   registration path (script, admin route, or seed) you reuse rather than inventing a parallel insert.
3. `fsi-app/scripts/harness-runs/CONVENTION.md`, IN FULL, and `fsi-app/scripts/harness-runs/family-
   registry.mjs` - the exact descriptor shape your new `research-walker/family.json` must match (lane N2
   already converted every family to this descriptor shape; do not add a hand-written entry to any of
   the old shared files it replaced).
4. On `lane/w2r-research-assessment` (branch): `.github/workflows/research-assessment.yml` - the
   explicit-dispatch-only workflow pattern, including its chained-dry-guard step, to copy if you build a
   workflow file.
5. `grep -rln "research_finding"` across `fsi-app/src/lib/agent` and `fsi-app/scripts` - every place
   that reads or writes this item_type, so your new candidate rows are shaped compatibly with every
   existing consumer (theme column, severity mapping in `taxonomy.mjs`, the format dispatch in `system-
   prompt.ts`).
6. `docs/decisions/` - `grep -ril "research.role\|research-role\|sources registry"` before adding a new
   registration path, per the lane common contract's ADR-search rule (section 4 of "Read before you
   write").
7. `docs/inventories/migrations.md` - confirm no migration is needed (you write to existing tables
   only); if your reading of the sources table says otherwise, STOP and report before writing SQL.

Report "read and reused" naming each file above.

## Migration number

The complete-build-plan's own table states "Migrations requested: none (reuses `sources`,
`intelligence_items`, `harness_runs`)". The coordinator's separate dispatch assignment names **349** for
this lane - the same number the complete-build-plan assigns to **L17** (obligations, Wave 6, a different
lane entirely). **Do not apply for migration 349.** If your reading of the existing `sources` table
proves it genuinely cannot hold a research-role registration without a schema change, STOP and report
the exact gap to the coordinator before requesting any number, rather than defaulting to 349.

## Harness and flywheel wiring (rule 17)

This is the lane most directly subject to rule 17. Your report must state, per minted candidate item in
your dry-run fixture: which flywheel hops fire today (forward-events extraction, the propagation drain's
existing invalidation pass, tag assignment) and which do not yet reach this new source path, named
honestly as gaps rather than omitted. The harness family `research-walker` you register must have its
first real run artifact (`research-walker-run-001.json`) produced against the 3 named sources in dry
mode before you report done - this is the R14 lift criterion 8 proof, and "fired twice, both times by
explicit dispatch, both logged to `harness_runs`" is the plan's own literal acceptance bar, so you need
TWO dry runs with two distinct run artifacts, not one.

## R14 compliance

Tools before data, three-gate shape: a reviewed-code `ENABLED` const, a runtime kill switch (env var),
and the `--apply`/`--dispatch` CLI flag, same shape as `research-assessment-producer.mjs` on the branch
(read it as the pattern). Dry by default. No live site-data write without the gate open; your two
required dry runs produce candidate items as fixture/dry output, never a live `intelligence_items`
insert, unless the coordinator has separately authorized a live dispatch (state plainly in your report
whether you ran live or dry - do not conflate the two).

## Tests and the fire-once requirement

- `node --test fsi-app/scripts/research/research-walker.test.mjs`: dry-run fixture tests.
- The plan's own acceptance test: a dry run against the 3 named research-role sources produces candidate
  items that pass the existing mint chokepoint's gates.
- The two-dispatch requirement above, with both run artifacts pasted (paths, not full contents) in your
  report.

## UX compliance

Not applicable - this lane touches no `.tsx`/`.css` file.

## Dependencies

None beyond the existing mint chokepoint (already built). Independent of L3, L5, L6, L8, L9 - may run in
parallel with any of them.

## Report format

Per the lane common contract. Name the mint-chokepoint file:line you reused. Name every flywheel hop
checked and its result (fired / did not fire / not yet wired) for your fixture candidate items.

## Standing prohibitions

No nested agents. No `--no-verify`. No cron, no schedule, no GitHub Actions `schedule:` trigger anywhere
in your write set (rule 16, absolute for this lane in particular). No edit to `docs/ops/session-log.md`,
`docs/PROGRAM-BOARD.md`, or `docs/INDEX.md`. No migration applied without the coordinator naming a
number distinct from 349. No DB credential, no live write without separate operator authorization
stated plainly.
