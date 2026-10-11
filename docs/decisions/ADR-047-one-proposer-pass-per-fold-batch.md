---
id: ADR-047
title: One proposer pass per fold batch, not per artifact
status: accepted
date: 2026-10-10
scope: harness-run proposer passes at train assembly (fsi-app/scripts/lib/assemble-train.mjs, fsi-app/scripts/harness-runs/PROPOSER-RUNBOOK.md, F28 rule (d))
supersedes: none
related: ADR-009, ADR-046
---

# ADR-047: One proposer pass per fold batch, not per artifact

Related: [ADR-009](./ADR-009-adr-system-architecture.md) (ADR frontmatter), [ADR-046](./ADR-046-gate-doctrine.md) (adds no gate).

## Context

The question was drafted on 2026-09-05 by lane ASSEMBLY in [TRAIN-ASSEMBLY-RUNBOOK](../runbooks/TRAIN-ASSEMBLY-RUNBOOK.md) as an open
operator question and left undecided: does a family with N artifacts folded in one train need N proposer
passes, or one pass that names the latest? PROPOSER-RUNBOOK.md section 1 reads "before a family's NEXT
batch runs" (one pass per dispatch); F28 rule (d) checks only that `LAST-PROPOSER-PASS.md` names the latest
artifact. The script has behaved as one pass per family since the day it landed, and that behaviour is now
the rule.

## Decision

A family that accumulates multiple artifacts between train assemblies needs exactly one proposer pass at
the next assembly. The pass reads every artifact landed since the previous pass, not only the newest, and
its `LAST-PROPOSER-PASS.md` names the latest verbatim, which satisfies F28 rule (d) unchanged.

Rationale: the proposer design values reading the full trace history once over reading it N times. A pass
per artifact would either re-read the same backlog N times with no new information between passes, or
skip straight to the newest, which is the "scores plus summary" failure the runbook's own citation warns
against. This clarifies PROPOSER-RUNBOOK.md section 1 for the batched-fold case it did not anticipate.

## Where it is implemented

`findFamiliesNeedingProposerPass` in `fsi-app/scripts/lib/assemble-train.mjs` returns one entry per family
whose `LAST-PROPOSER-PASS.md` no longer names its latest artifact (it reuses F28's `auditProposerAttestation`),
and `writeProposerBrief` writes one brief per such family listing every artifact of that family in order
(`--propose`, and as step (b) of `--all`). Tests: `fsi-app/scripts/lib/assemble-train.test.mjs`
("findFamiliesNeedingProposerPass flags a family whose LAST-PROPOSER-PASS.md is stale" and its silent-once-named pair).

## Consequences

- No new gate and no new check; the decision records what the script and F28 already do.
- A family whose backlog is read in one pass is attested by one `LAST-PROPOSER-PASS.md` naming the latest run.
