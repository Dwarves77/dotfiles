"use client";

/**
 * KeyMetricsRow — KEY METRICS rows with delta indicators on /market.
 *
 * Per dispatch G + visual reconciliation §3.4:
 *   "Design Tech Readiness items expand to KEY METRICS rows with delta
 *    indicators (e.g. Li-ion pack cost (2024) $115/kWh ↘ was
 *    $139/kWh (2023))"
 *
 * Data layer status: PARTIAL.
 * - Resource.marketData.{currentPrice,previousPrice,priceSource,priceDate}
 *   schema exists in src/types/resource.ts (lines 162-168).
 * - Seed data: 0 rows populate this (`grep -c marketData seed-resources.json`
 *   returns 0 at investigation time).
 * - intelligence_changes table exists (migration 009) but is empty (0 rows).
 * - Per #33 banner pattern: render real metrics for items that have
 *   marketData.currentPrice, otherwise emit a single section banner —
 *   not per-row placeholder strings.
 *
 * The data layer for prior-period values is the G2 split if Jason
 * authorizes follow-up work. This component honors the contract today:
 * if currentPrice is set, show the row; if not for any item, show
 * one banner.
 */

import type { Resource } from "@/types/resource";

interface KeyMetricsRowProps {
  items: Resource[];
  /** Optional time period selector value (display-only stub for now). */
  period?: "30d" | "90d" | "1y";
  onPeriodChange?: (period: "30d" | "90d" | "1y") => void;
}

const PERIODS: Array<{ id: "30d" | "90d" | "1y"; label: string }> = [
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "1y", label: "1Y" },
];

function deltaArrow(current: string, previous: string): {
  arrow: "↗" | "↘" | "→";
  tone: "up" | "down" | "flat";
} {
  // Extract first numeric token from each string. Falls back to flat
  // when either side has no parseable number.
  const num = (s: string) => {
    const m = s.match(/-?[\d,.]+/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(/,/g, ""));
    return isFinite(n) ? n : null;
  };
  const a = num(current);
  const b = num(previous);
  if (a == null || b == null || a === b) return { arrow: "→", tone: "flat" };
  return a > b
    ? { arrow: "↗", tone: "up" }
    : { arrow: "↘", tone: "down" };
}

export function KeyMetricsRow({ items, period = "90d", onPeriodChange }: KeyMetricsRowProps) {
  const withMetrics = items.filter(
    (it) => !!it.marketData?.currentPrice
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          Key metrics
        </div>
        <div
          role="tablist"
          aria-label="Key metrics time period"
          style={{ display: "inline-flex", gap: 2 }}
        >
          {PERIODS.map((p) => {
            const active = p.id === period;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => onPeriodChange?.(p.id)}
                disabled={!onPeriodChange}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  padding: "3px 8px",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border-sub)"}`,
                  background: active ? "var(--accent-strip)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-2)",
                  cursor: onPeriodChange ? "pointer" : "default",
                  borderRadius: 3,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {withMetrics.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border-sub)",
            borderRadius: "var(--r-sm)",
            padding: "14px 16px",
            fontSize: 12.5,
            color: "var(--text-2)",
            lineHeight: 1.55,
          }}
        >
          <b style={{ color: "var(--text)", fontWeight: 700 }}>
            Quantitative metrics not yet populated for this section.
          </b>{" "}
          Items in scope have lifecycle and source attribution; numeric
          deltas (current vs prior period) will appear here once
          <code style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5 }}>
            {" "}intelligence_items.market_data{" "}
          </code>
          is populated.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {withMetrics.map((it) => {
            const md = it.marketData!;
            const showDelta = md.currentPrice && md.previousPrice;
            const delta = showDelta
              ? deltaArrow(md.currentPrice!, md.previousPrice!)
              : null;
            const deltaColor =
              delta?.tone === "up"
                ? "var(--high)"
                : delta?.tone === "down"
                  ? "var(--moderate)"
                  : "var(--text-2)";
            return (
              <div
                key={it.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr auto auto",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border-sub)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text)",
                    lineHeight: 1.35,
                  }}
                >
                  {it.title}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--text)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {md.currentPrice}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: deltaColor,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {delta && (
                    <span style={{ fontWeight: 700, marginRight: 4 }}>
                      {delta.arrow}
                    </span>
                  )}
                  {md.previousPrice ? `was ${md.previousPrice}` : md.priceDate}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
