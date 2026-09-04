"use client";

// useLedgerInfiniteQuery — PERF-12 (2026-09-04, ADR-027 §2, tanstack.com/query/latest/docs/
// framework/react/guides/infinite-queries).
//
// The standard TanStack Query mechanism for "one page of rows at a time, more on demand" —
// replaces RegulationsLedger's old hand-rolled `fetchedRestRef`/`restResources`/`restStatus`
// useEffect (a one-shot fetch against LIST_REMAINDER_LIMIT=5000, DELETED — see
// list-pagination.ts's own header) with the documented `useInfiniteQuery` shape: `data.pages`,
// `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`.
//
// SSR HYDRATION (ADR-027 §2, "first paint is the SSR page, TanStack takes over without a second
// fetch"): the caller (RegulationsLedger.tsx) passes the server-fetched first page as `initialPage`
// — TanStack Query's OWN `initialData` mechanism (tanstack.com/query/latest/docs/framework/react/
// guides/initial-query-data), one of this ADR's two named options ("via HydrationBoundary/
// initialData"). `initialData` was chosen over a full server-side `dehydrate`/`HydrationBoundary`
// pair for two concrete reasons, not merely simplicity for its own sake: (1) this hook — and the
// ledger that calls it — is ALSO mounted directly (no page.tsx, no server QueryClient) by the
// existing rendering-smoke harness (`.discipline/rendering/smoke/regulations-rows-smoke.mjs`,
// which this lane's own gate run must keep green); `initialData`, sourced straight from a prop, is
// synchronous and works identically in both contexts, while `dehydrate` requires a real per-request
// server QueryClient regulations/page.tsx would have to construct and this smoke harness has no
// analog for. (2) With `initialData` set, `useInfiniteQuery` never issues a fetch for page one at
// all (per TanStack's own docs: initialData marked fresh via `staleTime` is treated exactly as if
// the query already ran) — the SAME "no second fetch on first paint" guarantee dehydrate/hydrate
// would give, with strictly less server-side plumbing. This hook only ever issues a NETWORK request
// when `fetchNextPage()` is actually called (a scroll past the end, or a manual "Load more").
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Resource } from "@/types/resource";
import { FIRST_LISTING_CURSOR, encodeListingCursor } from "@/lib/list-pagination";

export interface LedgerPage {
  resources: Resource[];
  archived: Resource[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** The pageParam for the very first page — MUST match what regulations/page.tsx seeds
 *  `pageParams[0]` with, or the hydrated cache entry and this hook's own `initialPageParam` would
 *  disagree and TanStack Query would treat the seed as stale/mismatched. */
export const FIRST_PAGE_PARAM = encodeListingCursor(FIRST_LISTING_CURSOR);

/** Query key builder — exported so the server-side seed (regulations/page.tsx) and this hook
 *  build the IDENTICAL key; a hand-typed duplicate array literal in two files is exactly the kind
 *  of drift that would silently break hydration (a mismatched key just means "no seed found",
 *  which fails soft into a real fetch — not a crash — but would defeat the "no second fetch on
 *  first paint" goal this hook exists for without any visible error). Keyed by `surface` only
 *  (not filters/sort): every filter (search, mode, topic, region, priority) and every sort mode
 *  this ledger supports is applied CLIENT-SIDE over the already-fetched pages (RegulationsLedger's
 *  own `matchesFilters`/`sortRows`, unchanged by this lane) — the server has never taken filter
 *  params, so the fetched row SET does not vary by filter and the cache key correctly does not
 *  either. Domain is likewise fixed (REGULATIONS_DOMAIN) for this surface, not a variable. */
export function ledgerListingQueryKey(surface: string) {
  return ["ledger-listing", surface] as const;
}

// RECONCILE (2026-09-04, item 1): no `orgId`/`X-Org-Id` header — /api/listings/cursor now serves the
// org-independent public RPC (see that route's own header), so there is no per-session org id for
// this request to carry or for the server to verify. A 409 "org mismatch" response can no longer
// occur (the route itself no longer returns one) — the surviving error path is a plain non-2xx/`error`
// body, same as any other fetch failure.
async function fetchLedgerPage(surface: string, cursor: string): Promise<LedgerPage> {
  const res = await fetch(`/api/listings/cursor?surface=${encodeURIComponent(surface)}&cursor=${cursor}`);
  if (!res.ok) throw new Error(`/api/listings/cursor responded ${res.status}`);
  const body = (await res.json()) as Partial<LedgerPage> & { error?: string };
  if (body.error) throw new Error(body.error);
  return {
    resources: body.resources ?? [],
    archived: body.archived ?? [],
    nextCursor: body.nextCursor ?? null,
    hasMore: !!body.hasMore,
  };
}

export interface UseLedgerInfiniteQueryResult {
  resources: Resource[];
  archived: Resource[];
  status: "pending" | "error" | "success";
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  error: string | null;
  /** True specifically when the LAST `fetchNextPage()` attempt failed (TanStack Query v5's own
   *  `isFetchNextPageError` — distinct from `status === "error"`, which is the INITIAL page's own
   *  status and stays "success" once initialData/a first fetch has landed, however many later
   *  fetchNextPage calls fail). What already loaded stays exactly as it was on either kind of
   *  error — this hook never clears `data.pages` on a failure. */
  isFetchNextPageError: boolean;
}

/**
 * `surface` is currently only ever `"regulations"` (see /api/listings/cursor's own header for why
 * the other three ledgers are not wired to this yet). Kept as a parameter rather than hard-coded
 * so a future surface can adopt this same hook with zero shape change once its own audit confirms
 * it needs cursor pagination — the point of building ONE shared mechanism, not a Regulations-only
 * one-off.
 *
 * `initialPage` — the server-fetched (or, in the rendering-smoke harness, fixture-supplied) first
 * page, always present on a real render (regulations/page.tsx always has SOME first page, even an
 * empty/degraded one — see that file's own comment). Optional only so a future non-SSR consumer of
 * this hook (none exists today) is not forced to fabricate one.
 */
export function useLedgerInfiniteQuery(
  surface: string,
  initialPage?: LedgerPage
): UseLedgerInfiniteQueryResult {
  const query = useInfiniteQuery({
    queryKey: ledgerListingQueryKey(surface),
    queryFn: ({ pageParam }) => fetchLedgerPage(surface, pageParam as string),
    initialPageParam: FIRST_PAGE_PARAM,
    getNextPageParam: (lastPage: LedgerPage) => lastPage.nextCursor ?? undefined,
    // ADR-027 §2's "hydrated ... via initialData" — see this module's own header for why
    // `initialData` (a TanStack Query built-in, tanstack.com/query's own initial-query-data guide)
    // rather than a full server dehydrate/HydrationBoundary pair.
    initialData: initialPage
      ? { pages: [initialPage], pageParams: [FIRST_PAGE_PARAM] }
      : undefined,
    // The seeded first page IS the current truth for up to 30s (QueryProvider's own
    // defaultOptions.staleTime) — without this, initialData is treated as already-stale and
    // useInfiniteQuery would fire an immediate background refetch of page one on every mount,
    // defeating "no second fetch on first paint" the moment a component using this hook remounts
    // (e.g. a client-side navigation away and back).
    staleTime: 30_000,
  });

  // MEMOIZED, keyed on `query.data?.pages` — TanStack Query only produces a NEW `data.pages`
  // reference when the page set actually changes (its own structural-sharing contract:
  // tanstack.com/query/latest/docs/framework/react/guides/render-optimizations, "structural
  // sharing"). Without this useMemo, `.flatMap` below built a brand-new array on EVERY call to this
  // hook regardless of whether the underlying pages changed — the caller's own effect that syncs
  // these into local state (RegulationsLedger.tsx, `useEffect(..., [pagedResources, pagedArchived])`)
  // depends on referential identity, so a fresh array every render meant that effect fired every
  // render, called setState every render, forced a re-render, produced ANOTHER fresh array, and so
  // on — a `setState`-in-effect loop that React aborts as "Maximum update depth exceeded"
  // (reproduced and root-caused via the rendering-smoke gate, this lane's own REPORT). Memoizing here
  // makes the returned arrays referentially stable across renders where the page set has not
  // changed, which is what the consuming effect's dependency array was always assuming.
  const pages = query.data?.pages ?? [];
  const resources = useMemo(() => pages.flatMap((p) => p.resources), [query.data?.pages]);
  const archived = useMemo(() => pages.flatMap((p) => p.archived), [query.data?.pages]);
  return {
    resources,
    archived,
    status: query.status,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    isFetchNextPageError: query.isFetchNextPageError,
  };
}
