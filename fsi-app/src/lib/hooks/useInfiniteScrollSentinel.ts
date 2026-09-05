"use client";

// useInfiniteScrollSentinel — PERF-12 (2026-09-04, ADR-027 §2: "fetchNextPage on scroll near the
// end via IntersectionObserver or the virtualizer's range"). The IntersectionObserver half of that
// choice: a small sentinel element, mounted at the foot of a scrolling list, whose entry into the
// viewport (plus `rootMargin`, so it fires BEFORE it is physically visible — a real "one screen
// ahead" prefetch, not "wait until the user hits the wall") calls `onIntersect`.
//
// Standard mechanism, not home-grown: IntersectionObserver is the documented browser-native
// primitive for "call me when this element nears the viewport" (developer.mozilla.org/en-US/docs/
// Web/API/Intersection_Observer_API) — the same technique TanStack Query's own infinite-query
// examples use for their own "load more on scroll" demos.
import { useEffect, useRef } from "react";

/**
 * `rootMargin` defaults to "800px" — roughly one LIST_PAGE_SIZE screen's worth of scroll distance
 * (list-pagination.ts's own row-height/viewport derivation: ~19 rows x ~44px ≈ 840px), so the next
 * page is typically already resident by the time the sentinel would otherwise become visible.
 */
export function useInfiniteScrollSentinel(
  onIntersect: () => void,
  enabled: boolean,
  rootMargin = "800px"
) {
  const ref = useRef<HTMLDivElement>(null);
  const onIntersectRef = useRef(onIntersect);
  onIntersectRef.current = onIntersect;
  // PERF-13 (2026-09-04, docs/audits/perf-clickthrough-2026-09-04.md §(f), root cause): read inside
  // the (stable) observer callback instead of gating the effect itself — see below for why the old
  // shape cascaded.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // PERF-13: this effect used to depend on `[enabled, rootMargin]` and return early when `enabled`
  // was false, so a fetch cycle (`enabled` false while `isFetchingNextPage`, true again once it
  // settles) disconnected the observer and created a BRAND NEW one on every single completed fetch.
  // A freshly-constructed IntersectionObserver always delivers an INITIAL callback reflecting the
  // target's CURRENT intersection state, not just future changes (this is standard, documented
  // IntersectionObserver behavior, not a bug in the API) — so if the sentinel was ALREADY visible
  // (true whenever the page is short enough that no further scrolling is needed, e.g. every band
  // collapsed to its default `ROWS_COLLAPSED` rows, RegulationsLedger.tsx), each completed fetch
  // re-armed a new observer against an already-intersecting element and it fired again immediately
  // — a self-sustaining cascade with NO further user scrolling, which is the mechanism behind the
  // operator's own measurement: "one click [on Load more, itself a legitimate trigger] fetched four
  // pages in a row." The fix: create ONE observer for the life of the mounted sentinel (depends only
  // on `rootMargin`, i.e. effectively mount/unmount), and gate the actual `onIntersect()` call
  // inside the callback via `enabledRef` — this preserves the real IntersectionObserver contract
  // (the callback fires only on an ACTUAL transition of intersection state, per spec — not "every
  // time some unrelated dependency changes and the effect happens to rerun"), which is what makes
  // "one page per viewport reached" (the operator's own bar) the natural behavior instead of an
  // artifact of how often `enabled` happens to flip.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // No IntersectionObserver in this environment (a non-browser test runner, an old browser) —
      // fail soft to "never auto-loads"; the ledger still has whatever it already loaded, and a
      // real browser always has this API (baseline support since 2019).
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (enabledRef.current && entries.some((e) => e.isIntersecting)) onIntersectRef.current();
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return ref;
}
