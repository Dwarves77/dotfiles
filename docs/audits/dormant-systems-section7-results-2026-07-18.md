# Dormant-Systems Audit — Section 7 Check Results (2026-07-18)

The [dormant-systems audit](./dormant-systems-audit-2026-07-18.md) section 7 carried forward seven
operator-dashboard checks that were deliberately not inferred from code. During the execution lane the
operator granted full access ("nothing is operator owned"), so these were run directly. Results:

| # | Check | Result | Source |
|---|---|---|---|
| 1 | `system_state`: `scrape_cadence` / `scrape_start_date` / `global_processing_paused` | **`off` / `null` / `false`** — cadence dormant, no emergency stop set | live SQL (kwrsbpiseruzbfwjpvsp) |
| 2 | `/api/admin/scan` live reachability | **Returns the 503 `global_processing_paused` response, not a run** — because `isGloballyPaused()` = (cadence `off` OR emergency) is TRUE via cadence-off. The audit inferred this from doctrine; now confirmed from live state. | derived from check 1 + `pause.ts` |
| 3 | Deployed Vercel env `SCRAPE_HOLD` / `GROUNDING_ACQUIRE_ENABLED` / `SPEND_REGIME` | **NOT readable** with available tools — the Vercel MCP exposes project/deployment metadata, not env-var values (they are secrets). Repo defaults are lifted / OFF / BUILD-PHASE. **Moot for fetch-blocking**: the live `scrape_cadence=off` gate already blocks every fetch regardless of `SCRAPE_HOLD`. This is the one remaining true operator-console check. | tool limitation, labeled as a gap |
| 4 | GitHub Actions enable/disable state | **`source-monitoring` and `spot-check-monthly` both `disabled_manually`** (off in both ways: commented schedule + GitHub-UI-disabled); the other 5 workflows active. | `gh workflow list` |
| 5 | SW-3 `integrity_flags` row (data_quality, subject drain_worklist) | **1 open** (includes the bec305e1-specific flag) | live SQL |
| 6 | `drain_worklist` queue state | **66 rows** (matches Session A's park count in commit `3f730232`) | live SQL |
| 7 | Session D forensics report merge state | **Merged** (PR #342, execution-lane Phase 1) | GitHub |

**Additional live confirmations gathered while checking:**

- `source_conflicts`: **dropped** — migration 215 (dormant-systems P-6) was applied this session; the table
  and the already-gone `open_conflicts` view both resolve to null. The P-6 purge is complete in code and data.
- `portal_link_candidates`: **0 rows** — confirms the P2-5 portal-crawl machinery (PR #253) never ran, as
  the audit recorded.
- `monitoring_queue`: **580 rows** — the source-watch registry, fed by check-sources accessibility pings.
- Corpus: **276 live items** (210 verified, 66 quarantined = the drain queue); **825 active sources**;
  `coverage_gap_candidates` **109** (106 MISSING / 2 HAVE_QUARANTINED / 1 AMBIGUOUS_ARCHIVED; 38 major /
  71 minor) — the priced wave-one universe for the [crawl rebuild spec](../plans/crawl-rebuild-spec-2026-07-18.md).

**The one genuinely unreachable check:** the deployed Vercel env-var values (check 3). It is a secret-scope
limitation of the available tooling, not a hook worked around, and it is moot for the fetch-blocking
question because the live cadence-off state already blocks fetches. If the operator wants the deployed
values confirmed, that is a Vercel-console read.
