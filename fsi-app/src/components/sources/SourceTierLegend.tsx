"use client";

/**
 * SourceTierLegend + SourceTierFacet + TierDefinitionsOverlay: the tier vocabulary as the
 * source registry card wears it (lane adminlayout, 2026-09-08, the operator's item 3).
 *
 * What this replaces: a "Source Tiers, how we rank authority" explainer block and a row of
 * seven T1-T7 summary CARDS above the registry table. Artboard 13 makes tier a COLUMN in the
 * source table, not a card set, and the card row was the region that ran past the content
 * column and under the rail at 1024 (measured: 688px of content in a 352px column). The rule
 * the operator states with it is absolute and wider than this page: nothing in the product may
 * require a horizontal reach to be seen. So the vocabulary goes three places, all reachable by
 * vertical scroll or Tab:
 *
 *   SourceTierLegend        T1..T7 squares in the card header, each carrying its authority
 *                           label as its tooltip and its accessible name, plus the
 *                           "Tier definitions" trigger.
 *   TierDefinitionsOverlay  a plain overlay listing the seven lines in full.
 *   SourceTierFacet         the per-tier COUNTS, in the table's own facet row, where clicking
 *                           one filters the table (`toggleTierFilter`, which `filterSources`
 *                           already honoured and which nothing in the app had ever mounted).
 *
 * The authority label always comes from `TIER_LABELS` (src/lib/tier-labels.ts), the single tier
 * vocabulary SoT under the tier-labels drift guard; the example gloss is this surface's own
 * detail and lives here beside the only thing that renders it.
 */

import { useCallback, useEffect, useRef } from "react";
import { TIER_LABELS } from "@/lib/tier-labels";
import { TierChip, FilterChip, FilterChipGroup } from "@/components/ui/Chips";
import { formatNumber } from "@/lib/format";
import type { Source, SourceTier } from "@/types/source";

/** The tier vocabulary's own order, T1 (most authoritative) first. */
export const SOURCE_TIERS: SourceTier[] = [1, 2, 3, 4, 5, 6, 7];

/** Dashboard-specific example gloss per tier. The authority NAME comes from TIER_LABELS (SoT). */
export const TIER_LEGEND_EXAMPLES: Record<number, string> = {
  1: "Official legal text (gazettes, Federal Register)",
  2: "Regulator guidance (FAQs, portals)",
  3: "Intergovernmental (IGO datasets, trackers)",
  4: "Expert analysis (think tanks, NGOs)",
  5: "Industry standards (ISO, IATA)",
  6: "Commercial intelligence (law firms, consultancies)",
  7: "News & commentary (trade press)",
};

/**
 * The tier a source is COUNTED and FILTERED at. `filterSources` matches on
 * `effective_tier ?? base_tier`, so a facet count derived any other way could name a number its
 * own filter would not return. One function, used by both sides.
 */
export function facetTierOf(s: Source): number {
  return s.effective_tier ?? s.base_tier;
}

/** Per-tier counts over the loaded registry, keyed exactly as the filter matches. */
export function tierCounts(sources: Source[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const t of SOURCE_TIERS) out[t] = 0;
  for (const s of sources) {
    const t = facetTierOf(s);
    if (out[t] !== undefined) out[t] += 1;
  }
  return out;
}

/** The header legend: seven squares, label as tooltip and accessible name, then the trigger. */
export function SourceTierLegend({ onOpenDefinitions }: { onOpenDefinitions: () => void }) {
  return (
    <div
      data-audit="tier-legend"
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}
    >
      <span
        style={{
          fontSize: "var(--fs-10)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        Tiers
      </span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {SOURCE_TIERS.map((t) => (
          <span
            key={t}
            role="img"
            title={`T${t} · ${TIER_LABELS[t]}`}
            aria-label={`T${t}, ${TIER_LABELS[t]}`}
            style={{ display: "inline-flex" }}
          >
            <TierChip tier={t} max={7} />
          </span>
        ))}
      </span>
      <button
        type="button"
        onClick={onOpenDefinitions}
        style={{
          fontFamily: "inherit",
          fontSize: "var(--fs-11)",
          fontWeight: 600,
          color: "var(--ink)",
          background: "none",
          border: "none",
          padding: "4px 0",
          minHeight: 28,
          textDecoration: "underline",
          textDecorationColor: "rgba(0,0,0,.3)",
          cursor: "pointer",
        }}
      >
        Tier definitions
      </button>
    </div>
  );
}

/** The tier facet: one chip per tier carrying its live count, clicking filters the table. */
export function SourceTierFacet({
  counts,
  active,
  onToggle,
}: {
  counts: Record<number, number>;
  active: SourceTier[];
  onToggle: (tier: SourceTier) => void;
}) {
  return (
    <div data-audit="tier-facet">
      <FilterChipGroup label="Tier">
        {SOURCE_TIERS.map((t) => (
          <FilterChip key={t} active={active.includes(t)} onClick={() => onToggle(t)}>
            T{t} {formatNumber(counts[t] ?? 0)}
          </FilterChip>
        ))}
      </FilterChipGroup>
    </div>
  );
}

/**
 * The definitions overlay. Plain: a scrim, a white panel, the seven lines, one close control.
 * Esc closes, focus moves to the panel on open and the trigger keeps its own place in the tab
 * order behind it. `position: fixed` is the overlay exemption, not content chrome.
 */
export function TierDefinitionsOverlay({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Source tier definitions"
      data-audit="tier-definitions-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(26,26,26,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "80vh",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 1px 2px rgba(26,26,26,.04), 0 4px 14px rgba(26,26,26,.06)",
          padding: "16px 18px 18px",
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Tier definitions
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: "inherit",
              fontSize: "var(--fs-11)",
              fontWeight: 700,
              color: "var(--ink-2)",
              background: "none",
              border: "none",
              minHeight: 28,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {SOURCE_TIERS.map((t) => (
            <li key={t} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <TierChip tier={t} max={7} />
              <span style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--ink)" }}>{TIER_LABELS[t]}</b> · {TIER_LEGEND_EXAMPLES[t]}
              </span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "12px 0 0", lineHeight: 1.5 }}>
          <b>Score</b> measures reliability: freshness of last check, historical accuracy, and
          whether we can verify the source independently.
        </p>
      </div>
    </div>
  );
}
