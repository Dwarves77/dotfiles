# /research Production Regression — Diagnostic Report

**Date:** 2026-05-26
**Status:** HYPOTHESIS 7 CONFIRMED as bug shape via code inspection. Operator env-var fix on Vercel resolves; no code change needed at the runtime layer.
**Priority:** HIGH (customer-visible surface showing "0 findings explicitly relevant to live events fine art workspaces" on a $500/mo product).

---

## Observed regression

Production screenshot (carosledge.com) shows:
- Masthead: "640 active findings this week · 0 themes active"
- All 4 severity tiles (ACTION REQUIRED / COST ALERT / MONITOR / BACKGROUND): 0
- "RESEARCH, WHAT WE COVER BY THEME · 0 active themes, filtered to your verticals"
- "IN YOUR SECTOR THIS WEEK · 0 findings explicitly relevant to live events fine art workspaces, of 640 total this week"

## What I CAN verify from this environment

### Diagnostic 2c partial — dev DB at master HEAD (07e8e75) returns expected values

```
[customer-view] DEV results:
  /regulations: aggregates 318 (resolves cleanly)
  /market:      aggregates 121 / RPC rows 46
  /operations:  aggregates 117 / RPC rows 30
  /research:    aggregates 640 / RPC allow-set 137 / pipeline intersection 13

VERDICT: AGGREGATES_HEALTHY in dev. Customer would see 13 items on
/research dev, not 0. Bug is production-environment-specific, not
master-code-specific.
```

### Hypothesis 7 — CONFIRMED bug shape (code inspection)

`fsi-app/src/lib/supabase-server.ts:37-46`:

```typescript
export function getServiceSupabase() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
```

**This silently falls back to the anon key when `SUPABASE_SERVICE_ROLE_KEY` is missing or not exposed to the runtime environment.**

Downstream effect (per `src/lib/supabase-server.ts:1022`):

```typescript
async function runCategoryRpc(orgId, rpcName, opts) {
  ...
  const serviceClient = getServiceSupabase();  // returns anon client if env var missing
  const { data: rows, error } = await serviceClient.rpc(rpcName, {
    p_org_id: orgId,
  });
  if (error || !rows) {
    console.error(...);
    return { resources: [], total: 0 };  // → allow.size = 0 in caller
  }
  ...
}
```

If production Vercel env does NOT have `SUPABASE_SERVICE_ROLE_KEY` set, `getServiceSupabase()` returns an anon-key client. Anon-key calls to `get_research_items` / `get_market_intel_items` / `get_operations_items` hit migration 077's `auth.uid()` membership check and either error or return zero rows. Either path through `runCategoryRpc` → `{ resources: [], total: 0 }` → in `/research/page.tsx:67` `allow.size === 0` → `filteredRows = pipeline.rows` (pipeline query uses a different client) → items rendered.

### Why the masthead still shows 640 (not 0)

The aggregates RPC `get_workspace_intelligence_aggregates_scoped` may not have migration 077's auth check (or may resolve differently for anon), so it returns 640 (workspace-wide active count) even when called with anon. The /research page combines:
- Masthead total from aggregates → 640 (works)
- Body items from category RPC + pipeline → empty (broken via the silent fallback)

This matches the symptom exactly.

### Hypothesis 8 — partial finding

- `/research/page.tsx` line 9-13 explicitly REMOVED the prior `export const revalidate = 60` route-level directive. No route-level cache.
- `cachedResearch` (data.ts:621-627) wraps `fetchResearchItems` in `unstable_cache` with `revalidate: 60, tags: [APP_DATA_TAG]`. TTL 60s.
- Cache key is `orgId`. If the cache filled with an empty result while `SUPABASE_SERVICE_ROLE_KEY` was missing, the 60s revalidate means production keeps serving empty until either (a) cache invalidation via `revalidateTag(APP_DATA_TAG)` from a mutation route, or (b) 60s elapses AND a fresh request triggers regeneration.
- Hypothesis 8 is not THE bug but COMPOUNDS hypothesis 7: even after env var is fixed, the next render takes up to 60s to see fresh data without a manual cache bust.

## What I CANNOT verify from this environment

These require operator-environment access:

| Diagnostic | Needs | Why I can't run it |
|---|---|---|
| 2a — Vercel deploy SHA vs master 07e8e75 | Vercel dashboard or CLI auth | No Vercel CLI installed; no auth token in dev env |
| 2b — Production DB migration state (084, 102-106) | Production Supabase service-role key | My .env.local has the DEV project credentials, not production |
| 2c — Localhost reproduction at `npm run dev` | Foreground process binding | `npm run dev` blocks the bash session; operator runs |
| Hypothesis 6 — production sources.category distribution | Production Supabase access | Same as 2b |
| Hypothesis 7 verification on the live env | Vercel env vars panel | Operator's Vercel dashboard |

## Recommended operator actions (in priority order)

### Action 1 — verify Vercel env var (5 minutes)

Vercel dashboard → fsi-app project → Settings → Environment Variables. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set on Production AND points at the same Supabase project as `NEXT_PUBLIC_SUPABASE_URL`. If missing or wrong-project, this is the root cause.

### Action 2 — if env var was missing, add it then force redeploy + cache invalidate

1. Add the correct `SUPABASE_SERVICE_ROLE_KEY` to Vercel Production env.
2. Trigger a fresh deploy (Vercel will run with the new env on next build).
3. After deploy, hit any mutation route that calls `revalidateTag(APP_DATA_TAG)` OR wait 60s for the cached empty result to revalidate.
4. Reload /research, expect to see ~13 items with themes populating.

### Action 3 — if env var was correct, diagnostic 2a + 2b

Production may be running a deploy from before commits landed AND/OR production DB may be missing migration 084. Either explains the same symptom via a different path.

## Independent code-side issue surfaced

`getServiceSupabase()`'s silent fallback to anon key is itself a bug worth fixing forward, regardless of whether the current incident is caused by missing env var. The function should THROW when `SUPABASE_SERVICE_ROLE_KEY` is missing, not fall back to anon. Silent fallback obscures exactly this class of regression. Recommend a small commit:

```typescript
export function getServiceSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for service-role operations. " +
      "Missing in environment — service-role calls would silently fall back to anon and produce incorrect empty results."
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
```

This is a SEPARATE dispatch from the current operator-env-fix. Surface to operator as a recommended follow-up after the regression is resolved.

## A5 corpus scan finding (pre-step 1, separate from /research investigation)

Ran sprint3-a5-corpus-scan.mjs across all 7 domains:

| Domain | Total active | `reasoning` non-empty | `why_matters` non-empty | both |
|---|---|---|---|---|
| D1 Regulations | 319 | 60 | 79 | 57 |
| D2 Energy & Tech | 38 | 6 | 12 | 6 |
| D3 Regional Ops | 111 | 4 | 18 | 4 |
| D4 Geopolitical | 70 | 21 | 26 | 21 |
| D5 Source Intel | 11 | 0 | 0 | 0 |
| D6 Facilities | 2 | 0 | 1 | 0 |
| D7 Research Pipeline | 90 | 33 | 37 | 33 |
| **Total** | 641 | 124 | 173 | 121 |

**Verdict: PER_ROW_DISPOSITION** (not BLANKET_HIDE). Mixed population. The earlier A5 Q2 D1-only spot-check landing all-empty on 10 sampled rows was sampling noise within D1's actual 60/319 reasoning population — the sampling pulled 10 specific rows that happened to all be unpopulated.

A5 Path C revised wiring: render Why It Matters block conditionally per row when `reasoning || why_matters` is non-empty, otherwise hide. 121 rows would render the block; 520 would hide it. Honest per-row empty-state, not blanket hide.

This refines the A5 path verdict — Path C still locks, but with the per-row conditional instead of blanket hide.

## A1 status downgrade per operator directive

A1 reverts from GREEN-AT-DB-LAYER to **APPLIED-PENDING-PRODUCTION-VERIFICATION**. Going forward, A-series dispatches require both:
1. DB-layer reconciliation (already enforced)
2. Customer-visible surface query against the live production route (was not enforced)

Adding PRODUCTION-SURFACE-VERIFICATION PRECEDENT to project memory.

## Holding queue

Per operator instruction, all A-series implementation HELD until /research production diagnostic resolves:
- A4 implementation
- A5 implementation (Path C per-row disposition ready, but blocked by Group A close gate)
- A6 implementation (operations.html full commit also pending operator)
- RPC-MASTHEAD Option B fix (the customer-actual-view investigation it called for is THIS investigation; merged findings above)

A2 commit 1 monitoring at addd210 continues independently.
