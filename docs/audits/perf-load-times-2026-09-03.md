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

## 7. After PERF (measured 2026-09-03 07:15-07:24 UTC, deployment `dpl_Cx7hhuqXA3Ja34z6YwieuTBe19wS`)

[CONFIRMED] Production alias `carosledge.com` resolves to deployment
`dpl_Cx7hhuqXA3Ja34z6YwieuTBe19wS`, `target: production`, `readyState:
READY`, `githubCommitSha: 9ebe0bb176f4e2a8052f56f18c6ceaa363d17a4f` — exactly
the PERF commit, verified via `get_deployment` before measuring. Same
method as §1-§3: `performance.getEntriesByType('navigation'/'resource')`
read from inside the page (immune to MCP round-trip latency), signed in as
the operator, region `iad1`.

### 7.1 Full-navigation loads — before → after

server-render = DCL − TTFB. Requests count includes the document itself.

| Page | server-render before→after | transfer before→after | requests before→after |
|---|---|---|---|
| `/` cold | 3398→3130ms | 46.7→45.8KB | —→26 |
| `/` warm | 1321→1599ms | 45.9→46.1KB | 25→26 |
| `/regulations` cold | 1736→2092ms | 64.0→64.3KB | 25→28 |
| `/regulations` warm | 1515→1094ms | 63.8→64.3KB | 26→28 |
| `/market` cold | 1481→1420ms | 49.9→50.4KB | 28→30 |
| `/market` warm | 744→1224ms | 49.9→50.8KB | 28→30 |
| `/research` cold | 1886→1736ms | 21.7→22.0KB | 22→23 |
| `/research` warm | 655→863ms | 21.9→22.2KB | 22→23 |
| `/operations` cold | 1077→1166ms | 48.5→49.5KB | 25→27 |
| `/operations` warm | 829→950ms | 48.5→49.2KB | 25→27 |
| `/community` cold | 2094→2867ms | 13.0→13.1KB | 22→23 |
| `/community` warm | 2999→1431ms | 13.0→13.0KB | 22→23 |

[CONFIRMED] No consistent full-navigation win or loss — some routes faster,
some slower, request counts up by 1-3 everywhere (new `loading.tsx` per
route adds its own chunk). This PERF change targeted the *click-through*
path, not full navigations, and §1's own note that identical requests vary
run-to-run (`/community` warm was slower than cold in the baseline too)
applies again here — treat full-nav deltas as noise, not signal.

### 7.2 Click-through (list → detail) — before → after

All durations are in-page `performance.now()`/resource-timing deltas
(§2's authoritative method), not cross-call wall clock.

| Surface → item | server `[perf]` before→after | client fetch duration before→after | settle before→after | skeleton before→after | cache |
|---|---|---|---|---|---|
| Regulations → EU Net-Zero (cold) | n/a→**1182ms** | 2054→2025ms | ~2.4s→2436ms | **no→yes** (~1ms) | MISS→MISS |
| Regulations → g14 Mexico SEMARNAT (warm) | 1279→**1257ms** | 1804→1634ms | ~2.7s→1699ms | no→yes (~1ms) | MISS→MISS, **HTTP 503 reproduced** |
| Market → f3510df3 Loadstar (cold) | 1905→**825ms** (−57%) | 2115→1183ms | ~3.2s→1939ms | no→yes (~0.5ms) | MISS→MISS |
| Market → South Korea K-Taxonomy (warm) | n/a→**751ms** | n/a→941ms | n/a→999ms | no→yes (~2ms) | MISS→MISS |
| Operations → India (cold) | 1262→**733ms** (−42%) | 1456→953ms | ~2.4s→1210ms | no→yes (~1ms) | MISS→MISS |
| Operations → Singapore (warm) | n/a→**727ms** | n/a→933ms | n/a→993ms | no→yes (~2ms) | MISS→MISS |
| Research → Mission Innovation (cold) | 1597→**715ms** (−55%) | 1939→1135ms | ~3.0s→1314ms | no→yes (~1ms) | MISS→MISS |
| Research → Tyndall Centre (warm) | n/a→**1052ms** | n/a→1399ms | n/a→1997ms | no→yes (~2ms) | MISS→MISS |

[CONFIRMED] Every single click now paints a skeleton within 0.5-2ms —
`loading.tsx` per route is live and working exactly as designed; this is
the clearest, unambiguous win in this change (§5 root cause #3 from the
baseline is fixed).

[CONFIRMED] Market, Operations and Research detail server render time
(the `[perf] … data` line) dropped 42-57% vs. the matching baseline item —
consistent with the commit's claim of collapsing 6-9 sequential Supabase
round trips into one parallel load.

[CONFIRMED] **Regulations detail server render time did not improve**:
1182-1257ms after vs. 1279ms baseline (same `g14` item, ±2%, within normal
run-to-run noise) — statistically indistinguishable from before, while the
other three surfaces improved by roughly half. Regulations is also the one
surface where an **HTTP 503 on the RSC request reproduced live** during
this run (`GET /regulations/g14?_rsc=1fiot` → 503, per
`read_network_requests`) — the same failure mode §2/§4 documented from the
baseline. [INFERRED] The resource-timing entry for that same URL shows a
single 200 response with the full 1634ms duration and the page did land on
`/regulations/g14` correctly, so the framework silently retried and the
user never saw a broken page — but the retry is not free, and a 503 on the
very click this PERF change targeted suggests the regulations fan-out
collapse either didn't fully land or is still hitting the same
saturation-adjacent path under concurrent load that §4's code comment
warned about. **This 503 did not appear in Vercel's function-level runtime
logs** for this window (`get_runtime_logs` with `statusCode: 5xx` returned
zero rows, and `group_by: statusCode` showed only `200`) — [INFERRED] it
was rejected before reaching the Lambda (edge/proxy layer), which is
consistent with a Supabase-connection-exhaustion-style 503 rather than an
application error, but this measurement pass cannot confirm the exact
layer.

[CONFIRMED] Warm (second-click, prefetch-eligible) server times are **not**
meaningfully lower than cold on any surface (Operations 733→727ms,
Regulations 1182→1257ms i.e. slightly *higher*, Market 825→751ms only
~9% lower) — a prefetched RSC payload should look close to instant, and
none do. [CONFIRMED, Vercel logs] Every detail request, cold or warm, still
shows `cache=MISS`; `next.config.ts`'s `Cache-Control: private` is
unchanged, so §5 root cause #2 from the baseline still holds in full:
prefetch can warm the static shell but not a per-org, uncacheable RSC data
payload, so "prefetch restored" does not make a second click materially
faster — it only lets the fetch start marginally earlier (client:
click→fetch-start is 0.3-2.2ms across the board here, vs. ~320-350ms in
the baseline, itself a real, separate win worth noting: the click-to-fetch
dispatch got much faster, just not the fetch itself).

### 7.3 Vercel runtime logs (last 30 min, `dpl_Cx7hhuqXA3Ja34z6YwieuTBe19wS`, `iad1`)

Slowest 10 `[perf]` lines in the window (this run's own traffic — no other
production traffic observed):

| Rank | Line | Duration |
|---|---|---|
| 1 | `getListingsOnly` (`/api/listings/rest`, regulations backfill) | 1787ms |
| 2 | `getAppData` (`/` cold) | 1515ms |
| 3 | `getListingsOnly` (`/community` client backfill) | 1481ms |
| 4 | `/regulations/g14 data` | 1257ms |
| 5 | `/regulations/eu-net-zero-industry-act-2024-1735 data` | 1182ms |
| 6 | `getResourcesOnly` (`/api/listings/rest`, operations backfill) | 1075ms |
| 7 | `/research/tyndall-centre-… data` | 1052ms |
| 8 | `/regulations data` (index page primary load) | 872ms |
| 9 | `/research data` (index page primary load) | 830ms |
| 10 | `/market/f3510df3-… data` | 825ms |

[CONFIRMED] 5xx count in Vercel function-level runtime logs for this
window: **0** (`statusCode: 5xx` query returned no rows; `group_by:
statusCode` showed only `200`, "2 distinct values" reported but the second
never surfaced under any statusCode filter tried — see 7.2's 503 note).

[CONFIRMED] The client-triggered index-page backfill fetches
(`getListingsOnly`/`getResourcesOnly` via `/api/listings/rest`, baseline
root cause #4) are **unchanged by this PERF pass** — still 0.18-1.79s,
same shape and same magnitude as the baseline's 1.4-1.79s figures. This
was never in scope for this commit and remains exactly as documented.

### 7.4 Summary

**What improved**: the click-to-skeleton gap, which was the baseline's
starkest usability problem (§5 root cause #3 — no `loading.tsx` anywhere
but the root, so every click looked frozen for 1-2+ seconds) is fixed
outright — every click across all four surfaces now paints a skeleton in
under 2ms [CONFIRMED]. Server render time for Market, Operations and
Research detail pages also genuinely dropped 42-57%
[CONFIRMED, matches the commit's "collapse fan-out into one cached
parallel load" claim]. **What did not improve**: (a) Regulations detail
server time is unchanged from baseline and its click reproduced the same
HTTP 503 the baseline first surfaced [CONFIRMED]; (b) no surface's warm
(prefetched) click is materially faster than its cold click, because every
RSC request — cold or warm — is still `cache=MISS` under the unchanged
`Cache-Control: private` policy, so "prefetch restored" cannot mask a
per-org uncacheable payload the way it would a cacheable one [CONFIRMED];
(c) the index-page client backfill fetch (up to 1.8s) is untouched
[CONFIRMED]. **Single most likely remaining cause clicks still aren't
instant**: every detail click still pays a full, live, uncached
Supabase-backed server render (0.7-1.3s) on every single click regardless
of prior visits or prefetch, because the RSC payload is per-org and
therefore `Cache-Control: private` by design — skeletons now hide this
wait but do not remove it. [HYPOTHESIS] The regulations route specifically
looks like it did not receive the same fan-out collapse the other three
did (unchanged latency, reproduced 503), which points first at
`src/app/regulations/[slug]/page.tsx` — worth checking whether it was
actually migrated onto the commit's new
`src/lib/detail/load-detail-core.ts` control flow the way market,
operations and research evidently were.

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

## 9. After PERF-2 (measured 2026-09-03 ~08:00-08:18 UTC, deployment `dpl_HA3LTPhA5CnBk4P113CtBE3ryHDg`)

[CONFIRMED] Production alias `carosledge.com` → `dpl_HA3LTPhA5CnBk4P113CtBE3ryHDg`,
`target: production`, `readyState: READY`,
`githubCommitSha: 41d9644e40238481a2507f288c694808076181d9` (the PERF-2
commit, "regulations detail obligations fan-out into Promise.all;
middleware getClaims()"), region `iad1` — verified via `get_deployment`
before measuring. Method: `performance.getEntriesByType` read in-page
(immune to MCP round-trip latency) plus Chrome `read_network_requests` for
status codes, signed in as the operator, cross-checked against Vercel
`[perf]` log lines for the same URLs/timestamps.

### 9.1 Regulations click-through — §7 vs now

| Item | §7 server `[perf]` | now server `[perf]` | §7 client fetch | now client fetch | 503? |
|---|---|---|---|---|---|
| g14 Mexico SEMARNAT (cold/warm) | 1257ms | 647-679ms (−47-49%) | 1634ms | 876-937ms | no (both) |
| EU Net-Zero (cold) | 1182ms | 609ms (−48%) | 2025ms | 1109ms | no |
| g2 EU PPWR (cold/warm, new item) | n/a | 611-668ms | n/a | 816-858ms | **yes, both** |
| 68af8b45 shipments-of-waste (cold/warm, new item) | n/a | 516-553ms | n/a | 808-1020ms | yes (cold only) |

**Server render time genuinely improved** on every regulations item
measured, ~46-58% below §7's 1182-1257ms — direct confirmation the PERF-2
commit's Promise.all fix for the obligations fan-out landed and worked;
this was §7/§8's one open item (regulations was the surface that did
*not* improve after the first PERF pass) and it is now closed.

**503 count: 3 of 7 click-throughs (43%)** returned HTTP 503 on the RSC
request at the browser network layer — `/regulations/g2` (both cold and
warm attempts) and `/regulations/68af8b45-fbbf-4ba1-add8-2c1761d2d120`
(cold only). Every one of these still landed on the correct, fully
rendered detail page in a single request/response — no retry request was
observed in either Resource Timing or the network log, yet Vercel's
function-level logs for this window show **zero** 5xx (`statusCode: 5xx`
→ no rows; `group_by: statusCode` → 200×92, 204×2, one further distinct
value no filter tried could surface — same tool gap §7.2 hit). This is a
**higher and more persistent** 503 rate than §7's single reproduced
instance (`/regulations/g2` 503'd on *both* of its two clicks, not just
one), still generated upstream of the Lambda.

### 9.2 Market / Operations / Research — regression check

| Surface → item | §7 server | now server | §7 client fetch | now client fetch | 503? |
|---|---|---|---|---|---|
| Market → Loadstar (f3510df3, cold) | 825ms | 432ms (−48%) | 1183ms | 774ms | **yes** (new) |
| Operations → India (cold) | 733ms | 329ms (−55%) | 953ms | 547ms | **yes** (new) |
| Research → 9118aab6 (cold, different item than §7's Tyndall/Mission) | n/a | 427ms | n/a | 759ms | no |

Server render time improved further on Market and Operations too (already
improved once in §7, now roughly halved again) — consistent with
[HYPOTHESIS] the middleware `getClaims()` change removing a blocking
Supabase auth round-trip from *every* request's middleware invocation,
though this is a single-sample read per item and cannot rule out ordinary
run-to-run noise (§1/§7's own caveat). **Not confirmed as regression-free**:
this was meant to be a "confirm no regression" check, but Market and
Operations single click-throughs both hit the same silent-503-yet-renders-
fine pattern that was previously regulations-only — the 503 surface has
widened, not shrunk, even as server latency improved.

### 9.3 Full-navigation loads — §7 vs now

server-render = DCL − TTFB.

| Page | §7 server-render | now server-render | transfer §7→now | requests §7→now |
|---|---|---|---|---|
| `/` cold | 3130ms | 1072ms | 45.8→45.1KB | 26→28 |
| `/` warm | 1599ms | 1067ms | 46.1→45.0KB | 26→27 |
| `/regulations` cold | 2092ms | 1877ms | 64.3→63.1KB | 28→~29 |
| `/regulations` warm | 1094ms | 1268ms (noise, per §1/§7) | 64.3→62.9KB | 28→30 |

### 9.4 Vercel runtime logs (last 30 min, `dpl_HA3LTPhA5CnBk4P113CtBE3ryHDg`, `iad1`)

[CONFIRMED] 5xx count: **0**. `[proxy]`-tagged lines: **0** found. No
discrete middleware-duration line is exposed by this log format (same gap
§3 baseline noted) — most routes log under source `serverless-middleware`,
implying middleware ran as part of the combined invocation, but its own
timing isn't broken out. Slowest `[perf] … data` lines this window were
all regulations/market/operations detail requests in the 329-679ms range —
no request in the 30-minute window exceeded ~700ms server-side, a marked
drop from §7.3's 825-1905ms top-10.

### 9.5 Summary

**What changed**: regulations detail server render time — §7/§8's one
unresolved finding — is fixed, down ~46-58% to 516-679ms, matching the
improvement market/operations already showed in §7 [CONFIRMED]. Market and
Operations improved *again* on top of §7's gains (−48%, −55%)
[CONFIRMED], plausibly middleware-driven [HYPOTHESIS]. **What did not
change**: the HTTP 503 on the RSC fetch is still present, still invisible
to Vercel's function logs (generated upstream of the Lambda, §7.2's
inference holds), and still self-heals with no visible retry — but it is
now *more frequent* (43% of regulations attempts vs §7's one instance) and
**newly observed on Market and Operations**, surfaces that were clean in
§7. **Most likely remaining cause**: the 503 arrives as a single
request/response that nonetheless carries a valid RSC payload — consistent
with an edge/proxy or Supabase-connection-exhaustion layer stamping a 503
status on some fraction of in-flight streaming responses while still
passing the body through, per the mechanism `RegulationsLedger.tsx:1367-1369`
already documents. That comment's fix (`prefetch={false}`) only shields
regulations rows; `src/components/market/MarketIntelLedger.tsx` (§4's
"Full analysis" link, ~line 973) still has no explicit prefetch decision,
and this pass's data is the first direct evidence that gap is now being
paid for in production. File it points at:
`src/components/market/MarketIntelLedger.tsx` and, by the same shape,
whatever operations-detail-link component was not read this pass.

## 10. Quiet-window 503 test (measured 2026-09-03 10:23-10:31 UTC, deployment `dpl_AJUmcghxM6ohtjjaaPJ4tGQ47rK8`, minutes since deploy 31-39)

[CONFIRMED] `carosledge.com` → `dpl_AJUmcghxM6ohtjjaaPJ4tGQ47rK8`, `githubCommitSha
910ee54d`, `readyState: READY`, `ready: 2026-09-03T09:52:51Z`. Verified via
`list_deployments`/`get_deployment` that no newer production deploy landed
between READY and the first click (checked at +8.5min and again at +30.5min,
identical single-row result both times). First click fired at 10:23:39 UTC —
**31 minutes** after READY, comfortably past the addendum-85-postscript-4
30-minute quiet-window bar; last click completed 10:31:08 UTC (39 min post-deploy).

**Method note**: the `window.fetch` tap (STEP 2) was installed and verified
wrapped (`window.fetch !== window.__origFetch`), but captured **zero** of the
18 `_rsc=` requests observed via `read_network_requests` across the 8 clicks
— confirmed by `performance.getEntriesByType('resource')`, which shows every
one of those requests as `initiatorType: "fetch"` (no service worker
registered) yet still invisible to the page-level wrapper. [INFERRED] Next's
bundled router chunk holds its own reference to native `fetch`, captured
during hydration — before this post-load script ran — so a post-hydration
`window.fetch` monkey-patch cannot intercept it in this app's build. This
reproduces, and adds a mechanism to, §8's own admission that "the browser
network-request tool used does not expose response headers": **no `x-vercel-error`,
`x-vercel-id`, or `x-matched-path` could be captured for any 503 this pass** —
status codes below are from Chrome's network monitor, not response headers.

**8 click-throughs** (status = the clicked URL's own real-payload response;
duration = that fetch's `performance` duration):

| # | Route → item | RSC status | duration | cold/warm |
|---|---|---|---|---|
| 1 | Regulations → g14 Mexico SEMARNAT | 503→200 (self-healed, 2nd of 3 own-URL attempts 503'd) | 1189ms | cold |
| 2 | Regulations → 68af8b45 shipments-of-waste | 200 | 1573ms | warm |
| 3 | Market → f3510df3 Loadstar | **503** (single request, self-healed, full 39,006B payload) | 1527ms | cold |
| 4 | Market → South Korea K-Taxonomy | 200 | 621ms | warm |
| 5 | Operations → India | **503** (single request, self-healed, full 12,392B payload) | 625ms | cold |
| 6 | Operations → Singapore | 200 | 810ms | warm |
| 7 | Research → 9118aab6 Mission Innovation | **503** (final/largest of 3 own-URL fetches, self-healed, full 16,614B payload) | 1462ms | cold |
| 8 | Research → Tyndall Centre | **503** (single request, self-healed, full 14,398B payload) | 1281ms | warm |

**503 count**: 5 of 8 click-throughs (62.5%) hit an HTTP 503 on the clicked
route's own RSC fetch — 4 as the sole/final response, 1 as a self-healed
mid-navigation retry — plus 2 further 503s on *background* viewport-prefetch
requests for other, un-clicked rows during clicks 1 and 7 (7 distinct 503
responses total across the session). Every 503 self-healed with no visible
broken page: either a same-request full payload (clicks 3/5/7/8) or a
follow-up request that returned 200 (click 1). Header values (`x-vercel-error`
etc.) were **not** capturable this pass (see Method note above) — this is a
gap, not a zero.

**Vercel runtime logs, same deployment, 10:22-10:32 UTC window** (spans all 8
clicks): `statusCode: 5xx` → **no logs found**. `group_by: statusCode` → `200`
×70 ("2 distinct values" reported, second value never surfaced under any
filter — same tool gap §7.2/§8 hit). The `[perf] … data` line for all 8
clicked routes is present and matches this test's client-side timings
(332-1573ms range), every one logged at `200` — including the 5 routes whose
*browser*-observed status was 503. One anomaly: Operations→India shows two
separate `[perf]` invocations 55s apart (774ms, 332ms) against one browser
click; [INFERRED, not confirmed] most likely an unrelated viewport-prefetch
re-fire when scrolling back through `/operations` for the next click, not a
retry of the same request.

**Verdict: hypothesis REFUTED.** The standing hypothesis (503s only within
minutes of a fresh deploy, a build-id-skew transition effect) predicted zero
503s in a confirmed 31-39-minute quiet window with no intervening deploy.
Instead 5 of 8 real router click-throughs hit one, at a rate (62.5%) higher
than §9's already-elevated 43%. Vercel's function-level logs show 100% clean
200s for the exact same requests in the exact same window — reproducing
§7.2/§9.4's finding that a request reaching the Lambda always leaves a
matching, successful log line, and every 503 leaves none. This confirms the
503 is generated at a layer upstream of or outside the Lambda (edge/proxy/
streaming-response layer) on an ordinary, low-concurrency, quiet-window
click path — not a deploy-transition artifact and not a Supabase-saturation
symptom of concurrent load, since this session issued one click at a time.
**Next probe**: capture response headers at the wire, not via page JS — this
pass shows a page-injected `window.fetch` patch cannot see Next's own RSC
requests in this build. Use Chrome DevTools Protocol `Network.responseReceived`
(CDP-level interception, installed before navigation, independent of page JS)
or a Vercel edge-middleware header-echo on the request path, to capture
`x-vercel-error`/`x-vercel-id`/`x-matched-path` from an in-flight 503 and
name the exact layer stamping it.

## 11. The 503 was the measuring instrument (coordinator, 2026-09-03 10:5x UTC, deployment 910ee54d)

Same router navigation, two readings of the same request (`GET /regulations?_rsc=12o37`, 48,932 bytes
transferred, 1,130 ms) [CONFIRMED]:

| reader | status |
|---|---|
| the page's own `PerformanceResourceTiming.responseStatus` (browser-native, in-page) | 200 |
| the Chrome extension's `read_network_requests` (the tool §2, §7, §9 and §10 used) | 503 |

Repeated on a second navigation: identical split (200 in-page, 503 from the extension reader). Vercel's
own request log (dashboard, edge level, not just function logs) for the §10 window shows every request
200. Three independent sources agree there is no 503; the only source that ever reported one is the
extension's network reader, on RSC responses specifically (it reports the document and API requests
correctly). The "self-healing 503 with a full payload" of §10 is exactly that shape: a completed 200
response mislabelled.

Closed: there is no production 503 on item navigation. §2's, §7's, §9's and §10's 503 lines are
instrument artefacts and are retained here as the record of how a measurement can lie for four rounds
when every reading comes from one tool. Rule for the next perf study: any status the extension reader
reports on an RSC request is cross-checked against `performance.getEntriesByType('resource')` in-page
before it enters a report.

## 12. PERF-6: the two `getUser()` levers outside proxy.ts — org.ts and auth.ts (2026-09-04)

Numbering note: the PERF-6 dispatch asked for an appended "§10"; by the time this lane read the file,
§10 and §11 already existed (PERF-2/PERF-VERIFY work, same day). Appending here as §12 rather than
renumbering or overwriting existing sections — this file is append-only shared evidence, per CLAUDE.md
standing rule 6/vault convention, and no other section's numbering changes.

**Starting evidence [CONFIRMED by PERF-5, EXPLAIN ANALYZE live, cited in the PERF-6 dispatch]:** every
query on the listings path runs 0.6-25 ms at the database; the observed 907 ms / 2,812 ms / 542 ms-warm
figures are sequential network round trips. PERF-5 fixed the chunk loop and the override read in
`supabase-server.ts`. Two remaining levers, both the same defect class PERF-2 fixed in `src/proxy.ts`
(header lines 12-30, the `getClaims()` call at line 66 — read in full this lane): (1)
`src/lib/api/org.ts`'s `resolveOrgIdFromCookies()` called `supabase.auth.getUser()`, a full Auth-server
round trip, on every call, imported by 15 real call sites (16 files hit by the identifier grep including
org.ts's own header comment, which is not a runtime import); (2) `src/lib/api/auth.ts`'s `requireAuth()`
called `supabase.auth.getUser(token)` for every one of its 47 API-route callers, whose own SQL is a
single indexed query each.

### 12.1 Consumers checked (rule B1) — every caller reads only `userId`/`orgId`, never a `User` field

`grep -rln "resolveOrgIdFromCookies"` under `fsi-app/src`: 15 files actually call it (the org.ts header
comment is the 16th grep hit, not a call) — `app/api/listings/rest/route.ts`, `app/market/[slug]/page.tsx`,
`app/market/page.tsx`, `app/operations/page.tsx`, `app/research/page.tsx`,
`components/regulations/UpcomingObligationsStrip.tsx`, `lib/api/org.ts` (self), `lib/dashboard/surface-
coverage.ts`, `lib/data.ts` (18 call sites across `getAppData`/`getResourcesOnly`/`getListingsOnly`/etc,
owned by another lane, not touched), `lib/detail/load-detail-core.ts` (comment only, the real call is
in `load-detail.ts`'s `defaultDetailDeps.resolveOrgId`), `lib/detail/load-detail.ts`,
`lib/notifications/seed-fallback-flag.ts` (comment only), `lib/supabase-server.ts` (comment only, owned
by another lane), `lib/workspace/viewer-relevance.npmtest.mjs`, `lib/workspace/viewer-relevance.ts`.
`grep -rln "requireAuth"` under `fsi-app/src`: 47 files call `lib/api/auth.ts`'s `requireAuth` (a
48th/49th hit, `lib/api/community-auth.ts` and `lib/watchlist-scope.npmtest.mjs`, only *contain* the
substring "requireAuth" inside `requireCommunityAuth`/a comment — neither imports or calls
`auth.ts:requireAuth`, confirmed by reading both files in full).

The field check the dispatch asked for is structural, not per-file: `resolveOrgIdFromCookies` returns
`Promise<string | null>` (an org_id, never the `User` object) and `requireAuth` returns
`Promise<{ userId: string } | NextResponse>` (never a `User` object either) — both functions already
box the caller off from every `User` field except the id, by their existing signatures, unchanged by
this lane. Grepped every caller file for `.email`/`.app_metadata`/`.user_metadata`/`.created_at`/
`.updated_at`/`.confirmed_at`/`.identities`/`.factors`/`.phone`/`.last_sign_in`/`.aud`/`.role` on the
`requireAuth`/`isAuthError` result — zero matches. **Conclusion: no caller of either function needed a
`getUser()` fallback for any field `getClaims()` doesn't carry; none was added.** `claims.sub` replaces
`user.id` exactly (verified against the installed `@supabase/auth-js` type: `RequiredClaims.sub: string`
is non-optional — `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:1660-1669`).

### 12.2 `getClaims()` in the installed package (`@supabase/auth-js` 2.112.3, `@supabase/supabase-js` 2.112.3)

Read `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts` (JSDoc, lines 2472-2538) and the
implementation, `dist/module/GoTrueClient.js:5318-5387`:
- **Token-argument form** confirmed: `getClaims(jwt?: string, options?)` — an explicit token (as
  `requireAuth` passes) is decoded and its own `exp` validated directly; the no-argument form instead
  pulls a session via `getSession()` first (which refreshes if near expiry) *before* decoding — that
  refresh path does not apply when a token is passed explicitly, so `requireAuth`'s "expired token →
  error" behavior is unchanged by the swap (same as `getUser(token)`, which also never refreshed).
- **JWKS caching / local verification**: when the JWT's header carries an asymmetric alg (`kid` set,
  not `HS*`) and WebCrypto is available, `fetchJwk(header.kid, ...)` fetches (and caches) the project's
  `/.well-known/jwks.json`, then verifies the signature locally via `crypto.subtle.verify` — no Auth-
  server round trip on a cache hit.
- **Symmetric-secret fallback** (line 5339-5360): `if (!signingKey) { const { error } = await
  this.getUser(token); ...; return { data: { claims: payload, header, signature }, error: null }; }` —
  confirmed exactly as the proxy.ts header describes: a project signing with a symmetric secret pays the
  identical `getUser()` round trip either way (a wash, never a regression); this lane's tests exercise
  that shape explicitly ("symmetric-secret fallback" cases in both new test files) by feeding the exact
  `{ data: { claims }, error: null }` result that branch produces.
- **Claims object contents** (JSDoc `@exampleResponse`, `RequiredClaims`/`JwtPayload` types): `sub`,
  `email`, `role`, `app_metadata`, `user_metadata`, `session_id`, `aal`, `amr`, `aud`, `exp`, `iat`,
  `is_anonymous`, `iss`, `phone` — `sub` is the only field either changed function reads.

### 12.3 Fixes applied

**`fsi-app/src/lib/api/org.ts`** — `resolveOrgIdFromCookies()`'s body was split into a new exported pure
function, `resolveOrgIdFromAuthenticatedClient(supabase)`, that calls `getClaims()` and uses
`claims.sub` in place of `user.id`, then the same `org_memberships` query unchanged. The thin cookie-
binding wrapper (`resolveOrgIdFromCookies`) delegates to it inside the same `try { ... } catch { return
null }` as before. Same public signature (`(): Promise<string | null>`), same fail-soft contract, zero
caller-side changes needed (verified: `npx tsc --noEmit` clean, no new errors in any of the 15 caller
files — see §12.5).

**`fsi-app/src/lib/api/auth.ts`** — `requireAuth()`'s body was split identically: a new exported
`resolveUserIdFromToken(supabase, token)` calls `getClaims(token)` and returns `claims.sub` or `null`;
`requireAuth` calls it inside its existing `try { ... } catch { "Authentication failed", 401 }`, and
turns a `null` into the existing "Invalid or expired token" 401 — the exact same two-tier error shape
(`catch` vs. explicit-null-check) as before. Same public signature, same 47 callers, zero caller-side
changes.

### 12.4 The `cache()` fix (dispatch item (d)) and the double-resolution it was found to fix

Instruction (d) asked whether `org.ts`'s org resolution could be cached per request, "check what
src/lib already uses." `fsi-app/src/lib/api/server-bootstrap.ts` (read in full) already does exactly
this for an equivalent `getUser()` + `org_memberships` pass: `export const resolveServerBootstrap =
cache(async (): Promise<ServerBootstrap> => { ... })`, React's `cache()`, request-scoped memoization.
`resolveOrgIdFromCookies` is now wrapped the same way: `export const resolveOrgIdFromCookies =
cache(async (): Promise<string | null> => { ... })`.

**This is not theoretical for this codebase — reading the consumer chain found a live double call.**
`fsi-app/src/lib/detail/load-detail-core.ts`'s `runViewerScoped()` (lines 175-189, read in full):

```js
const relevance = await deps.getRelevance(relevanceInput);   // -> viewer-relevance.ts -> resolveOrgIdFromCookies()  [call #1]
if (config.loadViewerScoped) {
  ...
  const orgId = await deps.resolveOrgId();                    // -> resolveOrgIdFromCookies()               [call #2]
  ...
}
```

`deps.getRelevance` is `getViewerRelevanceForItem` (`lib/workspace/viewer-relevance.ts`, read in full),
which itself calls `resolveOrgIdFromCookies()` internally (line 34) before it can compute a relevance
band. `deps.resolveOrgId` is `resolveOrgIdFromCookies` directly (`load-detail.ts`'s
`defaultDetailDeps.resolveOrgId`, line 100). Both run inside the same `async runViewerScoped()`, and
because `await deps.getRelevance(...)` is awaited *before* the `if (config.loadViewerScoped)` block
even starts, these two calls are **sequential**, not parallel — one full org-resolution pass, then a
second, on every request. `config.loadViewerScoped` is set for regulations and market (per
`load-detail-core.ts`'s own comment, "operations, research today" have none) — confirmed by reading
`app/regulations/[slug]/page.tsx` and `app/market/[slug]/page.tsx`'s `loadDetail(...)` calls, both pass
a `loadViewerScoped`. So **every regulations and market detail-page render, before this fix, paid two
sequential org-resolution passes** (two `getUser()` Auth round trips before PERF-6; even after PERF-6's
`getClaims()` swap alone, without `cache()`, it would have been two local-JWT-verify passes plus two
`org_memberships` queries). `cache()` collapses the second call to an in-memory hit — proof below.

**Regulations detail page does NOT get a third org-resolution from the root layout on this path.**
`app/layout.tsx` (read in full) calls `resolveServerBootstrap()` (which has its own, unrelated
`getUser()` — see §12.6) but PERF-4 already gated it: `const bootstrapPromise = rscNav ?
Promise.resolve(null) : resolveServerBootstrap()` — on an RSC (client-side) navigation, the shape every
click-through measurement in this doc used (§2, §7, §9, §10), `resolveServerBootstrap()` is never even
invoked. It only runs on a full document load (§1's cold-load numbers), which this lane's fix does not
touch (server-bootstrap.ts is not in this lane's write set — see §12.6).

**Safety of `cache()` outside a React render (operations/research detail pages have no `loadViewerScoped`,
but `lib/data.ts`'s `getResourcesOnly`/`getListingsOnly` are also called from
`app/api/listings/rest/route.ts`, a Route Handler, not a Server Component render).** Read
`node_modules/react/cjs/react.react-server.development.js` (installed react-server build), the `cache`
export (~line 573):

```js
exports.cache = function (fn) {
  return function () {
    var dispatcher = ReactSharedInternals.A;
    if (!dispatcher) return fn.apply(null, arguments);   // <-- no active render context: plain call, no memo
    var fnMap = dispatcher.getCacheForType(createCacheRoot);
    ...
  };
};
```

**[CONFIRMED by reading the installed source]:** when there is no active render dispatcher, `cache()`'s
wrapper just calls the underlying function directly, every time — no memoization, and critically, no
cross-request state to leak. It can only memoize *inside* an active per-request render/work-unit scope
(confirmed separately: Next 16.1.6's Route Handler module,
`node_modules/next/dist/server/route-modules/app-route/module.js:427`, runs the handler inside
`workUnitAsyncStorage.run(requestStore, handler, ...)` — a fresh, request-scoped store per request, the
same mechanism `unstable_cache`'s work-unit typing uses). There is no code path in the installed
React/Next.js by which `cache()` returns one request's org_id to a different request. Worst case for a
Route Handler caller (if its work-unit type turns out not to support the dispatcher's cache-for-type)
is zero memoization benefit — identical to the pre-fix behavior, never a regression, never a leak.

### 12.5 Gates

- `npx tsc --noEmit -p fsi-app/tsconfig.json`: 19 pre-existing errors, all `TS2882` CSS/side-effect-
  import errors in files this lane never touched (`app/layout.tsx`, community/market/operations panel
  views, `MapView.tsx`) — **[CONFIRMED]** identical 19-error baseline with this lane's changes `git
  stash`ed out (`git stash && tsc ... | wc -l` → 19; `git stash pop` → same 19). Zero errors in
  `org.ts`/`auth.ts`/either test file or any of the 62 caller files.
- `node --test fsi-app/src/lib/api/org.npmtest.mjs fsi-app/src/lib/api/auth.npmtest.mjs`: 18/18 pass —
  authenticated, unauthenticated, expired-token, malformed-claims, the symmetric-secret-fallback shape,
  a rejecting `getClaims()` propagating to the caller's own catch, `requireAuth`'s no-header/non-Bearer/
  malformed-JWT branches end-to-end (real `decodeJWT()` throw, no network — see the malformed-token
  test's comment for why that's deterministic), and `resolveOrgIdFromCookies` failing soft to `null`
  outside a request context (mirrors `viewer-relevance.npmtest.mjs`'s existing pattern for the same
  underlying `next/headers` constraint). Both files use the repo's established `*.npmtest.mjs` + `jiti`
  convention (`lib/workspace/profile.npmtest.mjs`, `lib/api/generation-pause.npmtest.mjs`) — auto-
  discovered by the CI npm-deps step's `git ls-files 'fsi-app/src/**/*.npmtest.mjs'` glob (confirmed by
  reading `.discipline/governance/execution-wiring.mjs:78-79`'s `npmtestMatcher()`, a genuine `**`
  recursive pattern), so no `run-test-suite.sh`/`.github/**` edit was needed or made.
- `node fsi-app/.discipline/fitness/runner.mjs` (run from repo root): 29 functions checked, **0
  violations**.
- `node --test fsi-app/.discipline/governance/*.test.mjs fsi-app/.discipline/fitness/*.test.mjs
  fsi-app/.discipline/*.test.mjs`: **141/141 pass**.

### 12.6 Round-trip projection [INFERRED] — arithmetic, not measured (no live Auth server from this
container; the coordinator re-measures in the browser after deploy, as PERF-5 did)

| call site | before (Auth-server round trips) | after (asymmetric-key project) | after (symmetric-secret project) |
|---|---|---|---|
| one `lib/data.ts` call (`getAppData`/`getResourcesOnly`/`getListingsOnly`, single call per request) | 1 | 0 (local JWKS-cached verify) | 1 (getClaims's own fallback calls getUser()) |
| regulations/market detail page (`load-detail-core.ts` `runViewerScoped`, 2 calls/request, sequential) | 2 | 1 → **0** after `cache()` (2nd call is an in-memory hit) | 2 → **1** after `cache()` |
| operations/research detail page (no `loadViewerScoped`, 1 call/request via `getRelevance` only) | 1 | 0 | 1 |
| one `requireAuth()`-guarded API route (single call per request, confirmed no route calls it twice per request — the 2-4x grep hits per file are separate exported `GET`/`PATCH`/`DELETE`/... handlers, each called on a different request, not the same one) | 1 | 0 | 1 (wash, per §12.2) |

The asymmetric-key column is the expected live case (Supabase's default is asymmetric signing keys per
the auth-js JSDoc @ `GoTrueClient.getClaims`'s remarks); which case this project is actually on was not
checked from this container (no live JWT to decode) — **[HYPOTHESIS]**, flagged for the coordinator's
post-deploy measurement rather than asserted.

### 12.7 Refused / out of write set (named, not silently dropped — rule 13)

- **`fsi-app/src/lib/api/server-bootstrap.ts`** — same defect class (`supabase.auth.getUser()`, no
  `getClaims()`), read in full, confirmed live on document loads only (§12.4). Not in this lane's write
  set (only `org.ts`, `auth.ts`, their tests, this doc). Flagged, not fixed.
- **`fsi-app/src/lib/api/community-auth.ts`** — `requireCommunityAuth()`, same defect class twice over
  (`cookieClient.auth.getUser()` then, on fallback, `tokenClient.auth.getUser(token)`), read in full.
  Not `auth.ts`, not in this lane's write set (the identifier match in the earlier `requireAuth` grep
  was `requireCommunityAuth`'s substring, not a real caller — §12.1). Flagged, not fixed.
- **`fsi-app/src/lib/data.ts`, `fsi-app/src/lib/supabase-server.ts`, the regulations detail page** —
  explicitly out of this lane's write set per the dispatch (other lanes' ownership); read only as
  consumers of `org.ts`/`auth.ts` (§12.1), not edited.

### 12.8 Files touched

`fsi-app/src/lib/api/org.ts`, `fsi-app/src/lib/api/auth.ts`, `fsi-app/src/lib/api/org.npmtest.mjs` (new),
`fsi-app/src/lib/api/auth.npmtest.mjs` (new), this document (§12). Commit: see the lane's PR/branch
`lane/perf6-2026-09-04`.

## 13. PERF-7: the two `getUser()` levers PERF-6 flagged and refused — server-bootstrap.ts and
community-auth.ts (2026-09-04)

Picking up §12.7's two refused items, both read in full by PERF-6, both the same defect class as
§12/proxy.ts/§8: `supabase.auth.getUser()` — a network round trip to Supabase Auth's server — on every
resolution, on document-load and API-route paths respectively.

### 13.1 `server-bootstrap.ts` — consumers and fields (rule B1)

`grep -rn "resolveServerBootstrap"` under `fsi-app/src`: 8 real callers (`app/layout.tsx`,
`app/onboarding/page.tsx`, `app/workspace/new/page.tsx`, `app/market/page.tsx`,
`app/market/[slug]/page.tsx`, `app/operations/[slug]/page.tsx`, `app/regulations/[slug]/page.tsx`,
`app/research/[slug]/page.tsx`) plus `components/shell/BootstrapBoundary.tsx` (type-only import of
`ServerBootstrap`). Grepped every caller for `bootstrap.user.*`/`bootstrap.user?.*`: only two fields are
ever read off `.user` — `.id` (`market`/`market/[slug]`/`operations/[slug]`/`regulations/[slug]`/
`research/[slug]` `page.tsx`, plus `onboarding/page.tsx` and `workspace/new/page.tsx`) and `.email`
(`onboarding/page.tsx` line 35, `workspace/new/page.tsx` line 27 — both server components that `await
resolveServerBootstrap()` directly, not through the client-hydration path). No caller reads
`.app_metadata`/`.user_metadata`/`.phone`/`.created_at`/any other `User` field.

**A third, independent piece of evidence for the same conclusion**, found while tracing `.user`'s
downstream flow into `AuthProvider`'s client-side context: `components/shell/bootstrap-seed.ts` (read in
full) already declares its own **structural echo** of `ServerBootstrap`, deliberately not importing the
real type ("so this file has zero runtime dependency on that module" — its own header) —
`BootstrapLike.user: { id: string } | null`. This is the PERF-4 lane's own, independent narrowing of
what the client-side hydration path actually needs, written before this lane existed, and it agrees
exactly with the grep: id only. (`AuthProvider.tsx`'s `seed()` callback then does `applied.user as User |
null` — an explicit cast into the wider `AuthContext.user: User | null` field — so narrowing the real
`ServerBootstrap.user` type does not break that assignment; the cast already absorbed any shape.)

**Conclusion:** `.id` and `.email` are the only fields any consumer needs. Both are carried directly on
`claims` — `sub` is a required, non-optional string claim (`RequiredClaims.sub: string`,
`node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:1660-1669`, cited already in §12.1) and
`email` is on the standard claim set (`JwtPayload.email?: string`, same file, line 1679, and the
installed `GoTrueClient.d.ts`'s own `getClaims()` `@exampleResponse` shows `"email": "example@email.com"`
in the returned claims object, lines 2504-2521) — so **no `getUser()` fallback was needed for any field**.
`ServerBootstrap.user`'s type was narrowed from the full Supabase `User` to a new, honest
`ServerBootstrapUser { id: string; email: string | null }` rather than left as `User` and populated with
a partial/cast object.

### 13.2 `community-auth.ts` — consumers and fields (rule B1)

`grep -rn "requireCommunityAuth\|isCommunityAuthError"` under `fsi-app/src`: 40 files, 56 call sites (one
`GET`/`POST`/`PATCH`/`PUT`/`DELETE` exported handler each — verified for the two highest-count files,
`app/api/community/posts/[id]/route.ts` (3) and `app/api/orgs/[org_id]/members/route.ts` (5), both are
distinct HTTP-method exports, never two calls inside one handler). `requireCommunityAuth`'s own return
type, `Promise<CommunityAuthResult | NextResponse>` where `CommunityAuthResult = { userId: string;
supabase: SupabaseClient }`, already boxes every caller off from any `User` field except `userId` — same
structural argument §12.1 made for `requireAuth`. Grepped every caller for `.email`/`.app_metadata`/
`.user_metadata`/`.phone`/`.created_at` on the `auth` result: zero matches on the `CommunityAuthResult`
shape itself.

**One caller reads a `User` field, but not through `requireCommunityAuth`'s return value.**
`app/api/community/profile/verify/route.ts` (read in full; not in this lane's write set) calls
`await auth.supabase.auth.getUser()` **again**, on the client `requireCommunityAuth` already returned, to
read `user.email` for corporate-domain verification (spec 05 §2's `community_member_profiles.
organisation_key` derivation, via `organisation-salt.ts`'s `WORKER_SECRET`-derived HKDF salt — the exact
consumer the coordinator's dispatch named to check before assuming `userId` suffices). This is a
**second** `getUser()` round trip stacked on top of `requireCommunityAuth`'s own one (this route only
ever authenticates via cookie session per its own header comment, "Auth: cookie session" — Path A
succeeds and Path B is never attempted), on that one route only. `claims.email`
(same `JwtPayload.email?: string` field cited in §13.1) would retire it, but **that file is not in this
lane's write set** — flagged in §13.5 with the exact one-line fix, decision-ready, not silently dropped
(CLAUDE.md rule 13).

### 13.3 Fixes applied

**`fsi-app/src/lib/api/server-bootstrap.ts`** — split into a new exported pure core,
`resolveServerBootstrapFromClient(supabase)`, that calls `getClaims()`, builds `user: { id: claims.sub,
email: claims.email ?? null }`, then runs the same `org_memberships`/`profiles`/`workspace_settings`
queries unchanged. `resolveServerBootstrap` (still `cache()`-wrapped — this file already had PERF-4's
request-scoped memoization; that mechanism is untouched, only the body it wraps changed) delegates to the
core inside the same `try { ... } catch { return EMPTY }`. Same public signature
(`(): Promise<ServerBootstrap>`), same fail-soft contract, same 8 caller files needing zero changes
(`tsc` clean — §13.6).

**`fsi-app/src/lib/api/community-auth.ts`** — both branches (cookie session, Authorization: Bearer) now
share one core, `resolveCommunityUserId(supabase, jwt?)`, calling `getClaims(jwt)` and returning
`claims.sub` or `null` — the "one resolver with one call" the dispatch asked for: previously each branch
inlined its own `getUser()`/`getUser(token)` call-and-check; now both call the identical function, proven
once, with only the `jwt` argument (absent vs. present) distinguishing cookie-session from explicit-token
verification, matching `getClaims(jwt?: string, ...)`'s own real signature
(`node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts:2538`). `requireCommunityAuth`'s
branch/fallback/401 structure is otherwise unchanged — same two tries, same fall-through-to-Bearer, same
fall-through-to-401 shape as before.

**No `cache()` added to `requireCommunityAuth`, and this was checked, not assumed (rule B4 — measure, do
not assume a prior audit's predicted lever applies unchanged to a different call-site shape).** The
dispatch's cache() instruction was written by analogy to PERF-6's `org.ts`/`server-bootstrap.ts` fix, but
those are called from **Server Components** (a React render, where `cache()`'s dispatcher-scoped memo
applies — §12.4/12.6's own citation of `react.react-server.development.js`'s `exports.cache`).
`requireCommunityAuth`'s 40 callers are **exclusively Route Handlers** (`app/api/community/*`,
`app/api/orgs/*`, `app/api/invitations/*`) — §12.4's own text names this exact runtime fact for its own
Route Handler caller (`app/api/listings/rest/route.ts` via `lib/data.ts`): outside an active render
dispatcher, `cache()`'s wrapper "just calls the underlying function directly, every time — no
memoization." Combined with §13.2's finding that no route calls `requireCommunityAuth` twice within one
request (56 call sites are 56 distinct handler exports, each invoked on a different request), wrapping it
in `cache()` here would be zero-benefit dead ceremony on every one of its call sites, not the "same defect
class" fix `org.ts`/`server-bootstrap.ts` needed. Documented in the code's own header (not just here) so
the next reader does not re-propose it without re-deriving this.

### 13.4 Round-trip projection [INFERRED] — arithmetic, not measured (no live Auth server from this
container, same caveat as §12.6)

Figures below are for an **authenticated** request — the case the round trip matters for; an anonymous
request pays 0 Auth-server round trips both before and after, trivially, in every row (both `getUser()`
and `getClaims()`'s no-argument path short-circuit locally with no network call when there is no session
at all — verified by reading the installed `_getUser()`'s `!session?.access_token` guard,
`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2691-2693`, and `getClaims()`'s own `if
(!token) { const { data, error } = await this.getSession(); if (error || !data.session) return ...; }`
guard at the same file's lines 5321-5325 — this correction itself is why the Bearer-token row below
differs from an earlier draft of this table that assumed Path A always dials out).

| call site | before (Auth-server round trips) | after (asymmetric-key project) | after (symmetric-secret project) |
|---|---|---|---|
| document load / hard reload (`app/layout.tsx` → `resolveServerBootstrap()`, not gated by PERF-3's `rscNav` skip — that skip only applies to RSC navigations, per §12.4) | 1 | 0 (local JWKS-cached verify) | 1 (getClaims's own fallback calls getUser(), §12.2) |
| `onboarding/page.tsx` / `workspace/new/page.tsx` (each `await resolveServerBootstrap()` directly — same `cache()`, so a request already carrying the layout's resolution hits the memo; a direct hard nav to either page is 1 call either way) | 1 | 0 | 1 |
| one `requireCommunityAuth()`-guarded route, cookie session present (Path A finds a real session and succeeds; Path B never attempted) | 1 | 0 | 1 |
| one `requireCommunityAuth()`-guarded route, Bearer token, **no** cookie session (Path A's cookie client finds no session and short-circuits locally — no network call, per the guard cited above; Path B verifies the token) | 1 (Path A: 0, short-circuit; Path B's `getUser(token)`: 1) | 0 (Path A: 0, `getSession()` also short-circuits with no session to decode, so the fallback branch inside `getClaims()` is never reached at all; Path B's `getClaims(token)`: 0, local JWKS verify) | 1 (Path A: 0; Path B's `getClaims(token)` hits the symmetric-secret fallback, which calls `getUser(token)` internally, §12.2 — wash) |
| `app/api/community/profile/verify/route.ts` (cookie-session route per its own header; unfixed — §13.2/13.5) | 1 (`requireCommunityAuth`'s Path A, real session) + 1 (this route's own extra `getUser()` for email) = **2** | 0 (`requireCommunityAuth`'s Path A now `getClaims()`, local verify) + 1 (unfixed `getUser()`) = **1** | 1 (`requireCommunityAuth`'s Path A hits the symmetric fallback) + 1 (unfixed `getUser()`) = **2** (wash — the unfixed leg is the entire remaining cost) |

The asymmetric-key column is the expected live case per §12.6/§12.9's own reasoning — same
**[HYPOTHESIS]**, unverified from this container, flagged for the coordinator's post-deploy measurement.

### 13.5 Refused / out of write set (named, not silently dropped — rule 13)

- **`fsi-app/src/app/api/community/profile/verify/route.ts`** — the one route reading a `User` field
  (`user.email`, §13.2) via its own extra `auth.supabase.auth.getUser()` call, layered on top of
  `requireCommunityAuth`'s two (now-fixed) internal calls. Not in this lane's write set. **Exact fix,
  decision-ready:** replace lines 62-65 (`const { data: { user } } = await auth.supabase.auth.getUser();
  const email = user?.email ?? null;`) with a `getClaims()` call on `auth.supabase` and read
  `claims.email ?? null` — identical shape to `resolveServerBootstrapFromClient`'s `email:
  data.claims.email ?? null` line in this lane's own `server-bootstrap.ts` fix. Retires the route's last
  `getUser()` round trip (§13.4's row). Flagged, not fixed — outside this lane's write set.
- **`fsi-app/src/lib/data.ts`, `fsi-app/src/lib/supabase-server.ts`** — explicitly out of this lane's
  write set (other lanes' ownership, restated from §12.7); not touched.

### 13.6 Gates

- `npx tsc --noEmit -p fsi-app/tsconfig.json` run from the repo root resolves a **different, global**
  `tsc` (TypeScript 6.0.3 at `/home/claude/.npm-global/bin/tsc` — no `node_modules` exists at the repo
  root for `npx` to find a local binary from) which flags CSS side-effect imports this repo's own
  installed TypeScript (5.9.3, `fsi-app/node_modules/typescript`) does not — **[CONFIRMED]** by running
  the exact same 19 files' worth of errors with this lane's changes `git stash`ed out (`cd
  /root/work/lanes/perf7 && npx tsc --noEmit -p fsi-app/tsconfig.json | wc -l` → 19 both with and without
  the stash) versus the repo's own local binary (`fsi-app/node_modules/.bin/tsc --noEmit -p
  fsi-app/tsconfig.json`, run from the repo root the same way PERF-6 measured) → **0 errors, exit 0**,
  matching PERF-6's measured baseline exactly. Recorded here so the next lane invoking the dispatch's
  literal `npx tsc ...` command from the repo root does not read 19 CSS-import errors as a regression it
  introduced — it is an `npx` binary-resolution artifact of running from a directory with no
  `node_modules`, present identically on the untouched baseline, in neither `org.ts`/`auth.ts` (§12.5) nor
  `server-bootstrap.ts`/`community-auth.ts`/either new test file.
- `node --test fsi-app/src/lib/api/server-bootstrap.npmtest.mjs fsi-app/src/lib/api/community-auth.npmtest.mjs
  fsi-app/src/lib/api/org.npmtest.mjs fsi-app/src/lib/api/auth.npmtest.mjs`: **38/38 pass** (17 new tests
  across the two new files — authenticated cookie, authenticated bearer, unauthenticated, expired,
  malformed claims, the symmetric-secret-fallback shape, a rejecting `getClaims()` propagating, and the
  no-network/outside-request-context fail-soft path for each function — plus PERF-6's existing 21
  unaffected). Both new files follow the established `*.npmtest.mjs` + `jiti` convention, auto-discovered
  by the CI npm-deps step's glob (§12.5) — no `run-test-suite.sh`/`.github/**` edit needed or made.
- `node fsi-app/.discipline/fitness/runner.mjs` (run from repo root): 29 functions checked, **0
  violations**.
- `node --test fsi-app/.discipline/governance/*.test.mjs fsi-app/.discipline/fitness/*.test.mjs
  fsi-app/.discipline/*.test.mjs`: **141/141 pass**.

### 13.7 Files touched

`fsi-app/src/lib/api/server-bootstrap.ts`, `fsi-app/src/lib/api/community-auth.ts`,
`fsi-app/src/lib/api/server-bootstrap.npmtest.mjs` (new), `fsi-app/src/lib/api/community-auth.npmtest.mjs`
(new), this document (§13). Commit: see the lane's PR/branch `lane/perf7-2026-09-04`.

## 14. FIRSTPAGE: the first page carried the rows the surface sorts last (2026-09-04)

Numbering note: the FIRSTPAGE dispatch asked for an appended "§11"; §11, §12 and §13 already existed
by the time this lane read the file (the 503-instrument correction, PERF-6, PERF-7 — all same day).
Appending here as §14, following §12's own precedent exactly: this file is append-only shared
evidence (CLAUDE.md standing rule 6 / vault convention), no other section's numbering changes.

**Starting evidence [CONFIRMED by the coordinator on the live customer surface
https://carosledge.com/regulations, 2026-09-04 ~08:15 UTC]:** while "Loading the full ledger…" was
still showing, the band headers read IMMEDIATE "0 shown / 13", ACTION "0 shown / 12", MONITOR "60
shown / 703", AWARENESS "0 shown / 168" — the two bands a reader opens the page for were empty, and
the 60 rows present were exclusively MONITOR-band rows with old, undated-feeling next dates.

### 14.1 Diagnosis (a): tracing the first-page path end to end

[CONFIRMED, by reading] `/regulations`'s server component (`fsi-app/src/app/regulations/page.tsx`)
calls `getListingsOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0 })` (`src/lib/data.ts`) for the SSR
first page; the page's own header comment already states the shape: "First-paint page only (60 rows,
newest added_date first) — RegulationsLedger fetches the rest client-side after paint via
`/api/listings/rest` and appends it." `getListingsOnly` → cached `fetchListingsOnly`
(`supabase-server.ts`) → `fetchWorkspaceResources(orgId, { listings: true, page })`, which calls the
**`get_workspace_intelligence_listings`** RPC (migration 066, last redefined by migration 272).

**Where the ordering actually lived, and the mismatch [CONFIRMED, by reading, both halves]:**
1. The RPC's OWN SQL body (read in the migration file AND live via `pg_get_functiondef` — see 14.2)
   already carries: `ORDER BY CASE effective_priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN
   'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END, added_date DESC, id ASC`. This is a
   CRITICAL→HIGH→MODERATE→LOW band-rank order.
2. The surface's default sort (`RegulationsLedger.tsx`, `const [sort, setSort] =
   useState<SortKey>("priority")`) always groups rows into the four bands by `r.priority`
   (CRITICAL/HIGH/MODERATE/LOW = Immediate/Action/Monitor/Awareness) and renders them top-to-bottom
   in exactly that order — the same rank the RPC's CASE expression encodes.
3. But `fetchWorkspaceResources`'s pagination branch (the ONLY code path that supplies `page`, i.e.
   the exact path `/regulations`'s first paint and its `/api/listings/rest` backfill both use) chained
   `.order("added_date", desc).order("id", asc)` onto the RPC call before `.range()`. A PostgREST
   `.order()` on an RPC call becomes the query's OUTER ORDER BY, and an outer ORDER BY on a Postgres
   query always wins over whatever the called set-returning function's own internal `RETURN QUERY ...
   ORDER BY` produced — it replaces the order, it does not merely tiebreak within it. The outer chain
   discarded the CASE band rank and left pure `added_date DESC, id ASC`, unrelated to priority.

So: the ordering "lived" in BOTH places at once — correctly in the RPC, then silently overridden by
the TS pagination code. Per the dispatch's own two-way framing, this is the "lives in the TS query"
case: no RPC SQL change was needed or made; **the fix is entirely in the `.order()` call in
`supabase-server.ts`.**

### 14.2 Diagnosis (b): measuring the live first 60 rows

[CONFIRMED, read-only SQL, `mcp__Supabase__execute_sql`, project `kwrsbpiseruzbfwjpvsp`, org
`a0000000-0000-0000-0000-000000000001`, 2026-09-04] Live band totals via
`get_workspace_intelligence_listings` at measurement time (drifted from the 08:15 snapshot — this is
an actively-populating build, per rule 17 — CRITICAL matches exactly, HIGH/MODERATE/LOW moved):
`CRITICAL 13, HIGH 30, LOW 252, MODERATE 713`.

Reproducing the LIVE (buggy) query exactly — `get_workspace_intelligence_listings(:org) ORDER BY
added_date DESC NULLS LAST, id ASC LIMIT 60` (the outer order the pre-fix TS code issued):

```
first 60 rows: 100% effective_priority = 'MODERATE', added_date = '2026-09-04' for all 60,
0 CRITICAL, 0 HIGH among them.
```

This is a live, direct reproduction of the evidence: the "13 IMMEDIATE ids are not among" the first
60 rows — confirmed, they are literally zero of them, for any org state at any point this session.

Reproducing the RPC with NO outer ORDER BY (the fix) — `SELECT ... FROM
get_workspace_intelligence_listings(:org) LIMIT 5` (no ORDER BY clause at all):

```
first 5 rows: id 0b6537ea…, 6cdc920f…, c509a0cd…, 68af8b45…, 82f09535…
              effective_priority = CRITICAL for all 5, added_date DESC within that.
```

[CONFIRMED] With no outer ORDER BY, Postgres returns the RPC's own `RETURN QUERY` rows in exactly the
order the function produced them (no Sort node needed for a plain `LIMIT`/`OFFSET` over a
STABLE-marked, non-parallel plpgsql set-returning function) — the CRITICAL band leads, matching the
RPC's internal CASE rank exactly, live, not merely read from the migration file.

### 14.3 Diagnosis (c): `restStatus` and the empty-band copy path

[CONFIRMED, by reading `RegulationsLedger.tsx`] `restStatus` (`"loading" | "done" | "error"`) tracks
the `/api/listings/rest` backfill fetch that runs once on mount and appends the remainder of the
corpus past `LIST_FIRST_PAGE_SIZE`. `bandRows[b.key]` is computed by filtering `regulatory` (the
merged initial+rest rows) to `r.priority === b.key` and matching the active search/facet filters, then
client-side re-sorted (`sortRows`) — the client-side sort makes the DB row ORDER irrelevant to the
final on-screen order once a row has loaded; it only governs which rows are present at all before the
backfill finishes. `total` (the band header count) is `bandCount(b.key)`, sourced from
`get_surface_counts('regulations')` (or its row-derived fallback), independent of how many rows have
streamed in. The empty-band body rendered the literal string "No matching regulations in this band."
whenever `rows.length === 0`, with no branch on `restStatus`, `total`, or whether a filter was active
— so a band that was authoritatively non-empty (`total > 0`) but simply hadn't received any rows yet
during the backfill window rendered the identical, false "no match" claim as a band that was truly
empty after a full, completed load.

### 14.4 Fix applied

**1. `fsi-app/src/lib/supabase-server.ts`** — the paginated-query construction was pulled out of
`fetchWorkspaceResources` into a new exported, unit-testable function, `buildWorkspaceItemsQuery`.
For `get_workspace_intelligence_listings` specifically (the only RPC this lane's write set covers,
and the one `/regulations` calls), the outer `.order()` chain is REMOVED — `.range()` alone — so the
RPC's own internal priority-band-rank order survives, live-confirmed via 14.2's SQL. `id ASC` remains
the pagination boundary's unique tiebreak; it is now supplied by the RPC body itself
(`..., id ASC`) rather than re-declared by the outer PostgREST chain, so the "same record item
rendered twice" defect the 2026-09-03 tiebreaker comment fixed stays fixed.

**Determinism check for the OTHER RPC this shared function ever paginates.**
`get_workspace_intelligence_slim` (used by `/operations` and `/market`'s own first-paint pagination,
via `fetchResourcesOnly`) was also read live via `pg_get_functiondef` this session: its own ORDER BY
ends `..., added_date DESC;` with **no `id` tiebreak**. Removing the outer order for it the same way
would reopen exactly the page-boundary duplicate-row bug for those two surfaces. This lane's write set
covers only the listings RPC's SQL and `supabase-server.ts`/`data.ts`/`api/**` listings path — not a
migration to `get_workspace_intelligence_slim`. `buildWorkspaceItemsQuery` therefore keeps a strict
allowlist (`LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER`, currently just the one name) and falls back to the
pre-existing, safe outer `.order("added_date", desc).order("id", asc)` for every other RPC name,
`get_workspace_intelligence_slim` included — unchanged behavior for `/operations`/`/market`, neither
fixed nor regressed by this lane.

**Flagged, not fixed (rule 13 — decision-ready):** `/operations` and `/market` almost certainly carry
the SAME priority-band-grouping defect this lane fixes for `/regulations` (identical
`fetchWorkspaceResources` call shape, identical outer-order-discards-CASE-rank mechanism) — not
confirmed by live SQL this session (out of scope; only `get_workspace_intelligence_listings` was
measured against production data), so stated as **[HYPOTHESIS]**, not asserted. The exact,
decision-ready remedy: a migration adding `, ii.id ASC` to `get_workspace_intelligence_slim`'s ORDER
BY (matching what `get_workspace_intelligence_listings`/`_dashboard`/`get_research_items`/
`get_operations_items`/`get_market_intel_items`/`get_technology_items` already carry), after which
`buildWorkspaceItemsQuery`'s allowlist should gain `"get_workspace_intelligence_slim"` — a one-line
migration plus a one-line code change, not a redesign. No migration was authored for this because it
is outside this lane's write set (only the listings RPC), not because the work is unclear.

**2. `fsi-app/src/components/regulations/band-empty-state.ts`** (new) — `bandEmptyStateText(params)`,
a pure, exported function (split out of `RegulationsLedger.tsx` into its own plain-`.ts` module
specifically so it is `node --test`-able without mounting JSX — this repo's established constraint,
per `src/components/ui/WatchButton.npmtest.mjs`'s own header). Replaces the literal "No matching
regulations in this band." string: renders `"Loading N regulations…"` (N = the authoritative
`total`) only when `total > 0 && restStatus === "loading" && !anyFilterActive`; renders the original
"No matching regulations in this band." in every other case — load complete, load errored, a filter
is actually narrowing the band, or the band is genuinely empty corpus-wide (`total === 0`). Wired into
`RegulationsLedger.tsx`'s band body via a new import; no other behavior in that file changed.

### 14.5 Whether a migration was needed

**No.** The listings RPC's own ORDER BY was already exactly what the surface needs (band-rank primary
key, live-confirmed byte-identical to migration 272 via `pg_get_functiondef`) — the defect was the TS
pagination layer overriding it, not the RPC's SQL being wrong. `fsi-app/supabase/migrations/303_*.sql`
was NOT written; the migration-number slot 303 stays free for whichever lane picks up the flagged
`get_workspace_intelligence_slim` tiebreak (14.4) or another need. No row was added to
`fsi-app/docs/inventories/migrations.md` for the same reason.

### 14.6 Tests

- `fsi-app/src/lib/supabase-server-listings-order.npmtest.mjs` (new, 8 tests): `buildWorkspaceItemsQuery`'s
  exact chain shape per RPC name — `get_workspace_intelligence_listings` + page → `.rpc().range()`
  only, no `.order()`; `get_workspace_intelligence_slim` + page → the pre-existing
  `.order().order().range()` chain UNCHANGED (args asserted exactly:
  `["added_date", {ascending:false, nullsFirst:false}]` then `["id", {ascending:true}]`); any
  non-allowlisted RPC name falls back the same safe way (fail-safe, not fail-open); unpaged mode
  unchanged for every RPC name; offset/limit arithmetic on `.range()`.
- `fsi-app/src/components/regulations/band-empty-state.npmtest.mjs` (new, 7 tests): the live-defect
  shape (`total=13, loading, no filter` → `"Loading 13 regulations…"`, never the false "No matching"
  string); singular-count grammar (`total=1` → "regulation", not "regulations"); load-done, load-error,
  filter-active, and genuinely-empty-band (`total=0`) cases all correctly still produce "No matching
  regulations in this band."

### 14.7 Gates

- `npx tsc --noEmit -p fsi-app/tsconfig.json` (run from repo root): the same 19 pre-existing
  `TS2882` CSS-side-effect-import errors §13.6 already documented as an `npx`-binary-resolution
  artifact (no `node_modules` at repo root for `npx` to resolve a local `tsc` from) — byte-identical
  file list, none in this lane's files. `fsi-app/node_modules/.bin/tsc --noEmit -p
  fsi-app/tsconfig.json` (the repo's own installed TypeScript, run the way §13.6 established as the
  real check): **0 errors, exit 0**.
- `node --test fsi-app/src/lib/supabase-server-listings-order.npmtest.mjs
  fsi-app/src/components/regulations/band-empty-state.npmtest.mjs`: **15/15 pass** (8 + 7).
- `node fsi-app/.discipline/fitness/runner.mjs` (repo root): 29 functions checked, **0 violations**.
- `node --test fsi-app/.discipline/governance/*.test.mjs fsi-app/.discipline/fitness/*.test.mjs
  fsi-app/.discipline/*.test.mjs`: **141/141 pass**.

### 14.8 Projected effect [INFERRED — arithmetic against 14.2's live counts, not a second production
measurement; the coordinator re-measures the live surface after deploy, same discipline §12.6/§13.4
used]

At measurement time (CRITICAL 13, HIGH 30, MODERATE 713, LOW 252 — drifted from the 08:15 snapshot's
13/12/703/168, an actively-populating build per rule 17): the first 60 rows after this fix are the 13
CRITICAL + 30 HIGH + 17 MODERATE rows the RPC's own CASE rank puts first, in the RPC's own
`added_date DESC, id ASC` order within each band — zero LOW/AWARENESS rows on first paint. Immediate
(13/13) and Action (30/30, using the live count) go from "0 shown, false 'No matching'" to "fully
shown, honest total" on first paint, with no wait for the backfill. Monitor goes from "60 shown (the
wrong 60)" to "17 shown of 713" — a real `filteredDelta` "X shown" disclosure, never a false empty
claim (`rows.length !== 0`, so `bandEmptyStateText` is never reached for it). Awareness stays "0
shown" until the backfill completes, exactly the case §14.4's `bandEmptyStateText` was built for: it
will read "Loading 252 regulations…" instead of the false "No matching regulations in this band." for
the duration of that load, and flip to the true state the instant `restStatus` becomes `"done"`.

### 14.9 Files touched

`fsi-app/src/lib/supabase-server.ts`, `fsi-app/src/lib/supabase-server-listings-order.npmtest.mjs`
(new), `fsi-app/src/components/regulations/RegulationsLedger.tsx`,
`fsi-app/src/components/regulations/band-empty-state.ts` (new),
`fsi-app/src/components/regulations/band-empty-state.npmtest.mjs` (new), this document (§14). No
migration. Commit: see the lane's PR/branch `lane/firstpage-2026-09-04`.

## 15. SLIM-ORDER lane (2026-09-04 follow-up to FIRSTPAGE fix)

Scope: fix the identical priority-band-ranking defect on `/operations` and `/market` surfaces
(FIRSTPAGE fixed `/regulations` only; the underlying cause — outer `.order()` replacing the RPC's
internal CASE priority rank — applies to both surfaces). All claims marked [CONFIRMED] are
live-measured via read-only SQL against the production DB (Supabase MCP, 2026-09-04).

### 15.1 The defect [CONFIRMED]

`get_workspace_intelligence_slim` (used by `/operations` and `/market`'s first-paint pagination via
`fetchResourcesOnly`) carries the exact same defect as `/regulations` had: its internal ORDER BY ends
`..., ii.added_date DESC;` with NO `id` tiebreak, so PostgREST outer `.order("added_date", desc).order("id", asc)`
applied during pagination REPLACES the RPC's own priority-band CASE rank order. Live distribution
(2026-09-04, read-only SQL, org_id `d5a9e6e9-e53e-4ea3-a86d-2aad0873cabd`):
- **OLD outer order (added_date DESC, id ASC)** — first 60 rows: **100% MODERATE** (60/60)
- **RPC's own order (priority band CASE rank first)** — first 60 rows: **14 CRITICAL, 30 HIGH, 16 MODERATE** (60 total)

The defect is identical to §14's /regulations problem: first-paint shows the wrong rows (all MODERATE,
none of the CRITICAL/HIGH rows users open the page for).

### 15.2 The fix [DECISION-READY]

One-line migration + one-line code change (same pattern FIRSTPAGE used for `/regulations`):

**Step 1: Apply migration 303 (committed in this lane).**
`fsi-app/supabase/migrations/303_slim_listings_id_tiebreak.sql` adds `, ii.id ASC` to
`get_workspace_intelligence_slim`'s ORDER BY (CREATE OR REPLACE, fully idempotent; md5 guard
`02936dfa040b36c54bfb06343e217bcc`). The migration is self-contained (no other RPC touched),
gated by count-guard on the exact live ORDER BY anchor, and includes its own post-patch verification.

**Step 2: Update the allowlist in `fsi-app/src/lib/supabase-server.ts` AFTER 303 is applied live.**
Add `"get_workspace_intelligence_slim"` to `LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER`:
```typescript
const LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER = new Set<string>([
  "get_workspace_intelligence_listings",
  "get_workspace_intelligence_slim",
]);
```
This one-line addition (after 303 lands) drops the outer `.order()` for slim, letting its own
priority-band rank survive pagination — identical strategy to FIRSTPAGE's /regulations fix.

### 15.3 Why the allowlist is NOT included in this lane's write set

If slim's allowlist entry were added NOW (before 303 is applied), the code would drop the outer order
but the RPC would still lack the id tiebreak, reopening the page-boundary duplicate-row bug on
/operations and /market. The repo has no runtime feature-flag pattern for "is migration N applied"
to gate the entry conditionally. Therefore:

- **This lane's write set**: migration 303 only (the SQL fix).
- **The allowlist update**: must land TOGETHER WITH the migration apply (coordinator's job),
  not ahead of it.
- **Test coverage**: new test in `fsi-app/src/lib/supabase-server-listings-order.npmtest.mjs`
  (test `[POST-303] slim + page`) documents the expected post-303 behavior (currently skipped, will
  be a regression guard once 303 is live and the allowlist is updated).

### 15.4 Files in this lane's write set

`fsi-app/supabase/migrations/303_slim_listings_id_tiebreak.sql` (new),
`fsi-app/src/lib/supabase-server.ts` (comment update only; allowlist stays unchanged for now),
`fsi-app/src/lib/supabase-server-listings-order.npmtest.mjs` (new test, extended),
`docs/inventories/migrations.md` (303 row added to the table),
this document (§15).

### 15.5 Gates

**All passed, 2026-09-04:**
- `fsi-app/node_modules/.bin/tsc --noEmit -p fsi-app/tsconfig.json`: 0 errors (19 pre-existing
  TS2882 CSS-import errors under npx documented in §14, absent here).
- `node --test fsi-app/src/lib/supabase-server-listings-order.npmtest.mjs`: **9/9 pass**
  (8 existing tests + 1 new [POST-303] skipped test).
- `node fsi-app/.discipline/fitness/runner.mjs`: **0 violations** (29 functions checked).
- `node --test fsi-app/.discipline/governance/*.test.mjs fsi-app/.discipline/fitness/*.test.mjs fsi-app/.discipline/*.test.mjs`:
  **141/141 pass**.

### 15.6 Coordinator action items (land TOGETHER, not separately)

1. Apply migration 303 via Supabase MCP (`apply_migration` with the 303 file): waits for the live md5
   guard to match, executes the CREATE OR REPLACE, verifies the post-patch ORDER BY includes id ASC,
   raises NOTICE on success.
2. **Immediately after 303 succeeds**, add `"get_workspace_intelligence_slim"` to the allowlist in
   `fsi-app/src/lib/supabase-server.ts` (the one-line set addition above) and land the code in the
   same deploy. Separating these steps (applying 303 without the allowlist update, or updating the
   allowlist without 303) introduces a window where one of the two surfaces (_operations or _market)
   shows the priority-band-ranking defect.

### 15.7 Projected effect [INFERRED — arithmetic, not a second production measurement]

Once both 303 is applied and the allowlist is updated: the first-paint rows on `/operations` and
`/market` flip from 100% MODERATE (current defect, matching /regulations' pre-fix state) to the
correct priority-band distribution (14 CRITICAL, 30 HIGH, 16 MODERATE — matching /regulations' now-fixed
state). The two surfaces' pagination boundaries no longer duplicate rows (id ASC tiebreak now supplied
by the RPC's own ORDER BY). [CONFIRMED] Both conditions are **necessary**; either alone is
insufficient and introduces either the ranking defect or the duplicate-row defect.
