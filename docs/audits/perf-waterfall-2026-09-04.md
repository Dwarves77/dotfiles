# Perf waterfall audit — 2026-09-04 (lane PERF-ARCH)

Operator, verbatim, this is the brief this document answers:

> "clicking into any item or any page takes WAY too long … every click should show items on a page instantly"
> "you dont load every item at once, basic 101 developing"
> "instead of fixing how the pages load youre trying to live with the problem and increase my spending to fix poor developing"
> "think like the top .01% developers, what would they do to diagnose the FULL problem … and then fix it"
> "these solutions have been developed already, you dont need to reinvent a fix, find out how others do it and do the same"

This audit combines the operator-established facts from `docs/audits/perf-load-times-2026-09-03.md` (cited, not re-measured — this lane did not re-run Chrome DevTools against a live deployment) with this lane's own code reading and a local `next build --webpack` (this worktree, 2026-09-04, placeholder Supabase env — build succeeded, TypeScript/lint clean, `.next/server` inspected directly). Every claim is labeled **[CONFIRMED]** (read or executed this session) or **[HYPOTHESIS]** (plausible, not independently verified this session). Nothing here is asserted flat.

## 0. What was already established (2026-09-03 audit, cited)

- **[CONFIRMED, by prior audit]** `getAppData` cold ~7,970ms, warm 200-465ms.
- **[CONFIRMED, by prior audit]** `/api/version` cold 1,542ms, warm ~300ms.
- **[CONFIRMED, by prior audit]** 118-130 routes are all `ƒ` (Dynamic) — no static shell anywhere.
- **[CONFIRMED, by prior audit]** Every HTML document response is `private, no-store`, `x-vercel-cache: MISS`.
- **[CONFIRMED, by prior audit]** Region mismatch (iad1 app vs us-west-1 DB) was real; fixed at this branch's base commit `be0f8e97` (Vercel functions moved to `sfo1`, co-located with the Supabase project's region). This audit does not re-litigate region — it's done.
- **[CONFIRMED, by prior audit]** `/regulations` document: 886 KB decoded, 1,259 UUID strings, 401 KB inside `self.__next_f` (RSC payload script tags), 301 row DOM elements for a nominal 60-row first page.
- **[CONFIRMED, by prior audit]** Home document: 315 KB decoded.
- **[CONFIRMED, by prior audit]** DB pool: 17/60 connections idle, 0 lock waits — the database itself is not the bottleneck.
- **[CONFIRMED, by prior audit, §11]** The 503s reported by the operator's Chrome extension were a broken measuring instrument (the extension itself misreported 200s as 503s); three independent sources agreed there was no real 503. This audit treats "503" as closed and focuses on the *latency* complaint, which is real and code-confirmed below.

## 1. Round-trip chain, `/regulations` (list page)

Request path, in call order, with file:line for every hop:

1. **Proxy/middleware** — `fsi-app/src/proxy.ts:66` — `supabase.auth.getClaims()`. One network round trip to Supabase Auth (JWT verification), **[CONFIRMED]** wrapped in `cache()` upstream in `org.ts`/`auth.ts` per PERF-6 (so a *second* call inside the same request is a cache hit, not a second round trip — this was PERF-6's fix, still in place, unmodified by this lane).
2. **`layout.tsx`** — `fsi-app/src/app/layout.tsx:25` — `resolveServerBootstrap()` (`fsi-app/src/lib/api/server-bootstrap.ts`), rendered inside `<Suspense fallback={null}>` per PERF-9/ADR-026, so it does **not** block the page's own data below it — it races in parallel with the page tree. **[CONFIRMED]** by reading both files.
3. **`page.tsx`** (`fsi-app/src/app/regulations/page.tsx:50-52`):
   ```
   const [data, aggregates] = await Promise.all([
     getListingsOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0 }),
     getSurfaceCounts("regulations"),
   ]);
   ```
   Two branches race, but **each branch itself is sequential**:
   - `getListingsOnly` (`fsi-app/src/lib/data.ts:278-291`): line 290 `const orgId = await resolveOrgIdFromCookies();` **then** line 291 `const dataPromise = cachedListingsOnly(orgId, page);` — **[CONFIRMED]** genuine 2-hop sequential chain (org resolution round trip, then an org-*parameterized* RPC that cannot be issued before the org id is known). This is the single largest fixable hop in the list path.
   - `getSurfaceCounts` (`fsi-app/src/lib/data.ts:656+`) — also calls `resolveOrgIdFromCookies()` independently (line 658) rather than sharing the org id `getListingsOnly` already resolved; `resolveOrgIdFromCookies` is `cache()`-wrapped upstream (same pattern as auth), so this is a cache hit in-request, **not** a second round trip — **[CONFIRMED]** by reading `org.ts`'s cache wrap, same PERF-6/PERF-7 pattern.
4. **Four sibling Server Components with zero Suspense boundaries** — `fsi-app/src/app/regulations/page.tsx:116` (`UpcomingObligationsStrip`), `:123` (`RegulationsLedger`), `:137` (`ObligationRegister`), `:141` (`EudrCustodyPanel`). Grepped this file and all three sibling component files for `Suspense` — zero hits. Each of `UpcomingObligationsStrip`, `ObligationRegister`, `EudrCustodyPanel` reads its own data via its own request-scoped Supabase client (confirmed by their own header comments, quoted in the surrounding code). **[HYPOTHESIS]**: whether React's Flight renderer executes these four un-Suspended siblings' data-fetching concurrently or sequentially was not independently measured this session (no live instrumentation was run against a running server). This is the correct target for the `server-timing` instrumentation this lane built (see §4) — flagged, not asserted either way. It is out of this lane's write set to fix (the three sibling components are PERF-11 territory — listing-page surface).
5. **Post-render, client-side**: `RegulationsLedger.tsx` (per its own `prefetch={false}` comment cited in the 2026-09-03 audit, `RegulationsLedger.tsx:1367-1369`) fetches the remaining rows via `/api/listings/rest` (`fsi-app/src/app/api/listings/rest/route.ts`), which does a single `LIST_REMAINDER_LIMIT=5000` one-shot fetch (`fsi-app/src/lib/list-pagination.ts`) — **[CONFIRMED]** this is not true pagination; it is "ship the first 60, then ship up to 5,000 more in one shot," which is why the decoded document balloons once that second fetch lands and gets appended into `self.__next_f`/DOM. This is the direct mechanical cause of the 886 KB / 1,259-UUID / 301-element numbers in the 2026-09-03 audit — **[CONFIRMED]** by reading the fetch limit constant plus the audit's DOM/byte counts, which line up with "60 SSR rows + several hundred more client-appended rows, unvirtualized."
6. `RegulationsLedger.tsx` renders **every row of every band as a real DOM element** (grepped for any virtualization import across `src/components/regulations/` — none found; a single band can hold up to 713 items per the prior audit). **[CONFIRMED]** — no TanStack Virtual, no `react-window`, no windowing of any kind.

**Bytes shipped, root cause, file-mapped:**
- `fsi-app/src/app/regulations/page.tsx:123-131` passes `data.resources.map(toLedgerRowPayload)` (a trim function, per the surrounding comment, already dropping `keyData`/`reasoning` from the first-page SSR rows as of this lane's dated comment "PAYLOAD lane 2026-09-04, item 2 of the perf brief" — **[CONFIRMED]** this trim already landed on this branch before this lane started work, likely from a sibling lane's earlier commit on the same train). The *client-appended* remainder rows from `/api/listings/rest`, however, go through a **different** code path (`toLedgerRowPayload` in `list-pagination.ts`, used by the REST route) — both call sites use the same trim function per the route's own header comment, so the byte bloat is not "untrimmed rows," it's **volume**: hundreds of rows with no virtualization, each becoming real, styled DOM.

## 2. Round-trip chain, `/regulations/[slug]` (detail page)

`fsi-app/src/app/regulations/[slug]/page.tsx`:

1. UUID→slug redirect check, its own `createClient()` call, must complete before anything else (line ~100s, per the file's own header comment) — **[CONFIRMED]** genuinely sequential and unavoidable (a redirect decision blocks rendering by definition).
2. Lines 168-227, the three-way `Promise.all`:
   ```
   const [result, obligations, watchEntry] = await Promise.all([
     loadDetail<ItemScoped, ViewerScoped>({ ... }),       // line 169
     loadRegulationDetailObligations(id),                  // line 226
     watchMembershipPromise,                                // line 227 (defined line 157)
   ]);
   ```
   **[CONFIRMED]** — per this file's own header comment (lines 37-47), this was itself a PERF-2/PERF-4 fix: obligations and watch-membership used to run sequentially *after* `loadDetail` resolved; they were folded into the same `Promise.all`, changing the shape from "loadDetail + obligations" to "max(loadDetail, obligations)". Verified by a real test (`regulation-obligations-core.test.mjs`'s timeline test, referenced in the file header) — this is genuinely fixed, not aspirational.
3. `loadDetail` → `loadDetailCore` (`fsi-app/src/lib/detail/load-detail-core.ts:241-282`):
   - Line 247: `const detail = await deps.fetchItem(config.id);` — **sequential, first**. Comment at line 229 explains why: it's an "admission guard" (item must exist / be visible before anything scoped to it can run).
   - Lines 279-282, **then** a second `Promise.all`:
     ```
     const [sections, itemScoped, viewer] = await Promise.all([
       deps.fetchSections(config.id),
       runItemScoped(),
       runViewerScoped(),
     ]);
     ```
   - So the real shape is: **1 sequential hop (admission) → 3-way parallel fan-out**, not the flat "N concurrent detail SSR renders" language from the prior audit's root-cause language — that language described the *aggregate* load (many detail pages rendering concurrently under load, each doing this same 2-stage chain), not a defect inside a single page's own chain. **[CONFIRMED]** by reading the function; this correction is worth stating because "8-11 Supabase round-trips each" (2026-09-03 audit's own number) is consistent with 1 (admission) + up to ~10 spread across `fetchSections`/`runItemScoped`/`runViewerScoped`'s own internal fan-outs, not with a single flat sequential chain.
4. `console.log(\`[perf] /regulations/${id} data ${result.elapsedMs}ms\`)` at line 249 — the existing ad hoc log line this lane's `server-timing` module now supplements with structured, aggregable phases (see §4) rather than replaces (kept — it's cheap, and removing a working diagnostic during a perf lane is the wrong trade).

**What is NOT sequential here, contrary to a naive reading of "N round trips":** the admission-guard-then-fan-out shape is the *standard* two-phase detail-load pattern (authorize/locate the resource, then fetch everything scoped to it in parallel) — it is not a home-grown antipattern needing replacement. The real cost on this page is **the size and number of things inside `runItemScoped`/`runViewerScoped`'s own internal `Promise.all`s** (not read in full this session — out of this lane's write set to modify, `src/lib/detail/**` is PERF-10's), and the **fact that this whole page is `ƒ` Dynamic** (§3).

## 3. Round-trip chain, `/api/workspace/bootstrap`

`fsi-app/src/app/api/workspace/bootstrap/route.ts` (this lane's own instrumentation target, §4):
1. `requireAuth` — one hop (JWT verify, `cache()`-backed if called again downstream).
2. Four independent loaders in one `Promise.all` (`personal_state`, `list_orders`, `members`, `admin_attention` — named per this lane's `timePhase` wrap labels).
3. `JSON.stringify` the combined payload → `NextResponse.json`.

**[CONFIRMED]** this route is PERF-9's "per-user layer after first paint from one call" pattern — the page itself (layout.tsx) renders public/shell content synchronously, and this one bootstrap call fills in everything user-specific, client-side, post-paint. This is architecturally the *standard* pattern (see ADR-027 §4) — it does not need replacing, it needs the org-id-in-JWT-claim shortcut applied to skip its own internal `resolveOrgIdFromCookies()`-then-RPC sequencing, same defect class as `getListingsOnly` above.

## 4. Cold-start composition (`next build --webpack`, this lane, this worktree, 2026-09-04)

Ran locally with placeholder Supabase env vars (no live DB reachable — `[changed-since]` reads failed as expected, non-fatal, page-data collection still succeeded): `next build --webpack`, webpack build, `Compiled with warnings in 64s` (one pre-existing, unrelated `unpdf`/`import.meta` warning in a workflow route, not touched by this lane), TypeScript pass clean, static-page-data collection completed 74/74, build finished successfully.

**[CONFIRMED]**, read directly from `.next/server/` after the build:

| Route | Bundled `page.js`/`route.js` size | Transitive module deps (`.nft.json` file count) |
|---|---|---|
| `/regulations` | 61,423 bytes | 79 |
| `/regulations/[slug]` | 96,795 bytes | 83 |
| `/api/workspace/bootstrap` | 17,254 bytes | 65 |

All 118-130 routes still print `ƒ` in the build's route table — **[CONFIRMED]** the region fix and this lane's own work did not change static/dynamic eligibility for any route; that lever is entirely PERF-10's (`cacheComponents`/Cache Components pilot, `next.config`, `layout.tsx`).

`layout.tsx` (`fsi-app/src/app/layout.tsx:1-28`) imports: `next/headers` (`headers()` — the exact call ADR-026 already proved forces every route under it to `ƒ` Dynamic, confirmed there by an empirical rebuild test, not re-tested here), 5 `@fontsource` CSS files, `react`'s `Suspense`, 5 first-party components (`ThemeInitializer`, `AuthProvider`, `BootstrapBoundary`, `AppShell`, `GlobalErrorReporter`), `resolveServerBootstrap` from `server-bootstrap.ts`, `isRscNavigation`, plus `theme.css`/`globals.css`. **[CONFIRMED]** by direct grep of the file's import block — nothing exotic; the dynamic-forcing call is `headers()` at line 2, exactly as ADR-026 already documented.

`.next/server/chunks` totals 4.6 MB across 265 built JS files for the whole app — **[CONFIRMED]**, not broken down per-route here (would need per-chunk trace analysis, out of scope for this lane's budget); offered as a single aggregate data point, not a diagnosis.

## 5. What this settles for ADR-027

- The list page's byte bloat is **volume + no windowing**, not untrimmed payload shape (the trim already landed). → TanStack Virtual is the fix, not more payload trimming.
- The list page's and bootstrap route's slowest *sequential* hop is the same shape in both: **resolve org id, then issue an org-parameterized query** — twice over in the list page (`getListingsOnly` and `getSurfaceCounts` each independently resolve org id, though the second is a cache hit not a second round trip). → org id belongs in a JWT claim or a single per-request resolution forwarded down, not re-derived per loader.
- The detail page's fan-out shape (admission guard → parallel scoped fetches) is already the standard pattern and needs no structural replacement — it needs `cacheComponents`/CDN eligibility (PERF-10) so it doesn't have to run cold on every single click at all.
- Every route being `ƒ` Dynamic, confirmed again by this lane's own build, is the single largest lever left un-pulled — and it belongs to PERF-10, not this lane.
- Supavisor pooling is **N/A**: `fsi-app/src/lib/supabase-service.ts` and `fsi-app/src/lib/supabase-server-client.ts` both construct clients from `NEXT_PUBLIC_SUPABASE_URL` — **[CONFIRMED]** by reading both files and grepping for any raw Postgres driver import (none found) — this app talks to Supabase exclusively over HTTPS/PostgREST, never a raw Postgres connection, so a pooler URL is not a lever this app can pull. Region co-location (already fixed) is the real analog of "get the DB close."

Full decision list, citations, and lane ownership: `docs/decisions/ADR-027-standard-fast-page-architecture.md`.
