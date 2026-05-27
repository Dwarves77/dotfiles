# Hypothesis 9 CONFIRMED — Build-time orgId resolution returns NULL on static pages

**Date:** 2026-05-27
**Status:** Root mechanism identified end-to-end. Force-dynamic patch proposed; awaiting operator green-light.

## The diagnostic chain end-to-end

### Step 1 — `/regulations/page.tsx` directive
No `export const dynamic`, no `export const revalidate`. /regulations is statically generated like the others, BUT its data path differs (uses `getResourcesOnly` + `getScopedWorkspaceAggregates` per the build log's `getResourcesOnly 3ms/1ms` lines; the aggregates RPC handles empty-scope as workspace-wide totals).

### Step 2 — /market, /operations, /research, /community directives

```
/market/page.tsx:      (no directive)
/operations/page.tsx:  (no directive)
/research/page.tsx:    (no directive)
/community/page.tsx:   export const dynamic = "force-dynamic";  ← line 10
```

**`/community` is the precedent.** It was made force-dynamic at some point (likely during H6 rebuild). The other three are NOT. That's the asymmetry the build log surfaces.

### Step 3 — `runCategoryRpc` uses `getServiceSupabase`

Confirmed at supabase-server.ts:479-480:
```typescript
const serviceClient = getServiceSupabase();
const { data: items, error } = await serviceClient.rpc(rpcName, { p_org_id: orgId });
```

Service-role IS the client. If it had a valid service-role key AND a non-null orgId, the RPC would succeed.

### Step 4 — Migration 077 `_assert_org_membership` bypass

```sql
IF auth.role() = 'service_role' THEN
  RETURN;
END IF;
IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
END IF;
```

Service-role bypasses. The membership check ISN'T the gate at build time.

### The actual gate (not in the original 4-step list, surfaced by Step 4 analysis)

`runCategoryRpc` lines 1018-1020 (supabase-server.ts):

```typescript
async function runCategoryRpc(orgId: string | null, rpcName, opts) {
  if (!isSupabaseConfigured() || !orgId) {
    return { resources: [], total: 0 };  // EARLY RETURN — no RPC call
  }
  ...
}
```

**If orgId is null, the function returns empty WITHOUT EVER CALLING THE RPC.** No error logged. The build log's silence on `[category-routing]` errors confirms the RPC was never invoked — just an early-return on `!orgId`.

Where does orgId come from? Looking at the call chain:

```
getMarketIntelItems()
  → resolveOrgIdFromCookies()  ← reads NEXT.js cookies()
  → cachedMarketIntel(orgId)
  → fetchMarketIntelItems(orgId)
  → runCategoryRpc(orgId, "get_market_intel_items")
```

At BUILD TIME, the static page renderer has NO COOKIES. `resolveOrgIdFromCookies()` returns NULL. `orgId` is null all the way down. `runCategoryRpc` hits the early-return. Page renders with `total: 0` baked into static HTML.

At RUNTIME with /community (force-dynamic), Next.js skips static generation and renders on the request. Cookies are present. orgId resolves. RPC runs. Works.

This explains EVERY observed symptom:
- `/market category-routed=0 fallback=119` — build-time, no orgId, fallback to 119-row seed array
- `/operations category-routed=0 fallback=119` — same
- `/research pipeline=0 category-routed=0` — same, both data paths null-orgId-shortcircuit
- `get_research_source_coverage error` — separate issue, migration 100 not yet applied to production
- `/regulations works at 319` — different data path (getResourcesOnly + getScopedWorkspaceAggregates) that handles null-orgId differently

## Proposed fix

### Patch A — One-line per page: `export const dynamic = "force-dynamic"`

```diff
 // src/app/market/page.tsx
+export const dynamic = "force-dynamic";
+
 import {
   ...
```

Same for `/operations/page.tsx` and `/research/page.tsx`. `/community/page.tsx` already has it (line 10).

**Net diff: 3 lines added, 3 files touched, atomic one-commit.**

### Why this is safe

- `/community` precedent: the same change was already made there, presumably correctly (operator should browser-test /community on production to confirm). If /community works, the pattern is proven.
- These three pages all serve per-user-filtered content. Static generation doesn't benefit them — every request is for a unique workspace anyway.
- Performance impact: each render adds the cost of resolveOrgIdFromCookies + the RPC roundtrip. Both are already on the critical path at first user request (no caching benefit was being captured at build time anyway, because the cached static result was empty).

### What this fix does NOT solve

- **Migration 098 + 100 still need to apply to production.** The fix above resolves the build-time-static-empty-render issue but doesn't address `get_research_source_coverage` missing on production. Apply via `supabase db push` or dashboard.
- **`getServiceSupabase()` silent fallback to anon when service-role key missing** — SF-1 dispatch still queued. Bug shape is real; happens to not be the active cause here.
- **A1 production verification** — after the force-dynamic patch lands AND migrations 098/100 apply AND a redeploy completes, A1 ratification is the next step.

## Recommended sequencing

1. Land the force-dynamic patch (3 files, 1 commit) — await operator green-light.
2. Apply migrations 098 + 100 to production — operator action.
3. `NOTIFY pgrst, 'reload schema'` on production for immediate PostgREST cache refresh.
4. Vercel redeploys automatically on the patch commit landing master.
5. Verify /research → 13 items, /market → 46-ish, /operations → 30-ish, masthead numbers match A1 dev verification.
6. A1 ratification at customer-visible surface.
7. SF-1 silent-fallback patch lands separately.
8. RPC-MASTHEAD Option B (corpus-honest disclosure) lands.
9. Unblock A-series.

## Status updates

- **A1**: stays APPLIED-PENDING-PRODUCTION-VERIFICATION until step 5 above passes.
- **A-series**: held until A1 GREEN at customer surface.
- **A2 commit 1 monitoring**: continues independently.
- **MIGRATION-FILE-DISCIPLINE PRECEDENT**: operator's revised framing accepted — direct SQL is technically functional when dev and production share the same Supabase project (confirmed via screenshot). The audit-trail and replay concerns remain valid for any future architecture with separate dev/prod DBs. Memory entry to be added per operator instruction.

## Reflection on the diagnostic arc

Operator's note: the question "is X the same as Y" for environment / project / deploy / branch identity should default to operator-screenshot-of-dashboard, not inference from code-side signals. The Supabase project identity question consumed 4 message rounds of hypothesis space (070 cliff, data divergence, hypothesis 7 silent fallback, then hypothesis 9 build-time auth) that a single dashboard screenshot would have resolved upfront. Worth carrying forward as a working principle: ENVIRONMENT-IDENTITY-VIA-SCREENSHOT.
