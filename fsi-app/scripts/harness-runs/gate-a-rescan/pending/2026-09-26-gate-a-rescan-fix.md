## Change

Fixed the gate-a-rescan family's two governing files after GitHub Actions run 36217491293 (workflow_dispatch,
dry, limit=50) crashed with "column item_gate_a_state.id does not exist" and still reported success:

- `scripts/maintenance/gate-a-rescan.mjs`: fixed the pagination order-key bug (readGateAStates's
  readAllByIds call) and a sibling instance (countDistinctGateAVersions), both against
  item_gate_a_state, which has no `id` column (PK is intelligence_item_id, migration 224).
- `scripts/turns/emit-gate-a-rescan-artifact.mjs`: fixed the false-success artifact -- a missing
  rescanSummary (the crash case) was recorded identically to a genuine zero-item no-op; now records a
  defect and an honest "did NOT complete cleanly" note when the rescan step's own outcome was not
  "success" and no summary.json exists.

## Planned run

Dispatching `.github/workflows/gate-a-rescan.yml` for real, in `dry` mode, on branch
`lane/gate-a-rescan-fix`, immediately after this commit lands on the branch (per the operator's "you HAVE
to test what you're building" directive). Delete this file the moment that run's own
`gate-a-rescan-run-NNN.json` artifact lands in this same range.
