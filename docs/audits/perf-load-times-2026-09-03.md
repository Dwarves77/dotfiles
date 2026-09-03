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
