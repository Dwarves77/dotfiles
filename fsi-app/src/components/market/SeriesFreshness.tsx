/**
 * SeriesFreshness: the freshness panel summary strip and the per-series freshness badge of spec 02 section 6
 * item 11, extracted from MarketSeriesBoard.tsx (lane MKT-1, 2026-10-08) so every Market page that shows
 * a market_series figure mounts the SAME two parts instead of retyping them (reuse before construction).
 *
 * THE MARKUP IS MOVED, NOT CHANGED. Both exports below are the exact JSX MarketSeriesBoard rendered inline
 * before this lane (the panel at the top of the board, the badge under each populated series row), with
 * the tone and copy tables that went with them. MarketSeriesBoard now imports them; /market/series
 * renders byte-for-byte what it rendered before. Two additive, defaulted props exist for the second
 * mount (`style` on the panel, `showAsOf` on the badge); omitted, they change nothing.
 *
 * NO NEW ARITHMETIC. The state itself is derived upstream by deriveSeriesFreshness and
 * summarizeBoardFreshness (src/lib/market/series-freshness.mjs, over envelope.mjs's stalenessOf); this
 * file only draws a finished state. Spec 02 section 9's named defect (a "Next release" date promised by a
 * scheduler that does not exist) is why the badge draws a DERIVED STATE and never a predicted date.
 *
 * Server component, no client state, no fetch.
 */

import type { CSSProperties } from "react";
import { FRESHNESS } from "@/lib/contracts/vocabularies.mjs";
import { producerFor } from "@/lib/market/series-registry.mjs";
import { deriveSeriesFreshness, summarizeBoardFreshness } from "@/lib/market/series-freshness.mjs";
import type { MarketSeriesBoardVM } from "@/lib/supabase-server";

export const FRESHNESS_TONE: Record<string, string> = {
  current: "var(--color-success)",
  ageing: "var(--color-warning)",
  stale: "var(--brass)",
  frozen: "var(--mi-action, #DC2626)",
  unknown: "var(--color-text-muted)",
};

export const FRESHNESS_PANEL_COPY: Record<string, string> = {
  current: "Every populated series is within its registered cadence.",
  ageing: "At least one series is running late against its registered cadence.",
  stale: "At least one series is well past its registered cadence.",
  frozen: "At least one series has gone quiet \u2014 its source has stopped publishing, not merely slipped.",
  unknown: "No populated series carries a decided cadence \u2014 degradation cannot be judged.",
};

/** summarizeBoardFreshness's return shape (series-freshness.mjs). */
export interface BoardFreshnessSummary {
  counts: Record<"current" | "ageing" | "stale" | "frozen" | "unknown", number>;
  total: number;
  worst: "current" | "ageing" | "stale" | "frozen" | "unknown";
}

/** deriveSeriesFreshness's return shape (series-freshness.mjs). */
export interface SeriesFreshnessState {
  code: string;
  label: string;
  degraded?: boolean;
  asOfDate: string | null;
  cadenceDays?: number | null;
}

/**
 * The panel's summary over every POPULATED series on a board, each judged against its OWN registry
 * producer cadence (the exact reduction MarketSeriesBoard computed inline before this lane). `nowIso` is
 * the injected render instant, a YYYY-MM-DD or full ISO string; this never reads the clock.
 */
export function boardFreshnessSummary(board: MarketSeriesBoardVM, nowIso: string): BoardFreshnessSummary {
  const populated = board.groups
    .filter((g) => g.state === "populated")
    .flatMap((g) =>
      g.series.map((s) =>
        deriveSeriesFreshness({ as_at_date: s.asAtDate, reference_period: s.referencePeriod }, producerFor(g.keyPrefix) ?? null, nowIso)
      )
    );
  return summarizeBoardFreshness(populated) as BoardFreshnessSummary;
}

/**
 * Freshness panel summary (spec 02 section 6 item 11). Worst state governs the headline; the count strip breaks
 * it down per state. Absent when nothing is populated yet: nothing to summarise.
 */
export function SeriesFreshnessPanel({ summary, style }: { summary: BoardFreshnessSummary; style?: CSSProperties }) {
  if (summary.total <= 0) return null;
  return (
    <div
      data-audit="series-freshness-panel"
      style={{
        border: `1px solid ${FRESHNESS_TONE[summary.worst]}`,
        borderRadius: 8,
        background: "var(--color-bg-surface)",
        padding: "10px 14px",
        margin: "0 0 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: FRESHNESS_TONE[summary.worst],
          whiteSpace: "nowrap",
        }}
      >
        {"Freshness \u2014 "}
        {FRESHNESS[summary.worst]?.label ?? summary.worst}
      </span>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", flex: "1 1 260px" }}>
        {FRESHNESS_PANEL_COPY[summary.worst]}
      </span>
      <span style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
        {(["current", "ageing", "stale", "frozen"] as const)
          .filter((k) => summary.counts[k] > 0)
          .map((k) => `${summary.counts[k]} ${FRESHNESS[k].label.toLowerCase()}`)
          .join(" · ") || `${summary.counts.unknown} unknown`}
      </span>
    </div>
  );
}

/**
 * Freshness badge (spec 02 section 6 item 11): derived, never asserted. Replaces any scheduler-implied "next
 * release" claim with the SHIPPED freshness vocabulary. `showAsOf` (default true) draws the badge's own
 * "as of" date; a caller that already prints the date beside it passes false.
 */
export function SeriesFreshnessBadge({ freshness, showAsOf = true }: { freshness: SeriesFreshnessState; showAsOf?: boolean }) {
  return (
    <p data-audit="series-freshness-badge" data-freshness={freshness.code} style={{ fontSize: 9.5, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: FRESHNESS_TONE[freshness.code],
          flex: "0 0 auto",
        }}
      />
      <span style={{ color: FRESHNESS_TONE[freshness.code], fontWeight: 700 }}>{freshness.label}</span>
      {showAsOf && (
        <span style={{ color: "var(--color-text-muted)" }}>
          {freshness.asOfDate ? `· as of ${freshness.asOfDate}` : "· no as-of date on record"}
        </span>
      )}
    </p>
  );
}
