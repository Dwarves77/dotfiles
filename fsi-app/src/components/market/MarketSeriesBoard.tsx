/**
 * MarketSeriesBoard — WO-16 layer 3, the missing reader for `market_series`.
 *
 * Server component, no client state: the page fetches `fetchMarketSeriesBoard()`
 * (src/lib/supabase-server.ts), which already ran the rows through buildSeriesBoard
 * (src/lib/market/series-board-view-model.mjs) — the pure, unit-tested transform that reduces to the
 * latest observation per series_key and groups by registry producer
 * (src/lib/market/series-registry.mjs). This component only renders that finished shape; no
 * reduction, grouping, or currency/value formatting decision lives here.
 *
 * HONEST MID-BUILD STATE (population-report.mjs's own philosophy — mid-build empty is a legitimate
 * state that must say so out loud, never a blank hole): every registry producer gets a card, always,
 * whether or not it has written a row yet —
 *   - "not_built"              — documented stub, no producer script exists (dashed, muted)
 *   - "registered_unpopulated" — wired to write, nothing has landed yet (dashed, brass "Pending")
 *   - "populated"               — its observed series render as figures
 * A series whose value is unobserved (null value_numeric) still renders as an honest em dash inside a
 * populated card, never a fabricated number — same "—" convention OperationsLedger's By-state
 * sub-list already uses for a state with no sourced cost fact.
 *
 * WATCHING (L6, WO-23 follow-up). Each POPULATED series row mounts a <WatchButton
 * itemType="market_series">, keyed against the *series row's own* `id` (MarketSeriesDisplayRow.id —
 * the winning market_series.id, uuid), NOT `seriesKey`. This is the exact identity fetchWatchlist's
 * resolveWatchlistTypeFields (supabase-server.ts) resolves a watched market_series row by; keying on
 * seriesKey instead would produce a watch row the reader can never look up. The watchable identity is
 * the SERIES ROW, not the producer group — one WatchButton per row, never one per <ProducerCard>. This
 * component stays a server component: WatchButton is a "use client" leaf, and a server component
 * rendering a client component directly needs no wrapper (the boundary only bites the other direction —
 * a client component importing server code, which is why WatchButton itself gets its itemType vocabulary
 * via a type-only import rather than a runtime one).
 */

import type { MarketSeriesBoardVM, MarketSeriesProducerGroup } from "@/lib/supabase-server";
import { WatchButton } from "@/components/ui/WatchButton";

interface MarketSeriesBoardProps {
  board: MarketSeriesBoardVM;
}

const STATE_META: Record<MarketSeriesProducerGroup["state"], { label: string; color: string }> = {
  not_built: { label: "Not built yet", color: "var(--color-text-muted)" },
  registered_unpopulated: { label: "Pending — registered, not yet populated", color: "var(--brass)" },
  populated: { label: "Live", color: "var(--color-primary)" },
};

export function MarketSeriesBoard({ board }: MarketSeriesBoardProps) {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 64px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "2px solid var(--color-text-primary)",
          padding: "0 0 8px",
          margin: "0 0 4px",
          flexWrap: "wrap",
        }}
      >
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
          Market series board
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
          {board.totalObservedSeries} observed series ·{" "}
          {board.implementedProducerCount}/{board.totalProducers} producers built
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "0 0 18px", maxWidth: "82ch" }}>
        Dated, sourced observations from `market_series` — the raw time series behind the price signals
        above, not a re-derived summary. Every producer this product intends to carry is listed below,
        whether or not it has written a row yet; a producer with no rows says so plainly instead of
        rendering blank.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {board.groups.map((group) => (
          <ProducerCard key={group.keyPrefix} group={group} />
        ))}
      </div>

      {board.unregistered.length > 0 && (
        <div style={{ marginTop: 16, border: "1px dashed var(--honest-dashed)", borderRadius: 8, background: "var(--color-bg-base)", padding: "14px 16px" }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brass)", margin: "0 0 6px" }}>
            {board.unregistered.length} unregistered {board.unregistered.length === 1 ? "series" : "series"} — no matching registry producer
          </p>
          <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
            {board.unregistered.map((s) => s.seriesKey).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

function ProducerCard({ group }: { group: MarketSeriesProducerGroup }) {
  const meta = STATE_META[group.state];
  const isDashed = group.state !== "populated";

  return (
    <div
      style={{
        border: isDashed ? "1px dashed var(--honest-dashed)" : "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-bg-surface)",
        padding: "16px 16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>{group.name}</p>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: meta.color,
              whiteSpace: "nowrap",
            }}
          >
            {meta.label}
          </span>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "3px 0 0" }}>{group.cadence}</p>
      </div>

      {group.state === "populated" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {group.series.map((s) => (
            <div key={s.seriesKey} style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{s.label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 17,
                    color: s.emptyReason ? "var(--color-text-muted)" : "var(--color-text-primary)",
                    whiteSpace: "nowrap",
                  }}
                  title={s.emptyReason ?? undefined}
                >
                  {s.displayValue}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                <p style={{ fontSize: 9.5, color: "var(--color-text-muted)", margin: 0 }}>
                  {s.referencePeriod ? `period ${s.referencePeriod}` : "no reference period"}
                  {s.observationCount > 1 ? ` · ${s.observationCount} observations on record` : ""}
                </p>
                {/* The watchable identity is this SERIES ROW's own market_series.id — see this
                    file's header for why. `id` can be null only if a raw row omitted it
                    (defensive); no id means nothing to watch, so the control is simply absent
                    rather than mounted against a lookup that can never resolve. */}
                {s.id && <WatchButton itemType="market_series" itemId={s.id} />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ border: "1px dashed var(--honest-dashed)", borderRadius: 6, padding: "9px 11px", background: "var(--color-bg-base)" }}>
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
            {group.state === "not_built"
              ? "Documented registry entry — no producer script exists yet."
              : "Producer is wired to write this series; nothing has landed yet."}
          </p>
        </div>
      )}

      <p style={{ fontSize: 9.5, color: "var(--color-text-muted)", margin: "auto 0 0", lineHeight: 1.4 }}>
        Source:{" "}
        {group.sourceUrl ? (
          <a href={group.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {group.sourceName}
          </a>
        ) : (
          group.sourceName
        )}
      </p>
    </div>
  );
}
