# Dashboard payload audit, 2026-05-11

## TL;DR

The dashboard route `/` is the only surface in the application that consumes the FULL `get_workspace_intelligence` Postgres RPC, which carries `full_brief` (a TEXT field averaging ~17 KB across 184 active items, totaling ~3.19 MB on the wire) plus `operational_impact`, `open_questions`, and `reasoning`. Every other resource-list surface (`/regulations`, `/operations`, `/market`, `/map`, `/settings`) already routes through a slim sibling RPC (`get_workspace_intelligence_slim`) added in migration 047, so the long-text bloat does not in fact appear on those routes today, contrary to one of the framing assumptions. The 99 markdown regulatory fact documents the investigation flagged are not loaded from disk via `import.meta.glob` or an MDX collection, they are stitched into the RSC payload as the `full_brief` column on each row returned by that one full RPC call. There is no project-level `Cache-Control: no-store` directive in `next.config.ts`, in the proxy at `src/proxy.ts`, or in `vercel.json`. The single highest-leverage fix is to switch `app/page.tsx` (`getAppData` -> `fetchDashboardData` -> `fetchWorkspaceResources(orgId)`) to the slim RPC for the dashboard's hero/list rendering and only re-hydrate `full_brief` when a card is expanded or when the user navigates to `/regulations/[slug]`. That single change projects out roughly 3.19 MB of `full_brief` text plus the related long-text columns from the initial dashboard payload, dropping the 4.71 MB initial HTML and 3.89 MB decoded RSC into the sub-megabyte range without any rendering changes.

## 1. Regulations query

The query that produces the 728 KB regulations slab on the dashboard is issued by `app/page.tsx`:

`C:/Users/jason/dotfiles/fsi-app/src/app/page.tsx:35` calls `await getAppData()`.

`C:/Users/jason/dotfiles/fsi-app/src/lib/data.ts:46` defines `cachedAppData` which wraps `fetchDashboardData(orgId)` plus `fetchSourceData()` in `unstable_cache` with a 60s TTL. The cookies read at `src/lib/data.ts:98` (`resolveOrgIdFromCookies()`) forces dynamic rendering, so the inner cache only spares re-fetch cost, not Vercel cache hits at the response level (this is consistent with the documented `x-vercel-cache MISS` observation).

`C:/Users/jason/dotfiles/fsi-app/src/lib/supabase-server.ts:543` defines `fetchDashboardData(orgId)`. At line 581 it calls `fetchWorkspaceResources(orgId)` with no `slim` flag, which at `src/lib/supabase-server.ts:408` resolves the RPC name to `get_workspace_intelligence` (the FULL variant). The full RPC is defined at `C:/Users/jason/dotfiles/fsi-app/supabase/migrations/007_full_brief.sql:10`.

Fields selected by the full RPC (`007_full_brief.sql:11-43`):

```
id, legacy_id, title, summary, what_is_it, why_matters, key_data,
full_brief, operational_impact, open_questions, tags, domain, category,
item_type, source_id, source_url, jurisdictions, transport_modes,
verticals, status, severity, confidence, priority, reasoning,
entry_into_force, compliance_deadline, next_review_date, added_date,
last_verified, is_archived, effective_priority, effective_archived
```

The four heavy long-text columns are `full_brief TEXT` (the regulatory fact document body, ~17 KB average per row), `operational_impact TEXT`, `open_questions TEXT[]`, and `reasoning TEXT`. The slim RPC (`047_workspace_intelligence_slim_rpc.sql`) drops exactly these four columns and is the variant every other surface uses.

LIMIT applied: none. The RPC returns all non-archived workspace items (current count 184 active per the migration 047 header), ordered by priority bucket then `added_date DESC`. `fetchWorkspaceResources` then enriches with `item_timelines` rows (`src/lib/supabase-server.ts:425-429`), also unbounded against the resolved item-id set.

What gets passed across the server/client boundary on `/`:

`C:/Users/jason/dotfiles/fsi-app/src/app/page.tsx:62-74` passes the resolved `data.resources` (full Resource[] shape including `fullBrief`, `whatIsIt`, `whyMatters`, `keyData`, `tags`, `jurisdictions`, `modes`, etc.) to two consumers:

- `<DashboardHero resources={data.resources} />` server-renders the 4-up tile strip. `C:/Users/jason/dotfiles/fsi-app/src/components/home/DashboardHero.tsx:52-61` only uses `r.priority` to bucket-count the items. Every other field on every Resource is dead weight inside the hero subtree.

- `<HomeSurface initialResources={data.resources} ... />` (`C:/Users/jason/dotfiles/fsi-app/src/components/home/HomeSurface.tsx`) is a `"use client"` component, so the entire resources array crosses the RSC boundary as a serialized JSON-in-string payload. Inside `HomeSurface` the resources flow into `WeeklyBriefing` (`src/components/home/WeeklyBriefing.tsx`) which sorts top-5 by `urgencyScore` and renders title/dayCount; into `WhatChanged` which references `changelog`; into `Supersessions` which uses the `resourceMap`; and into `DashboardByOwner` which counts.

Critically, `grep -rn "fullBrief"` across `src/components/` finds zero references in any home/dashboard component (`DashboardHero`, `HomeSurface`, `WeeklyBriefing`, `WhatChanged`, `Supersessions`, `DashboardByOwner`, `DashboardCoverageGaps`, `DashboardWatchlist`, `DashboardAwaitingReview`). The only consumers of `r.fullBrief` are `RegulationDetailSurface.tsx`, `ResourceDetail.tsx`, `DomainItemList.tsx`, and `SectorSynopsis.tsx`. None of those mount on `/`. So 100% of the `full_brief` payload shipped with the dashboard is unrendered.

`whatIsIt`, `whyMatters`, and `keyData` are referenced once on the dashboard via `TopUrgency.tsx:85` (`{r.whyMatters || r.note}`), but `TopUrgency` is not in the current `HomeSurface` render tree (it has been replaced by `WeeklyBriefing` per the page-level comment in `app/page.tsx`). The `tags`, `jurisdictions`, `modes` arrays cross the boundary because `mergeWithOverrides` and `urgencyScore` consume them; those are reasonably sized.

## 2. Markdown brief import pattern

There is no markdown loader in this codebase. `grep` for `import.meta.glob`, `require.context`, `\.md(['"]|$)` returns no application-code matches. The `find` for `*.md` finds only documentation (`README.md`, `STATUS.md`, `docs/*.md`, `.claude/*.md`), not regulatory briefs. There is no MDX configuration in `next.config.ts` (`C:/Users/jason/dotfiles/fsi-app/next.config.ts` only declares `turbopack.root`, `redirects()`, and the bundle analyzer wrapper). There is no `content/` or `briefs/` directory under `src/` or `public/`.

The 99 markdown regulatory fact documents the investigation flagged are not file imports. They live in the Postgres column `intelligence_items.full_brief` (TEXT). They enter the RSC tree the same way as the regulations table itself, via the `get_workspace_intelligence` RPC return at `src/lib/supabase-server.ts:411`. Each row's `full_brief` text is mapped onto `Resource.fullBrief` at `src/lib/supabase-server.ts:463`, then passed through `HomeSurface` as part of `initialResources` (`src/components/home/HomeSurface.tsx:50, 63`).

The header comment in migration 047 is explicit: `full_brief` averages ~17 KB across 184 rows, summing to ~3.19 MB. With ~99 of those classified as `regulatory_fact_document` per the `format_type` enum referenced in `src/lib/agent/system-prompt.ts:262` and `src/lib/agent/parse-output.ts:23`, the 99-document figure in the framing maps to a subset of the 184-row payload, all of which is shipped on every `/` render today.

Lazy-load feasibility: very high. None of the dashboard's home components read `r.fullBrief`, so it can be omitted from the initial hydration entirely. The detail page `app/regulations/[slug]/page.tsx` fetches a single item via `fetchIntelligenceItem(itemUiId)` (`src/lib/supabase-server.ts:889`) using a service-role client and a base-table SELECT (`*`), so per-item fetching is already in place. Switching the dashboard to the slim RPC requires no per-item lazy loader, the long-text fields simply stop being projected on the list path. If a future card-expand interaction needs the brief without a navigation, an `/api/regulations/[id]/brief` route handler can return the single column on demand. The expand/collapse pattern is already used inside `RegulationDetailSurface.tsx` for sections.

## 3. Cache-control source

There is no global `no-store` directive applied to authenticated routes. Specifically:

- `C:/Users/jason/dotfiles/fsi-app/next.config.ts` defines no `headers()` callback at all. No global Cache-Control rule.
- `C:/Users/jason/dotfiles/fsi-app/vercel.json` is minimal: `framework`, `regions: ["iad1"]`. No headers.
- There is no `src/middleware.ts`. The closest analog is `C:/Users/jason/dotfiles/fsi-app/src/proxy.ts` (the new Next 15+ proxy convention), which only reads cookies, refreshes the Supabase session via `supabase.auth.getUser()`, and either passes through or redirects unauthenticated requests. It sets no response headers other than the auth cookies.
- No page-level `export const dynamic = "force-dynamic"` on `/`, `/regulations`, `/market`, `/operations`, `/map`, `/research`, or `/settings`. The only routes that explicitly declare `export const dynamic = "force-dynamic"` are under `/community/*` (`browse`, root, `moderation`, `[slug]`).

The reason `x-vercel-cache: MISS` lands on every authenticated render is structural, not header-driven: every page in the protected tree resolves the org from cookies via `resolveOrgIdFromCookies()` (called from `getAppData`, `getResourcesOnly`, `getMapData`, `getSettingsData`) and reads cookies via `auth.getUser()` for membership checks. Reading cookies from a Server Component opts the route into dynamic rendering and disables ISR / response-level caching, regardless of the `unstable_cache` wrapper around the inner data fetcher. The page-level comments in `app/page.tsx`, `app/settings/page.tsx`, and `app/research/page.tsx` all acknowledge this directly. The route handlers themselves do set explicit Cache-Control:

- `C:/Users/jason/dotfiles/fsi-app/src/app/api/admin/attention/route.ts` sets `private, max-age=30` on 200, `private, max-age=60` on 401/403, and `no-store` only on 500. The 60s `useAdminAttention` poll (`src/lib/hooks/useAdminAttention.ts:39`) uses a fetch call without a `cache: "no-store"` override so the browser HTTP cache honours the 30s positive cache (the comment at line 111-115 documents this explicitly). If `x-vercel-cache: MISS` is observed on every poll, that is consistent with the routes being function invocations (not statically cached); the per-region runtime cache absorption happens at the browser level, not the Vercel edge.
- `C:/Users/jason/dotfiles/fsi-app/src/app/api/admin/sources/recently-auto-approved/route.ts:150` is the only other route with an explicit `Cache-Control: no-store`.
- Several community fetchers issue `fetch(..., { cache: "no-store" })` from the client (`NotificationsBell.tsx:42`, `NotificationsList.tsx:140,176`, `NotificationPreferencesPanel.tsx:97`), but these are per-call browser overrides, not server-emitted headers.

Override feasibility: high. There is no centralized policy to revise. Per-route Cache-Control can be added directly in route handler responses (the pattern in `api/admin/attention/route.ts` is the model). Page-level cache-control on dynamic Server Components is not directly settable from the page module, but for the dashboard specifically the rational target is not response-level caching (the cookie read forces dynamic) but trimming the payload that has to cross the wire on each MISS.

## 4. Shared layout vs per-route

The shared layout at `C:/Users/jason/dotfiles/fsi-app/src/app/layout.tsx` runs `await resolveServerBootstrap()` (`src/lib/api/server-bootstrap.ts:40`), which is auth + workspace + sectors only (org_membership + user_profiles, no resources). It does NOT issue the regulations query, and it does NOT pass resources to `AppShell` or any other shared chrome. So the 728 KB blob is not sourced from the layout.

The query is per-route. The full-fat path (`get_workspace_intelligence` returning `full_brief`) runs ONLY on `/`:

- `app/page.tsx` -> `getAppData()` -> `fetchDashboardData(orgId)` -> `fetchWorkspaceResources(orgId)` (no slim flag) -> `get_workspace_intelligence` RPC.

Every other resource-list surface uses the slim RPC:

- `app/regulations/page.tsx:73` -> `getResourcesOnly()` (`src/lib/data.ts:119`) -> `fetchResourcesOnly(orgId)` (`src/lib/supabase-server.ts:721`) -> `fetchWorkspaceResources(orgId, { slim: true })` (line 737) -> `get_workspace_intelligence_slim` RPC.
- `app/market/page.tsx:6` -> `getResourcesOnly()` -> same slim path.
- `app/operations/page.tsx:6` -> `getResourcesOnly()` -> same slim path.
- `app/map/page.tsx:23` -> `getMapData()` (`src/lib/data.ts:153`) -> `fetchMapData(orgId)` (`src/lib/supabase-server.ts:771`) -> `fetchWorkspaceResources(orgId, { slim: true })` (line 794).
- `app/settings/page.tsx:22` -> `getSettingsData()` (`src/lib/data.ts:192`) -> `fetchSettingsData(orgId)` (`src/lib/supabase-server.ts:841`) -> `fetchWorkspaceResources(orgId, { slim: true })` (line 858).
- `app/research/page.tsx:42-49` issues its own narrow `intelligence_items` SELECT scoped to `id, legacy_id, title, summary, pipeline_stage, transport_modes, jurisdictions, added_date, source(name, url)` with `LIMIT 100`.

So the framing claim that "the 728 KB blob is duplicated into RSC on /regulations, /market, /operations, /map" should be re-verified against actual response captures. Per code, those routes already drop `full_brief`, `operational_impact`, `open_questions`, and `reasoning` from the wire via the slim RPC. They do still ship `summary`, `what_is_it`, `why_matters`, `key_data`, `tags`, `jurisdictions`, `transport_modes`, `verticals` for every active row, which can still add up. If those routes' RSC blobs are still landing in the 700 KB range each, the next step would be to check observed response sizes against the slim-RPC field set (likely `summary` + `what_is_it` + `why_matters` are the long ones remaining) and decide whether a stricter list-only projection is warranted there too.

Recommended scoping: keep the current per-route fetcher split, but add a third even-thinner variant for the dashboard hero and home surface specifically. The dashboard does not render any of `summary`, `what_is_it`, `why_matters`, `key_data` in its top-5 list (`WeeklyBriefing` shows title + dayCount). It needs only `id`, `title`, `priority`, `tags`, `jurisdictions`, `transport_modes`, `complianceDeadline`, `addedDate`, `timeline` (for `dayCountMeta`), and a few flags for the hero counts and supersession resolution. Either a third RPC (`get_workspace_intelligence_dashboard`) or a passthrough projection done in `fetchWorkspaceResources` would let the dashboard ship a Resource shape with `~10-12` short fields per row instead of `~25` including the long-text variants.

## Secondary observations

Inline base64 font: the layout (`src/app/layout.tsx:2-9, 17-22`) loads `Anton` (weight 400) and `Plus_Jakarta_Sans` (weights 300, 400, 500, 600, 700) via `next/font/google` with `display: "swap"`. Five weights of Plus Jakarta Sans is a heavy spend; on the initial HTML response Next inlines the font-face CSS and the woff2 binary as the page's static font payload. There is no explicit Roboto Mono import anywhere in the codebase (`grep -i "Roboto.?Mono"` returns no results), so the "Roboto Mono" identification in the framing may be a misread of the inlined Plus Jakarta Sans payload, or it is being injected by a downstream library. Worth double-checking the exact font-family in the inlined `@font-face` rules of the captured HTML. The five-weight inclusion is the highest-leverage trim on the font axis: dropping weight 300 and one of 500/600 (the dashboard headline copy uses 700 and 800 mostly, body uses 400, the 300 weight is rarely if ever applied) would cut the inlined font binary by ~40%.

Duplicate chunk requests: not visible from the source review alone (the captured network waterfall is not in the audit input). The layout-level `dangerouslySetInnerHTML` block at `src/app/layout.tsx:50-53` runs a tiny inline script for theme bootstrap; not a duplicate-chunk vector. `AppShell` is `"use client"` (`src/components/AppShell.tsx:1`), which means the entire shell tree (`Sidebar`, `AskAssistant`, `BackToTop`) is shipped as client JS on every authenticated route. Worth confirming these are tree-shaken into a single shell chunk and not re-loaded per-route. `AskAssistant` is mounted only when `user` is present, so anonymous/login pages skip it.

Other RSC framing: the dashboard ships the dashboard-only chrome (`EditorialMasthead`, `DashboardHero`, `HomeSurface` plus its imported tree of `WeeklyBriefing`, `WhatChanged`, `Supersessions`, `HousekeepingSection`, `DashboardWatchlist`, `DashboardByOwner`, `DashboardCoverageGaps`, `DashboardAwaitingReview`, `Toast`). All except `EditorialMasthead`/`DashboardHero` are pulled by `HomeSurface` (which is `"use client"`), so the client bundle for `/` includes that entire subtree plus `useResourceStore`, `useWorkspaceStore`, scoring helpers, and the export utilities (`@/lib/export/htmlReport`, `@/lib/export/slackFormat`, `@/lib/export/download`). The export utilities are imported eagerly by `WeeklyBriefing.tsx:5-7` for buttons that may rarely be clicked, a candidate for `next/dynamic` lazy import.

The `unstable_cache` keys (`["app-data-v1"]`, `["watchlist-v1"]`, `["coverage-gaps-v1"]`, `["awaiting-review-v1"]`) all carry 60s TTL and the shared `APP_DATA_TAG`. This is the right shape but only helps when the upstream call repeats inside the cache window for the same orgId; it does not help cross-user cold renders. The `cachedAppData` key is shared across anon users (per the comment at `src/lib/data.ts:42-44`) which is fine since they all hit the seed fallback.

## Three fix tickets (high-level scope only, do NOT implement)

1. Dashboard query projection: add a third RPC variant (or extend `fetchWorkspaceResources` with a `dashboard: true` projection) that returns only `id`, `legacy_id`, `title`, `priority`, `effective_priority`, `effective_archived`, `tags`, `jurisdictions`, `transport_modes`, `compliance_deadline`, `added_date`, plus the existing `item_timelines` join, capped at LIMIT 50 ordered by priority+added_date. Wire `app/page.tsx` to the new fetcher, drop the long-text columns from the dashboard payload, and confirm `HomeSurface` and its children compile against the trimmed Resource shape (they do not currently read the dropped fields). Expected wire savings on `/`: ~3.19 MB `full_brief` plus ~300-500 KB across `summary`/`what_is_it`/`why_matters`/`key_data`/`reasoning`, taking the route from ~3.89 MB decoded RSC to ~400-700 KB.

2. Markdown brief lazy-load: not strictly needed if the dashboard projection above lands, because the briefs are not file-imports and the only consumer of `full_brief` outside `/regulations/[slug]` would no longer see it. If a card-expand interaction on the dashboard ever needs the brief without a route change, add a thin `GET /api/regulations/[id]/brief` route handler that returns just the `full_brief` column (cache `private, max-age=300, stale-while-revalidate=3600`, since briefs change rarely and per-user staleness is acceptable). Out of scope for a pure trim ticket; flag for a follow-up.

3. Cache-control header revision: there is no project-wide `no-store` to remove, but there are missing per-route Cache-Control headers on the page responses themselves (the dynamic Server Components emit nothing explicit). For the `/api/admin/attention` poll specifically, the route already sets `private, max-age=30`; the observed `x-vercel-cache: MISS` is consistent with function-invocation caching (response cache absorbs only at the browser layer, the runtime function still runs). Baseline policy proposal: keep `private, max-age=30, stale-while-revalidate=300` on the admin attention route, mirror it on any newly added per-item brief route with `max-age=300, stale-while-revalidate=3600`, and leave dynamic Server Component pages alone (their cookie reads make response caching infeasible until an anon/authed split is implemented per `docs/PERF-WAVE-2.md` Phase D). The leverage of this ticket is small relative to ticket 1, schedule accordingly.
