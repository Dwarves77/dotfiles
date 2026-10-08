"use client";

/**
 * UpcomingObligationsStrip — the CUSTOMER-FACING top strip for item_forward_events ("what is due,
 * when"), lane SURF (2026-09-01), converted to a client-side fetch by PERF-10 (2026-09-04,
 * root-cause fix, ADR-026 Follow-up).
 *
 * WHY THIS CHANGED. This was an async Server Component reading item_forward_events via
 * createSupabaseServerClient (cookie-bound) DURING its own server render — a Dynamic API call that
 * forced /regulations and /market to build `ƒ` (Dynamic) at build time, independent of the shared-
 * layout cause this lane's layout.tsx commit removes. src/lib/forward-events/read-upcoming.mjs's own
 * header is explicit: this data MUST always be read through the request-scoped, cookie-bound client
 * (RLS is the only gate) — never a service-role client. This lane respects that prohibition rather
 * than reversing it: the SAME read-upcoming.mjs call, through the SAME request-scoped client, now
 * runs inside a Route Handler (GET /api/obligations/upcoming — see its own header for the full
 * mechanism) instead of this component's server render. A Route Handler's own Dynamic-API dependency
 * does not propagate to a page that merely fetch()s it client-side, which is what unblocks static
 * generation here.
 *
 * UX-LAWS COMPLIANCE (docs/design/ux-laws.md — never render empty or wrong while the per-viewer
 * layer loads): the list variant shows an explicit "Loading upcoming obligations…" state, never a
 * silent blank that could be misread as "nothing is due." The detail variant (a small optional rail
 * card) shows nothing while loading, matching its own already-honest "nothing to show" contract for
 * an item with zero events — the loading state and the truly-empty state look identical there by
 * design (a rail card popping in a moment after the surrounding page has already painted is not the
 * kind of surface this law is protecting; the strip's cross-workspace obligations list is).
 *
 * ROW MARKUP is UNCHANGED: UpcomingObligationsStripView.tsx still owns every byte of Header / EventCard
 * / DetailCard (its own header explains why that split exists — a browser-bundling constraint that
 * predates and is now independent of this lane's change, kept as-is rather than re-merged, since the
 * rendering smoke harness (.discipline/rendering/smoke/regulations-rows-smoke.mjs) mounts that file
 * directly and F35's coverage scan text-matches this file's own import path).
 */

import { useEffect, useState } from "react";
import { UpcomingObligationsStripView, type UpcomingEvent } from "@/components/regulations/UpcomingObligationsStripView";

/** The active scope a surface hands the strip (lane MKT-1; the Market policy timeline). `null` on a
 *  dimension means the surface has no facet for it, and the read falls back to the workspace profile's.
 *  Never passed by Regulations, which keeps the unscoped read exactly as it was. */
export interface StripScope {
  modes: string[] | null;
  regions: string[] | null;
}

interface Props {
  /** "list" (default): top strip, next 8, jurisdiction-filtered to the workspace's weighted
   *  jurisdictions. "detail": one item's own upcoming events — pass `itemId`. */
  variant?: "list" | "detail";
  /** Required for variant="detail" — the item's UI id (a real uuid or a legacy_id; the API route
   *  resolves either, mirroring the pre-this-lane server component's own resolution). */
  itemId?: string;
  /** How many rows to show. Defaults: 8 for the list strip, 20 for a detail section. */
  limit?: number;
  /** List variant only. When given, the read is filtered to this scope (facets first, then the workspace
   *  profile) and the strip shows the filter as text with an "N hidden by your scope" widen control. When
   *  omitted the strip renders exactly as it always has. */
  scope?: StripScope;
}

interface ApiResult {
  events: UpcomingEvent[];
  hasJurisdictionFilter: boolean;
  /** Present only on a scoped read. */
  scope?: { label: string };
  hiddenByScope?: number;
}

export function UpcomingObligationsStrip({ variant = "list", itemId, limit, scope }: Props) {
  const scoped = variant === "list" && !!scope;
  const [widened, setWidened] = useState(false);
  const modesKey = scope?.modes?.join(",") ?? "";
  const regionsKey = scope?.regions?.join(",") ?? "";
  const [state, setState] = useState<{ loading: boolean; result: ApiResult | null }>({
    loading: true,
    result: null,
  });

  useEffect(() => {
    if (variant === "detail" && !itemId) {
      // Resolving to the empty result for a detail variant with no itemId yet, before the fetch
      // below can run; this early-return guard and the fetch are one synchronization.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ loading: false, result: { events: [], hasJurisdictionFilter: false } });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const params = new URLSearchParams();
    if (variant === "detail" && itemId) params.set("itemId", itemId);
    if (limit) params.set("limit", String(limit));
    if (scoped) {
      if (widened) {
        params.set("scope", "all");
      } else {
        params.set("scope", "1");
        if (modesKey) params.set("modes", modesKey);
        if (regionsKey) params.set("regions", regionsKey);
      }
    }
    fetch(`/api/obligations/upcoming?${params.toString()}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { events: [], hasJurisdictionFilter: false }))
      .then((result: ApiResult) => {
        if (!cancelled) setState({ loading: false, result });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, result: { events: [], hasJurisdictionFilter: false } });
      });
    return () => {
      cancelled = true;
    };
  }, [variant, itemId, limit, scoped, widened, modesKey, regionsKey]);

  if (state.loading) {
    if (variant === "detail") return null; // see this file's header — matches the eventual empty state
    return (
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 36px 0" }}>
        <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
          Loading upcoming obligations…
        </p>
      </section>
    );
  }

  const result = state.result ?? { events: [], hasJurisdictionFilter: false };
  return (
    <UpcomingObligationsStripView
      variant={variant}
      events={result.events}
      hasJurisdictionFilter={result.hasJurisdictionFilter}
      scopeInfo={
        scoped
          ? {
              label: result.scope?.label ?? "",
              hiddenByScope: result.hiddenByScope ?? 0,
              widened,
              onToggleWiden: () => setWidened((w) => !w),
            }
          : undefined
      }
    />
  );
}
