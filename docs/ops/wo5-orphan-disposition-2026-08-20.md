# WO-5 — Orphan-field disposition table (2026-08-20)

**Status: ⛔ OPERATOR-GATE. No deletion, wiring, or build below executes until the operator rules per row.**
Every claim `[CONFIRMED]` by live query or repo grep this session, per plan v2 rule 0.15. Baseline:
`origin/master` = `b2cf57c` (post #470/#471/#472); live `intelligence_items` = 1,062 rows.

One correction to the plan's premise, recorded first: v2 listed `signal_band` under "columns with data
and no reader". That is wrong — it has two production readers. The row below reflects what the code
actually does, not what the plan said (correction registered as C10 for the next plan revision).

## (a) Columns with data

| Field | Live data | Actual readers `[CONFIRMED]` | Disposition options | Recommendation |
|---|---|---|---|---|
| `instrument_identifier` | 675 / 1,062 rows | 4 backend consumers, 0 user-facing: `canonical-pipeline.ts` (grounding fetch), `coverage/index-data.ts` (coverage index: title fallback + distinct-instrument count), `sources/target-match.mjs` (identifier matching incl. IMO tokens), `entities/link-items.ts` (corpus linking) | (1) add a display chip on detail surfaces; (2) leave backend-only; (3) delete — **NOT viable**, four consumers break | **Wire a small display** (identifier chip beside the title on Regulations/Market detail, renders only when present). Cheap, honest, and the data is CELEX-clean. Fold into WO-13's detail-surface pass rather than a separate WO |
| `signal_band` | 60 / 1,062 rows (market-only by contract) | WIRED: `MarketIntelLedger` (badge, line 201), `MarketSignalDetailSurface` (190/1083), gates `TrajectoryBars` | Not a wiring question. Population grows only via regeneration (`parse-output.ts`, closed 3-value vocab) | **No UI work. Add `signal_band` classification for `market_signal` items to the WO-7 tags pass** (same call, ~zero marginal cost — the item is already in context). Priced with WO-7 |
| `topic_tags` / `tags` / `region_tags` | 637 / 374 / 15 rows | all read by discover.mjs scoring and surfaces | in scope for WO-7's same pass only if the operator wants region_tags densified; topic_tags already 60% | No action in WO-5. Noted for completeness |

## (b) Readers with no producer

| Field | Reader `[CONFIRMED]` | Producer state `[CONFIRMED]` | Disposition options | Recommendation |
|---|---|---|---|---|
| `trajectory_points` | `TrajectoryBars` via `MarketSignalDetailSurface` 650/682/839 — correctly gated (`band === "price" && points.length > 0`), renders nothing when empty, no fake pending frame remains | Producer EXISTS in `parse-output.ts` (B1: non-null only when `signal_band='price'`) but has produced 0 rows ever — only 60 items have any band, few are `price`, and regeneration hasn't run since the column landed (migration 107) | (1) keep as staging for WO-16 series producers; (2) drop column — breaks the wired reader | **Keep.** The reader is honest when empty. WO-16's series producers become the real feed; regeneration remains a secondary trickle |
| `marketData.currentPrice` (+ `previousPrice`, `priceSource`, `priceDate`, `freightCostImpact`) | `MarketIntelLedger` SignalRow key figure (~line 807): renders em-dash + "no price dimension" when absent — which is always | **NO producer anywhere in `src/`** — `marketData` exists only in `types/resource.ts`, the ledger reader, and an envelope-contract mention. No mapper populates it. Dead interface field | (1) re-point the key figure at `published_price_statistics` now (4 live rows, real table, PriceBoard already reads it) and at `market_series` after WO-16; (2) delete the binding and field; (3) leave dead | **Re-point (option 1), executed in WO-13** — consistent with the operator's WO-16.2 FEED ruling: one numeric channel, two readers (PriceBoard + ledger key figure), zero dead fields. Delete the `marketData` type block in the same commit since nothing else references it |

## Rulings requested (per row)

1. `instrument_identifier` display chip in WO-13: yes / no.
2. `signal_band` classification added to the WO-7 pass for market items: yes / no (priced with WO-7).
3. `trajectory_points`: keep as staging (recommended) / drop.
4. `marketData.currentPrice`: re-point to `published_price_statistics` in WO-13 + delete dead type block (recommended) / delete outright / leave.
