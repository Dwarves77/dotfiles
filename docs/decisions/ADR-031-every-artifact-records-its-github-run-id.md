---
id: ADR-031
title: Every harness artifact records its own GitHub run id; the loop id is resolved hop to hop on it
status: accepted
date: 2026-09-19
scope:
  - "fsi-app/scripts/lib/run-artifact.mjs"
  - "fsi-app/scripts/lib/loop-run-id.mjs"
  - "every harness family under fsi-app/scripts/harness-runs/"
  - ".github/workflows/ (every workflow_run hop of the loop manifest)"
supersedes: []
related:
  - "docs/plans/complete-system-build-plan-2026-09-04.md (sections 6.1 and 6.2)"
  - "docs/ops/session-log.d/2026-09-19-m3.md"
  - "docs/dispatches/lane-briefs/2026-09-19/brief-m3.md (Amendment 2)"
---

# ADR-031: every artifact records `config.github_run_id`

## Context

Proof run 6.2 passes only when an artifact at every hop carries the head dispatch's `loop_run_id`. Lane M3 found (2026-09-19) that nothing propagated the id past the sweep, and that the first mechanism tried, matching an upstream artifact on its `config.loop_run_id`, is unsound: it holds only at hop 1 and only when the operator leaves the sweep's `loop_run_id` input blank. No artifact recorded the GitHub Actions run id of the run that wrote it, so a consumer handed `github.event.workflow_run.id` had nothing to match.

## Decision

1. The shared writer `writeRunArtifact` stamps `config.github_run_id` (the run's own `GITHUB_RUN_ID`, null outside Actions) on every artifact of every family. A caller-supplied value is never overwritten. One home; no family bypasses the writer.
2. `resolveLoopRunId` finds the upstream artifact whose `config.github_run_id` equals the upstream run id the event gave, and returns THAT artifact's `config.loop_run_id`. An explicit id wins. No match returns null: an id is never invented, reused or guessed, and a null cascades to every hop after it.
3. The workflow-name to family mapping has one home beside the resolver (lane M3b, 2026-09-20); a test fails when a loop-manifest producer has no key in it.
4. A workflow passes its runner only what the event already knows (the upstream run id and name). Bash or jq extraction of fields from an upstream artifact inside a yml was rejected: it duplicates the resolver per workflow.

## Consequences

Every new hop (brief-export in M4, gate-a-rescan in M6) records the loop id through the same resolver and extends the attack chain in `loop-run-id.test.mjs`. A hop whose upstream is a loop head of its own (the data producers) records null, which is the honest value. Proven by attack: breaking one hop's run id makes the next hop resolve null.
