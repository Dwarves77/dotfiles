# Live click-through measurement — carosledge.com, 2026-09-04 23:10–23:20 UTC

**Source:** the coordinator's own live Chrome measurement against the deployed production site,
relayed to lane PERF-13 as its dispatch. This lane's sandboxed container has no route to
`carosledge.com` and no live Supabase credentials it can reach from the build process (see this
lane's REPORT for the exact sandbox limitation and what it did/did not block) — every finding below
is therefore **[CONFIRMED, coordinator live measurement, not independently re-verified by this
lane]** unless a specific PERF-13 fix's own commit says otherwise (each fix below names the
local/offline proof PERF-13 built to verify its OWN fix, which is a different, later measurement
than the live capture this file records).

This file exists specifically so PERF-13's in-code citations (`docs/audits/perf-clickthrough-2026-09
-04.md §(x)`, scattered across the files this lane touched) point at a real, findable document
instead of an inline paraphrase repeated differently in every comment. It is a companion to, not a
replacement for, `docs/audits/perf-waterfall-2026-09-04.md` (an earlier lane's round-trip/build-
composition audit, sections §1-§5, unrelated numbering) — the two are cross-referenced by name only,
never by shared section letters/numbers, to avoid exactly the citation collision this file was
created to fix.

Operator's own words, governing every fix below: *"every click should show items on a page
instantly"*; *"loading is faster but each page is blank when you navigate to it, there should be
zero wait time for pages to load"*; *"modern websites do not have blank pages and take time to
load"*; *"find out how others do it and do the same"*; explicitly **no spend-based fixes**.

## (a) Already-rendered slug: 150–165ms

A regulation detail slug already present in the Full Route Cache (visited earlier in the same
session, or otherwise already statically built) loaded in 150–165ms end to end. This is the target
shape — "every click an edge hit."

## (b) Never-rendered slug: 760–950ms

A regulation detail slug NOT yet in the Full Route Cache (the steady state of most of the corpus
under the pre-PERF-13 `generateStaticParams() { return [] }` design — see ADR-026's own Addendum —
PERF-10) cost 760-950ms to resolve. PERF-13 item 1 (`fsi-app/src/lib/data.ts`'s
`getPublicSurfaceSlugs`, wired into all four `[slug]/page.tsx` routes' `generateStaticParams`) closes
this for the entire corpus that exists at build time (1,431 items measured 2026-09-04 via Supabase
MCP: 1,312 regulations / 55 market / 25 operations / 39 research); the residual (items minted after
the last deploy) is addressed by `docs/runbooks/warm-static-detail-routes.md`.

## (c) Nothing on screen changes during that ~900ms

A `MutationObserver` on `document.body` during a never-rendered-slug navigation (finding (b)) saw
**zero mutations** until the whole detail page arrived — `loading.tsx` (present at
`src/app/regulations/[slug]/loading.tsx` and the market/operations/research siblings) never painted.
Root cause **[CONFIRMED, this lane, via github.com/vercel/next.js/issues/77322]**: a documented,
Next-team-confirmed architectural limitation — on-demand static generation for a `dynamicParams`
fallback route does not stream through the segment's own Suspense boundary the way a genuinely
Dynamic (`ƒ`) route does; the whole page is generated to completion server-side before any of it is
sent, regardless of `loading.tsx`'s presence. A nested `<Suspense>` inside `page.tsx` (a "static shell
streams, the body fills in") does not help either without Next 16's `cacheComponents` flag — which
PERF-9 already scoped OUT of a single lane's work (`fsi-app/next.config.ts`'s own PERF-9 comment,
citing `ADR-026` §2: "a materially bigger flag... needs its own dedicated, adversarially-tested
lane"), a binding prior decision this lane did not reopen. PERF-13's answer: shrink the population
that ever takes the on-demand path to (ideally) zero via item 1 + the warm-step runbook, rather than
try to make the on-demand path itself stream.

## (d) Only 6/12 visible row links carried an `_rsc` prefetch entry

Measured against the pre-item-1 build, where every one of these routes still built `ƒ` (Dynamic) —
Next's own documented `<Link>` behavior prefetches only the static shell + `loading.tsx` boundary for
a dynamic destination, never the full payload, regardless of how many visible rows enter the
viewport. Since item 1 makes each already-built item's detail route static, the SAME `<Link>` (prop
left at the framework default, `RegulationsLedger.tsx`'s `RegRow`) now qualifies for Next's full-
route prefetch by default for any row pointing at an already-built page — see that file's own updated
comment for the citation and the honest [HYPOTHESIS, pending live re-measurement] this lane could not
close from its sandbox (no reachable Supabase to stand up a real `next start` server with production
listing rows).

## (e) `/api/obligations/upcoming?itemId=` fires TWICE after detail render

Root cause **[CONFIRMED, this lane, by reading]**:
`src/components/regulations/RegulationDetailSurface.tsx` passed the SAME
`<UpcomingObligationsStrip variant="detail" itemId={r.id} />` React element (constructed once, in
`page.tsx`, as the `upcomingObligations` prop) into TWO separate render positions for a record-grade
item — the meta rail (unconditional) AND, previously, inside `RecordGradeSummary`'s own fallback
branch (`{upcomingObligations ?? (...)}`) reached via `SummaryTab`. Two render positions holding the
identical element reference still mount as two independent component instances (React element
identity is not the same as "rendered once and reused") — each ran its own `useEffect` fetch of
`GET /api/obligations/upcoming?itemId=...`. Fixed by removing the second render position and its
now-unused prop plumbing (`SummaryTab`, `RecordGradeSummary`) — the meta rail is now the sole render
site.

## (f) Scrolling to the bottom of `/regulations` fires NO `/api/listings/cursor` request; one click on "Load more" fetched four pages in a row

Two independent, compounding root causes, both **[CONFIRMED, this lane]** via purpose-built Playwright
reproductions (isolated CSS-only for the first, the real `RegulationsLedger` component mounted
through this repo's own esbuild+Playwright smoke harness for the second — both run before AND after
each fix, showing the exact behavioral reversal; see this lane's REPORT for the exact scripts and
output):

1. `src/components/AppShell.tsx`'s outer flex container used `min-h-screen` (a floor, not a bound).
   With no bounded-height ancestor, `<main className="flex-1 overflow-y-auto ...">` auto-grows to fit
   all of its content and never actually overflows (`scrollHeight === clientHeight`) — the browser
   scrolls `window`/`document.documentElement` instead, and `<main>`'s own `scrollTop` stays pinned at
   0 no matter how far the page is really scrolled. `src/lib/hooks/useNearestScrollParent.ts` checked
   only the COMPUTED `overflow-y` CSS property (true regardless of whether the box ever really
   overflows) when walking up from the ledger looking for its real scroll container, so it handed
   TanStack Virtual's `useVirtualizer({ getScrollElement: () => main })` a scroll element whose
   `scrollTop` never changes — the virtualizer, and the infinite-scroll sentinel mounted inside it,
   could never see the user's real scroll position advance. Fixed both: `AppShell.tsx` to `h-screen`
   (a real bound), and `useNearestScrollParent.ts` to also require `scrollHeight > clientHeight`
   (real overflow), not just the CSS property.
2. `src/lib/hooks/useInfiniteScrollSentinel.ts`'s `IntersectionObserver` effect depended on
   `[enabled, rootMargin]` and disconnected/reconnected on every `enabled` toggle (`enabled` flips
   false while `isFetchingNextPage`, true again once a fetch settles). A freshly-constructed
   `IntersectionObserver` always delivers an INITIAL callback reflecting the target's CURRENT
   intersection state (standard, documented API behavior) — so once the sentinel was already visible
   (any band collapsed to its default row count is short enough for this), each completed fetch
   re-armed a new observer against an already-intersecting element and it fired again immediately,
   with no further user scrolling: a self-sustaining cascade, exactly "one click fetched four pages in
   a row." Fixed by creating ONE observer for the sentinel's mounted lifetime (depends only on
   `rootMargin`) and gating the actual `onIntersect()` call inside the callback via a ref read of
   `enabled` — preserving the real IntersectionObserver contract (fires only on an actual intersection
   transition) instead of on every unrelated dependency change.

## (g) The Awareness band shows "0 shown 169 — Loading 169 regulations…" permanently

Root cause **[CONFIRMED, this lane, by reading + Playwright reproduction against the real
`RegulationsLedger` component]**: `src/components/regulations/RegulationsLedger.tsx` computed a
single ledger-wide `restStatus` ("loading" whenever `hasNextPage || isFetchingNextPage ||
queryStatus === "pending"`) and fed it identically to every band via `bandEmptyStateText`
(`src/components/regulations/band-empty-state.ts`). Because cursor pages are priority-ordered, the
Awareness band receives no rows until roughly page 37 of the stream — `hasNextPage` stays true for
nearly the entire session regardless of whether a request is genuinely in flight right now, or
whether that request could possibly be the one reaching Awareness. The operator's own words: "a
loading state with nothing loading." Fixed by replacing the single three-state `restStatus`/
`bandEmptyStateText` pair with a four-state `bandEmptyState` (`no-match` / `loading` / `error` /
`ready`) computed per band from the RAW flags (`isFetchingNextPage`, `hasNextPage`,
`isFetchNextPageError`, `initialLoadPending`) rather than a pre-collapsed value: "loading" now means a
fetch is *actually in flight right now*; a band with a positive total, no filter, and nothing
currently in flight renders its TRUE count plus a real "Load more (N in this band)" control wired to
the SAME `fetchNextPage` the footer's own button already calls. Verified both halves empirically (mid
-fetch shows "Loading N regulations…"; once the fetch settles with more pages remaining, the SAME
band immediately switches to "N regulations in this band — not loaded yet. Load more (N in this
band)" — never stuck on an indefinite "Loading" claim with nothing behind it).
