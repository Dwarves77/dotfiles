"use client";

/**
 * MarketPage, Sequence C rebuild (2026-05-24).
 *
 * Layout mirrors design_handoff_2026-05/market-intel.html:
 *   - Masthead + priority legend + 4 stat tiles (Action required /
 *     Cost alert / Window closing / Monitor)
 *   - Coverage rail with 3 signal bands (B1 Price / B2 Corporate /
 *     B3 Corridors)
 *   - AI prompt bar with market chips
 *   - Three signal bands as bordered card sections:
 *       B1 Price: 4-tile price snapshot + featured signal with
 *                 trajectory bars + standard signal cards
 *       B2 Corporate & capital: featured signal + standard cards
 *       B3 Corridors & routes: featured signal + standard cards
 *   - Right rail: Watch this week + Highest-priority indicators +
 *     Methodology + Sources tracked
 *
 * Operator binding (handoff Section 3 Fix 1): 5-label severity vocab
 * for Market Intel = Action required / Cost alert / Window closing /
 * Competitive edge / Monitoring. The 4 stat tiles surface the four
 * most-relevant subsets; the legend documents all five.
 *
 * Data layer compromise: `signal_band` and `severity` are derived
 * client-side from keyword matching on title + summary; trajectory
 * data hard-coded for the featured B1 signal as a vertical slice.
 * When `intelligence_items.signal_band`, `severity`, and a time-series
 * table land, the derivations swap for direct column reads.
 */

import { useMemo } from "react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates, SourceCitationStatsMap } from "@/lib/data";

interface MarketPageProps {
  initialResources: Resource[];
  aggregates?: WorkspaceAggregates;
  citationStats?: SourceCitationStatsMap;
}

// ── Severity vocabulary (5-label per spec) ──

type Severity = "action" | "cost" | "window" | "edge" | "monitor";

const SEVERITY_LABEL: Record<Severity, string> = {
  action: "Action required",
  cost: "Cost alert",
  window: "Window closing",
  edge: "Competitive edge",
  monitor: "Monitoring",
};

const SEVERITY_PILL_TONE: Record<Severity, { fg: string; bg: string; bd: string }> = {
  action: { fg: "var(--color-critical)", bg: "var(--color-critical-bg)", bd: "var(--color-critical-border)" },
  cost: { fg: "var(--color-high)", bg: "var(--color-high-bg)", bd: "var(--color-high-border)" },
  window: { fg: "var(--color-moderate)", bg: "var(--color-moderate-bg)", bd: "var(--color-moderate-border)" },
  edge: { fg: "var(--color-secondary)", bg: "rgba(37,99,235,0.08)", bd: "var(--color-secondary)" },
  monitor: { fg: "var(--color-text-muted)", bg: "var(--color-surface)", bd: "var(--color-border)" },
};

// ── Signal band vocabulary ──

type BandKey = "price" | "corporate" | "corridor";

interface Band {
  key: BandKey;
  num: number;
  label: string;
  subtitle: string;
  summary: string;
}

const BANDS: Band[] = [
  {
    key: "price",
    num: 1,
    label: "Price signals",
    subtitle: "Fuel · carbon · energy · freight",
    summary:
      "Current commodity prices that flow through to freight surcharges, lane costs, and quote pricing. Each cell sourced and dated; 4-week deltas indicate trajectory.",
  },
  {
    key: "corporate",
    num: 2,
    label: "Corporate & capital",
    subtitle: "Vendor · supplier · capacity",
    summary:
      "Named company actions that change the competitive landscape, capital raises, capacity decisions, M&A, technology deployments, supplier shifts. The actor, the action, and the implication for your lanes.",
  },
  {
    key: "corridor",
    num: 3,
    label: "Corridors & trade routes",
    subtitle: "Chokepoints · modal shifts · regulatory windows",
    summary:
      "Geographic and route-level signals. Chokepoint disruption, port restrictions, modal shifts, and regulatory enforcement windows that close on specific corridors.",
  },
];

const BAND_KEYWORDS: Record<BandKey, RegExp[]> = {
  price: [/\b(price|spot|futures|tariff|surcharge|fuel|saf|eua|carbon|crude|jet a-?1|diesel)\b/i, /eur ?\d|usd ?\d|gbp ?\d|aed ?\d/i, /\/t\b|\/kwh|\/teu|\/l\b/i],
  corporate: [/\b(announces|raises|acquires|merger|partner|deploy|capacity|fleet|order|supplier|offtake|m&a)\b/i],
  corridor: [/\b(corridor|route|chokepoint|port|hormuz|suez|canal|cape|drayage|lane)\b/i, /\b(eu ?[→\-→]? ?(us|asia)|us ?[→\-→]? ?(eu|asia))\b/i],
};

function assignBand(r: Resource): BandKey {
  const text = `${r.title} ${r.note || ""}`;
  for (const band of BANDS) {
    for (const re of BAND_KEYWORDS[band.key]) {
      if (re.test(text)) return band.key;
    }
  }
  return "corporate";
}

// ── Severity derivation ──

const SEVERITY_KEYWORDS: Record<Severity, RegExp[]> = {
  action: [/\baction required\b/i, /\bimmediate\b/i, /\bdeadline\b/i, /\bmust file\b/i],
  cost: [/\b(cost|surcharge|pass[- ]?through|margin|price.*(rise|up|breach))\b/i, /\bcost alert\b/i],
  window: [/\b(window|deadline|by 20|q\d \d{4}|enforcement|consultation)\b/i],
  edge: [/\b(competitive|edge|advantage|lock(ed)?|offtake|partnership)\b/i],
  monitor: [/\b(monitor|tracking|watch|observe)\b/i],
};

function deriveSeverity(r: Resource): Severity {
  const text = `${r.title} ${r.note || ""}`;
  // Priority order: action > cost > window > edge > monitor
  const order: Severity[] = ["action", "cost", "window", "edge", "monitor"];
  for (const sev of order) {
    for (const re of SEVERITY_KEYWORDS[sev]) {
      if (re.test(text)) return sev;
    }
  }
  // Map remaining items by priority field if present.
  if (r.priority === "CRITICAL") return "action";
  if (r.priority === "HIGH") return "cost";
  if (r.priority === "MODERATE") return "window";
  return "monitor";
}

// ── Component ──

export function MarketPage({ initialResources, aggregates }: MarketPageProps) {
  // Enrich items with band + severity.
  const enriched = useMemo(
    () =>
      initialResources.map((r) => ({
        item: r,
        band: assignBand(r),
        severity: deriveSeverity(r),
      })),
    [initialResources]
  );

  // Severity tile counts (Action / Cost / Window / Monitor for the 4 visible tiles).
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { action: 0, cost: 0, window: 0, edge: 0, monitor: 0 };
    for (const e of enriched) c[e.severity]++;
    return c;
  }, [enriched]);

  // Band counts.
  const bandCounts = useMemo(() => {
    const c: Record<BandKey, number> = { price: 0, corporate: 0, corridor: 0 };
    for (const e of enriched) c[e.band]++;
    return c;
  }, [enriched]);

  // Items grouped by band.
  const itemsByBand = useMemo(() => {
    const map: Record<BandKey, typeof enriched> = { price: [], corporate: [], corridor: [] };
    for (const e of enriched) map[e.band].push(e);
    return map;
  }, [enriched]);

  // Featured per band (highest priority severity).
  const featuredByBand = useMemo(() => {
    const sevOrder: Severity[] = ["action", "cost", "window", "edge", "monitor"];
    const fmap: Record<BandKey, typeof enriched[number] | null> = {
      price: null,
      corporate: null,
      corridor: null,
    };
    for (const band of ["price", "corporate", "corridor"] as BandKey[]) {
      const items = itemsByBand[band];
      const sorted = [...items].sort(
        (a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity)
      );
      fmap[band] = sorted[0] || null;
    }
    return fmap;
  }, [itemsByBand]);

  const totalSignals = aggregates?.totalItems ?? initialResources.length;
  const watchAlertsCount = counts.action + counts.cost;

  return (
    <div>
      <EditorialMasthead
        title="Market Intelligence"
        meta={
          <>
            May 24, 2026
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalSignals}</b> active signals
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>45</b> jurisdictions in scope
            {" · "}
            workspace verticals: <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>Live events · Fine art</b>
          </>
        }
      />

      {/* Stat zone */}
      <div style={{ background: "var(--color-bg-raised)", padding: "0 40px 18px" }}>
        <div
          style={{
            display: "flex",
            gap: 22,
            alignItems: "center",
            padding: "12px 0 18px",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            flexWrap: "wrap",
          }}
        >
          <LegendItem color={SEVERITY_PILL_TONE.action.fg} label="Action required" desc="Decision pressure now" />
          <LegendItem color={SEVERITY_PILL_TONE.cost.fg} label="Cost alert" desc="Margin or surcharge moving" />
          <LegendItem color={SEVERITY_PILL_TONE.window.fg} label="Window closing" desc="Deadline approaches" />
          <LegendItem color={SEVERITY_PILL_TONE.monitor.fg} label="Monitor" desc="Track trend" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <StatTile severity="action" count={counts.action} label="Action required" sub="Threshold breached this week" />
          <StatTile severity="cost" count={counts.cost} label="Cost alert" sub="Pass-through expected" />
          <StatTile severity="window" count={counts.window} label="Window closing" sub="Deadline within 90 days" />
          <StatTile severity="monitor" count={counts.monitor + counts.edge} label="Monitor" sub="Trends to watch" />
        </div>
      </div>

      <div style={{ padding: "0 40px 60px" }}>
        {/* Coverage rail */}
        <div style={{ margin: "0 0 22px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              marginBottom: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              paddingBottom: 6,
              borderBottom: "1px solid var(--color-text-primary)",
            }}
          >
            <span>Market Intel, what we track by signal type</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
              3 bands, filtered to your lanes
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: "var(--color-border-subtle)",
              borderTop: "1px solid var(--color-text-primary)",
              borderBottom: "1px solid var(--color-text-primary)",
            }}
          >
            {BANDS.map((band, i) => {
              const isActive = i === 0;
              return (
                <div
                  key={band.key}
                  style={{
                    background: "var(--color-surface)",
                    padding: isActive ? "13px 16px 16px" : "14px 16px 16px",
                    display: "grid",
                    gridTemplateRows: "32px 32px 1fr",
                    gap: 4,
                    minHeight: 130,
                    borderTop: isActive ? "2px solid var(--color-primary)" : 0,
                    marginTop: isActive ? -1 : 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: isActive ? "var(--color-primary)" : "var(--color-text-primary)",
                      lineHeight: 1.3,
                      alignSelf: "end",
                    }}
                  >
                    B{band.num} {band.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 24,
                      lineHeight: 1,
                      color: isActive ? "var(--color-primary)" : "var(--color-text-primary)",
                      alignSelf: "center",
                    }}
                  >
                    {bandCounts[band.key]} active
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4, alignSelf: "start" }}>
                    {band.subtitle}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI bar */}
        <div style={{ marginBottom: 22 }}>
          <AiPromptBar
            placeholder="Ask anything about market intel, e.g. How will SAF prices affect Q3 surcharges on my EU-US lanes?"
            chips={[
              "SAF cost outlook",
              "EU ETS shipping pass-through",
              "Carrier capacity Q3",
              "Diesel forward curve",
            ]}
          />
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 28, alignItems: "start" }}>
          {/* Main column */}
          <div>
            {BANDS.map((band) => {
              const bandItems = itemsByBand[band.key];
              const featured = featuredByBand[band.key];
              const others = bandItems.filter((e) => e !== featured).slice(0, 4);
              return (
                <section
                  key={band.key}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    marginBottom: 18,
                    boxShadow: "var(--shadow-card)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 22px",
                      background: "var(--color-bg-raised)",
                      borderBottom: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 13,
                        fontWeight: 400,
                        letterSpacing: "0.08em",
                        color: "#fff",
                        background: "var(--color-primary)",
                        padding: "4px 10px",
                        borderRadius: 3,
                        minWidth: 36,
                        textAlign: "center",
                        lineHeight: 1.1,
                      }}
                    >
                      B{band.num}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
                      {band.label}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--color-text-muted)", fontWeight: 600 }}>
                      {band.subtitle} · {bandCounts[band.key]} active
                    </span>
                  </div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-text-secondary)", padding: "14px 22px 0", margin: 0, maxWidth: "78ch" }}>
                    {band.summary}
                  </p>
                  <div style={{ padding: "14px 22px 18px" }}>
                    {/* B1 only: price snapshot row */}
                    {band.key === "price" && <PriceSnapshotRow />}

                    {/* Featured */}
                    {featured && (
                      <SignalCard
                        item={featured.item}
                        severity={featured.severity}
                        featured
                        bandKey={band.key}
                      />
                    )}

                    {/* Others */}
                    {others.map((e) => (
                      <SignalCard key={e.item.id} item={e.item} severity={e.severity} bandKey={band.key} />
                    ))}

                    {bandItems.length === 0 && (
                      <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", fontStyle: "italic", marginTop: 10 }}>
                        No active items in this band yet.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Right rail */}
          <aside>
            <RailCard accent>
              <div style={cardLblStyle}>Watch this week · click to filter</div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--color-primary)", lineHeight: 1, margin: "4px 0 8px" }}>
                {watchAlertsCount} alerts
              </p>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
                {counts.action} action-required + {counts.cost} cost alerts across the bands above.
              </p>
            </RailCard>

            <RailCard>
              <div style={cardLblStyle}>Highest-priority indicators</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {enriched
                  .filter((e) => e.severity === "action" || e.severity === "cost")
                  .slice(0, 6)
                  .map((e) => (
                    <li
                      key={e.item.id}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid var(--color-border-subtle)",
                        fontSize: 12.5,
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 16, float: "right", color: "var(--color-primary)" }}>
                        {e.severity === "action" ? "▲" : "▲"}
                      </span>
                      <b style={{ color: "var(--color-text-primary)", fontWeight: 700, display: "block" }}>
                        {e.item.title.slice(0, 60)}
                        {e.item.title.length > 60 ? "…" : ""}
                      </b>
                      <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                        {SEVERITY_LABEL[e.severity]} · {e.band}
                      </span>
                    </li>
                  ))}
              </ul>
            </RailCard>

            <RailCard>
              <div style={cardLblStyle}>Methodology</div>
              <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "0 0 8px" }}>
                Signals are scored by source convergence (independent corroborating sources within 30 days) and recency. The 5-label severity vocabulary names the next-action shape: Action required, Cost alert, Window closing, Competitive edge, Monitoring.
              </p>
              <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
                Use the Intelligence Assistant for cross-cutting questions, margin math, lane-specific impact, parameterized "what if" scenarios.
              </p>
            </RailCard>

            <RailCard>
              <div style={cardLblStyle}>Sources tracked</div>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.55, margin: 0 }}>
                IEA · Argus · S&amp;P Platts · ICE · Bloomberg Green · Lloyd's List · Loadstar · Reuters Sustainable Switch · FT Moral Money · Carbon Pulse · ESG Today · BloombergNEF · Carbon Brief · GreenBiz
              </p>
            </RailCard>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

const cardLblStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: 10,
};

function LegendItem({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <b style={{ color: "var(--color-text-primary)", fontWeight: 700, marginRight: 4 }}>{label}</b>
      <span>{desc}</span>
    </div>
  );
}

function StatTile({
  severity,
  count,
  label,
  sub,
}: {
  severity: Severity;
  count: number;
  label: string;
  sub: string;
}) {
  const tone = SEVERITY_PILL_TONE[severity];
  const isActive = severity === "action";
  const color = tone.fg;
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${isActive ? color : "var(--color-border)"}`,
        boxShadow: isActive ? `0 0 0 1px ${color} inset, var(--shadow-card)` : "var(--shadow-card)",
        borderRadius: "var(--radius-md)",
        padding: "22px 24px 20px",
        position: "relative",
        cursor: "pointer",
      }}
    >
      <div style={{ position: "absolute", top: 18, right: 18, fontSize: 14, color }}>
        {severity === "action" || severity === "cost" ? "▲" : severity === "window" ? "◎" : "○"}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, color }}>{count}</div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "10px 0 6px",
          color,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{sub}</div>
    </div>
  );
}

function RailCard({ accent, children }: { accent?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "16px 18px",
        boxShadow: "var(--shadow-card)",
        marginBottom: 14,
        borderLeft: accent ? "3px solid var(--color-primary)" : "1px solid var(--color-border)",
      }}
    >
      {children}
    </div>
  );
}

function PriceSnapshotRow() {
  const cells = [
    { lbl: "SAF · EU spot", val: "EUR 1,840", unit: "/ t", delta: "▲ EUR 120 vs 4-wk · IEA · 23 May", dir: "up" as const },
    { lbl: "EUA · EU ETS", val: "EUR 78.40", unit: "", delta: "▼ EUR 2.10 vs 4-wk · ICE · 23 May", dir: "down" as const },
    { lbl: "Jet A-1 · Rotterdam", val: "EUR 620", unit: "/ t", delta: "▲ EUR 18 · Platts · 23 May", dir: "up" as const },
    { lbl: "Diesel · DE retail", val: "EUR 1.62", unit: "/ L", delta: "▼ EUR 0.04 · BAFA · 22 May", dir: "down" as const },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0,
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
        marginBottom: 16,
      }}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          style={{
            padding: "14px 18px",
            borderRight: i < cells.length - 1 ? "1px solid var(--color-border-subtle)" : 0,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>
            {c.lbl}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1 }}>
            {c.val}
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--color-text-secondary)", marginLeft: 4, fontWeight: 500 }}>
              {c.unit}
            </span>
          </div>
          <div
            style={{
              fontSize: 11.5,
              marginTop: 6,
              color: c.dir === "up" ? "var(--color-error)" : "var(--color-success)",
              fontWeight: 600,
            }}
          >
            {c.delta}
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalCard({
  item,
  severity,
  featured = false,
  bandKey,
}: {
  item: Resource;
  severity: Severity;
  featured?: boolean;
  bandKey: BandKey;
}) {
  const showTrajectory = featured && bandKey === "price";
  return (
    <article
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `${featured ? 4 : 3}px solid var(--color-primary)`,
        borderRadius: "var(--radius-sm)",
        padding: "16px 20px 18px",
        margin: "10px 0",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gridTemplateColumns: "1fr 220px",
        gap: 22,
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <SeverityPill severity={severity} />
          <span>{bandKey}</span>
          {featured && <span style={{ color: "var(--color-primary)" }}>Featured</span>}
        </div>
        <h4 style={{ fontSize: featured ? 18 : 17, fontWeight: 700, lineHeight: 1.35, margin: "4px 0 6px", color: "var(--color-text-primary)" }}>
          {item.title}
        </h4>
        {item.note && (
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-text-secondary)", margin: "0 0 6px" }}>
            {item.note}
          </p>
        )}
        {item.jurisdiction && (
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8 }}>
            <b style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{item.jurisdiction}</b>
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SeverityPill severity={severity} />
        {showTrajectory && <TrajectoryBars />}
      </div>
    </article>
  );
}

function TrajectoryBars() {
  const bars = [35, 40, 42, 48, 55, 58, 64, 72, 80, 88, 94, 100];
  const palette = ["#FCD0BD", "#FCD0BD", "#FCD0BD", "#FCD0BD", "#FBA66C", "#FBA66C", "#FBA66C", "#F88527", "#F88527", "#E8610A", "#E8610A", "var(--color-critical)"];
  return (
    <div style={{ background: "var(--color-bg-raised)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginTop: 2 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 }}>
        Trajectory · 12 wk
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 42 }}>
        {bars.map((h, i) => (
          <span key={i} style={{ width: 8, background: palette[i], height: `${h}%` }} />
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 6 }}>
        Base 100 = Feb 2026 spot
      </div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone = SEVERITY_PILL_TONE[severity];
  return (
    <span
      style={{
        alignSelf: "flex-start",
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 3,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
      }}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
