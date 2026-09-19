# Lane briefs, 2026-09-18 (cloud coordinator session)

Briefs dispatched from a cloud container with no access to the operator's machine (handoff section 0a). Each lane read `brief-common-cloud.md` first, then its own brief. Amendments are appended in place, never rewritten, so a refuted premise stays visible with its correction (CLAUDE.md rule 13's corollary).

| Brief | Lane | Model | Outcome |
|---|---|---|---|
| brief-common-cloud.md | all | | the cloud lane contract: worktree, rules, gate wrapper, merge-not-rebase for a pushed branch |
| brief-l37.md | L37 | Haiku | PR #726 merged; 52 of 53 out of the index; amendment 1 records the consumer the coordinator's census missed |
| brief-l35h.md | L35h | Sonnet | PR #727 merged; two amendments: the sweep tests' blind stripper, then reuse of F46 by import |
| brief-d2.md | D2 | Haiku | PR #728 merged; the coordinator ran the SQL, the lane wrote the record |
| brief-l38.md | L38 | Sonnet | dispatched 2026-09-19 00:10 UTC; outcome recorded in the session log |

The gate wrapper the briefs name lives at `fsi-app/scripts/coordinator/lane-gate-cloud.sh` (the briefs cite its session scratchpad path; the repo copy takes the scratchpad from `LANE_GATE_SP`).

Related: [the lane contract](../../lane-common-contract.md), [the 2026-09-18 handoff](../../../ops/HANDOFF-2026-09-18.md), [the 2026-09-05 briefs](../2026-09-05/README.md).
