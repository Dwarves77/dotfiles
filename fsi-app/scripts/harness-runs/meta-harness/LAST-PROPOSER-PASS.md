# Last proposer pass — meta-harness

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `meta-harness` has **three** artifacts
(`meta-harness-run-001` through `-003`, retrofitted this same wave from MH-1/MH-2/MH-3's real commits) —
F28's rule (d) requires this file starting at N=2, and this is the family's FIRST proposer pass: not
"none warranted," since nobody has yet read the meta-layer's own three-run history as a proposer would.

**Artifacts read:** meta-harness-run-001, meta-harness-run-002, meta-harness-run-003.

**Full traces read:** commits `d5d7eb6c0ae144fffc956bb708e641747f8707c9` (MH-1),
`f6a769eaec11b2cf38f328da98735bf62dc876d4` (MH-2), `86872ff98de26befdddb96bb11981757a4d56fd4` (MH-3) in
full diff and message; `CONVENTION.md`, `PROPOSER-RUNBOOK.md`, `run-artifact.mjs`,
`run-artifact.test.mjs` (Wave MH-1 state); `F28-harness-run-integrity.mjs` and its own header comment
in full (including "KEEP IT HONEST" / "CONSIDERED AND NOT NARROWED"), `F28-harness-run-integrity.test.mjs`,
`invariants.mjs`'s RD-55 entry; `screen-worklist.mjs` (its emission-wiring code and its own
`SCREEN_GOVERNING_FILES`/`buildRunArtifact` comments), `screen-worklist.test.mjs`, `MINT-RUNBOOK.md`,
`fetch-drain/PROTOCOL.md`; `mint-run-001.json`, `mint-run-002.json`, `mint/LAST-PROPOSER-PASS.md`,
`screen-run-001/002/003.json`, `screen/LAST-PROPOSER-PASS.md`, `screen/PENDING-RUN.md`,
`fetch-drain-run-001/002.json`, `fetch-drain/LAST-PROPOSER-PASS.md`; `validate-mint-payload.mjs` and
`.test.mjs` (MH-3's diff); every path named in `meta-harness-run-001/002/003.json`'s own
`full_trace_refs`.

## Hypotheses, ranked

**1. [HIGH — code-level, next cycle] Emission for `mint` and `fetch-drain` is prose, and prose is not
enough — F28 cannot see the gap it leaves.** Plan §2's design goal is "forgetting is not possible because
there is nothing to remember." That is true for `screen` (`writeRunArtifact` is called inside
`screen-worklist.mjs`'s own `main()` — there is no code path that produces results without also writing
the artifact). It is NOT true for `mint` (`MINT-RUNBOOK.md` §6's mandatory step is a sentence a lane can
skip) or `fetch-drain` (`PROTOCOL.md`'s step 3 is the same). The gap is not just "prose is weaker than
code" in the abstract — it is a real hole in F28's own coverage: rule (c) re-hashes each family's
GOVERNING FILES and checks that hash against every recorded `harness_version`. That catches "the
harness's *code* changed without a run." It does **not** catch "a batch ran, payloads were authored,
results were reported — and nobody ran the writer," because a batch's data (payload JSON, queue
exports) lives outside the governing-file set entirely; nothing about running a batch touches
`MINT-RUNBOOK.md`'s bytes. Rule (b) only catches a family with *zero* artifacts ever, not one that
under-reports some fraction of its real runs once it already has one on record. So today, a mint batch
could run to completion, get reported to a coordinator, and never produce a `mint-run-003.json` — and
F28 would stay green throughout, exactly the honor-system gap `RD-55`'s own residual note says F28
does *not* close ("F28 cannot verify a run artifact's CONTENT is honest... only that the schema
shape... hold"), except this is worse than a content-honesty gap: it is an *existence* gap for two of
three original families. What code-level emission would take: `mint` has no single canonical script the
way `screen-worklist.mjs` is one — its batch procedure is a human/agent-run sequence across several
scripts. The natural seam is `validate-mint-payload.mjs` itself, since MH-3 already made it the
mandatory last gate every payload must pass — a `--batch-dir <dir> --write-artifact` mode that validates
every payload in a directory and then calls `writeRunArtifact` as its own last step would make the
artifact write structurally inseparable from running the validator, the same coupling `screen-worklist.mjs`
already has. `fetch-drain` is harder: `capture-worker/index.ts` is a deployed Deno edge function invoked
via `pg_net`/`execute_sql`, with no local runner to wire a Node-side `writeRunArtifact` call into — the
realistic fix is a thin local wrapper script around the batch invocation (already implied by
`fetch-error-dispositions.md`'s existence as a post-hoc report) that ends in the writer call, not a
change to the deployed function itself.

**2. [HIGH — documentation, implemented this wave] `meta-harness` is structurally its own highest-churn
family, and nobody had said so.** `meta-harness`'s governing files ARE `CONVENTION.md` and
`PROPOSER-RUNBOOK.md` — the two documents every substrate-extending wave is likely to touch (this very
wave touched both, to register the family itself). Under F28 rule (c)'s whole-file-hash design, *any*
edit to either — including a pure documentation clarification, including the two paragraphs this pass
just added — moves `meta-harness`'s `harness_version` and requires either a new run or a
`PENDING-RUN.md`. This wave landed instead alongside its own governing-file edits (`meta-harness-run-003`
carries the current-tree hash directly, no marker needed), which is the cheap path CONVENTION.md's own
design anticipates — but a future wave that makes a smaller, single-paragraph doc fix will face the same
choice every time. This is not proposed as a fix to F28 (narrowing the hash would repeat exactly the
false-positive tradeoff F28's own header already reasoned through and rejected for the other three
families, and there is no principled reason meta-harness should get a different rule than everyone
else). It is named explicitly in `CONVENTION.md`'s new "A named risk of self-application" paragraph and
`PROPOSER-RUNBOOK.md`'s new "Known residual" note (both landed this wave, see git diff) so a future lane
is not surprised by it, and so a wave of unrelated doc cleanup does not get mistaken for a real
meta-harness proposal cycle just because it happens to be what satisfies rule (c) that wave.

**3. [MEDIUM — monitor, no action] Staleness-marker churn is real and already measured, but the existing
"don't narrow" decision still holds.** Across MH-2 and MH-3, two `PENDING-RUN.md` markers were created
(`mint`, `screen`) from non-behavioral doc-pointer edits, one was deleted (`mint`'s, superseded by
`mint-run-002.json`), one is still open (`screen`'s — no round 4 has run). That is a 2-wave sample, not
a trend, but it is consistent with what F28's own header predicted when it explicitly considered and
rejected narrowing the whole-file hash: "the remedy for a genuine false positive is cheap BY DESIGN —
one `PENDING-RUN.md`... a forcing function, not noise." Two markers in two waves, one already resolved,
is exactly that — cheap, not noise. This pass does not propose reopening that decision on two data
points; it is named here (and the concrete evidence is now on record in
`meta-harness-run-002.json`'s `defects_found`) so a *future* pass with more waves of data has something
to check the trend against, rather than re-deriving the question from scratch.

**4. [MEDIUM — code-level, next cycle] `screen`'s `per_item: []` is currently unconditional, not
merely usually-empty, and that is more rigid than `CONVENTION.md`'s own rule requires.**
`screen-worklist.mjs`'s `buildRunArtifact` hardcodes `per_item: []` on every call, justified (correctly,
on the evidence read this pass) by `CONVENTION.md`'s "per_item at scale" second bullet: screen's own
reports (`screen-run-003.json`'s `metrics.mechanism_question_flags`, its `corrections_vs_round_2`
breakdown) operate at the RULE level, not the individual-row level — there is no report table naming
individual `census_worklist` rows the way mint's reports name individual payloads or
`fetch-error-dispositions.md` names individual `queue_id`s. So today's empty `per_item` is not a
violation; it is honestly earned by what the full traces actually contain. But the code path has no
mechanism to include individually-named rows even if a *future* screen round's report starts naming
some (a mechanism-test review that spot-checks the 23 open `mechanism_question_flags` against 5
concrete example rows, say) — `buildRunArtifact` would need to be extended to accept an optional
examples array before that reporting change could ever surface in `per_item`, rather than the current
unconditional `[]`. Low priority relative to #1, but a real gap between "the rule is followed" and "the
code enforces the rule is followed only because nothing has tested the edge yet."

**5. [LOW — observational, feeds the next cycle] The gate-catch-rate improvement (0/6 → 2/6, see
`meta-harness-run-003.json`'s `metrics.meta_harness_gate_catch_rate_method`) is entirely mint's. Screen's
and fetch-drain's defect classes have zero landed automated gates as of this pass — screen's by design
(a mechanism-test judgment call, not mechanically gateable without a dedicated review), fetch-drain's
because the authored fix (commit `0735a410`) is still undeployed. This is not a defect in either
family — it is a reminder that "gate-catch rate" as a standing metric will likely stay mint-dominated
until fetch-drain's v1.6 actually ships (a deploy, not a code change) and until screen's mechanism-test
backlog gets a dedicated review pass (a different kind of cycle than an implementation one). The next
meta-harness proposer pass should watch whether the metric moves for a family OTHER than mint before
treating "gate-catch rate is rising" as evidence the whole system is improving, rather than evidence one
family is.

## Proposal

**Implemented this wave (documentation-level, zero-risk):**
- `PROPOSER-RUNBOOK.md` §5: a "Known residual" paragraph naming F28's emission-gap blind spot for
  `mint`/`fetch-drain` precisely (hypothesis #1) — no code change, states what is already true today.
- `CONVENTION.md`: a "A named risk of self-application" paragraph naming `meta-harness`'s own
  high-churn exposure (hypothesis #2) — no code change, no narrowing of F28's staleness rule.

**Explicitly deferred to next cycle (code-level, through the family's own gates — not this wave's
scope):**
1. A `validate-mint-payload.mjs --batch-dir` mode ending in a mandatory `writeRunArtifact` call, closing
   hypothesis #1 for `mint`.
2. A local wrapper script around the fetch-drain batch invocation ending the same way, closing
   hypothesis #1 for `fetch-drain` (harder — no local runner exists to extend today; likely needs its
   own design pass before implementation, not a small diff).
3. `screen-worklist.mjs`'s `buildRunArtifact` extended to accept an optional named-examples array
   (hypothesis #4) — low priority, no forcing case exists yet.

**Not proposed:** narrowing F28 rule (c)'s whole-file hash (hypothesis #3) — the existing "considered
and rejected" reasoning in F28's own header still holds on the evidence this pass read; two waves of
marker-churn data supports "cheap forcing function," not "noise."

## Family gates status

GREEN — `sh .discipline/run-test-suite.sh`, `npx tsc --noEmit`, and
`node .discipline/fitness/runner.mjs` (23 functions incl. F28, now checking FOUR families, 0
violations) all pass under this wave's diff. No code changed this wave beyond registering `meta-harness`
in `run-artifact.mjs`'s `ALLOWED_FAMILIES` and F28's `GOVERNING_FILES` (both required by deliverable 1,
not by any proposal above) — see the Wave MH-4 lane report for full gate tails.
