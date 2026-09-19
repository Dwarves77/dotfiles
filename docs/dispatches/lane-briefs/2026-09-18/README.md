# Lane briefs, 2026-09-18 (cloud coordinator session)

Briefs dispatched from a cloud container with no access to the operator's machine (handoff section 0a). Each lane read `brief-common-cloud.md` first, then its own brief. Amendments are appended in place, never rewritten, so a refuted premise stays visible with its correction (CLAUDE.md rule 13's corollary).

| Brief | Lane | Model | Outcome |
|---|---|---|---|
| brief-common-cloud.md | all | | the cloud lane contract: worktree, rules, gate wrapper, merge-not-rebase for a pushed branch |
| brief-l37.md | L37 | Haiku | PR #726 merged; 52 of 53 out of the index; amendment 1 records the consumer the coordinator's census missed |
| brief-l35h.md | L35h | Sonnet | PR #727 merged; two amendments: the sweep tests' blind stripper, then reuse of F46 by import |
| brief-d2.md | D2 | Haiku | PR #728 merged; the coordinator ran the SQL, the lane wrote the record |
| brief-l38.md | L38 | Sonnet | PR #729; 41 sites dispositioned, one wired, F45 6,174 to 6,132; the lane agent died with a container restart after its push and the coordinator finished the branch from its diff |
| brief-d28b.md | D28b | Sonnet | the memory gate's UX-compliance check reads the per-lane session-log files too (D28 was half-wired); dispatched 00:45 UTC |

The gate wrapper the briefs name lives at `fsi-app/scripts/coordinator/lane-gate-cloud.sh` (the briefs cite its session scratchpad path; the repo copy takes the scratchpad from `LANE_GATE_SP`).

Related: [the lane contract](../../lane-common-contract.md), [the 2026-09-18 handoff](../../../ops/HANDOFF-2026-09-18.md), [the 2026-09-05 briefs](../2026-09-05/README.md).
