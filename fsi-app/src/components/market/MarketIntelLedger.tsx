"use client";

/**
 * MarketIntelLedger — the redesigned /market index (Redesign TEMPLATE 04).
 * Reuses the TEMPLATE 02 index archetype: clickable count tiles → Ask bar →
 * a filter status line → a banded ledger, all built from `var(--…)` tokens
 * and native buttons/links (WCAG AA, keyboard-operable).
 *
 * Shape (HANDOFF §6.4): five SEVERITY tiles (Action required / Cost alert /
 * Window closing / Competitive edge / Monitoring) + a three-band strip
 * (B1 Price / B2 Corporate & capital / B3 Corridors & trade routes) — ALL
 * combinable filters → signal cards grouped by severity. Each card head =
 * one dashed amber "Unverified" chip (market_signal is early-signal by
 * design, HANDOFF §3) + jurisdiction · band chip + a KEY FIGURE top-right
 * (Anton, in the severity colour) + "Full analysis →" (solid orange, to the
 * signal detail route) + an expander. On expand: Trajectory / What it changes
 * / Conversion trigger panels.
 *
 * COUNTS (binding, THE card-swap this template ships): the five tiles read
 * get_surface_counts('market').by_severity DIRECTLY, the band strip reads
 * .by_band DIRECTLY, and the header total reads .total_items — migrations
 * 148 + 149 are applied to prod so these are live. It is STILL fail-soft
 * (never throws): when the RPC bundle is absent/empty the tiles + bands
 * fall back to a client derivation over the loaded verified rows. Counts are
 * NEVER recomputed from the visible rows on the primary path and the mock's
 * snapshot numbers are NEVER hard-coded. signal_band is an honest partial
 * (market-only, sparsely classified) — the strip renders the classified
 * subset plus an honest "N not yet classified" note (migration 149).
 *
 * HONEST STATE (HANDOFF §4): a signal with no sourced price dimension renders
 * the key figure as an em-dash "—" with a muted reason — never an invented
 * number. Filters that can yield zero always render a "Clear filters"
 * recovery. Epistemic chips bind real fields only (dashed amber Unverified =
 * item_type market_signal, by design). Non-verified items never reach this
 * surface (the listing RPC is verified-gated server-side).
 */

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";

interface MarketIntelLedgerProps {
  initialResources: Resource[];
  /** Verified-population count bundle from getSurfaceCounts('market').
   *  bySeverity / byBand drive the tiles + strip on the primary path;
   *  totalItems === 0 (or missing distributions) signals the fail-soft
   *  path, in which case counts derive from the loaded verified rows. */
  aggregates: WorkspaceAggregates;
}

// ── Severity vocab ─────────────────────────────────────────────────────
// Canonical DB keys (intelligence_items.severity, migration 102/149) →
// display. Hues / tints / gradient strips lifted verbatim from the
// "Pages - 04 Market Intel" inline styles (tileDefs + sevMeta); the hex
// live as tokens in theme.css.
type SevKey =
  | "action_required"
  | "cost_alert"
  | "window_closing"
  | "competitive_edge"
  | "monitoring";

interface SevDef {
  key: SevKey;
  label: string;
  tileSub: string;
  groupSub: string;
  /** Ledger group hue + key figure + card left edge (mock sevMeta). */
  hueVar: string;
  /** Tile eyebrow + Anton numeral (mock tileDefs — differs from hueVar
   *  for competitive_edge: blue tile, green ledger — the mock's own split). */
  tileHueVar: string;
  bgVar: string;
  stripVar: string;
}

const SEVERITIES: SevDef[] = [
  {
    key: "action_required",
    label: "Action required",
    tileSub: "Threshold breached this week",
    groupSub: "decision pressure now",
    hueVar: "var(--mi-action)",
    tileHueVar: "var(--mi-action)",
    bgVar: "var(--mi-action-bg)",
    stripVar: "var(--mi-action-strip)",
  },
  {
    key: "cost_alert",
    label: "Cost alert",
    tileSub: "Pass-through expected",
    groupSub: "margin or surcharge moving — sorted by escalation risk",
    hueVar: "var(--mi-cost)",
    tileHueVar: "var(--mi-cost)",
    bgVar: "var(--mi-cost-bg)",
    stripVar: "var(--mi-cost-strip)",
  },
  {
    key: "window_closing",
    label: "Window closing",
    tileSub: "Deadline within 90 days",
    groupSub: "deadline approaches",
    hueVar: "var(--mi-window)",
    tileHueVar: "var(--mi-window)",
    bgVar: "var(--mi-window-bg)",
    stripVar: "var(--mi-window-strip)",
  },
  {
    key: "competitive_edge",
    label: "Competitive edge",
    tileSub: "Lock-in or advantage",
    groupSub: "lock-in or advantage",
    hueVar: "var(--mi-edge)",
    tileHueVar: "var(--mi-edge-tile)",
    bgVar: "var(--mi-edge-bg)",
    stripVar: "var(--mi-edge-tile)",
  },
  {
    key: "monitoring",
    label: "Monitoring",
    tileSub: "Trends to watch",
    groupSub: "track trend",
    hueVar: "var(--mi-monitor)",
    tileHueVar: "var(--mi-monitor)",
    bgVar: "var(--mi-monitor-bg)",
    stripVar: "var(--mi-monitor-strip)",
  },
];
const SEV_ORDER: SevKey[] = SEVERITIES.map((s) => s.key);
const SEV_BY_KEY: Record<SevKey, SevDef> = Object.fromEntries(
  SEVERITIES.map((s) => [s.key, s])
) as Record<SevKey, SevDef>;

// ── Signal-band vocab ──────────────────────────────────────────────────
type BandKey = "price" | "corporate" | "corridor";

interface BandDef {
  key: BandKey;
  code: string;
  name: string;
  sub: string;
}

const BANDS: BandDef[] = [
  { key: "price", code: "B1", name: "Price signals", sub: "Fuel · carbon · energy · freight" },
  { key: "corporate", code: "B2", name: "Corporate & capital", sub: "Vendor · supplier · capacity" },
  {
    key: "corridor",
    code: "B3",
    name: "Corridors & trade routes",
    sub: "Chokepoints · modal shifts · regulatory windows",
  },
];
const BAND_BY_KEY: Record<BandKey, BandDef> = Object.fromEntries(
  BANDS.map((b) => [b.key, b])
) as Record<BandKey, BandDef>;

const ASK_CHIPS = [
  "SAF cost outlook",
  "EU ETS shipping pass-through",
  "Carrier capacity Q3",
  "Diesel forward curve",
];

// ── Client-side classifiers (fallback only) ────────────────────────────
// Primary path: the DB severity/signal_band columns (migrations 102/149).
// These regex fallbacks fire ONLY when a row lacks the column value, so the
// per-row filter + the fail-soft tile/band counts still work pre-backfill.

const SEV_KEYWORDS: Record<SevKey, RegExp[]> = {
  action_required: [/\baction required\b/i, /\bimmediate\b/i, /\bmust file\b/i],
  cost_alert: [/\b(cost|surcharge|pass[- ]?through|margin)\b/i, /\bcost alert\b/i],
  window_closing: [/\b(window|deadline|enforcement|consultation|by 20)\b/i],
  competitive_edge: [/\b(competitive|edge|advantage|lock(ed)?|offtake|partnership)\b/i],
  monitoring: [/\b(monitor|tracking|watch|observe)\b/i],
};

function deriveSev(r: Resource): SevKey {
  if (r.severity && (SEV_ORDER as string[]).includes(r.severity)) {
    return r.severity as SevKey;
  }
  const text = `${r.title} ${r.note || ""}`;
  for (const key of SEV_ORDER) {
    for (const re of SEV_KEYWORDS[key]) if (re.test(text)) return key;
  }
  if (r.priority === "CRITICAL") return "action_required";
  if (r.priority === "HIGH") return "cost_alert";
  if (r.priority === "MODERATE") return "window_closing";
  return "monitoring";
}

const BAND_KEYWORDS: Record<BandKey, RegExp[]> = {
  price: [/\b(price|spot|futures|surcharge|fuel|saf|eua|carbon|crude|diesel|jet)\b/i, /\/(bbl|mmbtu|t|kwh|teu|l)\b/i],
  corporate: [/\b(announces|raises|acquires|merger|partner|deploy|capacity|fleet|order|supplier|offtake)\b/i],
  corridor: [/\b(corridor|route|chokepoint|port|hormuz|suez|canal|cape|drayage|lane|roadcheck)\b/i],
};

/** Band key, or null when the row carries no classification (honest partial). */
function deriveBand(r: Resource): BandKey | null {
  if (r.signalBand === "price" || r.signalBand === "corporate" || r.signalBand === "corridor") {
    return r.signalBand;
  }
  const text = `${r.title} ${r.note || ""}`;
  for (const b of BANDS) {
    for (const re of BAND_KEYWORDS[b.key]) if (re.test(text)) return b.key;
  }
  return null;
}

/** Short jurisdiction tag (ISO code, else legacy string, else GLOBAL). */
function jurTag(r: Resource): string {
  const iso = r.jurisdictionIso?.[0];
  if (iso) return iso.toUpperCase();
  if (r.jurisdiction) return r.jurisdiction.toUpperCase();
  return "GLOBAL";
}

interface Enriched {
  item: Resource;
  sev: SevKey;
  band: BandKey | null;
}

export function MarketIntelLedger({ initialResources, aggregates }: MarketIntelLedgerProps) {
  const [sevFilter, setSevFilter] = useState<SevKey | null>(null);
  const [bandFilter, setBandFilter] = useState<BandKey | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [askValue, setAskValue] = useState("");
  const askRef = useRef<HTMLFormElement>(null);

  const enriched = useMemo<Enriched[]>(
    () => initialResources.map((item) => ({ item, sev: deriveSev(item), band: deriveBand(item) })),
    [initialResources]
  );

  // ── Counts: RPC primary path, fail-soft to row derivation ────────────
  const rpcOk = aggregates.totalItems > 0;
  const sevRpc = !!aggregates.bySeverity && Object.keys(aggregates.bySeverity).length > 0;
  const bandRpc = !!aggregates.byBand && Object.keys(aggregates.byBand).length > 0;

  const rowSevCount = (key: SevKey) => enriched.filter((e) => e.sev === key).length;
  const rowBandCount = (key: BandKey) => enriched.filter((e) => e.band === key).length;

  const sevCount = (key: SevKey): number =>
    sevRpc ? aggregates.bySeverity![key] ?? 0 : rowSevCount(key);
  const bandCount = (key: BandKey): number =>
    bandRpc ? aggregates.byBand![key] ?? 0 : rowBandCount(key);

  const headerTotal = rpcOk ? aggregates.totalItems : enriched.length;
  const bandsClassified = BANDS.reduce((n, b) => n + bandCount(b.key), 0);
  const bandsUnclassified = Math.max(0, headerTotal - bandsClassified);

  // ── Filtered rows ─────────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      enriched.filter(
        (e) => (!sevFilter || e.sev === sevFilter) && (!bandFilter || e.band === bandFilter)
      ),
    [enriched, sevFilter, bandFilter]
  );

  const groups = useMemo(
    () =>
      SEV_ORDER.map((key) => ({
        def: SEV_BY_KEY[key],
        rows: filtered.filter((e) => e.sev === key),
      })).filter((g) => g.rows.length > 0),
    [filtered]
  );

  const filterActive = !!(sevFilter || bandFilter);
  const filterParts: string[] = [];
  if (sevFilter) filterParts.push(SEV_BY_KEY[sevFilter].label);
  if (bandFilter) filterParts.push(`${BAND_BY_KEY[bandFilter].code} ${BAND_BY_KEY[bandFilter].name}`);

  const clearFilters = () => {
    setSevFilter(null);
    setBandFilter(null);
  };

  const submitAsk = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const rect = askRef.current?.getBoundingClientRect();
    const anchor = rect ? { top: rect.bottom, left: rect.left, width: rect.width } : null;
    window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { question: q, anchor } }));
  };

  const watchAlerts = sevCount("action_required") + sevCount("cost_alert");
  const indicators = useMemo(
    () =>
      enriched
        .filter((e) => e.sev === "action_required" || e.sev === "cost_alert")
        .slice(0, 6),
    [enriched]
  );

  // ── Shared styles ─────────────────────────────────────────────────────
  const cardBorder = "1px solid var(--color-border)";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 36px 80px" }}>
      {/* ── Severity tiles — clickable filters → by_severity ── */}
      <div
        role="group"
        aria-label="Filter by severity"
        className="cl-mi-tiles"
        style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, margin: "0 0 18px" }}
      >
        {SEVERITIES.map((s) => {
          const pressed = sevFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={pressed}
              aria-label={`${s.label} — ${sevCount(s.key)} signals; filter this severity`}
              onClick={() => setSevFilter(pressed ? null : s.key)}
              style={{
                textAlign: "left",
                background: "var(--color-bg-surface)",
                border: `1px solid ${pressed ? s.tileHueVar : "var(--color-border)"}`,
                borderRadius: 8,
                overflow: "hidden",
                display: "block",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              <div style={{ padding: "14px 16px 10px" }}>
                <p
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: s.tileHueVar,
                    margin: "0 0 4px",
                  }}
                >
                  {s.label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 38,
                    lineHeight: 1,
                    color: s.tileHueVar,
                    margin: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {sevCount(s.key)}
                </p>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", margin: "5px 0 0" }}>
                  {s.tileSub}
                </p>
              </div>
              <div style={{ height: 5, background: s.stripVar }} />
            </button>
          );
        })}
      </div>

      {/* ── Signal-band strip — clickable filters → by_band ── */}
      <div
        role="group"
        aria-label="Filter by signal band"
        className="cl-mi-bands"
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, margin: "0 0 6px" }}
      >
        {BANDS.map((b) => {
          const pressed = bandFilter === b.key;
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={pressed}
              aria-label={`${b.code} ${b.name} — ${bandCount(b.key)} signals; filter this band`}
              onClick={() => setBandFilter(pressed ? null : b.key)}
              style={{
                textAlign: "left",
                background: pressed ? "var(--color-bg-accent-tint, #FFF7F0)" : "var(--color-bg-surface)",
                border: `1px solid ${pressed ? "var(--color-primary)" : "var(--color-border)"}`,
                borderRadius: 8,
                padding: "13px 16px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.11em",
                    textTransform: "uppercase",
                    color: "var(--brass)",
                  }}
                >
                  {b.code} · {b.name}
                </span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--color-primary)" }}>
                  {bandCount(b.key)}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>{b.sub}</p>
            </button>
          );
        })}
      </div>
      {/* Honest partial: signal_band is market-only + sparsely classified
          (migration 149). Surface the unclassified remainder rather than
          silently implying the three bands sum to the total. */}
      {bandsUnclassified > 0 && (
        <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", margin: "0 0 18px" }}>
          {bandsUnclassified} of {headerTotal} signals not yet classified into a band — band tagging is
          being backfilled.
        </p>
      )}
      {bandsUnclassified === 0 && <div style={{ height: 12 }} />}

      {/* ── Ask bar ── */}
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: cardBorder,
          borderRadius: 8,
          padding: "14px 16px",
          margin: "0 0 22px",
        }}
      >
        <form
          ref={askRef}
          onSubmit={(e) => {
            e.preventDefault();
            submitAsk(askValue);
            setAskValue("");
          }}
          style={{ display: "flex", gap: 10, alignItems: "center" }}
        >
          <input
            value={askValue}
            onChange={(e) => setAskValue(e.target.value)}
            aria-label="Ask anything about market intel"
            placeholder="Ask anything about market intel, e.g. How will SAF prices affect Q3 surcharges on my EU-US lanes?"
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: "inherit",
              fontSize: 13.5,
              padding: "11px 14px",
              border: "1px solid var(--color-border-medium)",
              borderRadius: 6,
              outline: "none",
              background: "var(--color-bg-base)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            type="submit"
            style={{
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 800,
              padding: "11px 20px",
              borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: "var(--color-primary)",
              color: "var(--color-text-inverse, #fff)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Ask
          </button>
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 0" }}>
          {ASK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setAskValue(chip)}
              style={{
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                background: "var(--color-bg-base)",
                border: "1px solid var(--color-border-medium)",
                borderRadius: 999,
                padding: "6px 13px",
                cursor: "pointer",
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter status line ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "2px solid var(--color-text-primary)",
          padding: "0 0 8px",
          margin: "0 0 16px",
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
          {headerTotal} {headerTotal === 1 ? "signal" : "signals"}
        </h2>
        {filterActive ? (
          <button
            type="button"
            onClick={clearFilters}
            style={{
              fontFamily: "inherit",
              fontSize: 11.5,
              fontWeight: 800,
              color: "var(--color-primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Clear filters ✕
          </button>
        ) : (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            Click a tile or band to filter
          </span>
        )}
      </div>

      {/* Filter disclosure — visible-count is a disclosure beside the
          authoritative header total, never a replacement for it. */}
      {filterActive && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 14px" }}>
          {filtered.length} shown · {filterParts.join(" · ")}
        </p>
      )}

      {/* ── Ledger + rail ── */}
      <div className="cl-mi-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 24, alignItems: "start" }}>
        {/* Ledger */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {enriched.length === 0 ? (
            <PendingFrame
              headline="No market signals to show yet"
              body="Verified market signals appear here once the workspace has classified, source-grounded coverage. Nothing is hidden — there is simply no verified signal on this surface right now."
            />
          ) : groups.length === 0 ? (
            <PendingFrame
              headline="No signals match this filter"
              body="No signal carries this combination of severity and band. Clear the filters to see the full ledger."
              action={{ label: "Clear filters", onClick: clearFilters }}
            />
          ) : (
            groups.map((g) => {
              const authCount = sevCount(g.def.key);
              const showShown = g.rows.length !== authCount;
              return (
                <div key={g.def.key}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: "9px 16px",
                      background: g.def.bgVar,
                      border: `1px solid ${
                        g.def.key === "action_required" ? "var(--mi-action-bd)" : "var(--color-border)"
                      }`,
                      borderBottom: "none",
                      borderRadius: "8px 8px 0 0",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: g.def.hueVar,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.def.hueVar, display: "inline-block" }} />
                      {g.def.label}
                      <span
                        style={{
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                          textTransform: "none",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {g.def.groupSub}
                      </span>
                    </span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
                      {showShown && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted)" }}>
                          {g.rows.length} shown
                        </span>
                      )}
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: g.def.hueVar }}>
                        {authCount}
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      border: "1px solid var(--color-border)",
                      borderRadius: "0 0 8px 8px",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {g.rows.map((e) => (
                      <SignalRow
                        key={e.item.id}
                        e={e}
                        open={!!openRows[e.item.id]}
                        onToggle={() =>
                          setOpenRows((prev) => ({ ...prev, [e.item.id]: !prev[e.item.id] }))
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {enriched.length > 0 && groups.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.6, margin: "2px 2px 0" }}>
              Signals are unverified by design — timely first, confirmed later. Open any signal for the full
              analysis, drivers, cost impact, and sources.
            </p>
          )}
        </div>

        {/* Right rail */}
        <div className="cl-mi-rail" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button
            type="button"
            onClick={() => {
              setSevFilter("cost_alert");
              setBandFilter(null);
            }}
            aria-label="Filter to cost alerts"
            style={{
              textAlign: "left",
              fontFamily: "inherit",
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              borderLeft: "3px solid var(--color-primary)",
              borderRadius: 8,
              padding: "14px 16px",
              cursor: "pointer",
            }}
          >
            <p style={railLbl}>Watch this week · click to filter</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--color-primary)", margin: 0 }}>
              {watchAlerts} {watchAlerts === 1 ? "alert" : "alerts"}
            </p>
            <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
              {sevCount("action_required")} action-required + {sevCount("cost_alert")} cost alerts across the
              bands.
            </p>
          </button>

          <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-subtle)" }}>
              <p style={railLbl}>Highest-priority indicators</p>
            </div>
            {indicators.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "12px 16px", margin: 0 }}>
                No action-required or cost-alert signals on the surface right now.
              </p>
            ) : (
              indicators.map((e) => (
                <Link
                  key={e.item.id}
                  href={`/market/${encodeURIComponent(e.item.id)}`}
                  className="cl-mi-indicator"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "baseline",
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--color-border-subtle)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, display: "block", lineHeight: 1.4 }}>
                      {e.item.title}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                      {SEV_BY_KEY[e.sev].label}
                      {e.band ? ` · ${BAND_BY_KEY[e.band].code}` : ""}
                    </span>
                  </span>
                  <span aria-hidden style={{ fontSize: 11, color: "var(--mi-cost)" }}>
                    ▲
                  </span>
                </Link>
              ))
            )}
          </div>

          <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ ...railLbl, marginBottom: 8 }}>Methodology</p>
            <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
              Signals are scored by source convergence (independent corroborating sources within 30 days)
              and recency. The five-label severity vocabulary names the next-action shape: Action required,
              Cost alert, Window closing, Competitive edge, Monitoring.
            </p>
          </div>

          <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ ...railLbl, marginBottom: 8 }}>Sources tracked</p>
            <div
              style={{
                border: "1px dashed rgba(0,0,0,0.25)",
                borderRadius: 6,
                background: "var(--color-bg-base)",
                padding: "11px 13px",
              }}
            >
              <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
                The price-data source roster populates here once the commodity-price feed is connected. The
                live source registry is under Sources → Source Health.
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .cl-mi-indicator:hover { background: var(--color-bg-base); }
        @media (max-width: 1200px) {
          .cl-mi-grid { grid-template-columns: minmax(0,1fr) !important; }
          .cl-mi-rail { flex-direction: row !important; flex-wrap: wrap !important; }
          .cl-mi-rail > * { flex: 1 1 260px; }
        }
        @media (max-width: 860px) {
          .cl-mi-tiles { grid-template-columns: repeat(2, 1fr) !important; }
          .cl-mi-bands { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .cl-mi-tiles { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Signal row (card head + expander body) ─────────────────────────────
function SignalRow({ e, open, onToggle }: { e: Enriched; open: boolean; onToggle: () => void }) {
  const { item, sev, band } = e;
  const def = SEV_BY_KEY[sev];
  const bandDef = band ? BAND_BY_KEY[band] : null;
  const summary = item.note || item.whatIsIt || "";
  const bodyId = `mi-body-${item.id}`;

  // Key figure — bind to a real sourced field (marketData.currentPrice) only;
  // otherwise the honest em-dash. No invented numbers, ever (HANDOFF §1/§4).
  const priceFigure = item.marketData?.currentPrice?.trim() || null;
  const figLabel = priceFigure
    ? item.marketData?.priceDate || item.marketData?.priceSource || "current price"
    : "no price dimension";
  const figHue = priceFigure ? def.hueVar : "var(--mi-fig-empty)";

  return (
    <div style={{ background: "var(--color-bg-surface)", borderLeft: `3px solid ${def.hueVar}`, borderBottom: "1px solid var(--color-border-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", padding: "14px 18px" }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            fontFamily: "inherit",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", margin: "0 0 5px" }}>
            {/* Epistemic: dashed amber Unverified — market_signal is early-signal by design (§3). */}
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--epistemic-signal)",
                border: "1px dashed rgba(180,83,9,0.45)",
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              Unverified
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "var(--brass)" }}>
              {jurTag(item)}
              {bandDef ? ` · ${bandDef.code}` : ""}
            </span>
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, lineHeight: 1.35, color: "var(--color-text-primary)" }}>
            {item.title}
          </p>
          {summary && (
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: "5px 0 0", maxWidth: "96ch" }}>
              {summary}
            </p>
          )}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "right", minWidth: 120 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: figHue, margin: 0, whiteSpace: "nowrap" }}>
              {priceFigure ?? "—"}
            </p>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                margin: "4px 0 0",
                whiteSpace: "nowrap",
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {figLabel}
            </p>
          </div>
          <Link
            href={`/market/${encodeURIComponent(item.id)}`}
            style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: "7px 14px",
              borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: "var(--color-primary)",
              color: "var(--color-text-inverse, #fff)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Full analysis →
          </Link>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? "Collapse signal" : "Expand signal"}
            style={{
              fontFamily: "inherit",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1,
              padding: "6px 8px",
              border: "none",
              background: "transparent",
              color: "var(--color-primary)",
            }}
          >
            {open ? "–" : "+"}
          </button>
        </div>
      </div>

      {open && (
        <div id={bodyId}>
          <div
            className="cl-mi-panels"
            style={{
              borderTop: "1px solid var(--color-border-subtle)",
              padding: "14px 18px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
            }}
          >
            {/* Trajectory — honest pending (no per-item price feed yet). */}
            <div style={{ border: "1px dashed rgba(0,0,0,0.25)", borderRadius: 6, background: "var(--color-bg-base)", padding: "12px 14px" }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brass)", display: "block", margin: "0 0 4px" }}>
                Trajectory · not yet captured
              </span>
              <p style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0 }}>
                {band === "price"
                  ? "Price history begins with the next weekly capture once the commodity-price feed is connected."
                  : "Trajectory tracking applies to price-band signals; this signal carries no price series."}
              </p>
            </div>

            {/* What it changes — labeled analysis (§3), ink on paper. */}
            <div style={{ borderLeft: "3px solid var(--color-text-primary)", padding: "2px 0 2px 12px" }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-primary)", display: "block", margin: "0 0 4px" }}>
                Our analysis · what it changes
              </span>
              <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "var(--color-text-primary)" }}>
                {item.whatItChanges || (
                  <span style={{ color: "var(--color-text-muted)" }}>
                    — not yet recorded for this signal
                  </span>
                )}
              </p>
            </div>

            {/* Conversion trigger — labeled analysis, orange accent. */}
            <div style={{ borderLeft: "3px solid var(--color-primary)", padding: "2px 0 2px 12px" }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-primary)", display: "block", margin: "0 0 4px" }}>
                Conversion trigger · when this escalates
              </span>
              <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "var(--color-text-primary)" }}>
                {item.conversionTrigger || (
                  <span style={{ color: "var(--color-text-muted)" }}>
                    — not yet recorded for this signal
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const railLbl: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  margin: 0,
};

function PendingFrame({
  headline,
  body,
  action,
}: {
  headline: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ border: "1px dashed rgba(0,0,0,0.25)", background: "var(--color-bg-base)", borderRadius: 8, padding: "22px 20px" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--brass)", margin: "0 0 6px" }}>
        Nothing to show
      </p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 6px" }}>{headline}</p>
      <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginTop: 12,
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            color: "var(--color-primary)",
            background: "none",
            border: "1px solid var(--color-primary)",
            borderRadius: 6,
            padding: "7px 14px",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
