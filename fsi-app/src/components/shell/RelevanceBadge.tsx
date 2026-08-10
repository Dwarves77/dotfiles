/**
 * RelevanceBadge — flywheel U9 (D1). Renders the read-time relevance lens (relevanceForItem,
 * src/lib/workspace/profile.ts, Option B mig 251) on an item detail page: a band pill (high/medium/low)
 * plus the deterministic one-line "Relevance to your operation" summary. Server component (no client
 * state) — the caller resolves the viewer's relevance server-side (per-request, never cached alongside
 * the item itself: see getViewerRelevanceForItem in supabase-server.ts for why) and passes the result.
 *
 * A LENS, not a filter/gate (relevance.mjs's own framing) — this never hides the item, only annotates
 * it. Absent relevance (viewer has no org, or the computation soft-failed) renders nothing, matching the
 * lens's fail-open posture: no relevance signal is not an error state worth a banner.
 */

import type { ItemRelevance } from "@/lib/workspace/profile";

const BAND_COLOR: Record<ItemRelevance["band"], string> = {
  high: "var(--accent)",
  medium: "var(--moderate)",
  low: "var(--muted)",
};
const BAND_LABEL: Record<ItemRelevance["band"], string> = {
  high: "High relevance",
  medium: "Some relevance",
  low: "General applicability",
};

export function RelevanceBadge({ relevance }: { relevance: ItemRelevance | null }) {
  if (!relevance) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "2px 8px",
          borderRadius: 999,
          background: BAND_COLOR[relevance.band],
          color: "var(--surface)",
          whiteSpace: "nowrap",
        }}
      >
        {BAND_LABEL[relevance.band]}
      </span>
      <span style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--text-2)" }}>{relevance.summary}</span>
    </div>
  );
}
