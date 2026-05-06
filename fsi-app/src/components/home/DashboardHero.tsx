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
 * F4 + F5 wire-up (PR-G, 2026-05-06):
 * Tiles deep-link to /market?priority={CRITICAL|HIGH|MODERATE|LOW}.
 * The Watch / Elevated / Stable / Informational lifecycle taxonomy on
 * /market is the same Critical / High / Moderate / Low priority taxonomy
 * surfaced here, so the click filter resolves cleanly. MarketPage reads
 * the `priority` URL param via next/navigation useSearchParams and
 * pre-applies it to the StatStrip filter on mount.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Resource } from "@/types/resource";

// TODO: replace with computed timeline once milestones data is reliable.
// Per design brief: preview specificity is what makes the helper feel
// useful — a bare count is dead copy. Tracked as follow-up to this PR.
const CRITICAL_HELPER_COPY = "3 inside 14 days: LL97 filing, FuelEU Q1, CBAM defaults";

interface DashboardHeroProps {
  resources: Resource[];
}

interface HeroTile {
  tone: "critical" | "high" | "moderate" | "low";
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  eyebrow: string;
  numeral: number;
  label: string;
  helper?: string;
}

export function DashboardHero({ resources }: DashboardHeroProps) {
  const router = useRouter();

  const tiles = useMemo<HeroTile[]>(() => {
    const filterBy = (pri: "CRITICAL" | "HIGH" | "MODERATE" | "LOW") =>
      resources.filter((r) => r.priority === pri);
    return [
      { tone: "critical", priority: "CRITICAL", eyebrow: "Immediate action", numeral: filterBy("CRITICAL").length, label: "Critical — within 90 days", helper: CRITICAL_HELPER_COPY },
      { tone: "high",     priority: "HIGH",     eyebrow: "High",             numeral: filterBy("HIGH").length,     label: "Action — 6 mo" },
      { tone: "moderate", priority: "MODERATE", eyebrow: "Moderate",         numeral: filterBy("MODERATE").length, label: "Monitor — 6–12 mo" },
      { tone: "low",      priority: "LOW",      eyebrow: "Low",              numeral: filterBy("LOW").length,      label: "Awareness only" },
    ];
  }, [resources]);

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
        @media (max-width: 767px) {
          .cl-dashboard-hero { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .cl-dashboard-hero { grid-template-columns: 1fr !important; }
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
              router.push(`/market?priority=${tile.priority}`)
            }
            aria-label={`${tile.eyebrow} — ${tile.numeral} items · open in Market Intelligence`}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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
