## Change

Lane CHAIN-1, 2026-10-07: .github/workflows/theme-briefs.yml (a theme-briefs governing file) changed. The apply step now gates on a computed RUN_DRIVER flag instead of env.PUSH_BATCH_COUNT != '0', which skipped the driver on every workflow_dispatch (chain-fire-2026-10-06 finding F1).

## Planned run

The next theme-briefs dispatch with action=apply and a real briefs_file, dry, now runs apply-theme-briefs.mjs and lands a theme-briefs row with the apply plan counts. That run supersedes this file; delete it when the run lands.
