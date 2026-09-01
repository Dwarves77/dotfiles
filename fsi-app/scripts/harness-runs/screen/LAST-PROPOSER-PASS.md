# Last proposer pass — screen

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `screen` has 3 artifacts (`screen-run-001` through
`screen-run-003`) — F28's rule (d) requires this file starting at N=2, and this is that pass.

**Artifacts read:** screen-run-001, screen-run-002, screen-run-003.

**Full traces read:** round 1's raw per-row output (does not survive — see `screen-run-001.json`'s own
`defects_found[0]`, the screen-v1 loss `CONVENTION.md` documents; only its aggregate counts and the
commit-message record survive, honestly recorded as a loss rather than backfilled); round 2's
`census-would-mint.screen-results.json` / `.screen-summary.md` (rule-only) and
`census-final.screen-results.json` / `.screen-summary.md` (post-`--reviewed` merge); round 3's
`census-final-v3.screen-results.json` / `.screen-summary.md` — every path named across all three
artifacts' `full_trace_refs`.

**Hypotheses:**
1. `screen-run-002.json`'s `defects_found[0]` (99 rows flipped `off_vertical`→`on_vertical` by 8 rules
   the round-2 reviewed pass corrected) was the mechanism-test re-audit round 3 IS — `screen-run-003.json`
   carries an EMPTY `defects_found` precisely because round 3 is itself the correction pass for that
   defect, and nothing wrong with round 3's own mechanism has surfaced in any later pass (there is no
   round 4 yet to surface one).
2. `screen-run-003.json`'s `metrics.mechanism_question_flags` (23 rules the mechanism-test re-audit could
   not confirm, left `on_vertical` per the hard rule that never silently flips a decided verdict off) is
   a genuinely open item — but it is DELIBERATE DESIGN (the hard rule), not a defect, per
   `screen-run-003.json`'s own `proposer_notes`. Treating an intentionally-conservative hold as a "bug to
   fix" would invert the hard rule's purpose (never silently declining an ambiguous-adjacent case).
3. No NEW failure mode surfaces in any of the three artifacts' full traces beyond what is already
   recorded: round 1's loss is closed (documented, not repeatable — the run-numbered artifact convention
   this same wave's screen-worklist.mjs wiring makes structural); round 2's defect is closed (round 3 is
   the fix); the mechanism-question-flags item is open by design, not by omission.

**Proposal: none warranted this pass.** Basis: every `defects_found` entry across all three artifacts
either has a `fix_ref` (round 2's fix is round 3 itself) or, for round 1's unrecoverable per-row loss,
is structurally impossible to repeat now that `screen-worklist.mjs` writes a run-numbered artifact on
every invocation (Wave MH-2's own emission wiring — see this family's `screen-run-*.json` files' own
`run_id`s and `nextRunId()` in `scripts/mint/screen-worklist.mjs`). The 23 `mechanism_question_flags`
rules are a standing, intentional review item for a FUTURE mechanism-test pass, not a proposal this pass
should force — proposing a rule change against them without doing that dedicated review would be
guessing, not proposing. Nothing in the full traces (not just the metrics/defects summary) surfaced
anything the three artifacts' own analysis had not already found.

**Family gates status:** not applicable — no code change proposed this pass.
