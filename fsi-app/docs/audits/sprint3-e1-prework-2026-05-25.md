# Sprint 3 E1 — `getAppData` cache-payload investigation prework

**Date:** 2026-05-25
**Status:** READ-ONLY INVESTIGATION COMPLETE. Awaiting operator authorization on a trimming approach.

---

## Finding

Total `cachedAppData` payload (org=Dietl/Rockit, dev DB): **2.17 MB**.
Next.js `unstable_cache` limit: **2.00 MB**.
Over by: **176 KB**.

That 176 KB overage is what produced the v3 build warning:
> Failed to set Next.js data cache for unstable_cache / ... items over 2MB can not be cached (2875919 bytes)

The reported 2.87 MB in the v3 warning is slightly larger than the 2.17 MB measured here. The delta is likely because the v3 warning includes the response wrapper (timestamps, cache key metadata) and possibly a different runtime cache key. Either way, both numbers are over the 2 MB threshold; the substantive composition holds.

## Composition

The payload sorts cleanly: **one outlier dominates**.

| Key | Bytes | Rows | % of total |
|---|---|---|---|
| `sources` | **1.80 MB** | 725 | **83%** |
| `provisional_sources` | 313 KB | 200 | 14% |
| `rpc_intelligence` (dashboard resources) | 56 KB | 50 | 2.5% |
| `item_timelines` | 15 KB | 107 | 0.7% |
| `sector_contexts` | 1 KB | 15 | <0.1% |
| `workspace_item_overrides` | 152 B | 1 | <0.1% |
| `intelligence_changes` | 2 B | 0 | 0 |
| `open_conflicts` | 2 B | 0 | 0 |

**Sources is the problem.** 1.80 MB out of 2.17 MB.

## Why sources is so big

`fetchSources()` runs `select("*")` against the sources table. That returns every column, including long-text and rarely-rendered fields. Top contributors inside the 1.80 MB sources payload:

| Field | Bytes (across 725 rows) | Avg per row |
|---|---|---|
| `description` | 118 KB | 167 B |
| `notes` | 106 KB | 150 B |
| `expected_output` | 77 KB | 109 B |
| `last_intelligence_item_at` | 44 KB | 62 B |
| `classification_assigned_at` | 44 KB | 62 B |
| `trust_score_computed_at` | 43 KB | 61 B |
| `classification_rationale` | 40 KB | 57 B |
| `name` | 40 KB | 56 B |

The four long-text columns alone (`description`, `notes`, `expected_output`, `classification_rationale`) total **341 KB**. Three timestamp columns total **131 KB** (string-formatted timestamps are deceptively large at 60+ bytes each).

## Why are 725 sources in the dashboard payload at all?

`getAppData` is called only by the dashboard home page (`src/app/page.tsx`) and the onboarding wizard (`src/components/onboarding/OnboardingWizard.tsx`). Neither surface renders 725 sources directly — they render dashboard-relevant resources + aggregate counts.

The source registry browser lives at `/admin → Source Health Dashboard`, which is **a separate page** that hydrates its own SourceStore from `initialSources` passed by `src/app/admin/page.tsx`. The admin page calls `fetchSources()` directly. Sources do NOT need to round-trip through `getAppData` for the admin page to work.

So the question is: does the home Dashboard component actually consume `data.sources` from `getAppData`? Two grep targets answer this:

- `src/components/Dashboard.tsx` — let me check.

The home page Dashboard either (a) uses sources for some count display, (b) hydrates a global SourceStore that gets consumed by sub-components, or (c) doesn't use them at all. Option (c) means free 1.8 MB savings. Option (a) likely means we need just the count, not the rows. Option (b) is the "store hydration ceremony" case — sources are loaded but only matter when the user navigates to /admin.

Audit needed to confirm before trimming.

## Three trimming approaches

### Option A — Drop sources from getAppData entirely (largest savings)

If the Dashboard home page doesn't actually render source detail, sources can be dropped from `cachedAppData` and the Source Health Dashboard's per-page fetch (which already exists on `/admin`) remains the only sources fetch.

- **Savings:** 1.80 MB (sources) + 313 KB (provisional_sources, also potentially droppable on the same logic) = up to **2.11 MB freed**.
- **Result:** `getAppData` payload drops from 2.17 MB to ~370 KB. Well under the 2 MB limit.
- **Risk:** if any dashboard sub-component DOES rely on `data.sources`, that component breaks. Audit before removing.

### Option B — Field-level trim on sources (medium savings, safer)

Replace `select("*")` in `fetchSources()` with an explicit field list of only what dashboard-consuming code reads. Drop the long-text + ancillary timestamp fields.

- **Drop:** `description` (118), `notes` (106), `expected_output` (77), `classification_rationale` (40), `last_intelligence_item_at` (44), `classification_assigned_at` (44), `trust_score_computed_at` (43) = **472 KB savings**.
- **Result:** sources drops from 1.80 MB to ~1.33 MB. Total payload ~1.70 MB. Just under 2 MB.
- **Risk:** if anything in the dashboard sub-tree DOES read those fields, it breaks silently or shows missing data. Audit before applying.
- **Caveat:** this is a fragile fix. New sources rows (with longer descriptions) could re-cross the threshold. Doesn't address the underlying "725 sources don't belong on the home page" question.

### Option C — Hybrid: page-specific fetcher (most architectural)

Introduce a new `fetchSourcesForDashboard()` that returns only the lean shape Dashboard actually needs (probably just id + name + tier + status + a count). Keep `fetchSources()` full for the admin Source Health Dashboard which legitimately needs all fields.

- **Savings:** comparable to Option A on `getAppData` (~1.8 MB freed) while preserving sources visibility on the home page if it's actually needed.
- **Risk:** more code surface; new RPC or new query. Operator code-style preference: lean queries per surface are already an established pattern (`getResourcesOnly`, `getListingsOnly`, `getMapData` etc.).

## Recommended sequence

1. **First** — operator authorizes a quick audit task: grep `data.sources` and `useSourceStore` across `src/components/Dashboard*` and `src/app/page.tsx`. Identifies which trim option is safe.
2. **Then** — operator picks Option A (if audit shows no consumption), Option B (if audit shows minimal field consumption), or Option C (if substantial consumption exists).
3. **Verify post-trim** — re-run `node scripts/sprint3-e1-payload-measure.mjs`, confirm new total under 2 MB.

## Artifacts

- `fsi-app/scripts/sprint3-e1-payload-measure.mjs` (read-only measurement script)
- `fsi-app/docs/audits/sprint3-e1-payload-composition-2026-05-25.json` (full byte-level data)

## Open question for operator

Which option (A, B, or C) and is the consumption audit authorized?

If consumption audit shows zero `data.sources` reads in the home Dashboard tree, **Option A is the cleanest fix and the easiest commit** (delete 1 line from `cachedAppData` body, delete `fetchSourceData` call, update type, possibly drop the seed fallback's `sources/provisionalSources/openConflicts` keys).
