"use client";

/**
 * RelevanceBadgeClient — client-fetching wrapper around RelevanceBadge.tsx (unchanged, pure
 * presentational). PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up).
 *
 * WHY THIS EXISTS. Every one of the four detail pages (regulations/market/operations/research/[slug])
 * used to compute `relevance` server-side via loadDetailCore's UNCONDITIONAL
 * `deps.getRelevance(relevanceInput)` call — resolveOrgIdFromCookies() underneath it, a Dynamic API
 * read that alone forced all four routes to build `ƒ` regardless of any other fix. See
 * GET /api/detail/relevance's own header for the full mechanism (a Route Handler's Dynamic-API
 * dependency does not propagate to a page that merely fetch()s it client-side). All four detail
 * page.tsx files now pass `relevance={null}` to their surface component's server render (see each
 * page's own PERF-10 comment) — this component is what actually resolves the real, per-viewer value,
 * client-side, after first paint.
 *
 * Renders nothing while loading — RelevanceBadge itself already renders nothing for `relevance: null`
 * (the lens's own documented fail-open posture: "no relevance signal is not an error state worth a
 * banner"), so a loading state and a resolved-empty state are visually identical by design, same
 * reasoning UpcomingObligationsStrip's detail variant and ObligationRegister's detail variant apply —
 * this is a small annotating badge, not primary content, and never blocks or delays anything around it.
 */

import { useEffect, useState } from "react";
import { RelevanceBadge } from "@/components/shell/RelevanceBadge";
import type { ItemRelevance } from "@/lib/workspace/profile";

export function RelevanceBadgeClient({ itemId }: { itemId: string }) {
  const [relevance, setRelevance] = useState<ItemRelevance | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/detail/relevance?itemId=${encodeURIComponent(itemId)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { relevance: null }))
      .then((body: { relevance: ItemRelevance | null }) => {
        if (!cancelled) setRelevance(body.relevance ?? null);
      })
      .catch(() => {
        if (!cancelled) setRelevance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return <RelevanceBadge relevance={relevance} />;
}
