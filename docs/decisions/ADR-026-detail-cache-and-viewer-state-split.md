---
id: ADR-026
title: PUBLIC intelligence content stays on the existing unstable_cache+revalidateTag model; PER-USER state moves to one post-paint batched fetch; classic PPR/Cache Components deferred
status: accepted
date: 2026-09-04
scope: fsi-app rendering path for the four customer detail surfaces (regulations|market|operations|research `[slug]`) and their index pages, plus the per-user state fetched by RegulationsLedger/HomeSurface/OwnerTeamCard; next.config.ts's cacheComponents evaluation
supersedes: nothing — this FORMALIZES and EXTENDS the caching pattern PERF postscript 1 already established (unstable_cache + tags + revalidateTag fired by population/maintenance runtimes); no prior ADR named this split explicitly
related: PERF postscript 1 (docs/ops/session-log.md, the revalidateTag mechanism), ADR-023 (producers are scheduled workers with a named runtime — the revalidateTag call this ADR relies on already lives at that runtime's single completion point), ADR-025 (deterministic derivations auto-adopt — same philosophy of not adding a manual gate where an existing mechanism already covers the case), PERF-2/PERF-6 (getClaims() migration, cache() request-scoped memoization), PERF-8 (React #418 fix), src/lib/detail/load-detail.ts / load-detail-core.ts (the item-scoped/viewer-scoped split this ADR extends to the shell layer)
---

# ADR-026 — Detail-page cache model and viewer-state split

## Context

The PERF-9 dispatch asked for a designed split between PUBLIC intelligence content (listings, item
pages, bands, forward-events strip, series board) served from a cached data layer, and PER-USER state
(personal-state, list-order, members, admin attention) fetched client-side after first paint in ONE
batched call instead of four — with a choice between `unstable_cache` + `revalidateTag` (the pattern
PERF postscript 1 already put in place, fired by population/maintenance runtimes on write) or
route-segment ISR, justified against ADR-023 and ADR-025 and prior PERF trains' decisions.

**[CONFIRMED]** Every one of the app's 129 routes builds as `ƒ (Dynamic)` today — `next build --webpack`
was run clean (`rm -rf .next`) both before and after this lane's changes and reports 129/129 routes `ƒ`,
0 `○`, 0 `◐` in both runs (`/tmp/.../scratchpad/build-before-full.log`,
`/tmp/.../scratchpad/build-final.log`). Route-segment ISR (a route.tsx opting into static generation
with a `revalidate` interval) is therefore not available to any of these routes as they stand, for two
independent, confirmed reasons:

1. **[CONFIRMED]** `src/app/layout.tsx` — the shared root layout every route renders under — called
   `await headers()` unconditionally in its own body to build `resolveServerBootstrap()`'s
   RSC-navigation check. Next's classical (non-PPR) rendering model treats a Dynamic API call ANYWHERE
   in a route's render tree, even wrapped in `<Suspense>`, as forcing that whole route to `ƒ`; Suspense
   only reorders streaming for an already-dynamic render, it does not restore static eligibility. This
   was verified empirically, not assumed: after restructuring the layout so the `headers()` call moves
   into a small async `BootstrapResolver()` Server Component rendered only inside the layout's existing
   `<Suspense fallback={null}>` boundary (the same eager-promise-then-`use()` streaming shape
   `BootstrapBoundary.tsx` already established), a clean rebuild of three genuinely static leaf pages
   with zero of their own dynamic-API reads (`/privacy`, `/login`, `/signup`) still showed `ƒ`. The
   hypothesis that Suspense alone would recover static generation is [REFUTED] by this measurement — the
   layout fix (kept in this lane, it is still correct hygiene: RootLayout is no longer async and does no
   I/O in its own body) does not, by itself, move any route off `ƒ`.

2. **[CONFIRMED]** All four detail pages and their index pages carry a SECOND, independent,
   deliberate dynamic dependency: `src/lib/detail/load-detail-core.ts`'s `runViewerScoped()`
   unconditionally calls `getViewerRelevanceForItem` → `resolveOrgIdFromCookies()`
   (`src/lib/api/org.ts`), which reads the request's auth cookies to resolve the caller's org for
   workspace-override merging. This is not a bug to fix — it is the existing, correct item-scoped vs
   viewer-scoped split PERF/PERF-2 already built (`load-detail.ts`/`load-detail-core.ts`): the item
   content is item-scoped and cacheable, the override/relevance layer is genuinely per-viewer and must
   read the request. At the SQL level, the listing RPCs backing the index pages are also
   org-parameterized (`p_org_id`), which is the same shape one level up. Removing this dependency for
   any of the four surfaces would require either a schema migration splitting the org-parameterized RPC
   into an org-independent public read plus a client-side override merge (out of this lane's write-set —
   no migrations), or a deep Suspense/streaming restructure of the detail-surface components (each
   1900+ lines) to move the override read below a boundary the page shell doesn't wait on. Both are
   correctly-sized follow-up work, not a same-lane fix (§5).

Given both, route-segment ISR is not reachable for these routes without also either accepting stale
per-viewer overrides at the edge (wrong — an org's live override must appear on next render, not after
an ISR window) or doing the migration/restructure work in (2). That leaves the two real options the
dispatch named: extend the existing `unstable_cache` + `revalidateTag` model, or adopt Next 16's Cache
Components.

**[CONFIRMED]** Cache Components was evaluated directly, not assumed out of reach: `next.config.ts` was
edited to add `experimental: { ppr: "incremental" }` (classic Partial Prerendering, the mechanism this
dispatch's item 3 wording names) and rebuilt. The build refuses to start:
`experimental.ppr has been merged into cacheComponents. The Partial Prerendering feature is still
available, but is now enabled via cacheComponents.` (`/tmp/.../scratchpad/build-ppr-test.log`). Next
16 removed the classic per-route `experimental_ppr` flag entirely; its replacement is a single
top-level `cacheComponents: true` config that changes fetch/data-caching semantics for every component
in the app at once — opt-IN caching via `"use cache"` directives, not the classic opt-out-per-route
model. This is confirmed materially bigger than the flag item 3's wording anticipated: it cannot be
piloted on one route and is not reversible by touching one file if something regresses; every existing
fetch/data-read call site's caching behavior is in scope the moment the flag flips.

## Decision

1. **PUBLIC intelligence content stays on the existing `unstable_cache` + tags + `revalidateTag`
   model** (PERF postscript 1), formalized here rather than replaced. This is the model ADR-023
   already assumes for how a producer's write becomes visible: ADR-023 establishes producers as
   scheduled workers with a named runtime, and that runtime's completion is the single point that
   fires cache invalidation — `revalidateTag(APP_DATA_TAG)` / the item/surface-detail tags already
   called from population/maintenance apply and from every workspace mutation route (`overrides`,
   `personal-state`, `list-order`). This lane introduces **no new cache entries** and therefore makes
   **no change to that single invalidation point** — `admin/attention`'s existing
   `unstable_cache(["admin-attention-counts-v1"], { tags: [APP_DATA_TAG] })` entry is reused as-is
   (§4), not duplicated.
2. **Cache Components (Next 16's PPR successor) is evaluated and explicitly deferred, not adopted this
   lane.** Per CLAUDE.md rule 13 ("a flag is a commitment, not a comment... fix it now or deliver a
   decision-ready recommendation") and rule 15 ("a proof that does not execute is not a proof"): a
   flag this size — changing caching semantics for every fetch in the app in one commit, with no
   partial/reversible rollout — is not a "fix it now" candidate inside a lane scoped to three specific
   items; it is model-changing infrastructure that needs its own dedicated, adversarially-tested lane
   (every existing `unstable_cache`/`fetch` call site re-verified under the new default, a real
   staging rollout, explicit rollback plan). Recommending it as a same-lane addition here, having
   confirmed it cannot even be tried incrementally, would be exactly the "small follow-up" rule 13
   forbids presenting as done. This is delivered decision-ready: the next lane that picks it up starts
   from a build-verified list of every call site Cache Components would touch (§4 below is the
   PER-USER-state half of that list already isolated by this lane's own work) rather than from zero.
3. **PER-USER state is fetched client-side, after first paint, in ONE batched call** —
   `GET /api/workspace/bootstrap` (§4) — never blocking the shell. Where auth/workspace identity
   must stay in the request path for access control, it already does, cheaply: PERF-2 migrated
   `proxy.ts`/`middleware.ts`'s per-request auth check from `getUser()` (a network round trip) to
   `getClaims()` (local JWT verification, no DB read) before this lane started, and this lane did not
   need to touch middleware to satisfy "cheap, no DB, page reads independent of it" — that separation
   already existed; this ADR records it as the standing shape the bootstrap design relies on rather
   than re-deriving it.
4. **The four detail pages' own remaining per-viewer read is trimmed, not removed** (item 4, §3
   below): `resolveServerBootstrap()`'s three-stage read is replaced with a two-stage
   `resolveViewerIdentityFromCookies()` for the one thing `watchMembershipPromise` actually needs
   (`userId`, `orgId`) — this does not change which routes are `ƒ` (the `getClaims()` call itself is
   still a dynamic-API dependency, correctly so — this is real per-viewer data), it removes one wasted
   sequential round trip per detail-page render, which is the dominant cost on an RSC navigation
   specifically (§3).

## Why this and not route-segment ISR

Route-segment ISR would statically generate a detail/index route and revalidate it on an interval or
tag, serving the SAME html to every viewer until invalidated. That is a correct model for the item
CONTENT (already effectively what `unstable_cache` gives the item-scoped half of `load-detail-core.ts`),
but the org-override / relevance layer described in Context (2) is genuinely per-viewer within that
same route — two different orgs viewing the same item can see different override state on the same
render. ISR has no per-viewer axis; putting a per-viewer read inside an ISR page either (a) forces the
whole page dynamic anyway (the exact problem today) or (b) requires exactly the migration/restructure
work in §5, which this lane's write-set (no migrations, `fsi-app/src/app/**` and friends only) cannot
do in three commits without exceeding rule 13's "fix it now, not a stub" bar for a change this size.
`unstable_cache` + `revalidateTag`, by contrast, already coexists cleanly with a per-viewer read inside
the same Server Component tree (the item-scoped call is cached, the viewer-scoped call is not, in the
same `Promise.all` — this is exactly what `load-detail-core.ts` already does), so it needed no new
mechanism, only the trim in §4.

## What this lane did NOT need to build

`data.ts`'s existing `unstable_cache` wrapping of `getAppData`/`getResourcesOnly`/`getListingsOnly`
(cited in `resolveOrgIdFromCookies`'s own header comment) already implements "PUBLIC intelligence
content served from a cached data layer" for the listing/band/forward-events reads named in the
dispatch. This lane found no gap there to close — the gap was entirely on the PER-USER side (four
independent post-render fetches, §4) and on the shared-layout dynamic-API call (§3 below, layout.tsx).

## Consequences

- The `next build` route table is **unchanged**: 129/129 `ƒ`, before and after (measured, §"Context"
  point 1 above) — this is the expected, correctly-labelled result of this decision, not a shortfall
  against it. The dispatch's request for "the before/after route table... IS the evidence for item 3"
  is satisfied by that table proving the two confirmed causes and proving the layout fix alone does not
  (and was never claimed to) flip a symbol — the evidence is in what did NOT change and why, not a
  flipped symbol.
- What DOES change and is measurable: the four detail pages' server-render cost drops by one sequential
  workspace_settings round trip per render (§4), and the shell's post-paint network cost drops from up
  to three independent per-user fetches (personal-state, list-order, members — admin/attention already
  had its own singleton and polling, left untouched) to one (§4 of the item-5 write-up).
- Cache Components stays a named, evaluated, deferred option — the next lane that wants it does not
  re-run the `experimental.ppr` dead end this lane already ran into.

## Follow-up (decision-ready, not started this lane)

- Splitting the org-parameterized listing RPCs into an org-independent public read + client-merged
  override layer (a migration) would let the four index pages go static/ISR under the classic model
  without Cache Components. Needs a migration-authoring lane.
- A dedicated Cache Components lane: enumerate every `unstable_cache`/`fetch` call site (this ADR's §4
  and the pre-existing `data.ts` wrapping are the starting inventory), add `"use cache"` directives
  incrementally behind a staging rollout, verify no per-viewer read silently gets cached.

### Addendum — PERF-10 (2026-09-04): first follow-up item done; measured, Consequences section above superseded

Operator ruling verbatim, this lane's dispatch: "clicking into any item or any page takes WAY too
long. multiple seconds. every click should show items on a page instantly." The coordinator chose,
by measurement not preference, **Option B (RPC split)** — this ADR's first Follow-up bullet above —
deferring Cache Components (second bullet) per this ADR's own prior evaluation.

**What PERF-10 did**, closing the exact gap this ADR named:

1. **Migration 306** (`fsi-app/supabase/migrations/306_public_workspace_intelligence_listings.sql`,
   renumbered from 305 by the PERF-MERGE lane, 2026-09-04 — PERF-11 authored a distinct migration 305
   in a parallel worktree off the same train-43 base and applied it live first; written not applied —
   Supabase MCP is read-only for this lane): five org-independent counterpart
   RPCs (`get_workspace_intelligence_slim_public`, `_listings_public`, `get_market_intel_items_public`,
   `get_operations_items_public`, `get_research_items_public`), byte-identical to the org-parameterized
   originals minus `_assert_org_membership`/the `workspace_item_overrides` join. `src/lib/data.ts`'s
   `getPublicResourcesOnly`/`getPublicListingsOnly`/`getPublicMarketIntelItems`/
   `getPublicOperationsItems`/`getPublicResearchItems` call them through one shared `unstable_cache`
   entry each (no `org_id` in the cache key), tagged `PUBLIC_ITEMS_TAG` — a NEW tag, kept separate from
   `APP_DATA_TAG`, revalidated at the same population/maintenance apply completion point ADR-023 names.
2. **The four detail pages' remaining per-viewer server reads were removed, not trimmed further** —
   this ADR's item 4 (§ above) had already trimmed `watchMembershipPromise` to a two-stage cookie read;
   this lane found that read (plus a still-cookie-bound owner lookup and, on `/regulations/[slug]`
   only, `loadRegulationDetailObligations`'s `createSupabaseServerClient()` call) was the remaining
   Dynamic-API dependency once the RPC split closed the listing-RPC cause. All three now resolve
   CLIENT-SIDE post-paint (`WatchButton`, `OwnerTeamCard`, and two Route-Handler-backed components —
   `ObligationRegister`, `UpcomingObligationsStrip` — reusing this ADR's own "a Route Handler's own
   Dynamic-API dependency does not propagate to a page that merely `fetch()`s it" mechanism), each with
   an explicit honest loading state per this ADR's UX-laws framing — never a silent empty-as-final
   render. `/regulations`'s index page also had a second, independent Dynamic API: `useSearchParams()`
   reading `?priority=/&region=/&owner=` directly in `RegulationsLedger.tsx` — isolated into a
   `<Suspense fallback={null}>`-wrapped leaf component per Next's own documented pattern, so the filter
   values now apply client-side after mount instead of forcing the whole route dynamic.
3. **`generateStaticParams` added to all four `/[slug]` pages, returning `[]`** — found by actually
   running `next build --webpack` (the dispatch's own "route table before/after IS the evidence" bar)
   after (1) and (2): a dynamic-segment page with no `generateStaticParams` is unconditionally
   server-rendered per request under classical (non-PPR) rendering, INDEPENDENT of whether it calls any
   Dynamic API. This was never named in this ADR's own analysis (§"Why this and not route-segment ISR"
   above reasons about ISR at the route-CONTENT level, not about this build-time enumeration
   requirement) — a genuine gap in this ADR's own Consequences prediction, closed empirically rather
   than predicted. `[]` (not a full slug enumeration) is deliberate: the corpus is unbounded and
   continuously grown by the population pipeline, so `dynamicParams` at its Next.js default (`true`)
   renders each slug on first request and serves it from the Full Route Cache thereafter — exactly the
   "first click populates the cache, every click after is instant, for every viewer" behavior the
   operator's law asks for, with no migration-scale corpus enumeration at build time.

**Measured result, replacing the "Consequences" section's `129/129 ƒ, unchanged` line above** (that
line was correct for the lane that wrote it — the RPC split had not yet landed — and is left frozen
rather than rewritten; this addendum supersedes it going forward): `next build --webpack`, this lane,
2026-09-04 — `/regulations`, `/market`, `/operations`, `/research`, `/privacy` build `○` (Static);
`/regulations/[slug]`, `/market/[slug]`, `/operations/[slug]`, `/research/[slug]` build `●` (SSG —
Next's own build-output legend: "prerendered as static HTML (uses generateStaticParams)"); `/community`
and `/community/[slug]` remain `ƒ`, deliberately and out of this lane's scope (each performs a
`redirect()` and reads genuinely per-viewer data — see this lane's FINAL REPORT for the full
route-table diff and the two `getServiceSupabase()` production defects this lane found and fixed while
proving the build). Cache Components (this ADR's second Follow-up bullet) remains untouched, still
deferred, still available to a future lane exactly as this ADR left it.

### Addendum — CAP-1000 (2026-09-05): revalidation is a property of every apply, not of mint alone

**TWO DEFECTS, ONE CAUSE** [CONFIRMED]: PostgREST's `db-max-rows` setting caps ANY response at 1000 rows
regardless of what `.limit(N)` asks for or whether the query carries no `.limit()`/`.range()` at all.
This addendum's own PERF-13 (above) built `getPublicSurfaceSlugs`'s `generateStaticParams` enumeration on
a bare `.limit(BUILD_TIME_SLUG_ENUM_LIMIT = 20000)` RPC call — with the live regulations corpus at 1,312+
rows, only the FIRST 1,000 were ever prerendered (measured live on carosledge.com: slug index 900 was a
prerender HIT, 1000/1050/1200/1311 were all MISS). The obligations register's `fetchObligationRegister
Page` (`src/lib/obligations/read-register.mjs`) carried the identical bug wearing a different name
(`OVERFETCH_CAP = 2000`, then a JS-side filter/count over the truncated array — the masthead read "60 of
1000" against a live 1,141-row table). Both fixed this lane by routing through ONE shared helper,
`fetchAllRows`/`exactCount` (`src/lib/db/paginate.mjs`) — `fetchAllRows` walks `.range()` pages until a
short page, `exactCount` asks Postgres for a real `COUNT(*)` via `{ count: 'exact', head: true }` instead
of trusting a fetched array's `.length`. A THIRD instance of the same class was found and fixed in the
same lane: `supabase-server.ts`'s `runCategoryRpc`/`runCategoryRpcPublic` (the org-scoped and public
category RPCs this ADR's own PUBLIC_ITEMS_TAG addendum names) called their RPC with no `.range()`/
`.limit()` at all — also now routed through the same helper (`fetchAllCategoryRows`). See
`.discipline/fitness/functions/F38-unbounded-supabase-read.mjs` for the mechanical backstop this lane
added against a recurrence, and this lane's own CAP-1000 REPORT for the full site-by-site audit table.

**THE SEPARATE GAP THIS ADDENDUM ACTUALLY AMENDS THIS ADR FOR**: this ADR's PERF-10 addendum (above)
established `PUBLIC_ITEMS_TAG`, "revalidated at the same population/maintenance apply completion point
ADR-023 names" — but the ONLY actual call site of `revalidateTags` (`scripts/lib/revalidate.mjs`) in the
whole repository was, and until this lane remained, `scripts/mint/apply-mint-batch.mjs`'s own in-process
call after a mint. `maintenance.yml` and `population-turn.yml` had ALREADY had `APP_URL`/`WORKER_SECRET`
added to their job-level `env` blocks by the 2026-09-03 PERF train, each with a comment promising a flush
"after a real apply" — but no step in either workflow ever called `revalidate.mjs`. The gap was not
theoretical: Maintenance run #47 (`forward-events-retext` apply) deleted 331 forward events and 331
obligations at 01:20 UTC on 2026-09-05, and `/regulations` (static, `PUBLIC_ITEMS_REVALIDATE_SECONDS` 6h)
still served the pre-cleanup register at 01:35 — the cache tags this ADR designed were never flushed
because nothing outside one mint script ever called the flush.

**THE FIX**: revalidation is a property of every apply that touches a row the public ledgers or their
detail pages read, not a property of minting specifically. Every apply-mode job in `maintenance.yml`,
`corpus-turn.yml`, `propagation-drain.yml`, `producers.yml`, and `population-turn.yml` now ends with one
best-effort step calling `scripts/lib/revalidate.mjs`'s own existing CLI (`node scripts/lib/revalidate.mjs
--apply <tags...>`, already tested in `revalidate.test.mjs` — no second copy of the POST-to-`/api/
revalidate` logic) to flush `APP_DATA_TAG` + `PUBLIC_ITEMS_TAG` + all four `<surface>-detail` tags.
`source-sweep.yml` and `ledger-consume.yml` were read and confirmed NOT to need this step: the first
writes only `portal_link_candidates`, the second only `census_worklist` — neither table any public cache
this ADR governs ever reads. See `docs/runbooks/MAINTENANCE-RUNBOOK.md`'s "Cache flush after apply"
section for the coordinator-facing summary and this lane's CAP-1000 REPORT for the exact diff per
workflow.
