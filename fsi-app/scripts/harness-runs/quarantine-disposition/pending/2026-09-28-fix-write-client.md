## Change

`scripts/plan-quarantine-disposition.mjs` and `scripts/maintenance/plan-quarantine-disposition.mjs`
(both governing files) fixed: the `harness_runs` insert was passed `readClient()`'s write-guarded proxy
(rule 015: `.from(table).insert` throws by design), so every real dispatch's insert threw and was
swallowed silently, with no `log` callback wired through the maintenance wrapper to surface it (found
live: run 36446625925, 2026-09-28, `harness_runs_landed:false` with the reason invisible). Fixed by
building a genuine write-capable client dedicated to this one exempt-from-rule-015 insert (mirroring
`scripts/lib/record-harness-run.mjs`'s own CLI section) and wiring `log` through the maintenance wrapper.

## Planned run

`quarantine-disposition-run-002` (or the next unclaimed number), landed by a real
`maintenance.yml` dispatch (`step=plan-quarantine-disposition`, `mode=dry`) on this fix, read back from
`harness_runs` and confirmed present. `quarantine-disposition-run-001.json` (committed to this repo) was
hand-inserted via Supabase MCP `execute_sql` grounded in a live dwell-classification reproduction (no DB
credentials in this worktree) and is labeled as such in
`docs/ops/session-log.d/2026-09-28-quarantine-disposition.md`; it is NOT the tool proving itself.
