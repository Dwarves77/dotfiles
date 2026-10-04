# research-walker: last proposer pass

Pass date 2026-10-04, lane S1-D (s1d-walker-registers). Procedure: PROPOSER-RUNBOOK.md sections 1 and 2.

## Proposer Attestation

**Artifacts read:** research-walker-run-001, research-walker-run-002, research-walker-run-003, research-walker-run-004.
Runs 001, 002 and 004 were read from the branch in full (every field: config, per_item, metrics,
defects_found, proposer_notes, full_trace_refs). Run-003 was read in full from git history
(`git show fa773e62~2:fsi-app/scripts/harness-runs/research-walker/research-walker-run-003.json`); it was committed
earlier on this same PR and then deleted in favour of run-004 because the DOI change made it stale, so it no longer
exists on the branch. The latest artifact is **research-walker-run-004**. The `--list` output was used as a survey only.

**Full traces read:** `fsi-app/scripts/research/fixtures/research-walker-fixtures.mjs`, the only
`full_trace_refs` path all four artifacts name, opened at its run-004 state (the 3 grey-lit sources and all
three OpenAlex fixture groups). All four runs are dry fixture runs with no network and no database, so no other
trace exists; no path was unopenable.

## What changed across the runs

- Runs 001 and 002 (lane L7, harness_version e5a65ebd): identical in substance. 3 of 3 grey-lit sources resolve
  and would_mint; both OpenAlex fixtures are rejected `unsourced` (`rejected_unsourced` 2, `would_mint` 3).
- Run 003 (S1-D first version, harness_version 0aa180ee): the walker registers and rates the OpenAlex publisher
  host (rule 18). New metrics `would_register`, `residue_awaiting_host_verdict`, `unplaced_hosts`;
  `rejected_unsourced` 0. A defect is visible in its trace: `doi.org` (a DOI resolver, not a publisher) is listed
  in `unplaced_hosts`, where a host verdict naming it would register the resolver as a source.
- Run 004 (S1-D, harness_version 8a6886d8, latest): doi.org, dx.doi.org and hdl.handle.net joined the
  never-register class; a DOI-resolver-only candidate is residue "publisher host unresolved from DOI" and the
  resolver is not on `unplaced_hosts`; fixture 0 carries a publisher landing page and places (`would_register`
  tier 4, built-in rule). Metrics: candidates 6, would_register 3, would_mint 6, rejected_unsourced 0,
  residue_awaiting_host_verdict 2, unplaced_hosts [unlisted-journal.example]. The run-003 doi.org defect is
  closed in run-004's trace.

## Hypotheses

1. `metrics.candidates` is not comparable across runs. In 001 and 002 it counted every candidate handed to the
   chokepoint (5, of which 2 rejected); in 004 it counts only candidates that reach the chokepoint (6, equal to
   `would_mint`), because residue candidates never reach it. Basis: run-001 `candidates` 5 = `would_mint` 3 +
   `rejected_unsourced` 2, versus run-004 `candidates` 6 = `would_mint` 6 with 2 residue candidates not counted.
2. Run-004's `proposer_notes` has a malformed sentence ("An OpenAlex candidate whose publisher host is resolved
   through the institution class table ...": an edit replaced the middle of the L7 sentence). It reads, but is not
   a clean sentence.
3. Grey-lit rows report `source-resolved (tier N)` while OpenAlex rows report `would_register (tier N, ...)`: two
   vocabularies for the same class-table placement. Cosmetic.

## Proposal

No walker change in this pass. Hypotheses 1 and 2 are metric-definition and wording fixes in a governing file;
each walker edit re-stamps harness_version and owes another run, so they ride with the next substantive walker
change (the first `--live` OpenAlex run, the first with a different input shape and so the next informative
comparison). Carry forward: report `candidates` as the count handed to the chokepoint plus a separate
`residue_total`, and rewrite the proposer_notes sentence. Hypothesis 3 is not proposed.
All four artifacts have empty `defects_found`, so no open defect lacks a fix_ref; the one defect a trace showed
(run-003 doi.org) is fixed by run-004.

## Family gates status

Green locally: `node --test` on research-walker.test.mjs and research-walker.npmtest.mjs (29 pass, 0 fail) and
on host-authority-class-tier.test.mjs. The full discipline suite, tsc and the fitness runner run in CI (ADR-040);
their state is on PR 931.
