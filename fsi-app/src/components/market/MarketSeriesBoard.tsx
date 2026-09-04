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
 *
 * FRESHNESS PANEL (Lane SURF, spec 02 §6 item 11 + §9's named defect: "PriceBoard prints 'Next release:
 * <date>' against a hand-run script with no scheduler"). Each POPULATED series row now carries a
 * freshness badge (current / ageing / stale / frozen / unknown) derived from `as_at_date` against the
 * series's OWN registry producer cadence, via the SHIPPED freshness-derived function
 * (src/lib/contracts/envelope.mjs stalenessOf, adapted through src/lib/market/series-freshness.mjs — see
 * that module's header for why it is an adapter, not a second implementation). This REPLACES any
 * scheduler-implied "next release" claim with a derived STATE — no scheduler runs this board, so no
 * component here predicts one. A panel-level summary line rolls every populated series's freshness into
 * one honest headline (worst state governs, mirrors envelope.mjs's own aggregate `propagate()` rule).
 *
 * METHODOLOGY / PROVENANCE DRAWER (spec 02 §6 item 10 + §5: "one click from any number"). Each populated
 * series row carries a <details> disclosure with source_key, licence status, derivation, origin_class,
 * method_version, n_observations, a source_ref link and an attribution line — sourced from the registry
 * entry (series-registry.mjs, read-only here) plus the row's own provenance-envelope columns
 * (series-board-view-model.mjs's toDisplayRow, WHICH ALREADY SELECTS THEM — no query change was needed,
 * see that module's own header; MarketSeriesDisplayRow in supabase-server.ts now declares these fields
 * directly, Lane SURF 2026-09-02, so this component reads them off `s` with no local cast). This directly
 * replaces the Methodology card in MarketIntelLedger.tsx that claimed "convergence scoring" this index
 * does not implement (spec 02 §9) — the real methodology, shown per number rather than asserted once for
 * the whole surface.
 */

import type { MarketSeriesBoardVM, MarketSeriesProducerGroup } from "@/lib/supabase-server";
import { WatchButton } from "@/components/ui/WatchButton";
import { producerFor } from "@/lib/market/series-registry.mjs";
import { deriveSeriesFreshness, summarizeBoardFreshness } from "@/lib/market/series-freshness.mjs";
import { FRESHNESS } from "@/lib/contracts/vocabularies.mjs";
import { lookupWatchMembership, type WatchMembershipEntry } from "@/lib/watchlist/membership";

interface MarketSeriesBoardProps {
  board: MarketSeriesBoardVM;
  /**
   * PERF-3 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md item 2): one server-side batch
   * read (market/page.tsx, via src/lib/watchlist/membership.ts) covering every populated series
   * row's market_series.id on this page, keyed by id. Each row's <WatchButton> reads its own entry
   * out of this map and renders it as initial state — this component stays a server component
   * (see this file's own header), so passing the resolved map down costs nothing extra to
   * serialize; only the per-row booleans cross into WatchButton's client boundary. Replaces the
   * six independent per-instance GET /api/watchlist calls this page used to fire on mount.
   *
   * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): market/page.tsx no longer performs this
   * batch read at all — it required resolveViewerIdentityFromCookies(), a Dynamic API call that alone
   * forced `ƒ` (Dynamic) at build time regardless of every other fix. `null` here means "not fetched
   * server-side" — each row's WatchButton then receives no initialWatched/initialTeamWatched/
   * initialTeamAvailable at all (omitted, not `false`), which is WatchButton's own pre-existing
   * contract for "resolve this client-side" (getClientWatchMembership on mount) rather than "server
   * knows this is unwatched." Passing `false` here instead would be a UX-law violation: a returning
   * viewer who HAS watched a row would see it rendered as unwatched, permanently, since a concrete
   * `initialWatched=false` tells WatchButton the server already knows and never fires the client
   * fallback.
   */
  watchMembership: Map<string, WatchMembershipEntry> | null;
}

const STATE_META: Record<MarketSeriesProducerGroup["state"], { label: string; color: string }> = {
  not_built: { label: "Not built yet", color: "var(--color-text-muted)" },
  registered_unpopulated: { label: "Pending — registered, not yet populated", color: "var(--brass)" },
  populated: { label: "Live", color: "var(--color-primary)" },
};

const FRESHNESS_TONE: Record<string, string> = {
  current: "var(--color-success)",
  ageing: "var(--color-warning)",
  stale: "var(--brass)",
  frozen: "var(--mi-action, #DC2626)",
  unknown: "var(--color-text-muted)",
};

const FRESHNESS_PANEL_COPY: Record<string, string> = {
  current: "Every populated series is within its registered cadence.",
  ageing: "At least one series is running late against its registered cadence.",
  stale: "At least one series is well past its registered cadence.",
  frozen: "At least one series has gone quiet — its source has stopped publishing, not merely slipped.",
  unknown: "No populated series carries a decided cadence — degradation cannot be judged.",
};

export function MarketSeriesBoard({ board, watchMembership }: MarketSeriesBoardProps) {
  // Injected "now" for every freshness derivation below — the component's render instant, computed
  // once here rather than read inside the pure lib functions (envelope.mjs's own "time is injected,
  // never read" discipline; deriveSeriesFreshness/summarizeBoardFreshness both take nowIso as an arg).
  const nowIso = new Date().toISOString().slice(0, 10);

  const populatedFreshness = board.groups
    .filter((g) => g.state === "populated")
    .flatMap((g) =>
      g.series.map((s) =>
        deriveSeriesFreshness({ as_at_date: s.asAtDate, reference_period: s.referencePeriod }, producerFor(g.keyPrefix) ?? null, nowIso)
      )
    );
  const panelFreshness = summarizeBoardFreshness(populatedFreshness);

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
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "0 0 14px", maxWidth: "82ch" }}>
        Dated, sourced observations from `market_series` — the raw time series behind the price signals
        above, not a re-derived summary. Every producer this product intends to carry is listed below,
        whether or not it has written a row yet; a producer with no rows says so plainly instead of
        rendering blank.
      </p>

      {/* Freshness panel summary (spec 02 §6 item 11). Worst state governs the headline; the count
          strip breaks it down per state. Absent when nothing is populated yet — nothing to summarise. */}
      {panelFreshness.total > 0 && (
        <div
          style={{
            border: `1px solid ${FRESHNESS_TONE[panelFreshness.worst]}`,
            borderRadius: 8,
            background: "var(--color-bg-surface)",
            padding: "10px 14px",
            margin: "0 0 18px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: FRESHNESS_TONE[panelFreshness.worst],
              whiteSpace: "nowrap",
            }}
          >
            Freshness — {FRESHNESS[panelFreshness.worst]?.label ?? panelFreshness.worst}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", flex: "1 1 260px" }}>
            {FRESHNESS_PANEL_COPY[panelFreshness.worst]}
          </span>
          <span style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            {(["current", "ageing", "stale", "frozen"] as const)
              .filter((k) => panelFreshness.counts[k] > 0)
              .map((k) => `${panelFreshness.counts[k]} ${FRESHNESS[k].label.toLowerCase()}`)
              .join(" · ") || `${panelFreshness.counts.unknown} unknown`}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {board.groups.map((group) => (
          <ProducerCard key={group.keyPrefix} group={group} nowIso={nowIso} watchMembership={watchMembership} />
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

function ProducerCard({
  group,
  nowIso,
  watchMembership,
}: {
  group: MarketSeriesProducerGroup;
  nowIso: string;
  watchMembership: Map<string, WatchMembershipEntry> | null;
}) {
  const meta = STATE_META[group.state];
  const isDashed = group.state !== "populated";
  const producerEntry = producerFor(group.keyPrefix) ?? null;

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
        {/* Law 4/12 consistency pass (lane MOBILE, 2026-09-03): the title had no `minWidth: 0` /
            `overflowWrap` beside a `whiteSpace: nowrap` status label — the same shape as every
            other row title in this write set, just not one of F35's ROW_COMPONENTS (a card grid,
            not a ledger row). Same fix, applied for consistency rather than a caught defect. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, color: "var(--color-text-primary)", margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{group.name}</p>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: meta.color,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {meta.label}
          </span>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "3px 0 0" }}>{group.cadence}</p>
      </div>

      {group.state === "populated" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {group.series.map((s) => {
            const freshness = deriveSeriesFreshness(
              { as_at_date: s.asAtDate, reference_period: s.referencePeriod },
              producerEntry,
              nowIso
            );
            return (
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
                  {s.id && (() => {
                    // See this file's own header (watchMembership prop doc) — `null` means the page
                    // made no server-side read at all; omit the initial* props entirely (not `false`)
                    // so WatchButton resolves this row's real state client-side instead.
                    const entry = watchMembership ? lookupWatchMembership(watchMembership, s.id) : null;
                    return (
                      <WatchButton
                        itemType="market_series"
                        itemId={s.id}
                        initialWatched={entry?.watched}
                        initialTeamWatched={entry?.teamWatched}
                        initialTeamAvailable={entry?.teamAvailable}
                      />
                    );
                  })()}
                </div>

                {/* Freshness badge (spec 02 §6 item 11): derived, never asserted. Replaces any
                    scheduler-implied "next release" claim with the SHIPPED freshness vocabulary. */}
                <p style={{ fontSize: 9.5, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
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
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {freshness.asOfDate ? `· as of ${freshness.asOfDate}` : "· no as-of date on record"}
                  </span>
                </p>

                {/* Methodology / provenance drawer (spec 02 §6 item 10, §5): one click from this
                    number. Real fields only — the registry's own derivation/origin_class/licence text
                    plus the row's own envelope columns, never the removed "convergence scoring" claim
                    (spec 02 §9). */}
                <details style={{ marginTop: 4 }}>
                  <summary
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    Methodology &amp; provenance
                  </summary>
                  <div
                    style={{
                      marginTop: 6,
                      padding: "8px 10px",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: 6,
                      background: "var(--color-bg-base)",
                      display: "grid",
                      gridTemplateColumns: "auto 1fr",
                      rowGap: 3,
                      columnGap: 8,
                      fontSize: 10,
                    }}
                  >
                    <MethodRow k="Derivation" v={s.derivation} />
                    <MethodRow k="Origin class" v={s.originClass} />
                    <MethodRow k="Method version" v={s.methodVersion} />
                    <MethodRow k="Observations (n)" v={s.nObservations != null ? String(s.nObservations) : null} />
                    <MethodRow k="Source key" v={s.sourceKey} />
                    <MethodRow
                      k="Source ref"
                      v={s.sourceRef}
                      href={s.sourceRef && group.sourceUrl ? group.sourceUrl : undefined}
                    />
                    <MethodRow k="Licence" v={group.licenceStatus} />
                    <MethodRow k="Attribution" v={`${group.sourceName}. ${group.licenceStatus}.`} />
                  </div>
                </details>
              </div>
            );
          })}
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

/** One methodology-drawer row. Renders nothing (not an empty dash) when the field is absent — a drawer
 *  states what it knows, never pads out fields the row does not carry. */
function MethodRow({ k, v, href }: { k: string; v: string | null | undefined; href?: string }) {
  if (!v) return null;
  return (
    <>
      <span style={{ color: "var(--color-text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ color: "var(--color-text-secondary)", wordBreak: "break-word" }}>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {v}
          </a>
        ) : (
          v
        )}
      </span>
    </>
  );
}
