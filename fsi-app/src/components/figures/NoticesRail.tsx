"use client";

/**
 * NoticesRail — the one client-side fetch-and-render wrapper for GET /api/notices, so every surface that
 * wants a recalculation-notices rail imports ONE module instead of re-implementing the fetch (lane
 * NOTICES, complete-system train, 2026-09-05; extracted from `AutomateVsHireCalculator.tsx`, which had the
 * only prior copy of this exact fetch-with-Bearer-token-then-render sequence — CLAUDE.md's "no copies of
 * logic" rule, made concrete the moment a second consumer needed the same behaviour).
 *
 * Mounted on: Operations' `AutomateVsHireCalculator` (unchanged behaviour, now via this module), the
 * Market index page, and all four item detail surfaces (regulations/market/operations/research `[slug]`)
 * — docs/plans/complete-system-build-plan-2026-09-04.md W4.3: "RecalculationNotice renders on the item
 * detail and on Market for items whose figures were recomputed, with the honest empty state when there
 * are none."
 *
 * SCOPE, UNCHANGED FROM THE ROUTE ITSELF: GET /api/notices is org-watchlist-scoped, not item-scoped (see
 * that route's own header — "team, not item"). This rail therefore shows the SAME feed everywhere it is
 * mounted: every recalculation notice for anything the viewer's org has watched, not only the one item the
 * surface happens to be showing. That is the honest shape of the underlying feed, not a per-mount
 * narrowing this component invents — narrowing to "notices about entities THIS item names" would need a
 * server-side item->entity filter the route does not offer today (a real, separately-scoped future
 * enhancement, not silently faked here).
 *
 * AUTH: via authedFetch (src/lib/api/authed-fetch.ts), the one shared builder WatchButton.tsx and
 * AutomateVsHireCalculator.tsx already establish for this codebase's client-side authenticated fetches —
 * reused, not reinvented.
 */

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { RecalculationNotice } from "./RecalculationNotice";
import type { RecalculationNoticeItem } from "./RecalculationNotice";

export interface NoticesRailProps {
  /** Heading shown above the rail. Callers on a page that already has an obvious section label (e.g. the
   *  Operations calculator's own "Recent recalculations" convention) can pass their own text; the default
   *  suits a standalone mount (Market index, item detail pages). */
  heading?: string;
  /** Passed through to RecalculationNotice's own honest-empty-state copy — see that component's default
   *  for the baseline wording this overrides. */
  emptyMessage?: string;
  /** When true, skip this rail's own `cl-card` wrapper — for a caller (AutomateVsHireCalculator) that
   *  already renders its own enclosing card and only wants the heading + list inline within it. Default
   *  false suits every standalone mount (Market index, item detail pages), which have no such wrapper. */
  bare?: boolean;
}

/**
 * useRecalculationNotices — the fetch on its own, so a caller that needs the
 * FEED rather than the rendered rail reads the same endpoint through the same
 * code path instead of a second copy of this sequence. Extracted by lane
 * comp-11 (2026-09-08): artboard 11 states the notice COUNT in a state-note
 * strip at the foot of the Watched card and the notice LIST in its own card
 * below it — two regions off one feed. `NoticesRail` is now this hook plus its
 * markup, unchanged in behaviour.
 */
export function useRecalculationNotices(): {
  notices: RecalculationNoticeItem[];
  loading: boolean;
  /** COUNTS-61 (production defect, click-through audit 2026-09-08): the START of the window these
   *  notices cover, as the route itself reports it (`json.since`). The route has always returned it;
   *  this hook used to discard it, which is why /watchlist could print "SINCE YOUR LAST VISIT" twice
   *  and never state a date. It is NOT a last-visit instant and never was: GET /api/notices defaults
   *  to a fixed 30-day window (DEFAULT_WINDOW_DAYS in its own logic.ts) and no caller sends `?since=`.
   *  Surfaces state the window this value describes rather than a visit the product does not track. */
  since: string | null;
} {
  const [notices, setNotices] = useState<RecalculationNoticeItem[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/notices", {
          cache: "no-store"
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (Array.isArray(json.notices)) setNotices(json.notices);
        if (typeof json.since === "string") setSince(json.since);
      } catch {
        // Fail soft — the notices rail is a courtesy on every surface it appears on, never a blocker for
        // the page's own primary content (same posture AutomateVsHireCalculator's prior inline copy took).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { notices, loading, since };
}

export function NoticesRail({
  heading = "Recalculation notices",
  // COUNTS-61 (2026-09-08): "since your last visit" was false on every mount — GET /api/notices
  // covers a fixed 30-day window and no caller sends `?since=`; the product tracks no last visit.
  emptyMessage = "No recalculations on your team's watchlist in this window.",
  bare = false,
}: NoticesRailProps) {
  const { notices, loading } = useRecalculationNotices();

  const body = (
    <>
      <div className="cl-section-label" style={{ marginBottom: 8 }}>
        {heading}
      </div>
      {loading ? (
        <div className="cl-card-meta">Loading…</div>
      ) : (
        <RecalculationNotice notices={notices} emptyMessage={emptyMessage} />
      )}
    </>
  );

  if (bare) {
    return (
      <div aria-label={heading} data-notices-rail>
        {body}
      </div>
    );
  }

  return (
    <section className="cl-card" style={{ padding: "16px 18px" }} aria-label={heading} data-notices-rail>
      {body}
    </section>
  );
}
