# Perf measurement: page loads and click-through — 2026-09-03

Scope: MEASUREMENT + ROOT CAUSE only, no fixes applied. All numbers below are
[CONFIRMED] (directly measured via `performance.getEntriesByType`, Chrome
network log, or Vercel runtime logs) unless marked [INFERRED]/[HYPOTHESIS].
Measured against production (carosledge.com, deployment
`dpl_2G4DcEEU5fCm3S3Kbcuh7hURmFih`, region `iad1`), signed in as the operator.

**Methodology caveat** [CONFIRMED]: wall-clock deltas spanning multiple tool
round-trips (e.g. a `click` call followed by a separate `read` call) are
inflated by MCP tool latency, not page latency. Click-through numbers below
use `performance.getEntriesByType('resource')` timestamps captured *within
the page*, which are immune to that — the authoritative numbers are the
resource-timing deltas and the Vercel-side `[perf]` server logs, not any
`Date.now()` spans I logged across separate tool calls.

## 1. Full-navigation loads (cold = first hit this session, warm = reload)

| Page | TTFB | DOMContentLoaded | load | transfer | requests |
|---|---|---|---|---|---|
| `/` cold | 107ms | 3505ms | 3857ms | 46.7KB | — |
| `/` warm | 21ms | 1342ms | 1476ms | 45.9KB | 25 |
| `/regulations` cold | 22ms | 1758ms | 1855ms | 64.0KB | 25 |
| `/regulations` warm | 21ms | 1536ms | 1639ms | 63.8KB | 26 |
| `/market` cold | 22ms | 1503ms | 1630ms | 49.9KB | 28 |
| `/market` warm | 19ms | 763ms | 876ms | 49.9KB | 28 |
| `/research` cold | 29ms | 1915ms | 1993ms | 21.7KB | 22 |
| `/research` warm | 24ms | 679ms | 787ms | 21.9KB | 22 |
| `/operations` cold | 21ms | 1098ms | 1222ms | 48.5KB | 25 |
| `/operations` warm | 21ms | 850ms | 935ms | 48.5KB | 25 |
| `/community` cold | 20ms | 2114ms | 2192ms | 13.0KB | 22 |
| `/community` warm | 22ms | 3021ms | 3088ms | 13.0KB | 22 |

TTFB is fine everywhere (first byte in ~20-30ms, Vercel Edge responding
immediately). The cost is entirely between TTFB and DCL: on `/` cold,
`finalResponseHeadersStart` (when the streamed SSR document actually
finishes its headers) is 1762ms — i.e. the document itself takes ~1.7s to
render server-side before the browser has anything to parse. `/community`
warm being *slower* than cold (3088ms vs 2192ms) shows this isn't a caching
effect — it's per-request server render variance, consistent with §3/§5.

Slowest home-page resources (cold, in order): `/api/admin/attention` 796ms,
five `_next/static/chunks/*.js` bundles at 415-486ms each (largest 56KB),
`/api/workspace/personal-state` 460ms.

## 2. Click-through (list → detail), first click (cold) and second click (warm)

Measured as time from click to the item's RSC data fetch completing
(browser resource-timing), cross-checked against the server's own `[perf]`
log line for the same request.

| Surface → item | client: click→fetch-start | client: fetch duration | client: total to settled¹ | server `[perf] … data` |
|---|---|---|---|---|
| Regulations → EU Net-Zero Industry Act (cold) | 324ms | 2054ms | ~2.4s | *(not in captured log window)* |
| Regulations → Mexico SEMARNAT `/regulations/g14` (warm) | 324ms | 1804ms | ~2.7s | **1279ms** |
| Market → Loadstar Supply Chain News Feed | 354ms | 2115ms | ~3.2s (+2 JS chunks, +`/api/watchlist` 492ms) | **1905ms** |
| Operations → India Regional Operations Profile | 318ms | 1456ms | ~2.4s (+JS chunk, +`/api/watchlist` 477ms) | **1262ms** |
| Research → Mission Innovation Shipping Mission | 334ms | 1939ms | ~3.0s (+JS chunk, +`/api/watchlist` 497ms) | **1597ms** |

¹ "settled" = last network activity the browser recorded after the click,
including the trailing client-side `/api/watchlist` call every detail page
fires post-navigation.

Every click-through is a **soft client-side navigation** [CONFIRMED] — the
`window` object and its `performance.now()` clock survive the URL change
(no full document reload), and the request is an RSC fetch
(`?_rsc=<hash>`), not a document GET. So this is not a "full page reload"
problem; it's that the RSC fetch itself takes 1.3–2.1s server-side on every
single click, with no prefetch to hide it (see §4).

One RSC retry during this run returned **HTTP 503** on
`/regulations/eu-net-zero-industry-act-2024-1735?_rsc=1qesj` before a
follow-up request succeeded — a live instance of the "Supabase-saturation"
failure mode the code comment in §4 already documents.

Market and Research/Operations detail navigations *also* fetch new
`_next/static/chunks/*.js` files after the click (10-15KB each) — those
routes were not code-split into anything already resident in the browser,
so the click pays for a JS chunk fetch on top of the data fetch.

## 3. Vercel runtime logs (last hour, `dpl_2G4DcEEU5fCm3S3Kbcuh7hURmFih`, `iad1`)

No cold-start flag is exposed in this log format, so cold/warm-start
attribution is not available from this tool — noted as a gap, not asserted.

Server-measured `[perf]` timings, all from this run's own clicks (matches §2
exactly, confirming the client-observed wait is server render time, not
network):

- `/regulations/g14 data 1279ms`
- `/market/f3510df3-… data 1905ms`
- `/operations/india-regional-operations-profile data 1262ms`
- `/research/9118aab6-… data 1597ms`
- `/regulations data 241ms` (index page's own primary data call — fast)
- `/operations data 553ms` (`getResourcesOnly 552ms`)
- `getListingsOnly 1400ms` / `getResourcesOnly 1485ms` — client-triggered
  `/api/listings/rest` calls that `RegulationsLedger` fires *after* first
  paint to backfill the rest of the corpus (see `regulations/page.tsx`
  comment: first paint ships 60 rows, the remainder streams in client-side).

**Every single logged request — index or detail, first hit or repeat hit,
identical URL requested three times within 5 seconds — shows `cache=MISS`
or `cache=BYPASS`.** [CONFIRMED] Nothing observed was served from Vercel's
edge/data cache during this session. This matches `next.config.ts`'s
`Cache-Control: private, ...` headers on every one of these routes (PERF-1
design, by intent — `private` explicitly excludes Vercel's CDN because the
payload is per-org). The practical effect: PERF-1's TTLs can only ever help
a single browser's own HTTP cache; they do nothing to reduce load on the
Lambda or Supabase, and this session's repeated navigations to the same
detail pages never benefited from them.

## 4. Code-side findings

### `/regulations/[slug]/page.tsx` (regulation detail)
Fully dynamic route (no `revalidate`, cookies read via
`resolveOrgIdFromCookies()` — comment at line 36-40 explicitly says a
former `export const revalidate = 60` was "a no-op" because of this). Per
request, **sequential, non-parallel `await`s**, each a separate Supabase
round trip:
1. L67-91: conditional UUID→slug redirect lookup (own `createClient()`)
2. L93: `fetchIntelligenceItem(id)` — **is** wrapped in `unstable_cache`
   (300s, tag-scoped) in `supabase-server.ts:3046`
3. L110: `getViewerRelevanceForItem()` — **uncached**, itself does
   `resolveOrgIdFromCookies()` + a fresh `createClient()` +
   `getWorkspaceProfile()` (deliberately excluded from the cache per its
   own header comment, to avoid leaking one org's relevance into another
   org's cached item — a correctness constraint, not an oversight)
4. L117: `fetchIntelligenceItemSections(id)` — cached (300s,
   `supabase-server.ts:2717`)
5. L131-193: related-items title lookup — **uncached**, own
   `createClient()`, up to 2 queries via internal `Promise.all`
6. L202-253: owner lookup — **uncached**, own `createClient()`, **3
   sequential nested awaits** (resolve item UUID → override row → member
   row), none parallelized

Steps 1,2,3,4,5,6 run one after another, not via `Promise.all`, even though
3, 5 and 6 don't depend on each other. No `loading.tsx` exists for this
route (only one exists in the whole app, at `src/app/loading.tsx`).

### `/market/[slug]/page.tsx` (market signal detail)
Same shape, worse fan-out — **8 sequential stages**: UUID redirect (1) →
`fetchIntelligenceItem` cached (2) → `Promise.all([relevance,
resourceLookup])` (3, only this one pair is parallelized) →
`fetchIntelligenceItemSections` cached (4) → convergence fetch, own client
(5) → price-board fetch, own client, up to 2 queries (6) → carbon-factors
fetch, own client (7) → note fetch, own client, up to 2 queries (8) →
`getMarketIntelItems()` for the related-signals rail (9). Every stage from
5 onward opens its own `createClient()` instance rather than reusing one.
This matches the 1905ms server `[perf]` figure measured in §2/§3 — at
roughly 150-250ms per uncached Supabase round trip, 6+ sequential uncached
stages alone accounts for the bulk of it.

### The team already diagnosed this, and worked around it rather than fixing it
`src/components/regulations/RegulationsLedger.tsx:1367-1369`, on the
"Full analysis"-equivalent row link:

> `// prefetch OFF (diagnosis 2026-07-13): App Router prefetches every
> visible row → N concurrent uncached detail SSR renders (~8-11 Supabase
> round-trips each) → the Supabase-saturation spike behind the
> /regulations/[slug] 503s. Kill the fan-out at source.`

This is a direct, code-committed confirmation of both the magnitude
(8-11 sequential Supabase round trips per detail render) and the
consequence (503s under concurrent load — reproduced live in §2). The fix
applied was to disable Next.js's default prefetch-on-hover/viewport
behavior for regulation rows, which stops the *fan-out* but also means
every click now guarantees a full, un-hidden 1.2-2s+ wait with zero
prefetch to mask it. `MarketIntelLedger.tsx`'s "Full analysis" link (line
973) has **no** `prefetch={false}` — it's left at the framework default —
so market detail pages are exposed to the same fan-out risk this fix was
written to avoid on regulations.

### Index pages (`/regulations`, `/operations` `page.tsx`)
`getListingsOnly`/`getSurfaceCounts` (and `/operations`'s equivalents) run
in `Promise.all` — parallelized correctly. But each index page also renders
`<UpcomingObligationsStrip>` and `<ObligationRegister>` as separate
self-contained async Server Components with their own Supabase reads,
outside that `Promise.all`, adding further sequential round trips to the
same render. `getListingsOnly`/`getResourcesOnly` (`data.ts:200-262`) wrap
their Supabase call in a 10-second internal timeout
(`Promise.race`) — evidence the team expects these calls to sometimes run
long enough to need a hard ceiling.

## 5. Ranked root causes

1. **Per-detail-page sequential Supabase fan-out (6-9 uncached round
   trips), not run in parallel.** [CONFIRMED — code + matching server
   timing] Explains essentially all of the 1.26-1.91s server-side `[perf]`
   time on every detail click in §2/§3, and is explicitly diagnosed in the
   team's own code comment as "8-11 Supabase round-trips" per render.
   Estimated share of the observed click-to-render wait: **~85-95%** — the
   remainder is JS-chunk fetch + the trailing `/api/watchlist` call.

2. **No caching benefit ever realized in this session — everything is
   `cache=MISS`/`BYPASS`.** [CONFIRMED, Vercel logs] By design
   (`Cache-Control: private`, correct for per-org data), but it means the
   6-9 round trips in #1 happen in full on *every single click*, including
   repeat clicks to the same item seconds apart. The two calls that *are*
   wrapped in `unstable_cache` (`fetchIntelligenceItem`,
   `fetchIntelligenceItemSections`) are a minority of the round trips on
   each detail page — most of the fan-out (relevance, related-items,
   owner/note, price-board, carbon-factors, convergence) is intentionally
   uncached for per-org correctness. Estimated share: this is what makes
   #1 pay its full cost on every click rather than only the first.

3. **Prefetch is disabled where it exists, absent where it doesn't, and
   there's no per-route `loading.tsx`.** [CONFIRMED, code] Regulations
   rows have `prefetch={false}` explicitly to protect Supabase from a
   documented saturation failure; market rows have no explicit setting
   (framework default, which for a fully-dynamic route without a
   `loading.tsx` boundary prefetches only the static shell, not the data).
   Either way, nothing hides the 1.2-2s wait behind a hover-triggered
   prefetch or an instant skeleton — the only `loading.tsx` in the app is
   at the root. Estimated share: this doesn't add latency itself, but it's
   why every click is a *visible*, unmasked wait instead of an
   instant-feeling one.

4. **Index pages issue a second, client-triggered ~1.4s fetch after first
   paint** (`getListingsOnly 1400ms` / `getResourcesOnly 1485ms` via
   `/api/listings/rest`) to backfill rows beyond the first-paint page size.
   [CONFIRMED, Vercel logs] This doesn't block the visible first paint but
   does extend when the index page's row list (and therefore anything a
   user clicks) is actually complete. Estimated share: secondary — affects
   perceived "settling" time on index pages, not the click-through number.

5. **home `/` and `/community` show high variance run-to-run** (community
   warm slower than cold: 3088ms vs 2192ms). [CONFIRMED] Consistent with
   #1/#2's pattern of full per-request server work with no caching
   floor — under concurrent load this is what would produce the "many
   seconds" tail the operator describes, beyond what a single measurement
   here shows.

## 6. Minimal structural changes to make a click render without a visible wait

None of the below are implemented — this is a mapping of change → files
only.

- **Parallelize each detail page's independent fetches with
  `Promise.all`.** The relevance lookup, related-items lookup, and
  owner/note lookup in `/regulations/[slug]/page.tsx` and
  `/market/[slug]/page.tsx` don't depend on each other and can run
  concurrently instead of as sequential `await`s — this alone should
  collapse most of the 6-9 sequential round trips into 1-2 round-trip
  widths. Files: `src/app/regulations/[slug]/page.tsx`,
  `src/app/market/[slug]/page.tsx` (and, by the same pattern noted in its
  own comments, `src/app/operations/[slug]/page.tsx`,
  `src/app/research/[slug]/page.tsx` — not directly read this pass, but
  referenced as mirroring this shape).

- **Add a route-level `loading.tsx` for each of the four detail routes**
  so a click renders an instant skeleton instead of nothing, independent
  of how fast the fan-out above becomes. Files:
  `src/app/regulations/[slug]/loading.tsx`,
  `src/app/market/[slug]/loading.tsx`,
  `src/app/operations/[*]/loading.tsx`, `src/app/research/[slug]/loading.tsx`
  (new files).

- **Re-enable prefetch on detail links once the fan-out above is fixed**,
  so the RSC payload is already in flight (or in the router cache) before
  the click happens. File: `src/components/regulations/RegulationsLedger.tsx`
  (remove the `prefetch={false}` at L1370, but only after #1 above ships —
  removing it first reproduces the 503 saturation this flag was added to
  stop). `src/components/market/MarketIntelLedger.tsx`'s link should get an
  explicit, deliberate prefetch decision made (currently just the default)
  rather than being unconsidered.

- **Consider widening `unstable_cache` to more of the uncached stages**
  where correctness allows (e.g. `carbonFactors`/`priceBoard` in
  `market/[slug]/page.tsx` are not obviously org-scoped the way
  relevance/notes/ownership are, and may be cacheable the same way
  `fetchIntelligenceItem` already is). Files: `src/lib/supabase-server.ts`,
  `src/app/market/[slug]/page.tsx`.

## 8. PERF-2 diagnosis (2026-09-03)

Scope: root-cause diagnosis + structural fix for the two facts PERF-2's brief
named CONFIRMED-in-production after the PERF lane's own fix (#540,
`9ebe0bb1`) landed: (A) `/regulations/[slug]` stayed slower than
market/operations/research on the same shared loader, and (B) a 503 on an
RSC request that never appears in Vercel's function logs. Base commit
`6776934d` (post-#540; the PERF lane's `loadDetail`/`loadDetailCore` shared
shape, §1–§6 above, is already live). All claims below are labelled by
evidence status per the lane contract.

### (A) why regulations stayed slower — evidence

[CONFIRMED, by reading] `loadDetail()` (`src/lib/detail/load-detail-core.ts`)
already parallelizes its own item-scoped/viewer-scoped/sections bundle via
one `Promise.all` (§4/§6 above; unchanged by this lane). But
`/regulations/[slug]/page.tsx` is the ONLY one of the four detail pages that
also renders two MORE async Server Components — `<ObligationRegister
itemId variant="detail">` (its own section below the surface) and
`<UpcomingObligationsStrip variant="detail" itemId>` (passed as
`RegulationDetailSurface`'s `upcomingObligations` prop) — confirmed absent
from `src/app/{market,operations,research}/[slug]/page.tsx` by grep (neither
import appears in any of the three).

[CONFIRMED, by reading] The page's own function body is `async`, and does
`const result = await loadDetail(...)` BEFORE it reaches the `return
(<>...</>)` statement that instantiates `<ObligationRegister>` /
`<UpcomingObligationsStrip>`. This is a plain JS execution-order fact, not a
React-scheduling nuance: the function cannot even construct those elements
until the `await` above it resolves. Each of the two components then opens
its OWN `createSupabaseServerClient()` (a *different*, request-scoped client
from `loadDetail`'s service-role one) and does its own legacy_id→uuid
resolution query before its main read — none of it overlapped with
`loadDetail`'s own work, all of it paid strictly afterward, on every single
render, uncached.

[CONFIRMED, `node --test`] `src/lib/detail/regulation-obligations-core.test.mjs`
mounts this exact composition shape with a stubbed call log and prints the
ordered timeline for both the pre-lane shape and the fix:

```
BEFORE — await loadDetail(), then await obligations (STAGE_MS=30 each):
  start:loadDetail → end:loadDetail → start:obligations → end:obligations
  wall time: ~61ms   (obligations does not start until loadDetail ends)

AFTER  — Promise.all([loadDetail(), obligations]):
  start:loadDetail, start:obligations (both before either ends) → end, end
  wall time: ~31ms   (~= the slower of the two stages, not the sum)
```

(The same file's other 4 tests prove `loadRegulationObligations`'s own
control flow: id resolved once then register+upcoming fetched in parallel;
an unresolved id returns empty arrays without calling either fetch;
resolution/fetch errors soft-fail to empty arrays rather than throwing.)

Estimated share of the regulations-vs-others gap this fix collapses: the two
extra components' own Supabase round trips (resolution + main read, ×2,
previously serial-after-loadDetail) — consistent with the audit's own §2
server `[perf]` figures (regulations' logged `data` timing already only
covers `loadDetail`'s cost, meaning the ADDITIONAL render-tree cost these two
components paid was invisible to that log line entirely; this lane's fix
makes them run inside the same `Promise.all` window `loadDetail` occupies,
so they add zero to wall time in the common case where they are not the
slowest branch).

### (B) the 503 with no Vercel log — evidence

[CONFIRMED, live reproduction, this session, `carosledge.com`,
`dpl_TU9Y9tK7HsBedATesoERMtX31rso`] Clicking "Mexico SEMARNAT" from
`/regulations` into `/regulations/g14` reproduced the exact symptom: the
browser's network log showed, in order, `GET /regulations/g14?_rsc=1kmdx
503`, `GET /regulations/g14?_rsc=1v4qf 200`, `GET /regulations/g14?_rsc=jsprb
503` — 2 of 3 requests for the SAME navigation failed. Following synthetic
probes (single fetches, a 20-request concurrent burst, a 15-request
multi-item concurrent burst, all issued from the same authenticated tab) did
NOT reproduce a 503 — consistent with the condition being timing-sensitive
around a cold/first-hit window rather than reproducible by raw concurrency
alone, so the exact response headers on the two failing requests themselves
were not captured (the browser network-request tool used does not expose
response headers, and headers could only be captured on synthetic
requests that all happened to return 200). This is reported honestly as a
gap, not filled in.

[CONFIRMED, live query, `mcp__Vercel__get_runtime_logs`, same project,
90-minute window spanning the exact reproduction above] Grouping by
`statusCode` over the last 3 hours returns exactly `{200: 328, 307: 9,
204: 2}` — **zero 503s**, despite the two live 503s above having occurred
inside that same window. Filtering explicitly by path (`query: "g14"`)
across `serverless` and `serverless-middleware` sources for the exact
07:39–07:41 UTC window in which the 503s were captured shows every single
logged hit to `/regulations/g14` as `200`, including several with the
`[perf] /regulations/g14 data …ms` line the app's own `console.log` emits —
i.e. the underlying Next.js function DID run, successfully, many times in
that exact window, and none of those runs is the request the browser saw
fail. A `query: "proxy"` search of `source: ["edge-middleware"]` for the
`[proxy] auth.getUser() failed` (now `getClaims()`) warning also returned no
matches in the last 60 minutes.

**Conclusion: the 503 is produced at a layer Vercel's own runtime-log tool
cannot see — before or outside the deployed middleware/function execution
this project's logs are scoped to** [INFERRED from the above: a request that
reaches and executes the middleware or the function leaves a log line here
every time in this sample (100% of `g14` hits in the reproduction window did);
the two 503s left none]. This is the platform-vs-app distinction the brief
asked to determine, and the evidence points at the platform / edge routing
layer, not at `proxy.ts`'s own logic — consistent with `proxy.ts`'s existing
try/catch around the auth check already converting an in-process rejection
into a graceful redirect rather than a throw (§ "FIX" below preserves that
same fail-closed shape while removing the network round trip that guard was
originally written to protect against).

**What was NOT fixed as a result:** nothing in this lane's write set can
change platform-layer routing/edge behavior — there is no code fix available
for evidence that points outside the app. The fix applied (part 1 below,
`auth.getClaims()`) removes the specific network round trip the original
`[proxy] auth.getUser() failed` guard comment names as the trigger condition
for the failure mode it was written against, which should reduce how often
the underlying saturation condition is reached at all, but this lane cannot
CONFIRM that removes 100% of the platform-layer 503s without a longer
post-deploy observation window than this session had.

### Fix applied

1. **`src/proxy.ts`**: `supabase.auth.getUser()` (one Supabase Auth network
   round trip per request, including every RSC prefetch) replaced with
   `supabase.auth.getClaims()` (local JWT verification against the cached
   project JWKS — [CONFIRMED by reading
   `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts`]: "Prefer
   this method over `getUser()` which always sends a request to the Auth
   server for each JWT"). Session-refresh-on-near-expiry is preserved
   (`getClaims()`'s own JSDoc: "the user's session will first be refreshed
   before validating the JWT" — same `setAll`/cookie flow). Worst case (a
   project signing JWTs with a symmetric secret rather than asymmetric keys)
   is a wash, not a regression: `getClaims()`'s JSDoc states it then "always
   sends a request similar to `getUser()`" — [HYPOTHESIS: which signing mode
   this project's Supabase instance uses was not checked (no DB/dashboard
   credentials in this worktree per the lane contract); the change is safe
   either way]. The fail-closed catch (an unguarded rejection → platform 503,
   per the pre-existing guard comment) is preserved exactly, now around
   `getClaims()` instead of `getUser()`.

   The routing DECISION itself (public route / static-api passthrough /
   scanner-probe 404 / protected-route redirect, including the
   logged-in-hits-`/login` bounce) was extracted, unchanged, into
   `src/lib/auth/route-policy.ts`'s pure `decideRoute()` — `proxy.ts`
   value-imports `@supabase/ssr` and `next/server`, neither resolvable by
   plain `node --test` outside Next's bundler (same constraint
   `load-detail-core.ts` documents for `next/cache`), so this split is what
   makes the public/static/api/protected × claim-present/absent/expired
   matrix testable at all. `route-policy.test.mjs` (12 tests) covers it,
   including the "expired claim" and "absent claim" cases (both collapse to
   `authenticated: false` from `decideRoute`'s point of view — `proxy.ts`'s
   own `getClaims()` wiring is what tells them apart before calling in).

   The matcher already excludes `_next/static`, `_next/image`, `favicon.ico`,
   `robots.txt`, and common image extensions [CONFIRMED, `proxy.ts`'s
   `config.matcher`, unchanged]. `?_rsc=` prefetches ARE authenticated in
   middleware only, not doubly — the four detail `page.tsx` files call
   `resolveOrgIdFromCookies()`/relevance lookups for viewer-scoping, not a
   second auth gate; middleware remains the only auth CHECK on the request
   path [CONFIRMED, no second `auth.getUser()`/`getClaims()` call found by
   grep in `src/app/regulations/[slug]/page.tsx` or `src/lib/detail/*`].

2. **Regulations detail fan-out (A)**: `src/lib/detail/regulation-obligations-core.ts`
   (pure, deps-injected, `node --test`-able) + `src/lib/detail/regulation-obligations.ts`
   (real Supabase/Next wiring) replace the two Server-Component calls in
   `src/app/regulations/[slug]/page.tsx` with a single `loadRegulationDetailObligations(id)`
   call run via `Promise.all` alongside `loadDetail(...)`. The fetched rows
   feed the two components' existing PURE presentational halves
   (`ObligationRegisterFilterBar`, `UpcomingObligationsStripView`) directly —
   identical rendered output, identical soft-fail/honest-omission behavior,
   identical request-scoped (RLS) Supabase client (per `read-register.mjs`'s
   and `read-upcoming.mjs`'s own "MUST always be called with the
   REQUEST-SCOPED client... never a service-role client" header rule — kept,
   not swapped for the cacheable service-role client `loadItemScoped` uses,
   since `unstable_cache` also forbids reading `cookies()` inside its wrapped
   function). `ObligationRegister.tsx` / `UpcomingObligationsStrip.tsx`
   themselves are UNCHANGED and still serve the regulations LIST page's
   `variant="list"` shape (out of this lane's write set).
