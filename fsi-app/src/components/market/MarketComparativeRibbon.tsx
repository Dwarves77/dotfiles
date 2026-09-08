/**
 * MarketComparativeRibbon — Lane SURF, spec 02 §6 item 1: "Comparative ribbon: 6 to 10 headline
 * metrics, each `level · Δ1w · Δ1m · ΔYoY · sparkline · as-of`. The 15-second 'has anything moved that
 * changes my week' read. The contract in its most literal form."
 *
 * Server component, no client state, no new fetch: reads the SAME `MarketSeriesBoardVM` the page
 * already fetches for <MarketSeriesBoard> (fetchMarketSeriesBoard → buildSeriesBoard). buildSeriesBoard
 * now attaches `deltas` to every populated series row (src/lib/market/series-board-view-model.mjs,
 * computed via src/lib/market/series-deltas.mjs from the FULL row history for that series_key) — this
 * component only renders that finished shape, exactly like MarketSeriesBoard's own header states for
 * value formatting.
 *
 * HONEST TODAY: `market_series` has 6 series keys, 1 row each, live [confirmed 2026-09-02]. Every card
 * below therefore renders the honest "one observation, no delta yet (history backfill pending)" state —
 * this is spec §9's own acceptance bar working as designed, not a placeholder: the ribbon becomes
 * comparative the moment a second observation lands per series, with no further code change.
 *
 * NEVER FABRICATE. A delta that could not be computed (insufficient history, or a unit/currency change
 * across the compared pair) renders an explicit reason, never a dash indistinguishable from a real
 * zero-change delta (spec 00 §2's false-precision failure).
 */

import type { MarketSeriesBoardVM } from "@/lib/supabase-server";
import { formatDelta } from "@/lib/contracts/envelope.mjs";
import { MoreBelowDisclosure } from "@/components/shared/MoreBelowDisclosure";
import { SectionRule } from "@/components/ui/SectionRule";

interface MarketComparativeRibbonProps {
  board: MarketSeriesBoardVM;
  /** True when mounted inside ListSurfaceShell's `aboveRows` slot (artboard 04/id="p4": the
   *  "Headline series" card nests BETWEEN the band tiles and the sort row, inside the content
   *  column, not as its own full-bleed page section) — lane compose-lists, 2026-09-08, relocating
   *  the placement this file's own header comment (and DEVIATION-LOG.md) already logged as
   *  deferred. Drops the standalone page-section's own maxWidth/margin/padding so the card fills
   *  the content column instead. The card's own border/radius/shadow/section-rule chrome (ruling
   *  5.1) is added by MarketIntelLedger where this mounts, not here, so a future non-embedded
   *  caller is unaffected. */
  embedded?: boolean;
}

const MAX_METRICS = 10;

interface DeltaPoint { date: string; value: number | null }
interface WindowDelta {
  value?: number;
  pct?: number | null;
  fromDate?: string;
  insufficientHistory?: boolean;
  unitMismatch?: boolean;
}
interface SeriesDeltas {
  count: number;
  latest: { date: string; value: number | null; unit: string | null; currency: string | null } | null;
  sparkline: DeltaPoint[];
  delta1w: WindowDelta | null;
  delta1m: WindowDelta | null;
  deltaYoY: WindowDelta | null;
  message: string | null;
}
interface RibbonRow {
  seriesKey: string;
  label: string;
  displayValue: string;
  deltas: SeriesDeltas;
}

export function MarketComparativeRibbon({ board, embedded = false }: MarketComparativeRibbonProps) {
  const rows: RibbonRow[] = [];
  for (const g of board.groups) {
    if (g.state !== "populated") continue;
    for (const s of g.series) {
      const raw = s as unknown as { deltas?: SeriesDeltas };
      if (!raw.deltas) continue;
      rows.push({ seriesKey: s.seriesKey, label: s.label, displayValue: s.displayValue, deltas: raw.deltas });
    }
  }
  for (const s of board.unregistered) {
    const raw = s as unknown as { deltas?: SeriesDeltas };
    if (!raw.deltas) continue;
    rows.push({ seriesKey: s.seriesKey, label: s.label, displayValue: s.displayValue, deltas: raw.deltas });
  }

  if (rows.length === 0) return null;
  const shown = rows.slice(0, MAX_METRICS);
  const hiddenCount = rows.length - shown.length;

  const embeddedCardStyle = {
    background: "var(--card)",
    border: "1px solid var(--line-1)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--shadow-card)",
    overflow: "hidden",
  };

  return (
    <div
      style={
        embedded ? embeddedCardStyle : { maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }
      }
    >
      {/* Ruling 5.1 (2026-09-07, CLOSED): the graduated rule sits ABOVE the title, full card
          width, no radius, and there is NO divider below the title — a solid border-bottom under
          "Comparative ribbon" was the exact defect 5.1 names. Section title itself: Anton
          uppercase, no divider, no underline. */}
      {embedded && <SectionRule />}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          padding: embedded ? "14px 16px 0" : "0 0 8px",
          margin: "0 0 12px",
          flexWrap: "wrap",
        }}
      >
        {/* artboard 04/id="p4": "HEADLINE SERIES" — this card's own title, not "Comparative
            ribbon" (this file's pre-existing name, kept as the component/file identity, not the
            rendered copy). */}
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Headline series
        </h2>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {shown.length} of {rows.length} · dated, sourced observations ·{" "}
          <a href="#market-series-board" style={{ color: "inherit", textDecoration: "underline" }}>
            Series board →
          </a>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          padding: embedded ? "0 16px 14px" : undefined,
        }}
      >
        {shown.map((row) => (
          <RibbonCard key={row.seriesKey} row={row} />
        ))}
      </div>

      <MoreBelowDisclosure count={hiddenCount} itemNoun="more headline series">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            padding: embedded ? "0 16px 14px" : undefined,
          }}
        >
          {rows.slice(MAX_METRICS).map((row) => (
            <RibbonCard key={row.seriesKey} row={row} />
          ))}
        </div>
      </MoreBelowDisclosure>
    </div>
  );
}

function RibbonCard({ row }: { row: RibbonRow }) {
  const d = row.deltas;
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-bg-surface)",
        padding: "12px 14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <p
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: 0,
        }}
      >
        {row.label}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--color-text-primary)" }}>
          {row.displayValue}
        </span>
        <Sparkline points={d.sparkline} />
      </div>

      {d.message ? (
        <p style={{ fontSize: 10, color: "var(--color-text-muted)", margin: "2px 0 0", lineHeight: 1.4 }}>
          {d.message}
        </p>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <DeltaChip label="1w" delta={d.delta1w} />
          <DeltaChip label="1m" delta={d.delta1m} />
          <DeltaChip label="YoY" delta={d.deltaYoY} />
        </div>
      )}

      <p style={{ fontSize: 9, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
        as of {d.latest?.date ?? "—"}
      </p>
    </div>
  );
}

function DeltaChip({ label, delta }: { label: string; delta: WindowDelta | null }) {
  if (!delta) return null;
  if (delta.unitMismatch) {
    return (
      <span style={{ fontSize: 10, color: "var(--brass)" }} title={`Unit changed since ${delta.fromDate} — comparison refused`}>
        Δ{label} unit changed
      </span>
    );
  }
  if (delta.insufficientHistory || typeof delta.value !== "number") {
    return (
      <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
        Δ{label} no data yet
      </span>
    );
  }
  if (typeof delta.pct !== "number") {
    // Division-by-zero guard fired upstream (prior value was 0) — a % move is undefined here, and
    // showing one would be exactly the fabrication this module refuses elsewhere. Say so plainly.
    return (
      <span style={{ fontSize: 10, color: "var(--color-text-muted)" }} title={`vs ${delta.fromDate}: prior value was zero`}>
        Δ{label} n/a
      </span>
    );
  }
  const tone = delta.pct > 0 ? "var(--mi-cost, #D97706)" : delta.pct < 0 ? "var(--color-success)" : "var(--color-text-muted)";
  // The series' own unit price change is expressed as a PERCENT move (quantity, never a ratio in
  // pp — formatDelta's `kind` is required, never defaulted, per envelope.mjs's own header: "a default
  // here would silently pick a side").
  const formatted = formatDelta(delta.pct, "quantity");
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: tone }} title={`vs ${delta.fromDate}`}>
      Δ{label} {formatted}
    </span>
  );
}

function Sparkline({ points }: { points: DeltaPoint[] }) {
  const vals = points.map((p) => p.value).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  if (vals.length === 1) {
    return (
      <svg width="40" height="16" aria-hidden style={{ flex: "0 0 auto" }}>
        <circle cx="20" cy="8" r="2.5" fill="var(--color-text-muted)" />
      </svg>
    );
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 60;
  const h = 16;
  const step = w / (vals.length - 1);
  const coords = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`);
  return (
    <svg width={w} height={h} aria-hidden style={{ flex: "0 0 auto" }}>
      <polyline points={coords.join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />
    </svg>
  );
}
