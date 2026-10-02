# Lane L9: Research Summary brief generation wired to the assessment model

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full, including its
warning (section "Write set") about governing-file changes and the harness convention's "Declaring a
pending run" step, since `system-prompt.ts` is almost certainly a governing file of the mint/record
harness family (confirm, do not assume); `docs/plans/complete-build-plan-2026-10-01.md` section 1.3 and
its L9 entry in section 2; `docs/specs/03-research.md` section 1 in full ("the atomic unit is the
assessment, not the paper") and the platform-intent skill's 6-section Research Summary format; then, on
your branch, `docs/decisions/ADR-038-research-built-now.md`.

Lane id: `l9`. Branch: cut from `origin/lane/w2r-research-assessment` (PR #887; confirm merge state
first - see L3's brief for the same note). Branch name: `lane/l9-research-summary-wiring-2026-10-02`.
Model: Sonnet (touches the canonical pipeline's system prompt - read `SKILL.md` for whichever skill
governs `system-prompt.ts` FIRST, per the doctrine's own warning cited in the plan).

## Objective and requirement IDs

Spec 03S1: "One assessment may draw on forty sources, and the forwarder never needs to read one. A card
that cannot populate `planning_assumption_shifted` does not ship as a card." This lane wires the
existing Research Summary brief generator to require and populate that field from the real assessment
and assumption-register data the other Research lanes produce, rather than leaving it an unenforced
convention.

## Operator rulings that bind you

- **ADR-038**: Research is built now, data machine first; the surface renders what the data machine
  produces, never the reverse. This lane is downstream of the data machine (L1/L3, in-flight) and the
  assumption register (L4, merged), not a redesign of either.
- **Spec 03S1's own non-negotiable rule**, restated: a card that cannot populate `planning_assumption_
  shifted` does not ship. This lane enforces that as a real constraint (a non-null check in the test, as
  the plan's own acceptance test states), not a style guideline in a prompt a model can ignore.
- **The canonical-pipeline doctrine's single-write-site rule** (cited in the plan as "the one canonical
  write site... non-negotiable"): you add the `research_summary` section to `system-prompt.ts` in place,
  never a parallel generator, a second prompt file, or a bypass route for research_finding items.
- **CLAUDE.md rule 17** (nothing runs alone): a brief generated for a research_finding item is not done
  until it actually reads the real assessment (L1/L3's columns) and the real assumption register (L4's
  table) - not a placeholder, not a hardcoded example. State plainly in your report which of the two
  your wiring actually reaches as of this lane's run, since L3's authority-score client may not have
  landed yet (see "Dependencies").

## Exact write set

- `fsi-app/src/lib/agent/system-prompt.ts` - the `research_summary` section addition. This file is
  almost certainly a governing file of a harness family (mint/record) - CONFIRM via `grep -rn "system-
  prompt" fsi-app/scripts/harness-runs/*/family.json` before touching it; if it is, add your own pending
  file (`scripts/harness-runs/<family>/pending/2026-10-02-l9.md`) per the convention, in the SAME commit.
- `fsi-app/src/lib/agent/metadata-vocab.ts` - new fields mapped to the live DB vocabulary the other
  Research lanes produce (`horizon_band`, the maturity corridor, the credibility distribution shape,
  the assumption-register's `load_bearing`/`vulnerable`/`bound_to` columns) - read the exact column
  names from migration 344 and migration 345 before writing the mapping; do not guess a field name.
- `fsi-app/src/lib/agent/system-prompt.test.mjs` or the nearest existing test file covering format-
  dispatch sections (read first to find the right home; do not create a parallel test file if one
  already covers this dispatch).
- `docs/ops/session-log.d/2026-10-02-l9.md` (new).

Do not touch `canonical-pipeline.ts`'s mint chokepoint itself (L7's territory, a different write path);
you are editing the PROMPT that feeds the EXISTING generation call, not the write path that persists its
output.

## READ FIRST

1. `fsi-app/src/lib/agent/system-prompt.ts` - the existing `research_summary` section (lines ~296, ~305,
   ~329, ~351-356 per this brief's own prior grep; re-confirm exact line numbers on your branch, they
   will have shifted) - read the surrounding ~100 lines so your addition matches the file's existing
   voice and constraint style (null-when-not-applicable, locked vocabulary call-outs, etc.).
2. `fsi-app/src/lib/agent/metadata-vocab.ts` - the `theme` vocabulary's "single home" comment and the
   existing `research_summary`-scoped fields, as the pattern your new fields follow exactly.
3. `fsi-app/src/lib/research/read-assessments.mjs` (on the branch, IN FULL) - the view-model shape your
   prompt addition will cite; confirm the exact field names (do not invent column names that do not
   exist in migration 344).
4. `fsi-app/src/lib/assumptions/read.ts`, `contract.mjs`, `row.mjs` (on master, already merged via PR
   #877) - `readAtRiskAssumptions`/`readWorkspaceAssumptions` and the `load_bearing`/`vulnerable`/
   `bound_to`/`isAtRisk` shape your `planning_assumption_shifted` field maps from.
5. `grep -rn "system-prompt" fsi-app/scripts/harness-runs/*/family.json` - confirm or refute the
   governing-file status named above; report the result either way.
6. `grep -rln "planning_assumption_shifted"` across `fsi-app/src` - confirm this field name does not
   already exist with a different shape before you introduce it (it may already be referenced as a
   convention-only comment somewhere, per spec 03S1's own framing - find out, do not assume it is net
   new).
7. `docs/decisions/` - `grep -ril "system-prompt\|canonical.pipeline\|single.write.site" docs/
   decisions/` - name any ADR governing the pipeline's single-write-site rule before editing it.

Report "read and reused" naming each file above.

## Migration number

None requested; none needed. The coordinator's dispatch assignment names **351** for this lane; the
complete-build-plan's own table assigns 351 to **L18** (portfolio, Wave 6), a different lane. **Do not
apply for migration 351 under any circumstance** - this lane edits a prompt and a vocabulary file only,
no schema.

## Harness and flywheel wiring (rule 17)

This lane IS the rule-17 closure point for the Research data machine: it is what makes an assessment's
existence actually change the customer-facing brief, rather than sitting in a table nobody reads from.
Your acceptance test (below) is the proof that the downstream is triggered, not merely that the upstream
tables are populated. If the governing-file pending-run mechanism applies (per the READ FIRST item
above), your commit discharges it or adds the pending file naming what a later harness run will
discharge - state which in your report.

## R14 compliance

This lane makes no live LLM call itself in its tests (per the lane common contract's $0 rule for
executor lanes); it edits the PROMPT text that the production canonical pipeline sends when it next runs
for real, under its own existing three-gate R14 shape (unchanged by this lane). Your acceptance test
(below) is explicitly a "regeneration of one live research_finding item" - if that regeneration requires
a real Sonnet call (it does, since `canonical-pipeline.ts` is an LLM-backed generator), this is the
PRODUCTION pipeline's own existing, already-authorized call path, not a new LLM call this lane
introduces; confirm with the coordinator before running a live regeneration against a real item, and if
unauthorized, build the test as a prompt-assembly-only check (confirm the assembled prompt contains the
required section and its field list) without an actual model call, and say so plainly.

## Tests and the fire-once requirement

- `node --test` for whichever test file you extend (named in your READ FIRST findings).
- The plan's own acceptance test: a regeneration of one live research_finding item produces a brief
  whose `planning_assumption_shifted` field is populated, enforced as a non-null constraint CHECK in the
  test, not just a convention comment in the prompt.
- If a live regeneration is not authorized for this lane (see R14 compliance above), the fire-once
  requirement is satisfied by asserting the assembled prompt text (the actual string sent to the model,
  not a mock) contains the new section's required fields, and flagging the live-regeneration step as an
  open item for the coordinator to run and confirm separately.

## UX compliance

Not applicable at the component level (no `.tsx`/`.css` touched) - the user-visible effect is a change
in generated brief CONTENT, which is reviewed via the regeneration test above, not a UX-law checklist.

## Dependencies

L1 (the branch's schema - `research_assessments`), L4 (the assumption register, already merged per PR
#877). L3 is NOT a hard dependency: if L3 has not landed, your `credibility_authority_score` mapping
cites `assess.mjs`'s placeholder distribution shape and you state this plainly rather than blocking.

## Report format

Per the lane common contract. State explicitly which of L1/L3/L4's data your prompt addition actually
reaches as of this run, and whether the live-regeneration acceptance test ran for real or was reduced to
a prompt-assembly-only check per the R14 note above.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration applied (none needed; 351 is explicitly forbidden to this lane). No live
LLM regeneration against a real item without separate coordinator authorization stated plainly. No DB
credential, no live write.
