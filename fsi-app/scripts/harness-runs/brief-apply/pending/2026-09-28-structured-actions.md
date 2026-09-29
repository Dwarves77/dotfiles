## Change

Lane STRUCTURED-ACTIONS (2026-09-28) adds a new "structured-actions" step to
`scripts/turns/apply-record-briefs.mjs`'s per-item pipeline (between `grow` and `discovery`), per
coordinator ruling: re-reads the item's `item_type` + just-written `full_brief` and runs
`extractRecommendedActions` (`src/lib/agent/extract-recommended-actions.mjs`), recording the count it
would write. This is a governing-file change for the `brief-apply` family
(`scripts/harness-runs/brief-apply/family.json` names `apply-record-briefs.mjs` directly).

## Planned run

No new `brief-apply-run-NNN.json` artifact lands in this range. The new step is DRY MODE ONLY by
design: `intelligence_items.recommended_actions` does not exist in the live schema yet (migration 334,
authored/not applied per the two-track policy), so this lane has no destination to write to and no live
credentials in its worktree to exercise a real `--execute` run against. The next `brief-apply` run
supersedes this pending file once the coordinator applies migration 334 and a lane dispatches a real
`--execute` run (fixture-tested here: `applyOneEntry: structured-actions step extracts real counts from
the re-read item_type/full_brief`, `apply-record-briefs.test.mjs`).
