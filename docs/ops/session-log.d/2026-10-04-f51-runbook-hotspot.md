# 2026-10-04 F51 hotspot allowlist entry for MAINTENANCE-RUNBOOK

- Added: dated HOTSPOT_ALLOWLIST entry (decidedOn 2026-10-04) for `docs/runbooks/MAINTENANCE-RUNBOOK.md` in `fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs`; the allowlist pin in the sibling test file updated to match.
- Why: coordinator-decided. Three source-loop lanes (S0 PR 925, S1-B PR 928, S1-C PR 929) ran in parallel with disjoint sections of this runbook. S0 merged while 928 and 929 were open, so F51 check 5 (concurrent edit) refused both even after merging master in. The check's own sanctioned remedy is a dated allowlist entry.
- Removal condition: remove the entry when the runbook is split into one file per step (lane to be dispatched), or when PRs 928 and 929 have merged, whichever comes first.
