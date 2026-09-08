"use client";

/**
 * useListSurfaceFilter — filter state for a list surface, held in the URL.
 *
 * COUNTS-61 (production defect, click-through audit 2026-09-08, /regulations): applying the `road`
 * mode narrowed the list correctly and left the URL at a bare `/regulations`, so the filtered view
 * could not be linked, bookmarked or survived a reload — while the band facet DID write `?band=`.
 * One panel, two contracts. This hook is the one contract: every facet round-trips through the URL,
 * using the param names list-surface-helpers.ts owns.
 *
 * Extracted once here rather than four times, because Regulations, Market, Research and Operations
 * all hold the identical `useState<RowFilterState>` today (CLAUDE.md's no-duplication rule).
 *
 * MECHANICS. The URL is the state: `filter` is derived from `useSearchParams()` on every render, so
 * the back button, a pasted link and a reload all land on the same view with no second copy of the
 * truth to fall out of sync. Writes go through `router.replace(..., { scroll: false })` — replace,
 * not push, because a facet toggle is a refinement of the current view rather than a new
 * destination, and a push would make the back button walk every chip the reader tried. Deep-linking
 * into the surface (the dashboard's "All N immediate") still pushes, from the link, as before.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EMPTY_FILTER_STATE,
  filterFromSearchParams,
  searchParamsFromFilter,
  type RowFilterState,
} from "./list-surface-helpers";

export interface ListSurfaceFilterApi {
  filter: RowFilterState;
  /** Set one facet (or the query). `null`/"" clears it, which removes its param entirely. */
  setFacet: (facet: keyof RowFilterState, value: string | null) => void;
  /** Toggle a facet: selecting the value already selected clears it. The band tiles' behaviour,
   *  now available to every group. */
  toggleFacet: (facet: keyof RowFilterState, value: string | null) => void;
  /** Clear every facet and the query — a bare path again. */
  clear: () => void;
  /** Whether anything is currently narrowing the view. */
  active: boolean;
}

export function useListSurfaceFilter(): ListSurfaceFilterApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filter = useMemo(() => filterFromSearchParams(searchParams), [searchParams]);

  const write = useCallback(
    (next: RowFilterState) => {
      const qs = searchParamsFromFilter(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setFacet = useCallback(
    (facet: keyof RowFilterState, value: string | null) => {
      write({ ...filter, [facet]: facet === "query" ? value ?? "" : value });
    },
    [filter, write],
  );

  const toggleFacet = useCallback(
    (facet: keyof RowFilterState, value: string | null) => {
      const current = filter[facet];
      write({ ...filter, [facet]: current === value ? null : value });
    },
    [filter, write],
  );

  const clear = useCallback(() => write({ ...EMPTY_FILTER_STATE }), [write]);

  return {
    filter,
    setFacet,
    toggleFacet,
    clear,
    active: Boolean(
      filter.band || filter.mode || filter.region || filter.topic || filter.tier || filter.query.trim(),
    ),
  };
}
