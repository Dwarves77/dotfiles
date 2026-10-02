# Lane L8: Research theme classification backfill for the null-theme rows

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full, including the
UX contract section (you add a visible band, even though the bulk of the work is a backfill script);
`docs/plans/complete-build-plan-2026-10-01.md` section 1.3 (its own-note row on theme rendering) and its
L8 entry in section 2; `docs/specs/03-research.md` section 10's "Theme rendering" gap row.

Lane id: `l8`. Branch: cut from `origin/master` directly (independent of `lane/w2r-research-assessment`
- confirm by reading `taxonomy.mjs`'s current state on master before you start; if the branch has
already changed the theme column's shape in a way that affects you, STOP and report). Branch name:
`lane/l8-research-theme-backfill-2026-10-02`. Model: Haiku for the batch classification calls, Sonnet
for the `Unclassified` band UI, per the plan's own model split for this lane.

## Objective and requirement IDs

Spec 03's own-finding (section 10): "Theme rendering silently hides verified content matching no theme
regex. Verified content is silently invisible." Closes R14 lift criterion 9: 0 null-theme `research_
finding` rows, or an explicit `unclassified` band visible.

## Operator rulings that bind you

- **CLAUDE.md rule 2** (never fabricate): a backfill classification is a real Haiku call against the
  item's own text, scored against the existing closed theme vocabulary - never a default guess, never a
  silent "emissions_accounting" fallback because it is the first value in the enum. A genuinely
  ambiguous item gets `unclassified`, not a forced pick.
- **CLAUDE.md rule 14** (finding is a hypothesis until verified): the plan's own count ("47 of 36
  research_finding rows... have null theme", an internally inconsistent count the plan itself carries
  verbatim) is `[HYPOTHESIS, spec-dated]` per the plan's own status-token discipline. **Your first step
  is re-running the live count** (`SELECT count(*) FROM intelligence_items WHERE item_type =
  'research_finding' AND theme IS NULL` via the coordinator, since you have no DB credential - ask the
  coordinator for this one read before building the backfill, or build against the fixture count and
  flag the live number as unverified in your report). Do not repeat "47 of 36" as a fact; it is
  arithmetically impossible as written (47 cannot be a subset of 36) and is itself evidence the plan's
  own number needs re-verification, not propagation.
- **Spec's own design intent**: the `Unclassified` band is a permanent safety net, not a one-time cleanup
  artifact - a classification miss after this lane ships must still be visible, never silently absorbed
  back into invisibility. Build the band to render whenever the null-theme count is nonzero at render
  time, not only today.

## Exact write set

- `fsi-app/scripts/research/backfill-themes.mjs` (new) - Haiku classification against the existing
  closed theme vocabulary (the 7 values named in `system-prompt.ts`'s own comment:
  `emissions_accounting | fuels_saf | packaging_circular | carbon_markets | cold_chain_art |
  last_mile_electrification | disclosure_regimes`), same Haiku-route pattern as the existing
  `recommend-classification` module (read it first, reuse its request/parse shape, do not reinvent the
  Haiku-call wrapper).
- `fsi-app/scripts/research/backfill-themes.test.mjs` (new) - dry-run fixture tests, no live LLM call,
  no DB credential.
- `fsi-app/src/components/research/ResearchThemeCards.tsx` - add an `Unclassified` band rendered when
  the null-theme count (passed in as a prop or computed from the existing data read) is nonzero. Read
  the whole file first; this is a targeted addition, not a rewrite.
- `fsi-app/src/components/research/ResearchThemeCards.npmtest.mjs` - extend with the regression test
  named in the acceptance criteria below (the exact defect the spec names: a row matching no regex is
  counted in tiles but rendered nowhere - prove this was true before your fix via a reverted-fixture
  check, then prove it is false after).
- `docs/ops/session-log.d/2026-10-02-l8.md` (new).

## READ FIRST

1. `fsi-app/src/components/research/ResearchThemeCards.tsx`, IN FULL, and its `.npmtest.mjs` - the
   current tile-counting and band-rendering logic the spec's own finding describes; confirm by reading,
   not by trusting the plan's prose, exactly how a null-theme row is counted-but-not-rendered today (name
   the file:line in your report).
2. `fsi-app/src/lib/research/taxonomy.mjs` - whether theme classification touches this file at all, or
   is purely a DB column read; your backfill writes the column, this file (per lane W2-R's own fix)
   handles severity, a different concept - do not conflate them.
3. `grep -rln "theme" fsi-app/src/lib/agent/metadata-vocab.ts fsi-app/src/lib/agent/system-prompt.ts` -
   the single home for the theme vocabulary (metadata-vocab.ts, per its own header comment) - your
   backfill script imports this vocabulary, never a hand-copied literal list that could drift from it.
4. The existing Haiku classification route your backfill reuses - find it via
   `grep -rln "recommend-classification\|haiku" fsi-app/scripts` and read the one closest in shape (a
   batch-classify-against-closed-vocabulary call) before writing a new wrapper.
5. `docs/decisions/` - `grep -ril "theme" docs/decisions/` before changing anything about how theme is
   assigned; name any ADR that governs the vocabulary itself (you are not changing the vocabulary, only
   backfilling a column against it, but confirm no ADR forbids a backfill of this kind).
6. `docs/inventories/migrations.md` - confirm no migration is needed (the theme column already exists,
   per the plan's own note); if your reading disagrees, STOP and report before writing SQL.

Report "read and reused" naming each file above.

## Migration number

None requested; none needed - the theme column already exists. The coordinator's dispatch assignment
names **350** for this lane; the complete-build-plan's own table assigns 350 to **L18** (portfolio, Wave
6), a different lane. **Do not apply for migration 350 under any circumstance** - this lane's acceptance
test does not involve schema at all.

## Harness and flywheel wiring (rule 17)

A backfill is a one-time (or re-runnable) data-correction script, not a standing producer; it has no
harness family of its own unless the coordinator decides otherwise. State in your report whether you
registered one (likely not needed - this is closer to a maintenance task than a recurring producer) and
your reasoning either way. The `Unclassified` band, once shipped, is itself the permanent downstream
safety net rule 17 would otherwise require a harness to provide - name this explicitly as why no
standing harness family is needed here.

## R14 compliance

Three-gate shape for the backfill: reviewed-code `ENABLED` const, runtime kill switch, `--apply` flag.
Dry by default - a dry run classifies against fixtures and reports what it WOULD write, never touching
the live table without the gate open and explicit coordinator authorization for the live pass (you
likely do not run the live pass yourself in this lane; say so plainly and hand the live `--apply`
dispatch to the coordinator as a follow-on action, consistent with "tools before data").

## Tests and the fire-once requirement

- `node --test fsi-app/scripts/research/backfill-themes.test.mjs` and the extended `ResearchThemeCards.
  npmtest.mjs`.
- Acceptance test named in the plan: live `research_finding.theme` null count goes from its (re-
  verified, not assumed) current value to 0, every row gets a theme or explicit `unclassified`; the
  surface renders an `Unclassified` band when the count is nonzero rather than silently hiding those
  rows - regression-tested against the EXACT defect named in the spec (counted in tiles, rendered in
  zero bands).
- "Test what you build": run the backfill once, dry, against the live table's actual null-theme rows (a
  SELECT-only read via the coordinator, since you hold no credential) or against a fixture set sized to
  match the re-verified live count, and paste the dry-run's proposed theme assignments for a sample of 5
  rows in your report.

## UX compliance (required section in your report)

For `ResearchThemeCards.tsx`'s new `Unclassified` band: primary goal (surface a classification miss
rather than hide it), path (zero steps, renders inline with the existing theme tiles whenever the count
is nonzero), no new async action (this band renders from already-fetched data), feedback state (the band
itself IS the feedback state the spec's finding says is missing today - describe its visual treatment
relative to the existing tiles, consistent typographic and spacing treatment, not a jarring error-styled
callout for what is an honest, expected absence state).

## Dependencies

None. Independent of L3, L5, L6, L7, L9 - may run in parallel with any of them.

## Report format

Per the lane common contract, plus the UX compliance section above. State the re-verified live null-
theme count (or the fixture-based substitute and why) prominently, since the plan's own carried number
is internally inconsistent and this lane's first job is correcting that in place per rule 14.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration applied (none needed; 350 is explicitly forbidden to this lane). No DB
credential, no live write without separate operator authorization stated plainly.
