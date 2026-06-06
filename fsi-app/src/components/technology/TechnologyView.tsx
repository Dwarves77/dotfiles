"use client";

/**
 * TechnologyView — /technology list surface (2026-06-05).
 *
 * Structurally cloned from ResearchView.tsx. Renders get_technology_items
 * results (item_type IN technology/innovation/tool, migration 134).
 *
 * Layout mirrors ResearchView:
 *   - EditorialMasthead + priority legend + 4 stat tiles
 *   - Category rail (6 technology categories: Battery/EV, SAF,
 *     Hydrogen/Ammonia, Marine Fuels, Solar/BESS, Autonomous)
 *   - AI prompt bar with technology-specific chips
 *   - Filter row (window pills)
 *   - 2-col layout: category-grouped cards + right rail
 *   - Right rail: methodology + source coverage count
 *
 * Category assignment derives from keyword matches in title + summary
 * against CATEGORY_KEYWORDS. Items that match no category fall into a
 * flat "Other technology" bucket rendered below the category sections.
 *
 * FAIL CLOSED: renders ONLY the passed items; honest empty state when none.
 * No seed / getResourcesOnly fallback.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import type { WorkspaceAggregates } from "@/lib/data";
import type { ResearchPipelineItem } from "@/components/research/ResearchView";

// ── Types ──

interface TechnologyViewProps {
  items: ResearchPipelineItem[];
  aggregates?: WorkspaceAggregates;
  total?: number;
}

// ── Severity vocabulary (reused from ResearchView) ──

type Severity = "action" | "cost" | "monitor" | "background";

const SEVERITY_LABEL: Record<Severity, string> = {
  action: "Action required",
  cost: "Cost alert",
  monitor: "Monitor",
  background: "Background",
};

const SEVERITY_TONE: Record<Severity, { fg: string; bg: string; bd: string }> = {
  action: { fg: "var(--color-critical)", bg: "var(--color-critical-bg)", bd: "var(--color-critical-border)" },
  cost: { fg: "var(--color-high)", bg: "var(--color-high-bg)", bd: "var(--color-high-border)" },
  monitor: { fg: "var(--color-moderate)", bg: "var(--color-moderate-bg)", bd: "var(--color-moderate-border)" },
  background: { fg: "var(--color-text-muted)", bg: "var(--color-surface)", bd: "var(--color-border)" },
};

const SEVERITY_TILE_COLOR: Record<Severity, string> = {
  action: "var(--color-critical)",
  cost: "var(--color-high)",
  monitor: "var(--color-moderate)",
  background: "var(--color-low)",
};

// ── Technology category vocabulary ──

type CategoryKey =
  | "battery-ev"
  | "saf"
  | "hydrogen"
  | "marine-fuels"
  | "solar-bess"
  | "autonomous";

interface TechCategory {
  key: CategoryKey;
  num: number;
  label: string;
  summary: string;
}

const CATEGORIES: TechCategory[] = [
  {
    key: "battery-ev",
    num: 1,
    label: "Battery & EV",
    summary:
      "Electric vehicle fleet adoption, battery chemistry advances, charging-infrastructure deployment, and range/payload developments affecting cargo and drayage operations.",
  },
  {
    key: "saf",
    num: 2,
    label: "SAF",
    summary:
      "Sustainable aviation fuel production pathways, feedstock availability, cost trajectory, blending mandates, and certification developments relevant to air cargo operators.",
  },
  {
    key: "hydrogen",
    num: 3,
    label: "Hydrogen & Ammonia",
    summary:
      "Green hydrogen and ammonia production, storage, bunkering infrastructure, and certification frameworks for maritime and heavy transport decarbonisation.",
  },
  {
    key: "marine-fuels",
    num: 4,
    label: "Marine Fuels",
    summary:
      "LNG, methanol, and alternative bunker fuels — production capacity, port availability, vessel retrofits, and FuelEU compliance pathways for ocean carriers.",
  },
  {
    key: "solar-bess",
    num: 5,
    label: "Solar & BESS",
    summary:
      "Solar generation, battery energy storage systems, and behind-the-meter energy for warehouses, facilities, and logistics hubs reducing Scope 2 exposure.",
  },
  {
    key: "autonomous",
    num: 6,
    label: "Autonomous",
    summary:
      "Autonomous vehicles, drones, robotics, and AI-driven logistics tools with operational or regulatory implications for freight movement and facility operations.",
  },
];

const CATEGORY_KEYWORDS: Record<CategoryKey, RegExp[]> = {
  "battery-ev": [/\bbattery\b/i, /\bev\b/i, /electric vehicle/i, /\bbev\b/i, /lithium/i, /charging.*(station|infrastructure)/i, /electrif/i, /drayage.*electric/i, /cargo.*electric/i],
  saf: [/\bsaf\b/i, /sustainable aviation fuel/i, /\bhefa\b/i, /e-saf/i, /biofuel.*aviation/i, /aviation.*biofuel/i, /jet fuel.*renew/i, /renew.*jet fuel/i],
  hydrogen: [/\bhydrogen\b/i, /\bammonia\b/i, /\bh2\b/i, /green fuel.*ship/i, /fuel cell/i, /electrolys/i, /bunkering.*hydrogen/i],
  "marine-fuels": [/\blng\b/i, /\bmethanol\b/i, /marine fuel/i, /bunker/i, /vessel.*fuel/i, /ship.*fuel/i, /fueleu/i, /maritime.*alternative fuel/i],
  "solar-bess": [/\bsolar\b/i, /photovoltaic/i, /\bpv\b.*(panel|array|install)/i, /\bbess\b/i, /battery storage/i, /energy storage/i, /behind.the.meter/i, /rooftop.*energy/i],
  autonomous: [/\bautonomous\b/i, /self.driving/i, /\bdrone\b/i, /\brobotics\b/i, /\bagv\b/i, /artificial intelligence.*logistics/i, /ai.*freight/i, /automated.*warehouse/i],
};

function assignCategory(item: ResearchPipelineItem): CategoryKey | null {
  const text = `${item.title} ${item.summary}`;
  for (const cat of CATEGORIES) {
    for (const re of CATEGORY_KEYWORDS[cat.key]) {
      if (re.test(text)) return cat.key;
    }
  }
  return null;
}

// ── Severity derivation (mirrors ResearchView) ──

function deriveSeverity(item: ResearchPipelineItem): Severity {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/\b(action required|immediate|deadline|must file|cease)\b/.test(text)) {
    return "action";
  }
  if (/\b(cost|surcharge|pass[- ]?through|price|margin)\b/.test(text)) {
    return "cost";
  }
  if (item.addedDate) {
    const age = Date.now() - new Date(item.addedDate).getTime();
    if (age >= 0 && age < 14 * 24 * 60 * 60 * 1000) {
      return "monitor";
    }
  }
  return "background";
}

// ── Fetch-error filter (mirrors ResearchView) ──

const FETCH_ERROR_PATTERNS = [
  /content unavailable/i,
  /\b403 forbidden\b/i,
  /access blocked/i,
  /could not be accessed/i,
  /source returned (\d{3}|error)/i,
];

function isFetchErrorItem(item: ResearchPipelineItem): boolean {
  const text = `${item.title} ${item.summary}`;
  return FETCH_ERROR_PATTERNS.some((re) => re.test(text));
}

// ── Date formatting (mirrors ResearchView) ──

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

function isWithinLast7Days(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  return ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000;
}

function withinWindow(addedDate: string | null, windowKey: "7d" | "30d" | "90d" | "all"): boolean {
  if (windowKey === "all") return true;
  if (!addedDate) return false;
  const d = new Date(addedDate);
  if (isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  const limits = { "7d": 7, "30d": 30, "90d": 90 };
  return ageMs >= 0 && ageMs <= limits[windowKey] * 24 * 60 * 60 * 1000;
}

// ── Source coverage classes (mirrors ResearchView) ──

const COVERAGE_CLASSES = [
  { key: "primary", label: "Primary regulator", domains: [/\biea\b/i, /\birena\b/i, /imo/i, /\bicao\b/i, /epa/i] },
  { key: "industry", label: "Industry body", domains: [/\bfiata\b/i, /\bclecat\b/i, /\btiaca\b/i, /\bdnv\b/i, /bureau veritas/i] },
  { key: "research", label: "Research / think tank", domains: [/\bmit\b/i, /tyndall/i, /icct/i, /drawdown/i, /nrel/i, /nlr/i] },
  { key: "analytical", label: "Analytical press", domains: [/freightwaves/i, /loadstar/i, /splash247/i, /\bedie\b/i, /greenbiz/i] },
];

function classifySource(name: string | null): string {
  if (!name) return "analytical";
  for (const cls of COVERAGE_CLASSES) {
    for (const re of cls.domains) {
      if (re.test(name)) return cls.key;
    }
  }
  return "analytical";
}

// ── Component ──

export function TechnologyView({
  items,
  aggregates,
  total,
}: TechnologyViewProps) {
  const enriched = useMemo(
    () =>
      items
        .filter((it) => !isFetchErrorItem(it))
        .map((it) => ({
          item: it,
          category: assignCategory(it),
          severity: deriveSeverity(it),
        })),
    [items]
  );

  const [activeCategory, setActiveCategory] = useState<CategoryKey | "all">("all");
  const [activeSeverity, setActiveSeverity] = useState<Severity | "all">("all");
  const [windowFilter, setWindowFilter] = useState<"7d" | "30d" | "90d" | "all">("all");

  const displayed = useMemo(() => {
    return enriched.filter((e) => {
      if (!withinWindow(e.item.addedDate, windowFilter)) return false;
      if (activeSeverity !== "all" && e.severity !== activeSeverity) return false;
      return true;
    });
  }, [enriched, windowFilter, activeSeverity]);

  const severityCounts = useMemo(() => {
    const c: Record<Severity, number> = { action: 0, cost: 0, monitor: 0, background: 0 };
    for (const e of displayed) c[e.severity]++;
    return c;
  }, [displayed]);

  const categoryCounts = useMemo(() => {
    const c: Record<CategoryKey, number> = {} as Record<CategoryKey, number>;
    for (const cat of CATEGORIES) c[cat.key] = 0;
    for (const e of displayed) {
      if (e.category) c[e.category]++;
    }
    return c;
  }, [displayed]);

  const coverageClassCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cls of COVERAGE_CLASSES) c[cls.key] = 0;
    for (const e of displayed) {
      const key = classifySource(e.item.sourceName);
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }, [displayed]);

  const featuredItem = useMemo(() => {
    const sevOrder: Severity[] = ["action", "cost", "monitor", "background"];
    const sorted = [...displayed].sort((a, b) => {
      const sa = sevOrder.indexOf(a.severity);
      const sb = sevOrder.indexOf(b.severity);
      if (sa !== sb) return sa - sb;
      const da = a.item.addedDate ? new Date(a.item.addedDate).getTime() : 0;
      const db = b.item.addedDate ? new Date(b.item.addedDate).getTime() : 0;
      return db - da;
    });
    return sorted[0] || null;
  }, [displayed]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<CategoryKey, typeof displayed>();
    for (const cat of CATEGORIES) map.set(cat.key, []);
    for (const e of displayed) {
      if (e === featuredItem) continue;
      if (!e.category) continue;
      map.get(e.category)!.push(e);
    }
    return map;
  }, [displayed, featuredItem]);

  // Items that matched no category — rendered in a flat "Other" section.
  const uncategorized = useMemo(() => {
    return displayed.filter((e) => e !== featuredItem && !e.category);
  }, [displayed, featuredItem]);

  const totalDisplay = aggregates?.totalItems ?? total ?? items.length;
  const categoriesActive = CATEGORIES.filter((c) => categoryCounts[c.key] > 0).length;

  return (
    <div>
      <EditorialMasthead
        title="Technology"
        meta={
          <>
            Energy transition technologies, alternative fuels, and operational tools affecting freight sustainability
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalDisplay}</b> active items this week
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{categoriesActive}</b> categories active
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
          <LegendItem color={SEVERITY_TILE_COLOR.action} label="Action required" desc="Decision pressure now" />
          <LegendItem color={SEVERITY_TILE_COLOR.cost} label="Cost alert" desc="Margin impact" />
          <LegendItem color={SEVERITY_TILE_COLOR.monitor} label="Monitor" desc="Worth tracking" />
          <LegendItem color={SEVERITY_TILE_COLOR.background} label="Background" desc="Awareness only" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <StatTile
            severity="action"
            count={severityCounts.action}
            label="Action required"
            sub="In your verticals, this week"
            active={activeSeverity === "action"}
            onClick={() => setActiveSeverity(activeSeverity === "action" ? "all" : "action")}
          />
          <StatTile
            severity="cost"
            count={severityCounts.cost}
            label="Cost alert"
            sub="Affecting margins"
            active={activeSeverity === "cost"}
            onClick={() => setActiveSeverity(activeSeverity === "cost" ? "all" : "cost")}
          />
          <StatTile
            severity="monitor"
            count={severityCounts.monitor}
            label="Monitor"
            sub="Trending developments"
            active={activeSeverity === "monitor"}
            onClick={() => setActiveSeverity(activeSeverity === "monitor" ? "all" : "monitor")}
          />
          <StatTile
            severity="background"
            count={severityCounts.background}
            label="Background"
            sub="Awareness coverage"
            active={activeSeverity === "background"}
            onClick={() => setActiveSeverity(activeSeverity === "background" ? "all" : "background")}
          />
        </div>
      </div>

      <div style={{ padding: "0 40px 60px" }}>
        {/* Category rail */}
        <div style={{ margin: "22px 0 18px" }}>
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
            <span>Technology, what we cover by category</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
              {categoriesActive} active categories
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 1,
              background: "var(--color-border-subtle)",
              borderTop: "1px solid var(--color-text-primary)",
              borderBottom: "1px solid var(--color-text-primary)",
            }}
          >
            {CATEGORIES.filter((c) => categoryCounts[c.key] > 0).map((cat) => {
              const count = categoryCounts[cat.key];
              const isActive = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(isActive ? "all" : cat.key)}
                  style={{
                    background: "var(--color-surface)",
                    padding: isActive ? "13px 16px 16px" : "14px 16px 16px",
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateRows: "34px 34px 1fr",
                    gap: 4,
                    minHeight: 140,
                    border: 0,
                    borderTop: isActive ? "2px solid var(--color-primary)" : 0,
                    marginTop: isActive ? -1 : 0,
                    textAlign: "left",
                    fontFamily: "inherit",
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
                    {cat.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 26,
                      lineHeight: 1,
                      color: isActive ? "var(--color-primary)" : "var(--color-text-primary)",
                      alignSelf: "center",
                    }}
                  >
                    {count} new
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4, alignSelf: "start" }}>
                    {cat.summary.split(".")[0]}.
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI bar */}
        <div style={{ marginBottom: 22 }}>
          <AiPromptBar
            placeholder="Ask anything about technology, e.g. What SAF mandates affect my air cargo costs?"
            chips={[
              "SAF cost trajectory",
              "EV fleet readiness",
              "Green hydrogen bunkering",
              "BESS for warehouses",
            ]}
          />
        </div>

        {/* Window filter row */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            padding: "4px 0 18px",
            fontSize: 12,
            flexWrap: "wrap",
            borderBottom: "1px solid var(--color-border-subtle)",
            marginBottom: 22,
          }}
        >
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
              Window
            </span>
            {(["7d", "30d", "90d", "all"] as const).map((w) => (
              <FilterChip key={w} on={windowFilter === w} onClick={() => setWindowFilter(w)}>
                {w === "all" ? "All" : w}
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 28, alignItems: "start" }}>
          {/* Main column */}
          <div>
            {/* Featured item */}
            {featuredItem && <TechCard item={featuredItem.item} severity={featuredItem.severity} featured />}

            {/* Empty state when no items */}
            {displayed.length === 0 && (
              <div
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "48px 32px",
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                }}
              >
                <p style={{ fontSize: 14, margin: 0 }}>No technology items available for the selected filters.</p>
                <p style={{ fontSize: 12, marginTop: 8 }}>Items appear when sources classified as technology/innovation/tool are ingested and verified.</p>
              </div>
            )}

            {/* Category-grouped sections */}
            {CATEGORIES.filter(
              (c) => activeCategory === "all" || activeCategory === c.key
            ).map((cat) => {
              const catItems = itemsByCategory.get(cat.key) || [];
              if (catItems.length === 0) return null;
              return (
                <section
                  key={cat.key}
                  id={`category-${cat.key}`}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    marginBottom: 14,
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
                      C{cat.num}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
                      {cat.label}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--color-text-muted)", fontWeight: 600 }}>
                      {categoryCounts[cat.key]} new
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      color: "var(--color-text-secondary)",
                      padding: "14px 22px 4px",
                      margin: "0 0 8px",
                      maxWidth: "78ch",
                    }}
                  >
                    {cat.summary}
                  </p>
                  <div style={{ padding: "8px 14px 14px" }}>
                    {catItems.slice(0, 3).map((e) => (
                      <TechCard key={e.item.id} item={e.item} severity={e.severity} />
                    ))}
                    {catItems.length > 3 && (
                      <div style={{ fontSize: 11.5, color: "var(--color-primary)", textAlign: "right", padding: "6px 22px 14px", fontWeight: 600 }}>
                        + {catItems.length - 3} more in this category
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            {/* Uncategorized items (flat section, only shown in "all" view) */}
            {activeCategory === "all" && uncategorized.length > 0 && (
              <section
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: 14,
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
                  <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
                    Other technology
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--color-text-muted)", fontWeight: 600 }}>
                    {uncategorized.length} items
                  </span>
                </div>
                <div style={{ padding: "8px 14px 14px" }}>
                  {uncategorized.slice(0, 3).map((e) => (
                    <TechCard key={e.item.id} item={e.item} severity={e.severity} />
                  ))}
                  {uncategorized.length > 3 && (
                    <div style={{ fontSize: 11.5, color: "var(--color-primary)", textAlign: "right", padding: "6px 22px 14px", fontWeight: 600 }}>
                      + {uncategorized.length - 3} more
                    </div>
                  )}
                </div>
              </section>
            )}

            <p style={{ textAlign: "center", padding: 20, color: "var(--color-text-muted)", fontSize: 12 }}>
              All <b>{totalDisplay}</b> technology items this week organised by category
            </p>
          </div>

          {/* Right rail */}
          <aside>
            <RailCard>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
                Source coverage
              </div>
              <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
                <tbody>
                  {COVERAGE_CLASSES.map((cls) => (
                    <tr key={cls.key}>
                      <td style={{ padding: "4px 0", color: "var(--color-text-muted)" }}>{cls.label}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-display)", color: "var(--color-primary)" }}>
                        {coverageClassCounts[cls.key] || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                Rendered items by source type. Technology items come from regulators, industry bodies, research organisations, and analytical press.
              </p>
            </RailCard>

            <RailCard>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
                Methodology
              </div>
              <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
                Technology items include tools, innovations, and technology-transition developments with direct operational or compliance relevance to freight. Each item links to a structured Technology Profile brief. Click any item to read the full detail.
              </p>
            </RailCard>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

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
  active,
  onClick,
}: {
  severity: Severity;
  count: number;
  label: string;
  sub: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const color = SEVERITY_TILE_COLOR[severity];
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${active ? color : "var(--color-border)"}`,
        boxShadow: active ? `0 0 0 1px ${color} inset, var(--shadow-card)` : "var(--shadow-card)",
        borderRadius: "var(--radius-md)",
        padding: "22px 24px 20px",
        position: "relative",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        color: "inherit",
        width: "100%",
      }}
    >
      <div style={{ position: "absolute", top: 18, right: 18, fontSize: 14, color }}>
        {severity === "action" || severity === "cost" ? "▲" : severity === "monitor" ? "◎" : "○"}
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
    </button>
  );
}

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid",
        borderColor: on ? "var(--color-text-primary)" : "var(--color-border)",
        background: on ? "var(--color-text-primary)" : "var(--color-surface)",
        color: on ? "#fff" : "var(--color-text-primary)",
        borderRadius: "var(--radius-pill)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
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

function TechCard({
  item,
  severity,
  featured = false,
}: {
  item: ResearchPipelineItem;
  severity: Severity;
  featured?: boolean;
}) {
  const tier = item.effectiveTier || item.baseTier;
  const recent = isWithinLast7Days(item.addedDate);
  const when = item.addedDate ? formatShortDate(item.addedDate) : "";
  const sevTone = SEVERITY_TONE[severity];
  void sevTone; // referenced via SeverityPill; declared here for clarity

  return (
    <Link
      href={`/technology/${encodeURIComponent(item.id)}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
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
          cursor: "pointer",
        }}
      >
        {/* Body column */}
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
            <span>{featured ? "Featured" : ""}</span>
            <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 10.5 }}>
              {when}
              {recent && " · this week"}
            </span>
          </div>
          <h4 style={{ fontSize: featured ? 18 : 17, fontWeight: 700, lineHeight: 1.35, margin: "4px 0 6px", color: "var(--color-text-primary)" }}>
            {item.title}
          </h4>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-text-secondary)", margin: "0 0 6px" }}>
            {item.summary}
          </p>
          {item.sourceName && (
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8 }}>
              <b style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{item.sourceName}</b>
              {tier && <span style={{ marginLeft: 8 }}>· T{tier}</span>}
              {item.citationCount && item.citationCount > 0 && <span style={{ marginLeft: 8 }}>· cited {item.citationCount}×</span>}
            </p>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tier && (
            <span
              style={{
                alignSelf: "flex-start",
                fontFamily: "var(--font-display)",
                fontSize: 11,
                padding: "1px 6px",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              T{tier}
            </span>
          )}
          <SeverityPill severity={severity} />
          {item.biasTags && item.biasTags.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {item.biasTags.slice(0, 2).map((b, i) => (
                <span
                  key={i}
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 10,
                    background: "var(--color-bg-raised)",
                    padding: "1px 6px",
                    borderRadius: 3,
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border)",
                    fontWeight: 500,
                  }}
                >
                  {b.tag}
                </span>
              ))}
            </div>
          )}
          {item.whatItChanges && (
            <div
              style={{
                borderLeft: "3px solid var(--color-secondary, var(--color-primary))",
                padding: "8px 10px 8px 12px",
                background: "var(--color-surface-raised, var(--color-bg-raised))",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>
                What it changes
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-text-primary)", margin: 0 }}>
                {item.whatItChanges}
              </p>
            </div>
          )}
          {featured && item.doesNotResolve && (
            <div
              style={{
                padding: "8px 10px 8px 12px",
                background: "var(--color-surface-raised, var(--color-bg-raised))",
                borderLeft: "3px solid var(--color-text-muted)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>
                Does NOT resolve
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-text-muted)", margin: 0 }}>
                {item.doesNotResolve}
              </p>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone = SEVERITY_TONE[severity];
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
