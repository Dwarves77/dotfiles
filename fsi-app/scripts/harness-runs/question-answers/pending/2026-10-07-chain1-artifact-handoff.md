## Change

Lane CHAIN-1, 2026-10-07: .github/workflows/question-answers.yml (a question-answers governing file) changed. The apply step now gates on a computed RUN_DRIVER flag instead of env.PUSH_BATCH_COUNT != '0', which skipped the driver on every workflow_dispatch (chain-fire-2026-10-06 finding F1).

## Planned run

The next question-answers dispatch with action=apply and a real answers_file, dry, now runs apply-question-answers.mjs and lands a question-answers row with the apply plan counts. That run supersedes this file; delete it when the run lands.
