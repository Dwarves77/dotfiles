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

import Link from "next/link";
import type { Resource } from "@/types/resource";
import type { SourceCitationStatsMap } from "@/lib/data";
import { CitationCountChip } from "@/components/credibility/CitationCountChip";
import { RecencyChip } from "@/components/credibility/RecencyChip";

interface KeyMetricsRowProps {
  items: Resource[];
  /**
   * Build 7: per-source citation stats keyed by source_id. Renders the
   * CitationCountChip + RecencyChip pair beside each metric row when stats
   * are available; suppresses per chip contract otherwise. Mirrors Build 8.1
   * /research pattern.
   */
  citationStats?: SourceCitationStatsMap;
}

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

export function KeyMetricsRow({ items, citationStats = {} }: KeyMetricsRowProps) {
  // Build 7: the 30D/90D/1Y period selector was removed in this dispatch.
  // The buttons did not filter anything (no time-series schema exists for
  // KEY METRICS items; marketData snapshots are single-point timestamps),
  // so they were a customer-visible non-functional control. When cost
  // time-series schema lands in a future dispatch, the period buttons
  // return alongside the data layer they depend on.
  const withMetrics = items.filter(
    (it) => !!it.marketData?.currentPrice
  );

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 10,
        }}
      >
        Key metrics
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
            Quantitative metrics not yet available for this section.
          </b>{" "}
          Items in scope have lifecycle and source attribution; numeric
          deltas (current vs prior period) will appear here as market
          data is added.
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
            const stat = it.sourceId ? citationStats[it.sourceId] : undefined;
            const showChips = (stat && stat.count >= 1) || stat?.recency;
            return (
              <Link
                key={it.id}
                href={`/regulations/${encodeURIComponent(it.id)}`}
                prefetch={false}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr auto auto",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border-sub)",
                  borderRadius: "var(--r-sm)",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                  transition: "background-color 120ms ease",
                }}
                className="hover:bg-[var(--raised)]"
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
                {showChips && (
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                    {stat && stat.count >= 1 && <CitationCountChip count={stat.count} />}
                    {stat?.recency && <RecencyChip timestamp={stat.recency} />}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
