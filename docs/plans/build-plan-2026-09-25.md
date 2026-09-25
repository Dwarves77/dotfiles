# Build plan  -  2026-09-25: the four-questions rebuild

Living plan doc. Opened by the coordinator close of 2026-09-25 to carry rulings R1-R13 (verbatim in
[docs/ops/session-log.d/2026-09-25-coordinator-close.md](../ops/session-log.d/2026-09-25-coordinator-close.md))
forward into work. Read the close addendum first  -  it has the rulings, the state, the design changes
owed and the known bugs; this document is the forward plan built on top of it.

## How the build is run

Restated here because every lane brief in section 4 depends on it; the full text with citations lives
in the close addendum's "How the build is run" section. Short form: the coordinator coordinates only,
sub-agents (Sonnet for implementation/research, Haiku for mechanical work, never Opus) do the work;
a sub-agent that hits a question about scope, design, a doc conflict, or a choice between approaches
STOPS and asks the coordinator, never decides it; token use is metered (rule 11)  -  read narrowly, reuse
cached results, never re-derive what specs 00-10 and the ADRs already answer; artboards govern look
only (rule 20), system and structure are ruled in conversation, and a divergence becomes a Design
Changes Owed entry, never a silent pick; lanes work in their own worktrees (RD-19), one writer per file,
session notes to `docs/ops/session-log.d/` (F51); the coordinator merges once CI is green; database
writes are SELECT-first and coordinator-approved only; every finding in this plan and in the audit lane
(section 3) below carries `[CONFIRMED]` / `[HYPOTHESIS]` / `[REFUTED]` (rule 14).

## 1. Workstreams

Each workstream below states the question it answers, what it reuses, and its rough sequence position
(see section 4). None of these are examples (rule 19)  -  each names the class it covers, not one
instance.

1. **Supabase integrity-and-wiring audit (FIRST  -  gates everything else).** Every table has a reader
   and a writer, or an allowlisted reason; no duplicate or parallel tables serving one role; no
   duplicate items (same instrument minted twice  -  legacy_id/CELEX collisions); no dead columns; no
   unwired UI parts (a component or route rendering a field with no producer); no unrun producers (an
   ADR-023-named runtime with no schedule and no dispatch history). Full spec in section 3. R13's
   "everything must be clean, functional and wired" is the acceptance bar.
2. **Community identity-by-default.** R8.7 supersedes spec 07's opposite default (amended this close).
   Show identity unless the user opts into anonymity, per-post or per-user; anonymous posts keep the
   verified-member marker; fix the composer's 400 without `entity_ids`.
3. **Placeholders → absence wording.** The new artboards' rule: "a value that exists is shown; one that
   cannot exist yet names the data it needs" (e.g. "needs 4 price inputs →"). Applies everywhere a
   card currently renders nothing or a generic placeholder, not only on #800's parts.
4. **Operations matrix shows values.** `fetchOperationsCoverage` has an envelope-reader gap
   (`docs/PROGRAM-BOARD.md:1587`, pre-existing line, re-cited here)  -  the matrix has a value to show and
   isn't reading it. Fix the reader, not the schema.
5. **Market Intel label.** Nav label must read "Market Intel" (R12); the #604 rename to "Market" was
   never approved and reverts.
6. **Structured-action extraction.** Items with "do now" prose but empty `recommended_actions` need the
   pipeline to extract structured actions from that prose, not leave it prose-only. Class fix, not a
   per-item patch (remediation-discipline: class over instance).
7. **Profile + applicability.** R5 / ADR-034: role-based users, organisation size as a dimension, the
   "on behalf of many" aggregate mode (illustrations only per rule 19). Open item: reconcile population
   thresholds  -  this close's N≥10 vs. spec-07's ≥5/25% (community benchmark)  -  coordinator decision,
   not a lane's.
8. **The four-question answer (R3), wired per surface.** "What's happening in this industry and how
   does it affect me" / "how do these things affect my choices and where do I invest or not" is the
   acceptance test for every surface section this plan touches, not a slogan. Each workstream below
   that touches a surface states, in its lane brief, which half of R3 it answers and how.
9. **Typed connections + chain.** The masthead connections strip (new boards: moves off the rail, into
   the masthead card on 03/07/09). Reverses #800's "renders nothing"  -  the look-only pass (workstream
   15) must implement this, not merely re-skin the old behaviour.
10. **Generalising the five hard-coded examples** (rule 19, applies retroactively to code, not only new
    specs): the 16-instrument classifier, the single-corridor rate board (now moot  -  see workstream 11),
    the fuel-only market view, the automate-vs-hire Operations page, the SAF benchmark. Each needs its
    full question stated and a coverage test beyond its one instance.
11. **ETS-proxy carbon calc.** Decisions 1 and 2: no freight-rate tracking; carbon cost per
    container/tonne from carrier-published ETS surcharges, per carrier/period/source, never blended
    without a range, client override labelled client-supplied, EEX licence deferred. Spec 02 and spec
    07 (Market Intel section) both carry the 2026-09-25 amendment already.
12. **Learning loop S→M→L.** R10; full design in
    [docs/plans/learning-loop-design-2026-09-25.md](./learning-loop-design-2026-09-25.md). Builds under
    the build-mode cadence (rule 16, scrape cadence off) and no-paid-research (decision 6a). The
    BYD/fast-charger case in that design doc is illustrative only (rule 19)  -  the loop must be built to
    cover the class of "new industry news arrives, the site reaches out, concludes, and the surfaces
    update," not that one case.
13. **Research model design.** Decision 4: DESIGN now, BUILD after the four-question structure (section
    4 sequence) lands. Do not build ahead of this gate.
14. **ADR-034 naming-only phase.** R5: the domain-agnostic core is merged (#799); this phase is naming
    and surface text only  -  no schema or behaviour change yet. Confirm no lane treats ADR-034 as
    licence to touch schema this phase.
15. **#800 look pass against the new boards.** Fix, against the artboards in `coord/artboards-2026-09-25`
    (or its successor once merged): band tag once per masthead not per fact-card; remove the leftover
    SCOPE wrapper; restore the 3px top-rule card treatment on sections; fix the squeezed Sources table on
    Operations; confirm the stepped meter; style the connections strip per workstream 9; apply the
    absence wording per workstream 3.
16. **Market detail raw-dump bug.** A raw text/JSON-like dump renders mid-page on the Market detail page,
    live and on branch. `[HYPOTHESIS]` until a lane reproduces it with a URL and a screenshot/network
    capture  -  needs its own lane, not a drive-by fix (rule 13: a flag is work, delivered decision-ready
    even where a ruling or access blocks execution).

## 2. Integration table

Every existing lane/item is marked against this rebuild: **KEEP** (proceeds unchanged), **MERGE INTO**
(folded into a numbered workstream above), **SUPERSEDED BY** (a ruling replaces it), **CONFLICTS**
(needs a coordinator or operator call before either can proceed), or **REDUNDANT** (already done,
duplicate tracking).

| Existing item | Source | Disposition | Reason / citation |
|---|---|---|---|
| M0 housekeeping (merge train, migration 299 deferral) | complete-system-build-plan section 6.1 | KEEP | Independent of this rebuild; migration 299 + 146-item re-mint still gated behind the proof run (section 6.2/section 6.3), unaffected by R1-R13 |
| M1 head of the loop (fetch-drain, source-sweep) | section 6.1 | KEEP | Machine-layer lane, orthogonal to the four-questions rebuild; runs under build-mode cadence (rule 16) same as before |
| M2 ledger-consume apply | section 6.1 | KEEP | Unaffected; still gated on M1 |
| M3 turns chained and proven | section 6.1 | KEEP | Unaffected |
| M4 brief chain wired at mint | section 6.1 | MERGE INTO workstream 6 (structured-action extraction) | The brief chain's `record-briefs` write site is the natural home for extracting structured actions from "do now" prose  -  same chokepoint, same lane family. Coordinate, don't duplicate the write site |
| M5 market-series edges | section 6.1 | CONFLICTS  -  workstream 11 (ETS-proxy carbon calc) | M5 authors edges from `market_series` producers that may include rate-board series retired by decision 1. Needs a coordinator pass over `scripts/producers/market/*.mjs` to confirm no producer's sole purpose was the retired rate board before M5 proceeds unchanged |
| M6 evaluate invokers (Gate A rescan, quarantine disposition) | section 6.1 | MERGE INTO workstream 1 (Supabase audit) | `quarantine-disposition-audit.mjs` and the Gate A rescan are exactly the reuse-first mechanisms the audit lane spec (section 3) is built on; M6's dispatch wiring becomes the audit lane's remediation-phase invoker, not a separate lane |
| M7 last mile (grade badge, NoticesRail, statutory writer) | section 6.1 | KEEP, sequenced after workstream 15 | The grade-badge parts work depends on the same Masthead/ListRow parts as the #800 look pass; land #800's look pass first so M7 mounts onto the corrected parts, not the old ones |
| M8 collect completeness (sitemap/feed/research walkers) | section 6.1 | KEEP | Unaffected; runs under build-mode cadence |
| M9 loop manifest and harness truth (F50, dispatch ledger) | section 6.1 | KEEP, and REUSED by workstream 1 | F50's "every hop fires, every family has an artifact" pattern is cited directly in the audit lane spec (section 3) as the model for the wiring check |
| 6.2 proof run | section 6.2 | KEEP | Gates M1-M6/M9; independent of this rebuild's workstreams, but the Supabase audit (workstream 1) should run its SELECT-only pass before, not after, the proof run's writes, so audit findings aren't reading a mid-migration state |
| 6.3 the data, once (migration 299 + 146-item re-mint, brief batches, statutory upload) | section 6.3 | KEEP | Unaffected by R1-R13; still sequenced after the proof run |
| W10 parts program (F49, FactCard, Masthead, ActionCard, CommandBar, ListRow, StateNote, RailCard, NavCard) | section 6.4 | MERGE INTO workstream 15 (#800 look pass) | #800 is W10's own deliverable, parked on old boards; the look pass IS the next W10 step, not a separate program |
| Brief-chain plan Parts 0-2 (green master, wiring at mint, brief contract) | brief-chain-build-plan-2026-09-11 | KEEP | Below the rebuild; unaffected |
| Brief-chain plan Part 3 (brief runtime: record-briefs, brief-apply) | brief-chain-build-plan-2026-09-11 | MERGE INTO workstream 6 | Same reasoning as M4 above  -  one write site for structured actions and brief content |
| Brief-chain plan Part 4, Task 4.3 (Ask mode ON in production) | brief-chain-build-plan-2026-09-11 | KEEP | Unaffected; already ruled ON |
| Spec 06 gap register and sequence | docs/specs/06-gap-register-and-sequence.md | KEEP, re-read not re-derived | Cited as the source of truth for gap sequencing; this plan does not restate its gap list  -  read it directly per rule 11 |
| Hop proofs / proof run 6.2 (carried-over list item) | PROGRAM-BOARD carried-over list | KEEP | Same item as row above; single entry, not duplicated |
| M7c, M4b (carried-over list) | PROGRAM-BOARD carried-over list | KEEP | No ruling touches these; proceed as already planned |
| 6.3 data (carried-over list) | PROGRAM-BOARD carried-over list | REDUNDANT | Same as the 6.3 row above  -  one entry |
| Community search restyle (carried-over list) | PROGRAM-BOARD carried-over list | MERGE INTO workstream 2 (Community identity-by-default) | Any Community UI restyle in flight should carry the identity-by-default default from R8.7, not the retired anonymous-by-default layout |
| Watchlist re-check cell (carried-over list) | PROGRAM-BOARD carried-over list | KEEP | Unaffected |
| /admin/factors rows (carried-over list) | PROGRAM-BOARD carried-over list | KEEP | Unaffected |
| Corridor rate board (spec 02 row 2, spec 07 Market Intel item 2) | specs 02 + 07 | SUPERSEDED BY decision 1 | Retired outright, not built; see spec 07 Amendment 2026-09-25 (Market Intel) and spec 02 Amendment 2026-09-25 |
| Community "not your name, not your company" default (spec 07 Community item 1) | spec 07 | SUPERSEDED BY R8.7 | See spec 07 Amendment 2026-09-25 (Community) |
| Population threshold ≥5/25% (spec 07 Community benchmark) | spec 07 | CONFLICTS with this close's N≥10 (R5 open item) | Not resolved this close  -  flagged as an open item in R5 and in workstream 7. Needs a coordinator ruling on which threshold governs before either surface's benchmark code changes |

**Counts:** KEEP 13 · MERGE INTO 6 · SUPERSEDED BY 2 · CONFLICTS 2 · REDUNDANT 1 (23 rows total).

## 3. Supabase integrity-and-wiring audit lane spec

**Principle: reuse first.** Before writing anything new, the lane inventories and runs what already
exists, in this order:

1. `fsi-app/.discipline/fitness/functions/F14-producer-consumer-orphan.mjs` (RD-9)  -  producer/consumer
   orphan detection, the direct precedent for "every table has a reader and a writer."
2. `fsi-app/.discipline/governance/execution-wiring.mjs`  -  proves a verifier is actually run by a lane,
   not merely git-tracked (rule 15). The audit lane's own verifiers must pass this same check once wired.
3. `fsi-app/.discipline/governance/closure-gate.mjs`  -  the existing gate that checks a lane's own
   closure conditions; model for the audit lane's own closure.
4. `fsi-app/scripts/verify/quarantine-disposition-audit.mjs`, `orphan-source-audit.mjs`,
   `source-link-audit.mjs`, `id-redirect-target-audit.mjs`  -  the four existing dedicated audits that
   already cover disposition, orphan sources, source-link integrity and redirect targets. The new lane
   does not reinvent these; it runs them and folds their output into one findings register.
5. `fsi-app/scripts/maintenance/canonical-key-dedup.mjs` and `.discipline/fitness/functions/F45-duplicate-code.mjs`
    -  existing duplicate-detection precedent (data-side and code-side respectively); the audit's
   duplicate-table and duplicate-item checks follow the same shape.
6. `fsi-app/scripts/verify/run-data-audit-lane.mjs`  -  the existing CI data-audit lane runner; the new
   audit's checks should register here rather than spin up a parallel lane runner.

**Coverage required** (each item below is a check, not yet a fix):
- Every table has a reader AND a writer, or an allowlisted reason (extends F14's producer/consumer
  model to the full schema, not only the tables F14 already covers).
- Duplicate or parallel tables serving one role (e.g. two tables both claiming to be the source-tier
  store)  -  new check, no existing precedent; build minimally on the F45 shape (structural comparison,
  not text diff).
- Duplicate items: the same instrument minted twice under different ids (legacy_id/CELEX collisions
  named explicitly by R13's own concern)  -  extends `canonical-key-dedup.mjs`'s method to run as a
  read-only report before any dedup write.
- Dead columns: written by nothing, read by nothing.
- Unwired UI parts: a component or route rendering a field with no producer anywhere in the schema  - 
  the UI-side mirror of F14's DB-side orphan check.
- Unrun producers: an ADR-023-named runtime with a declared schedule but zero dispatch history  -  extends
  the M9/F50 "every hop fires" pattern (section 2 integration table, M9 row) to producers generally, not only
  the loop-manifest's named hops.

**Method.** SELECT-only first, full stop  -  no write of any kind in the discovery phase. Output is a
findings register, one row per finding, each row carrying `[CONFIRMED]` (independently re-verified by a
named method), `[HYPOTHESIS]` (read from code/schema, plausible, not yet run against the live system),
or `[REFUTED]` (checked and found false, corrected in place per rule 13's corollary)  -  rule 14, no
exceptions. Only after the register is complete and reviewed by the coordinator do remediation lanes
open, each scoped to one disposition (drop, merge, wire, extract), each with its own coordinator-approved
statement set before any write (memory: DB agents edit with approval; standing rule 8: never hand-edit
published rows outside a migration).

**Acceptance.** The register is `docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md` (or the
date it actually runs), every finding labeled per rule 14, execution-wired per rule 15 so the checks
that get promoted to standing gates are provably run by a lane, not merely present.

## 4. Sequence and lane briefs (headline)

Model assignment: **Sonnet** for anything requiring judgment (design read, extraction logic,
cross-referencing rulings); **Haiku** for mechanical work (running an existing script, pushing a
branch, formatting a findings register from tool output). No Opus sub-agents. Any brief marked
"decision: coordinator" means the lane stops and asks rather than choosing.

| Order | Lane | Model | Decision rule |
|---|---|---|---|
| 1 | Merge the artboards PR (`coord/artboards-2026-09-25`) once its own CI is green | Haiku (mechanical merge) | If CI is not green, or the PR conflicts with #800, stop and ask the coordinator  -  do not force-resolve |
| 2 | Supabase integrity-and-wiring audit, discovery phase (section 3) | Sonnet | Any check design ambiguity (e.g. what counts as an "allowlisted reason") goes to the coordinator before the lane invents one |
| 3 | #800 look-only pass against the merged artboards | Sonnet (visual judgment against artboards) | Any structural/functional gap found mid-pass is NOT fixed inline  -  it is logged as a Design Change Owed or, if it's a system question, sent to the coordinator per rule 20 |
| 4 | Community identity-by-default (workstream 2) | Sonnet | The population-threshold conflict (section 2, last integration-table row) is NOT this lane's call  -  coordinator decides which threshold governs first |
| 5 | Market Intel label fix (workstream 5) | Haiku (mechanical rename + verify no other reference) | None expected; if the label appears in a generated/cached artifact the lane can't safely touch, stop and ask |
| 6 | Operations matrix envelope-reader fix (workstream 4) | Sonnet | If the envelope shape has changed since PROGRAM-BOARD:1587 was written, confirm with the coordinator before assuming the old gap description still applies |
| 7 | Structured-action extraction + brief-chain Part 3 merge (workstreams 6, M4) | Sonnet | Any change to the single write site (`record-briefs`) needs coordinator sign-off before merge, per the one-writer-per-file discipline |
| 8 | Market detail raw-dump bug repro (workstream 16) | Sonnet (investigation), Haiku (mechanical repro capture) | Repro only this lane; the fix is a separate, later lane once the cause is `[CONFIRMED]` |
| 9 | ETS-proxy carbon calc + M5 conflict resolution (workstream 11) | Sonnet | The M5 conflict (section 2) must be resolved by the coordinator before this lane touches `scripts/producers/market/*.mjs` |
| 10 | Generalising the five hard-coded examples (workstream 10) | Sonnet | Each example's coverage test is proposed by the lane, approved by the coordinator, per rule 19's mechanics |
| 11 | Learning loop S→M→L, build phase (workstream 12) | Sonnet | Design is already ruled (R10, learning-loop-design-2026-09-25.md); a lane that finds the design underspecified for a real case stops and asks rather than improvising |
| 12 | Research model design (workstream 13) | Sonnet | DESIGN ONLY  -  a lane that starts building before the four-question structure lands has skipped decision 4's gate; stop |
|  -  | M1-M9, proof run, 6.3 data (complete-system-build-plan section 6) | per that plan | Unaffected by this rebuild (section 2); continue under their own sequence, in parallel with the above where files are disjoint |

Nothing after lane 2 (the audit) starts writing to the schema until the audit's discovery-phase register
exists and the coordinator has reviewed it  -  R13's "clean, functional and wired" bar governs every
later lane's assumptions about what tables and columns are safe to build on.
