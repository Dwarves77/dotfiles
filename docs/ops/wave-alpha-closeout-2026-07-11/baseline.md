# Wave-α Baseline (2026-07-11, dispatch start)

Dispatch: FULL-SYSTEM CORRECTION, COMPLETE, ZERO OPERATOR GATES (operator authorization 2026-07-11).
Integration branch: `fix/wave-alpha-2026-07-11` (from audit tip `42a4479`; master verified at `71bcbd4` — unmoved, scope holds).

## Corpus state at start
| Metric | Value |
|---|---|
| intelligence_items verified | 380 |
| intelligence_items quarantined | 197 |
| intelligence_items unverified | 57 |
| integrity_flags open | 838 |

## Money
| Metric | Value |
|---|---|
| Program spend July MTD (agent_runs.cost_usd_estimated) | $42.74 |
| Dispatch ceiling (hard) | $25.00 |
| Expected C7 spend | ~$16 ± 5 |
| New code-level monthly ceiling (mandated) | $75.00 |

Headroom check: $42.74 MTD + $25 worst-case dispatch = $67.74 < $75 monthly ceiling — C7 cannot trip the new ceiling.

## Safety switches at start (all held through dispatch)
Loop OFF · cadence off · SCRAPE_HOLD LIVE (made airtight in C5) · zero fetches · zero mints · batch-1 worktree locked, untouched.

## Agent fleet
B (Track B DDL authoring) · A1 (surface seal) · A2 (pipeline contract C1–C6 + ceiling) · A4 (community pre-adoption) · A5 (dead-weight) — parallel worktrees, orchestrator owns merges + all DDL application (per-migration snapshot→apply→proof→rollback protocol) + all DB writes + C7.
Migration number lanes to avoid collisions: B=164+, A5=180+, A4=190+.
