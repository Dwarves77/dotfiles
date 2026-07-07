"use client";

/**
 * DashboardHero — the 4-up priority tile strip on the Dashboard body.
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + "Pages - 01 Dashboard" mock). Four
 * EQUAL tiles (Immediate action / High / Moderate / Low), each: colored
 * eyebrow → Anton numeral in the severity hue → sub-label → a 5px severity
 * gradient underline. Hex/px lifted from the mock inline styles; all values
 * reference the §2 / banded-ledger tokens in theme.css (no raw hex, no
 * Tailwind-default substitution).
 *
 * COUNTS: per-priority buckets read the workspace aggregates
 * (getWorkspaceAggregates / migration 068 byPriority) — the true workspace
 * totals, NOT recomputed from the capped row payload and NOT the mock
 * snapshot literals. Fail-soft to row-derived counts when aggregates report
 * zero (anon caller / seed fallback / RPC error).
 *
 * TILE BEHAVIOUR (pending decision, HANDOFF §6.3 + §9): the mock jumps each
 * tile to the "This week" priority list (#priority anchor). Making the tiles
 * FILTER the dashboard's own lists like every other surface's tiles is a
 * pending operator decision — the plumbing is built (onSelectBand +
 * TILES_AS_LIVE_FILTERS) but DISABLED. Until approved, tiles scroll to
 * #priority only. See DESIGN-DEVIATIONS.md.
 */

import { useMemo } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";

/**
 * PENDING DECISION — do NOT flip without operator approval (HANDOFF §9).
 * When true, clicking a tile filters the dashboard's own lists in place;
 * when false (current), tiles scroll to the #priority "This week" list.
 * The onSelectBand plumbing is wired either way so activation is a one-line
 * change once approved.
 */
export const TILES_AS_LIVE_FILTERS = false;

export type PriorityBand = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

interface DashboardHeroProps {
  /** Capped row payload — fallback count source when aggregates are absent
   *  or report zero (anon / seed / RPC error). */
  resources: Resource[];
  /** Scalar workspace aggregates (migration 068). Primary count source. */
  aggregates?: WorkspaceAggregates;
  /** Pending live-filter plumbing (DISABLED via TILES_AS_LIVE_FILTERS). */
  onSelectBand?: (band: PriorityBand) => void;
}

interface HeroTile {
  band: PriorityBand;
  eyebrow: string;
  /** Eyebrow + numeral hue token. */
  fig: string;
  /** 5px underline gradient/solid token. */
  strip: string;
  label: string;
}

const TILES: HeroTile[] = [
  {
    band: "CRITICAL",
    eyebrow: "Immediate action",
    fig: "var(--reg-band-immediate)",
    strip: "var(--reg-band-immediate-strip)",
    label: "Critical, within 90 days",
  },
  {
    band: "HIGH",
    eyebrow: "High",
    fig: "var(--reg-band-action)",
    strip: "var(--reg-band-action-strip)",
    label: "Action, 6 mo",
  },
  {
    band: "MODERATE",
    eyebrow: "Moderate",
    fig: "var(--reg-band-monitor)",
    strip: "var(--reg-band-monitor-strip)",
    label: "Monitor, 6 to 12 mo",
  },
  {
    // Mock: Low tile eyebrow + numeral render muted-secondary; only the
    // bottom rule is green (--reg-tile-low-fig keeps that intent explicit).
    band: "LOW",
    eyebrow: "Low",
    fig: "var(--reg-tile-low-fig)",
    strip: "var(--reg-band-awareness-strip)",
    label: "Awareness only",
  },
];

export function DashboardHero({ resources, aggregates, onSelectBand }: DashboardHeroProps) {
  const counts = useMemo<Record<PriorityBand, number>>(() => {
    const useAggregates = !!aggregates && aggregates.totalItems > 0;
    const fromRows = (pri: PriorityBand) =>
      resources.filter((r) => r.priority === pri).length;
    const count = (pri: PriorityBand) =>
      useAggregates ? aggregates!.byPriority[pri] : fromRows(pri);
    return {
      CRITICAL: count("CRITICAL"),
      HIGH: count("HIGH"),
      MODERATE: count("MODERATE"),
      LOW: count("LOW"),
    };
  }, [resources, aggregates]);

  const activate = (band: PriorityBand) => {
    if (TILES_AS_LIVE_FILTERS && onSelectBand) {
      onSelectBand(band);
      return;
    }
    // Default (mock) behaviour: jump to the "This week" priority list.
    document
      .getElementById("priority")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      role="group"
      aria-label="Priority breakdown"
      className="cl-dash-tiles"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 14,
        margin: "0 0 22px",
      }}
    >
      <style>{`
        @media (max-width: 767px) {
          .cl-dash-tiles { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
      `}</style>
      {TILES.map((t) => (
        <button
          key={t.band}
          type="button"
          onClick={() => activate(t.band)}
          aria-label={`${t.eyebrow} — ${counts[t.band]} items; ${TILES_AS_LIVE_FILTERS ? "filter this band" : "jump to this week's priority list"}`}
          className="cl-dash-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{
            textAlign: "left",
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            overflow: "hidden",
            display: "block",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          <div style={{ padding: "16px 18px 12px" }}>
            <p
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: t.fig,
                margin: "0 0 4px",
              }}
            >
              {t.eyebrow}
            </p>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 44,
                lineHeight: 1,
                color: t.fig,
                margin: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {counts[t.band]}
            </p>
            <p
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                margin: "6px 0 0",
              }}
            >
              {t.label}
            </p>
          </div>
          <div aria-hidden="true" style={{ height: 5, background: t.strip }} />
        </button>
      ))}
    </div>
  );
}
