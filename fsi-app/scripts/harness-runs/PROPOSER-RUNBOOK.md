# Proposer runbook — the cadence that makes the loop close (Wave MH-1)

This is the procedure every harness family (`mint`, `screen`, `fetch-drain`, `meta-harness` — Wave MH-4
registered the meta-harness layer as a family over itself, per plan §3 — and any family added later)
follows on every run, per the build plan's §2 ("'Smarter on its own,' made structural"). It
exists to enforce one sentence: **no harness may run a new batch until a proposer has read the FULL
prior record of that family and either proposed improvements or attested none are warranted.** That
is not a suggestion this document restates for convenience — it is the precondition every lane brief
for a harness-family run must open with, and `F28` (harness-run integrity, Wave MH-2) fails CI when
it is skipped.

Read `CONVENTION.md` first if you have not — this document assumes you know the artifact schema, the
`writeRunArtifact`/`readRunHistory`/`--list` tooling, and *why* full traces matter (arXiv 2603.28052's
56.7% vs 38.7% ablation). This document is the cadence built on top of that substrate.

## 0. The four-step loop

```
  ┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
  │  PROPOSE    │ ──▶ │ FAMILY GATES │ ──▶ │     LAND     │ ──▶ │   MEASURE   │
  │ (read ALL   │     │ (the family's│     │ (commit, PR, │     │ (the NEXT   │
  │  artifacts  │     │  own tests + │     │  merge — same│     │  run writes │
  │  + traces,  │     │  the repo's  │     │  discipline  │     │  a new run  │
  │  hypothesize│     │  suite/tsc/  │     │  as any other│     │  artifact;  │
  │  or attest  │     │  fitness)    │     │  change)     │     │  its metrics│
  │  none)      │     │              │     │              │     │  ARE the    │
  └─────────────┘     └─────────────┘     └──────────────┘     │  measurement)│
        ▲                                                       └──────┬──────┘
        └───────────────────────────────────────────────────────────────┘
                    the next family run's proposer pass reads this
```

Every arrow is a real artifact, not a verbal handoff:
- **Propose** produces the attestation (§2 below), committed with (or immediately alongside) the
  proposal's diff.
- **Family gates** are whatever that family already runs today: `validate-mint-payload.mjs` for
  mint, `screen-rules.test.mjs` for screen, the drain protocol's own checks for fetch — plus this
  repo's standing three: `sh .discipline/run-test-suite.sh`, `npx tsc --noEmit`,
  `node .discipline/fitness/runner.mjs`. A proposal that does not clear its family's own gates never
  lands, exactly like any other change.
- **Land** is the same commit/PR discipline every wave in this repo already follows — nothing
  meta-harness-specific here.
- **Measure** is the next run's own artifact. Per plan §2's "measurement, not assertion": an
  "improvement" is not real until a run artifact's `metrics` shows it moved the family's standing
  metric (below). A proposal that lands but doesn't move the metric gets recorded as such, in the
  next artifact's `proposer_notes` — not quietly declared a win.

## 1. Precondition: the proposer pass, before any family's next run

Before a `mint`, `screen`, or `fetch-drain` lane runs a new batch, its dispatch/brief MUST open with
a proposer pass over that family's history:

1. **List the family's runs.** `node scripts/lib/run-artifact.mjs --dir scripts/harness-runs/<family> --list`
   — a survey, never a substitute for step 2.
2. **Read every artifact in full**, in `started_at` order (`readRunHistory` already sorts them).
   Every field, not just `metrics` — `defects_found` and `proposer_notes` are where the previous
   run's proposer (or this convention's retrofit) already did analysis; skipping them means redoing
   work that is already written down.
3. **Read every `full_trace_refs` path the artifacts point to.** This is the step the paper's
   ablation makes non-negotiable: a proposer that reads only `metrics` and `defects_found` (a
   scores-plus-summary diet) measured at 38.7% — *worse than scores alone* — against 56.7% for full
   raw traces. `full_trace_refs` exists exactly so this step has something concrete to do: open the
   report files, the payload JSON, the results JSON, the source excerpts — not a paraphrase of them.
   For a thousands-of-rows family (`screen`, and `fetch-drain` at scale), `per_item` is deliberately
   thin or empty per CONVENTION.md's "per_item at scale" rule — the full population lives ONLY in
   `full_trace_refs`, so this step is not optional for those families the way it might feel
   optional when `per_item` looks complete.
4. **Form a hypothesis, or attest none is warranted, with basis.** See §2 — this step's output is
   the attestation itself, and it belongs in the lane's report before any fetch/mint/classify work
   starts, not appended afterward.

A lane brief that skips straight to "run batch N+1" without this pass is the CI failure plan §2
describes ("skipping it is a CI failure") — `F28` (Wave MH-2) is the mechanical enforcement; this
section is the human/agent procedure `F28` exists to check was actually followed.

## 2. The attestation format

Every lane report for a harness-family run carries a **Proposer Attestation** section, in this
shape:

```markdown
## Proposer Attestation

**Artifacts read:** <run_id list>, e.g. mint-run-001. If any run's full_trace_refs could not be
opened (a moved file, a stale path), name it — never silently skip it and never fabricate what it
would have shown.

**Full traces read:** the actual paths opened, not "all of them" — e.g. BATCH-001-REPORT-v2.md,
payload-32019R1242.json, source-32019R1242.txt. This is the line F28 (Wave MH-2) checks exists and
is non-empty; a proposer pass that names zero traces read is indistinguishable from one that read
none.

**Hypotheses:**
1. <what the full traces suggest should change, and why — tie each hypothesis to a specific
   defects_found entry or a specific full-trace observation, not a vague "could be better">
2. ...

**Proposal:** <the concrete diff intended, OR explicitly "none warranted this pass" with the basis
for that call — e.g. "all open defects_found already have a fix_ref pointing at a landed or
already-authored fix; nothing new surfaced in the traces">

**Family gates status:** <green/red once the proposal, if any, is implemented — this section is
filled in AFTER §0's FAMILY GATES step, not before>
```

A "none warranted" attestation is a legitimate, expected outcome — plan §2 says "propose
improvements OR attest none are warranted." It is not legitimate to skip the pass and default to
"none warranted" as a shortcut; the basis line is what distinguishes a real attestation from a
rubber stamp, and is exactly what a future proposer (or a human auditor) checks against the actual
`defects_found`/`full_trace_refs` it claims to have read.

## 3. The family's standing metric (plan §2, "measurement, not assertion")

Every artifact's `metrics` field carries these, by family — a proposer pass's job is partly to ask
"did the metric move, and in which direction, since the last run":

| Family | Standing metric | Where it lives in the retrofitted artifacts |
|---|---|---|
| `mint` | validator first-pass rate + live verify rate | `mint-run-001.json` → `metrics.validator_first_pass_rate`, `metrics.live_verify_first_pass_rate` (and their `_final_rate` counterparts, showing the pre-fix vs. post-fix delta within one run) |
| `screen` | ambiguous rate + operator-overturn rate | `screen-run-*.json` → `metrics.ambiguous_rate`; operator-overturn rate is measured **retrospectively**, once a later round exists to overturn against — see `screen-run-002.json`'s `metrics.operator_overturn_rate`, computed once `screen-run-003.json` existed to diff against it |
| `fetch-drain` | capture success rate per attempt class | `fetch-drain-run-002.json` → `metrics.class_breakdown` / `metrics.recommendation_breakdown` (per-attempt-class detail only exists starting run-002 — see its `proposer_notes` for why run-001 could not carry this breakdown, an honest gap, not an omission) |
| `meta-harness` | proposals implemented per cycle + gate-catch rate (see `CONVENTION.md`'s "meta-harness's standing metric") | `meta-harness-run-*.json` → `metrics.proposals_implemented_this_cycle` (not measurable before `meta-harness-run-004` — retrospective, like screen's operator-overturn rate — `run-001`..`-003` predate this family's own first proposer pass and honestly record so) and `metrics.gate_catch_rate` (computed fresh each run over ALL families' `defects_found` history; `meta-harness-run-003.json`'s value and method are the current figure) |

An "improvement" that lands but does not move this metric in the direction intended is recorded as
such in the next artifact's `proposer_notes` (plan §2's own phrasing) — not silently reframed as a
win because *something* changed.

## 4. Worked examples: the retrofitted history as the first proposer pass's own reading list

The six artifacts this wave retrofitted under `mint/`, `screen/`, and `fetch-drain/` are not just
historical record — they are the FIRST full-trace reading list a proposer pass over any of these
three families must complete before that family's next run. Concretely, per plan §3/§4:

- **mint**: `mint-run-001.json`'s `defects_found` names the three defects MH-3 is explicitly scoped
  to fix (capture-completeness / the 8KB-slice extraction procedure as runbook law, and
  unicode-normalization span checking). A proposer pass over the mint family before the next mint
  batch runs should read this artifact FIRST and confirm those fixes are either landed (`fix_ref`
  populated) or still the right next targets — not re-discover the same defects from scratch.
- **screen**: `screen-run-003.json`'s `metrics.mechanism_question_flags` names 23 rules the
  mechanism-test re-audit could not confirm but left `on_vertical` per the hard rule (never silently
  flip off). That is an explicitly open item for the next screen proposer pass to pick up — not a
  new discovery each time someone reads `screen-rules.mjs`.
- **fetch-drain**: `fetch-drain-run-002.json`'s `defects_found[1]` (the `*.gov.au` HTTP/2 cluster) is
  named `fix_ref: null` — genuinely unresolved, flagged as its own investigation thread separate
  from the timeout/size-guard fix already authored (commit `0735a410`). A drain proposer pass should
  not assume v1.6's deployment closes every open fetch-drain defect; this one specifically will not.

## 5. Where this is wired in

- `scripts/mint/MINT-RUNBOOK.md` and `scripts/mint/screen-worklist.mjs`'s header each carry a
  one-line pointer to `CONVENTION.md` (this wave) — the runbook/harness-adjacent entry points a
  human or lane finds first, pointing at the substrate.
- **Emission-in-the-harness** (the artifact write happening as part of each harness's own execution
  path, so forgetting is not possible) is Wave MH-2's scope, not this wave's — MH-1 builds the
  substrate and retrofits the history that already happened; MH-2 wires `screen-worklist.mjs`, the
  mint runbook's batch procedure, and the drain protocol doc to write their own run artifacts going
  forward, plus `F28` to fail CI when a family's code changed without one.

  **Known residual, named honestly** (surfaced by meta-harness's own Wave MH-4 proposer pass — see
  `scripts/harness-runs/meta-harness/LAST-PROPOSER-PASS.md`): "forgetting is not possible" is true for
  `screen` (emission is CODE, inside `screen-worklist.mjs`'s own `main()`) but not yet true for `mint`
  or `fetch-drain`, where emission is PROSE (a mandatory runbook step; a protocol doc) — a lane can
  still run a full batch, author payloads, and report results without ever calling `writeRunArtifact`.
  `F28` rule (c) does not catch this: it re-hashes each family's GOVERNING FILES against recorded
  `harness_version`s, which detects "the harness's CODE changed without a run," not "a BATCH happened
  without a run" — a batch that touches only payload/queue data outside the governing-file set, with
  the harness's own code untouched, is invisible to rule (c) by construction. Rule (b) (census) only
  catches a family with ZERO artifacts ever, not a family that under-reports some of its runs once it
  already has one. Closing this for `mint` and `fetch-drain` is code-level work (giving each family a
  canonical entry point the way `screen-worklist.mjs` is one) — out of scope for a documentation-only
  wave; see the proposer pass's ranked hypotheses for what that would take.
- MH-3 is the first live proof this loop improves the system: a proposer pass over the mint family
  (reading `mint-run-001.json` exactly as this runbook prescribes) implementing its top proposals
  through the family's own gates, measured back into a new mint run artifact.
- MH-4 registers the meta-harness layer itself as a family whose own runs (MH-1 through MH-3) become
  its first artifacts, and runs the family's own first proposer pass over that three-run history — the
  loop closing over itself, per plan §1's last sentence.

## 6. The machine-checkable half (Wave MH-2) — `LAST-PROPOSER-PASS.md` + F28 rule (d)

§§1-2 above describe the proposer pass as a PROCEDURE — something a lane's own brief and report carry
out and record in prose. That is necessary but, on its own, exactly the honor-system this repo's own
discipline standard forbids everywhere else (`invariants.mjs`'s header: "buildable but unbuilt is not a
valid exemption"). Wave MH-2 closes the gap the same way every other procedure in this codebase gets
closed — a committed artifact plus a fitness function that checks it exists and is current.

**Every harness family directory carries a `LAST-PROPOSER-PASS.md`** recording the most recent proposer
pass over that family, in the §2 attestation shape (artifacts read, full traces read, hypotheses,
proposal-or-none-warranted, family gates status). It is a real file at
`scripts/harness-runs/<family>/LAST-PROPOSER-PASS.md`, committed alongside whatever proposal it
attests to (or, for a "none warranted" pass, committed on its own) — not a section buried in a lane
report that a future reader has to go find.

**`F28` (harness-run-integrity, Wave MH-2) rule (d) enforces this mechanically**: a family with **N ≥ 2**
valid run artifacts MUST have a `LAST-PROPOSER-PASS.md` that NAMES the family's latest artifact's
`run_id` verbatim. A family with exactly one artifact is not required to have one yet — there is no
prior record for a first run to be measured against, so "propose or attest none warranted" has nothing
to read. The threshold is N ≥ 2, not N ≥ 1, for that reason.

**What this closes, concretely**: without rule (d), a family could accumulate `screen-run-004.json`
through `screen-run-050.json` and nobody would ever be MECHANICALLY forced to have read
`screen-run-003.json`'s open `mechanism_question_flags` before proposing the next rule change — the
proposer pass would stay a "should," identical in kind to the `harness_version` drift F28 rule (c)
closes for the emission side. `LAST-PROPOSER-PASS.md` naming the WRONG (stale) `run_id` is exactly as
much a violation as naming none at all — a proposer pass that names an older run it read is
indistinguishable, to a future reader, from one that read nothing since.

Every family's `LAST-PROPOSER-PASS.md`, as of Wave MH-2's landing:

| Family | Basis |
|---|---|
| `mint` | Written ahead of the N≥2 requirement (mint has 1 artifact) because `mint-run-001.json`'s `defects_found` already names concrete next work (the capture-completeness gate, unicode-normalization span checking, the 8KB-slice extraction procedure) MH-3 is scoped to implement — recording that reading now is cheaper than re-deriving it before MH-3 starts. |
| `screen` | **None warranted this pass** — every `defects_found` entry across all three artifacts already has a `fix_ref` (round 2's defect is fixed by round 3 itself); round 1's per-row loss is structurally impossible to repeat now that `screen-worklist.mjs` emits a run-numbered artifact on every invocation (this same wave). The 23 `mechanism_question_flags` are open BY DESIGN (the hard rule that never silently flips a decided verdict), not a defect a "none warranted" pass should propose against without a dedicated mechanism-test review. |
| `fetch-drain` | Two real proposals: **deploy worker v1.6** (commit `0735a410`, authored, proven against both artifacts' timeout-class rows, never shipped) and **open an HTTP/2 investigation thread** for the 12-row `*.gov.au`-clustered `http2_stream_error` class (`fix_ref: null`, explicitly not addressed by v1.6). |

`meta-harness`'s own `LAST-PROPOSER-PASS.md` (added Wave MH-4, not "as of Wave MH-2's landing" like the
three rows above — meta-harness did not exist as a registered family until this wave) is the family's
FIRST proposer pass: read `meta-harness-run-001` through `-003` (MH-1 through MH-3, retrofitted this same
wave) and the full MH-1..MH-3 commits/lane reports, and produces ranked hypotheses about the meta-harness
layer's own weaknesses — not a "none warranted" pass, since this is the first time anyone has read the
meta-layer's own three-run history as a proposer would. See `meta-harness/LAST-PROPOSER-PASS.md` for the
attestation; only its documentation-level proposals are implemented this wave, per the build plan's own
$0/no-scope-creep discipline — code-level proposals are explicitly next-cycle, through the family's own
gates, like any other proposal in this runbook.
