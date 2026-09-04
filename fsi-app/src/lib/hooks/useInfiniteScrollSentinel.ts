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

  useEffect(() => {
    if (!enabled) return;
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
        if (entries.some((e) => e.isIntersecting)) onIntersectRef.current();
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return ref;
}
