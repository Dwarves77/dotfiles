# ADR-027: The standard fast-page architecture

**Status:** Proposed
**Date:** 2026-09-04
**Author:** lane PERF-ARCH
**Supersedes / extends:** ADR-026 (detail cache and viewer-state split) — this ADR does not reopen ADR-026's own decisions (kept: `unstable_cache`+`revalidateTag` for public content, bootstrap-route-for-per-user-state, detail-page 2-stage viewer resolution). It picks up ADR-026's own stated follow-up: "splitting the org-parameterized listing RPCs into an org-independent public read + client-merged override layer."

## Why this exists

Operator, verbatim: *"these solutions have been developed already, you dont need to reinvent a fix, find out how others do it and do the same."* Every decision below names the standard mechanism, the library/framework feature that implements it, and an official doc citation — not a home-grown alternative — unless the home-grown mechanism already *is* the standard pattern, in which case it's kept and said so explicitly.

Every decision states its owning lane. This lane (PERF-ARCH) owns none of the implementation of §1-6 — its write set is instrumentation/CI budget only (§8) — but is accountable for this document being correct and decision-ready per rule 13 (a flag is a commitment, not a comment).

---

## 1. Static shell served from CDN

**Decision: Cache Components (`cacheComponents: true` + `"use cache"`), not classic ISR+`revalidateTag`, for the *shell* — layout chrome and any route segment with no per-request data.**

Next.js 16.1.6 merged Partial Prerendering into `cacheComponents`; the classic `experimental.ppr` flag is **removed** and the build refuses to start if it's set — **[CONFIRMED]**, ADR-026 already proved this empirically (rebuild test against `/privacy`, `/login`, `/signup`). This means the only forward-compatible static-shell mechanism on this Next version is `cacheComponents` + `"use cache"` directives on the segments/functions that should be cached, with dynamic segments (`headers()`, `cookies()`, per-user data) automatically excluded from the cached shell and streamed in. This *is* the framework-recommended replacement for the old ISR mental model, not an alternative to it — Next's own docs describe `cacheComponents` as "the primary way to make part of a route static while keeping the rest dynamic," which is exactly this app's shape (public shell + per-user bootstrap).

ADR-026 deferred `cacheComponents` as "too large/non-incremental to pilot" at the time it was written. This ADR does not overrule that — it says: the region fix and this lane's own measurements confirm the deferral was correct triage, but it is now the single largest un-pulled lever (every one of 118-130 routes is still `ƒ` Dynamic, confirmed again by this lane's own `next build --webpack`, `docs/audits/perf-waterfall-2026-09-04.md` §4). It should be piloted next, incrementally, starting with the route that forces every layout descendant dynamic: `headers()` at `fsi-app/src/app/layout.tsx:2`.

**Doc citation:** nextjs.org/docs — App Router → Caching → Cache Components (`cacheComponents` config flag, `"use cache"` directive, `cacheLife`/`cacheTag`).

**File mapping:** `fsi-app/src/app/layout.tsx`, `fsi-app/next.config.ts`.
**Owning lane: PERF-10** (already named as owning `layout.tsx`/`next.config`/cacheComponents/static-eligibility in this train's lane split).

---

## 2. One screen of rows by cursor

**Decision: PostgREST `.range()`/keyset cursor pagination on the server, `useInfiniteQuery` (TanStack Query) on the client, `useVirtualizer` (TanStack Virtual) for the DOM.**

Three separate standard mechanisms, each solving a distinct part of the same complaint ("every click should show items on a page instantly," "you dont load every item at once"):

- **Server-side pagination**: PostgREST's `.range(from, to)` (offset) or a keyset cursor (`WHERE (sort_col, id) > (last_sort_col, last_id)`) — **[CONFIRMED]** the current mechanism, `fsi-app/src/app/api/listings/rest/route.ts`, is a one-shot `LIST_REMAINDER_LIMIT=5000` fetch (`fsi-app/src/lib/list-pagination.ts`), not true pagination. This is the home-grown mechanism flagged for replacement: it works (it's not broken), but it is not the standard pattern — it ships up to 5,000 rows in one HTTP response instead of a page at a time on demand.
- **Client-side cache/fetch-more**: TanStack Query's `useInfiniteQuery` (`getNextPageParam`, `fetchNextPage`, `data.pages`) is the documented standard for exactly this shape — cursor-paginated lists with "load more" or scroll-triggered fetching, with built-in caching so a click-back doesn't re-fetch. **[CONFIRMED]** not currently installed in this app (no `@tanstack/react-query` import found under `src/` — grepped this session). **Not installed by this lane** (no-npm-install constraint) — named here as the exact package for the coordinator to add: `@tanstack/react-query` (v5, current major as of Next 16.1.6-era ecosystem).
- **DOM windowing**: TanStack Virtual's `useVirtualizer` — renders only the rows in/near the viewport regardless of how many are in the fetched dataset. **[CONFIRMED]** directly explains a large share of the 886 KB/301-element numbers: `RegulationsLedger.tsx` renders every row of every band as real DOM (grepped, zero virtualization imports anywhere under `src/components/regulations/`), and a single band can hold up to 713 items (2026-09-03 audit). Package: `@tanstack/react-virtual` (v3).

**Doc citation:** tanstack.com/query/latest/docs/framework/react/guides/infinite-queries; tanstack.com/virtual/latest/docs/introduction; postgrest.org/en/stable/references/api/pagination_count.html (`.range()`/`Range` header semantics).

**File mapping:** the four listing pages and their ledgers, `fsi-app/src/app/api/listings/rest/route.ts`, `fsi-app/src/lib/list-pagination.ts`.
**Owning lane: PERF-11** (already named as owning listing payload, the four listing pages/ledgers, `data.ts`/`supabase-server.ts` listing projection).

---

## 3. Query-side filter/projection

**Decision: keep the RPC/view-projection pattern — it already is the standard.**

Migration 064's dashboard projection (an RPC/view returning only the fields a screen needs, rather than `select *`) is precisely the recommended Supabase/PostgREST pattern: push projection to the database via a view or RPC, not a client-side `.map()` after fetching full rows. **[CONFIRMED]** `toLedgerRowPayload` already trims `keyData`/`reasoning` from first-page SSR rows (per its own header comment, dated this lane's own train — "PAYLOAD lane 2026-09-04, item 2 of the perf brief"). **Kept, not replaced.** The remaining work is applying the same discipline to whatever RPC backs the remainder fetch once §2's cursor pagination replaces it — that's PERF-11's implementation detail, not a new pattern to invent.

**Doc citation:** supabase.com/docs/guides/database/functions (Postgres functions/RPC as the query-projection boundary); postgrest.org/en/stable/references/api/resource_representation.html (`select` param as the client-projection escape hatch — used for one-off cases, not as the default).

**File mapping:** `fsi-app/src/lib/data.ts` (listing projection), any migration 305 work PERF-11 authors.
**Owning lane: PERF-11.**

---

## 4. Per-user layer after first paint from one call

**Decision: the PERF-9-built bootstrap route (`/api/workspace/bootstrap`) IS the standard pattern. Keep it.**

This is the "shell + hydrate" split that Next.js's own Partial Prerendering docs describe as the target shape for pages mixing static and per-user content: render the static/public shell first (fast, cacheable), then fill in per-user state from a single follow-up call after paint, rather than blocking the whole document on auth-scoped data. **[CONFIRMED]** by reading `fsi-app/src/app/api/workspace/bootstrap/route.ts` — one `requireAuth`, four loaders in a single `Promise.all`, one JSON response, one Server-Timing header (this lane's own addition, §8). This is not a home-grown antipattern to replace with a library; it *is* the library-recommended shape, implemented by hand because the "library" here (Cache Components' own per-user boundary) is exactly what §1 defers piloting. No action item beyond §1 landing (at which point this route becomes the boundary between the cached shell and the dynamic hole, rather than a client-side-only post-paint fetch).

**Doc citation:** nextjs.org/docs — App Router → Partial Prerendering (static shell + dynamic holes filled after the initial static response streams).

**File mapping:** `fsi-app/src/app/api/workspace/bootstrap/route.ts` (already this lane's instrumentation target — read-only otherwise).
**Owning lane: none — already correct, no new lane needed.**

---

## 5. One round trip per screen (collapsing auth→org→RPC)

**Decision: put the org id in a JWT custom claim (Supabase Auth Hook), or resolve it once at the proxy/middleware layer and forward it — do not re-derive it per loader.**

**[CONFIRMED]** by reading `fsi-app/src/lib/data.ts`: `getListingsOnly` (lines 290-291) and `getSurfaceCounts` (line 658) each independently call `resolveOrgIdFromCookies()`. Because that function is `cache()`-wrapped (PERF-6/PERF-7 pattern, confirmed present), the second call is a request-scoped cache hit, not a second network round trip — so this is **not** currently costing an extra hop. What it *does* cost is the irreducible sequential shape inside each loader: org id must resolve before the org-parameterized RPC can be issued, and that's one full round trip (cookie read → Supabase Auth) sitting in front of every listing/aggregate query, on every single request, because cookies are re-read fresh per request (the `cache()` wrap is request-scoped, not cross-request).

The standard fix for "stop resolving the same identity fact from scratch on every request" is a **custom JWT claim**: Supabase Auth Hooks can inject `org_id` directly into the access token at sign-in/refresh, so `getClaims()` (already the mechanism in `fsi-app/src/proxy.ts:66`, PERF-2's migration) returns org id as part of the *same* JWT verification call that already happens — zero additional round trips, because the auth hop was going to happen anyway. This collapses "auth round trip, then org round trip, then RPC" into "auth+org round trip (one call), then RPC."

**Doc citation:** supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook (inject custom claims into the JWT at token-issuance time, readable via `getClaims()` with no extra request).

**File mapping:** a new Supabase Auth Hook (SQL function + dashboard/config wiring — not a code file in this repo's existing tree), `fsi-app/src/lib/api/org.ts` (`resolveOrgIdFromCookies` would read the claim instead of a fresh cookie/DB round trip), `fsi-app/src/proxy.ts` (already calls `getClaims()`, would just read one more field off the existing result).
**Owning lane: a new lane, PERF-12 ("org-claim"), or folded into PERF-11 if that lane's scope allows — this ADR does not assign it to PERF-ARCH (proxy.ts and org.ts are outside this lane's write set) or PERF-10 (not a static-eligibility concern). Recommend: new lane, since it touches an auth hook (infra config, not just app code) that neither PERF-10 nor PERF-11 currently owns.**

---

## 6. DB co-location and pooling

**Decision: Supavisor pooling is architecturally not applicable. Region co-location (already done) is the real lever, and it's already pulled.**

**[CONFIRMED]** by reading `fsi-app/src/lib/supabase-service.ts` and `fsi-app/src/lib/supabase-server-client.ts` — both construct their Supabase client from `NEXT_PUBLIC_SUPABASE_URL`, and a grep for any raw Postgres driver (`pg`, `postgres`, a `.pooler.supabase.com`/`db.<ref>.supabase.co` connection string) across `src/` found none. This app talks to Supabase exclusively over HTTPS via supabase-js/PostgREST. Supavisor (transaction-mode connection pooling, port 6543) exists specifically for apps holding raw Postgres connections (ORMs, connection-pooled server frameworks) — it is not a concept that applies to an HTTPS/PostgREST client, which has no persistent connection to pool. The literal ADR-027 question ("is the app using the pooler URL?") is answered: **N/A, and switching to one would require adopting a raw Postgres driver, which is a much larger and unrelated change** with no upside for this app's actual bottleneck.

The real analog — "put the compute near the data" — was already done at this branch's base: `be0f8e97 perf(region): Vercel functions sfo1`, moving the app's Vercel functions into the same region as the Supabase project (us-west-1/sfo1 co-location). **[CONFIRMED]** by this branch's own git log. No further action.

**Doc citation:** supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler (Supavisor's stated purpose: pooling for direct/raw Postgres connections); vercel.com/docs/edge-network/regions (function-region-to-data-region co-location as the standard latency lever for HTTP-based backends).

**File mapping:** none — no change proposed.
**Owning lane: none.**

---

## 7. Cold-start reduction without spend

**Decision: smaller server bundles via `optimizePackageImports`, no cron pings, no CPU tier change, no provisioned concurrency.**

Operator, verbatim, explicitly bans spend-based fixes: *"increase my spending to fix poor developing"* — this section names only zero-cost, code-level levers.

- **`optimizePackageImports`** (Next.js config, stable) automatically tree-shakes named imports from large packages (icon libraries, UI kits) so only the used exports are bundled per route, shrinking the server function's cold-load bytecode. **[CONFIRMED]** not currently configured — `fsi-app/next.config.ts` has no `optimizePackageImports` entry (read in full this session). Zero-cost, config-only change.
- **Vercel Fluid Compute** — **[CONFIRMED]** by prior research this lane, this is a *default* architectural feature (in-function concurrency + bytecode caching) since April 2025, not a paid tier — it reduces cold starts for free by reusing warm execution contexts across concurrent requests to the same function, and requires no code change, only confirming it isn't explicitly disabled in `vercel.json`/project settings (out of this lane's write set to check — flagged for PERF-10 or whichever lane owns deploy config).
- **Explicitly rejected, per the operator's own ban**: cron-ping keep-warm schemes, CPU tier upgrades, provisioned concurrency. None of these fix "how the pages load" — they pay to hide the symptom, exactly what the operator said not to do.

**Doc citation:** nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports; vercel.com/docs/fluid-compute (default-on architecture, not a paid add-on).

**File mapping:** `fsi-app/next.config.ts`.
**Owning lane: PERF-10** (owns `next.config`).

---

## 8. CI budget (F37, this lane's own deliverable)

**Decision: `F37-perf-budget.mjs`, a fitness function enforcing a registry of dated, evidenced perf metrics with a ratchet and a target per route — built and landed by this lane.**

`fsi-app/src/lib/perf/perf-budget.mjs` defines `PERF_BUDGET_REGISTRY` for the three routes this lane instrumented (`regulations-list`, `regulations-detail`, `workspace-bootstrap`), each metric carrying `{ ratchet, target, measuredAt, evidence }` where `evidence` is a `[CONFIRMED]`/`[HYPOTHESIS]`-labeled citation back to this audit or the 2026-09-03 audit — never a bare number. `F37-perf-budget.mjs` fails CI if the registry is malformed (missing route, malformed evidence label, ratchet worse than target with no override). Initial ratchets are today's measured/cited numbers (from `docs/audits/perf-waterfall-2026-09-04.md` and the 2026-09-03 audit); targets are:

- listing document < 200 KB (down from the confirmed 886 KB) — the number to hit once §1+§2 land.
- item click < 300ms warm RSC render.
- DCL < 1s.

This is a **ratchet**, not a one-time gate: as PERF-10/PERF-11/the new org-claim lane land their pieces, they tighten `PERF_BUDGET_REGISTRY`'s `ratchet` values downward; F37 fails if a future change regresses past the currently-committed ratchet. This is this lane's mechanism for making sure the diagnosis in this ADR doesn't just sit as a document — every future PR touching these routes is measured against it.

**File mapping:** `fsi-app/src/lib/perf/perf-budget.mjs`, `fsi-app/.discipline/fitness/functions/F37-perf-budget.mjs` (+ test).
**Owning lane: PERF-ARCH (this lane, already built — see §9).**

---

## 9. What PERF-1..9 built: kept vs replaced

| Lane | Mechanism | Verdict | Why |
|---|---|---|---|
| PERF-2 | `getClaims()` migration in `proxy.ts`, `decideRoute()` extraction | **Kept** | Already the standard (`auth.getClaims()` per Supabase's own migration guidance away from `getUser()`); §5's JWT-claim proposal extends it, doesn't replace it. |
| PERF-6, PERF-7 | `cache()`-wrapping `org.ts`/`auth.ts`/`server-bootstrap.ts`/`community-auth.ts` | **Kept** | This is React's own standard request-memoization primitive, correctly applied (proven via reading the installed React source this lane's context inherited). |
| FIRSTPAGE / SLIM-ORDER | Fixing PostgREST's outer `.order()` silently overriding an RPC's internal `CASE`-based rank order | **Kept** | A correctness fix, not an architecture choice — orthogonal to this ADR. |
| PERF-9 | Bootstrap route as per-user post-paint layer, `Suspense`-wrapped `BootstrapResolver`, 2-stage detail viewer resolution | **Kept** | §4 above — this already is the standard shell+hydrate pattern. |
| PERF-9 | Deferred `cacheComponents` pilot | **Kept as-of-then, now due for revisit** | §1 — correct triage in ADR-026's moment, now the largest remaining lever. |
| (unnamed, pre-existing) | FIRSTPAGE remainder fetch (`/api/listings/rest`, one-shot 5,000-row limit) | **Flagged for replacement** | §2 — not the standard cursor-pagination pattern; works, but ships too much in one response and has nothing to do with limiting *concurrent* renders, which was its original framing. |
| (unnamed, pre-existing) | `useWorkspaceBootstrap` (client hook consuming the bootstrap route) | **Not read this session** | Out of this lane's write set (`src/app/api/workspace/bootstrap/route.ts` only, not its client consumer) — no verdict rendered; flagged for whichever lane owns it to confirm it's a thin consumer of §4's already-correct pattern and not itself doing extra sequential fetching. |
| (unnamed, pre-existing) | `unstable_cache`+`revalidateTag` wrappers for public content | **Kept** | ADR-026's own decision, not reopened here — this is Next's documented standard for tag-based revalidation of cached data outside a full Cache-Components pilot. |

---

## 10. Summary decision table

| # | Decision | Standard mechanism | Doc | Files | Lane |
|---|---|---|---|---|---|
| 1 | Static shell | Cache Components `"use cache"` | nextjs.org/docs Cache Components | `layout.tsx`, `next.config.ts` | PERF-10 |
| 2 | Cursor rows | PostgREST `.range()` + `useInfiniteQuery` + `useVirtualizer` | tanstack.com, postgrest.org | listing pages/ledgers, `list-pagination.ts` | PERF-11 |
| 3 | Query projection | RPC/view projection | supabase.com/docs functions | `data.ts`, migration 305 | PERF-11 |
| 4 | Per-user layer | Bootstrap route (kept) | nextjs.org/docs PPR | `api/workspace/bootstrap/route.ts` | none (already correct) |
| 5 | One round trip | JWT custom claim (org id) | supabase.com/docs auth-hooks | `org.ts`, `proxy.ts`, new Auth Hook | new lane (PERF-12) or PERF-11 |
| 6 | DB pooling | N/A (HTTPS/PostgREST, not raw PG); region co-location (done) | supabase.com/docs pooler; vercel.com/docs regions | none | none |
| 7 | Cold start, no spend | `optimizePackageImports`; Fluid Compute (default-on) | nextjs.org/docs, vercel.com/docs | `next.config.ts` | PERF-10 |
| 8 | CI budget | F37 fitness function, dated ratchet | (this repo's own discipline system) | `lib/perf/perf-budget.mjs`, `F37-perf-budget.mjs` | PERF-ARCH (done) |
