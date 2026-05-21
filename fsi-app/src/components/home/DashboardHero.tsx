"use client";

/**
 * DashboardHero — the 4-up hero strip on the home dashboard masthead.
 *
 * Matches design_handoff_2026-04/preview/dashboard-v3.html `.hero` /
 * `.h-card` spec:
 *   - 1.4fr / 1fr / 1fr / 1fr column layout — Critical tile is wider.
 *   - Critical: diagonal gradient (linear-gradient(135deg, #FEF2F2 0%, #FFF 55%)),
 *     4px left rail, 84px Anton numeral.
 *   - Other tiles: flat surface, 72px Anton numeral, colored eyebrow
 *     + colored numeral.
 *   - Each tile: eyebrow (k) → numeral (n) → label (l) → helper (m).
 *
 * This is the dashboard-only variant. Other pages use the standard
 * 4-equal-column StatStrip from src/components/ui/StatStrip.tsx.
 *
 * F4 + F5 wire-up (PR-G, 2026-05-06; reverted in Hotfix 1, 2026-05-07):
 * Tiles deep-link to /regulations?priority={CRITICAL|HIGH|MODERATE|LOW}.
 * The "10 critical" badge represents 10 critical regulations and lands on
 * the filtered regulations index. The earlier PR-G route to /market was
 * reverted because the priority callouts describe regulation counts, not
 * market lifecycle states. RegulationsPage reads the `priority` URL param
 * and pre-applies it to its filter on mount.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import type { CriticalItemsSnapshot } from "@/lib/dashboard/critical-items";

interface DashboardHeroProps {
  // Row payload — used directly when no aggregates are supplied (e.g.
  // /regulations passes the UN-capped listings array, where row-derived
  // counts are already correct). Also the fallback when aggregates are
  // present but report zero items (seed / anon / RPC failure paths).
  resources: Resource[];
  // Optional scalar aggregates (migration 068). The home dashboard (/)
  // passes this to override the LIMIT-50 row payload's misleading counts;
  // surfaces whose row payload is already complete (e.g. /regulations
  // via getListingsOnly) can omit it and the component falls back to
  // resources.filter().length unchanged.
  aggregates?: WorkspaceAggregates;
  // Build 11: workspace-scoped critical-items snapshot. When supplied,
  // the CRITICAL tile's helper line shows the real "N inside W days" count
  // plus a short preview of the closest deadlines (title, jurisdiction,
  // day count). Omit on surfaces other than the home dashboard (e.g.
  // /regulations) to suppress the helper line without changing the tile.
  criticalSnapshot?: CriticalItemsSnapshot;
}

interface HeroTile {
  tone: "critical" | "high" | "moderate" | "low";
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  eyebrow: string;
  numeral: number;
  label: string;
  helper?: string;
}

export function DashboardHero({
  resources,
  aggregates,
  criticalSnapshot,
}: DashboardHeroProps) {
  const router = useRouter();

  // Build 11: workspace-anchored critical-items snapshot. Replaces the
  // prior hardcoded "3 inside 14 days, LL97 / FuelEU / CBAM" helper string
  // with a real count + top-3 preview drawn from the workspace's actual
  // compliance_deadline + timeline data. When the snapshot is absent
  // (other surfaces, anon caller, RPC failure) the helper line collapses
  // rather than rendering a frozen demo string.
  const criticalHelper = useMemo<string | undefined>(() => {
    if (!criticalSnapshot || criticalSnapshot.totalWithinWindow === 0) {
      return undefined;
    }
    const { totalWithinWindow, windowDays, preview } = criticalSnapshot;
    const previewBits = preview.map((p) => {
      const titleClip = p.title.length > 40 ? p.title.slice(0, 38) + "…" : p.title;
      const juris = p.jurisdiction ? ` (${p.jurisdiction})` : "";
      const days =
        p.daysUntil <= 0
          ? "today"
          : p.daysUntil === 1
            ? "1 day"
            : `${p.daysUntil} days`;
      return `${titleClip}${juris} ${days}`;
    });
    const intro = `${totalWithinWindow} inside ${windowDays} days`;
    return previewBits.length > 0 ? `${intro}: ${previewBits.join(", ")}` : intro;
  }, [criticalSnapshot]);

  const tiles = useMemo<HeroTile[]>(() => {
    // Counts come from the aggregates RPC (migration 068) when supplied,
    // which scopes to the same active row set as the dashboard payload
    // BEFORE the LIMIT 50. Fallback: when aggregates are absent (callers
    // whose row payload is already complete) or report zero items
    // (anon caller / seed fallback / RPC error), filter the row array
    // so the tiles still render something rather than 0/0/0/0.
    const useAggregates = !!aggregates && aggregates.totalItems > 0;
    const fromRows = (pri: "CRITICAL" | "HIGH" | "MODERATE" | "LOW") =>
      resources.filter((r) => r.priority === pri).length;
    const count = (pri: "CRITICAL" | "HIGH" | "MODERATE" | "LOW") =>
      useAggregates ? aggregates!.byPriority[pri] : fromRows(pri);
    return [
      { tone: "critical", priority: "CRITICAL", eyebrow: "Immediate action", numeral: count("CRITICAL"), label: "Critical, within 90 days", helper: criticalHelper },
      { tone: "high",     priority: "HIGH",     eyebrow: "High",             numeral: count("HIGH"),     label: "Action, 6 mo" },
      { tone: "moderate", priority: "MODERATE", eyebrow: "Moderate",         numeral: count("MODERATE"), label: "Monitor, 6 to 12 mo" },
      { tone: "low",      priority: "LOW",      eyebrow: "Low",              numeral: count("LOW"),      label: "Awareness only" },
    ];
  }, [resources, aggregates, criticalHelper]);

  const TONE_VAR: Record<HeroTile["tone"], string> = {
    critical: "var(--critical)",
    high: "var(--high)",
    moderate: "var(--moderate)",
    low: "var(--low)",
  };

  return (
    <div
      className="cl-dashboard-hero"
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
        gap: "14px",
        marginTop: "24px",
      }}
    >
      <style>{`
        /* Keep all 4 hero tiles in a single horizontal row on mobile.
           Tile internals shrink via the cl-hero-* classes below. */
        @media (max-width: 767px) {
          .cl-dashboard-hero {
            grid-template-columns: 1.2fr 1fr 1fr 1fr !important;
            gap: 6px !important;
            margin-top: 16px !important;
          }
          .cl-hero-tile { padding: 10px 8px !important; }
          .cl-hero-tile-crit { padding: 10px 8px 10px 12px !important; }
          .cl-hero-eyebrow {
            font-size: 9px !important;
            letter-spacing: 0.1em !important;
            margin-bottom: 4px !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .cl-hero-numeral { font-size: 32px !important; }
          .cl-hero-numeral-crit { font-size: 36px !important; }
          .cl-hero-label, .cl-hero-helper { display: none !important; }
        }
      `}</style>
      {tiles.map((tile) => {
        const toneColor = TONE_VAR[tile.tone];
        const isCrit = tile.tone === "critical";
        return (
          <button
            key={tile.tone}
            type="button"
            onClick={() =>
              router.push(`/regulations?priority=${tile.priority}`)
            }
            aria-label={`${tile.eyebrow} — ${tile.numeral} items · open in Regulations`}
            className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cl-hero-tile${isCrit ? " cl-hero-tile-crit" : ""}`}
            style={{
              position: "relative",
              background: isCrit
                ? "linear-gradient(135deg, var(--critical-bg) 0%, var(--surface) 55%)"
                : "var(--surface)",
              border: `1px solid ${isCrit ? "var(--critical-bd)" : "var(--border)"}`,
              borderRadius: "var(--r-lg)",
              padding: isCrit ? "18px 22px 18px 26px" : "18px 22px",
              boxShadow: "var(--shadow)",
              textAlign: "left",
              fontFamily: "inherit",
              cursor: "pointer",
              minWidth: 0,
              transition: "background 0.18s ease, box-shadow 0.18s ease",
            }}
          >
            {isCrit && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "4px",
                  background: "var(--critical)",
                  borderRadius: "var(--r-lg) 0 0 var(--r-lg)",
                }}
              />
            )}
            <div
              className="cl-hero-eyebrow"
              style={{
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: "8px",
                color: toneColor,
              }}
            >
              {tile.eyebrow}
            </div>
            <div
              className={isCrit ? "cl-hero-numeral-crit" : "cl-hero-numeral"}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: isCrit ? "84px" : "72px",
                fontWeight: 400,
                lineHeight: 0.88,
                letterSpacing: "-0.01em",
                color: toneColor,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tile.numeral}
            </div>
            <div
              className="cl-hero-label"
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "var(--text)",
                marginTop: "6px",
              }}
            >
              {tile.label}
            </div>
            {tile.helper && (
              <div
                className="cl-hero-helper"
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  marginTop: "3px",
                  lineHeight: 1.45,
                }}
              >
                {tile.helper}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
