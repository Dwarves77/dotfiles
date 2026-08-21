# WO-7 — Tag backfill run (2026-08-20, $0 session-executor)

**Method:** $0 session-executor. The session model itself classified each item from stored section
content (title + summary + sections already in `intelligence_item_sections`, zero fetching) and wrote
tags via MCP transport in ~26 idempotent batches with a resumable cursor state file. No API spend, no
fleet release.

## Scope and guards

- Targets: 655 untagged non-archived items (the WO-6 addressable set).
- Idempotent: only rows with empty `operational_scenario_tags` written.
- Never overwrite non-empty `compliance_object_tags`.
- `signal_band` classification scoped to `format_type=market_signal_brief` only — none present in the
  population, so the field is unchanged at 60 rows.
- Vocabulary: open scenario vocabulary per SKILL.md glossary (exact casing, 0-5 values); closed
  19-value compliance vocabulary, capped at 4.

## Rule-015 snapshot `[CONFIRMED]`

Taken BEFORE any write: 655 rows `{id, ost, cot, sb}`. `snapshot-prior.json` md5
`7c15b97106b0999c2bae643839ad2cee`.

**Undo:** restore those values for the 655 ids.

## Results `[CONFIRMED]`

| Metric | Value |
|---|---|
| Targets | 655 |
| Newly tagged | 414 |
| Honest empties | 241 (content gave no defensible tag, none forced) |
| Regenerated rows touched | 0 (297 untouched: 208 at 2026-05-27 contract + 89 at 2026-04-29, verified pre/post) |
| Scenario coverage | 312 -> 726 items |
| Compliance coverage | 315 -> 845 items |
| `signal_band` | unchanged (60) |

## New vocabulary

~30 new open-vocabulary tags introduced deliberately. Families: `customs-transit`,
`tir-carnet-transit`, `dangerous-goods-transport-{road,rail,inland-waterway}`,
`air-carrier-operating-ban`, `road-transit-permit-quota`, `rail-freight-corridor`,
`air-navigation-charges`, others recorded in the run's tag ledger.

## Post-state note

Largest tag `emissions-reporting-Scope3` at 162/726 (22% of tagged corpus) — the ubiquity WO-8 then
corrected for.
