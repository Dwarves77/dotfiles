"use client";

/**
 * ResearchView, Sequence C horizon-scan rebuild (2026-05-24).
 *
 * Per operator-stated correction in design_handoff_2026-05/HANDOFF.md
 * Section 5, /research is now the customer-facing horizon-scan
 * destination. The editorial draft-staging queue (pipeline_stage
 * framing) is owed by /admin/research-pipeline, a separate dispatch.
 *
 * Layout mirrors design_handoff_2026-05/research.html:
 *   - Masthead + priority legend + 4 stat tiles (research-relevance:
 *     Action required / Cost alert / Monitor / Background)
 *   - Theme rail (7 themes: Emissions accounting, Fuels & SAF,
 *     Packaging & circular, Carbon markets, Cold-chain & art,
 *     Last-mile EV, Disclosure regimes)
 *   - AI prompt bar with research-specific chips
 *   - Filter row (Verticals chips + Window chips)
 *   - 2-col layout: theme-grouped findings + right rail
 *   - Right rail: "In your sector this week", "Source coverage matrix",
 *     "Methodology"
 *
 * Theme assignment derives from keyword matches in title + summary
 * against a hard-coded vocabulary (THEME_KEYWORDS). When a richer
 * `intelligence_items.theme` column lands, the assignment function
 * swaps to read that column directly; the rest of the UI is unchanged.
 *
 * Severity assignment derives from recency + source tier as a
 * placeholder for the spec-mandated `intelligence_items.severity`
 * column (per environmental-policy-and-innovation). When the severity
 * column lands, the deriveSeverity() function reads it directly.
 *
 * Cards use the unified Operations card pattern (1fr 220px grid, item-
 * head strip with severity pill + kicker + when, right column with
 * tier pill + severity pill + "What it changes" callout).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import type { WorkspaceAggregates } from "@/lib/data";

// ── Types ──

export interface ResearchPipelineItem {
  id: string;
  title: string;
  summary: string;
  /** Retained for /admin/research-pipeline; not consumed in horizon-scan UI. */
  pipelineStage: string | null;
  transportModes: string[];
  jurisdictions: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  addedDate: string | null;
  citationCount: number | null;
  lastCitedAt: string | null;
  baseTier: number | null;
  effectiveTier: number | null;
  biasTags: Array<{ dimension: "funding" | "methodology" | "stakeholder"; tag: string; confidence: number | null }>;
  owner: string | null;
  partnerFlagged: boolean;
}

export interface ResearchSourceCoverageCellProp {
  transportMode: string;
  jurisdictionIso: string;
  sourceCount: number;
}

interface ResearchViewProps {
  items: ResearchPipelineItem[];
  aggregates?: WorkspaceAggregates;
  total?: number;
  shown?: number;
  cap?: number;
  sourceCoverage?: ResearchSourceCoverageCellProp[];
}

// ── Severity vocabulary (research-relevance labels) ──

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

// ── Theme vocabulary ──

type ThemeKey =
  | "emissions"
  | "fuels"
  | "packaging"
  | "carbon"
  | "cold-chain"
  | "last-mile"
  | "disclosure";

interface Theme {
  key: ThemeKey;
  num: number;
  label: string;
  summary: string;
}

const THEMES: Theme[] = [
  {
    key: "emissions",
    num: 1,
    label: "Emissions accounting",
    summary:
      "Methodology shifts and quantified frameworks that change how the workspace reports Scope 3, restates client claims, or rebases verifier conversations.",
  },
  {
    key: "fuels",
    num: 2,
    label: "Fuels & SAF",
    summary:
      "Production capacity, feedstock constraints, price trajectory, and pathway cost crossover for SAF, e-SAF, hydrogen, and alternative marine fuels. Critical for long-haul fuel-mix planning and forward-buy decisions.",
  },
  {
    key: "packaging",
    num: 3,
    label: "Packaging & circular",
    summary:
      "PPWR reuse targets, recyclability standards, crate verification methods, and PFAS restrictions. Direct impact on art-handler and live-events crate inventories.",
  },
  {
    key: "carbon",
    num: 4,
    label: "Carbon markets",
    summary:
      "EU ETS price trajectory, UK and other CBAM design, voluntary carbon market quality. Affects pass-through math on ocean-lane surcharges and the cost line on EU-bound air freight.",
  },
  {
    key: "cold-chain",
    num: 5,
    label: "Cold-chain & art",
    summary:
      "Climate-controlled crate materials, insulation lifecycle, refrigerant transitions, and conservation-grade packaging. Vertical-specific research for art-handler workspaces.",
  },
  {
    key: "last-mile",
    num: 6,
    label: "Last-mile electrification",
    summary:
      "European urban delivery zones, EV cargo capacity, charging-infrastructure rollout, and zero-emission cargo bay restrictions.",
  },
  {
    key: "disclosure",
    num: 7,
    label: "Disclosure regimes",
    summary:
      "CSRD omnibus revisions, ISSB S2 interpretations, and emerging disclosure frameworks. Affects client-tender language and verifier conversations.",
  },
];

const THEME_KEYWORDS: Record<ThemeKey, RegExp[]> = {
  emissions: [/scope ?3/i, /ghg/i, /emission/i, /co2|carbon footprint|tco2e/i, /accounting/i, /lca/i, /lifecycle/i],
  fuels: [/\bsaf\b/i, /sustainable aviation fuel/i, /hydrogen/i, /\bhefa\b/i, /e-saf/i, /biofuel/i, /alternative fuel/i, /marine fuel/i],
  packaging: [/packaging/i, /\bppwr\b/i, /reuse/i, /crate/i, /pfas/i, /recyclable/i, /circular/i, /pet resin/i],
  carbon: [/\beu ets\b/i, /\bets\b/i, /carbon market/i, /carbon price/i, /\bcbam\b/i, /\beua\b/i, /allowance/i, /carbon pricing/i],
  "cold-chain": [/cold[- ]?chain/i, /climate[- ]?control/i, /refrigerant/i, /art handling/i, /fine art/i, /conservation/i, /vip|vacuum insulated/i],
  "last-mile": [/last[- ]?mile/i, /\bev\b.*(fleet|charging|cargo)/i, /urban delivery/i, /zero[- ]?emission/i, /\bzev\b/i, /drayage.*electric/i],
  disclosure: [/\bcsrd\b/i, /\bissb\b/i, /\bsfdr\b/i, /\btcfd\b/i, /disclosure/i, /reporting standard/i, /\bs2\b/i, /verifier/i],
};

// Phase 3C (2026-05-24): column-first / regex-fallback. When the
// migration 102 theme column lands on the RPC payload, this skips the
// regex match and returns the authoritative value. Until then,
// regex fallback preserves the prior behavior.
const THEME_COLUMN_TO_KEY: Record<string, ThemeKey> = {
  emissions_accounting: "emissions",
  fuels_saf: "fuels",
  packaging_circular: "packaging",
  carbon_markets: "carbon",
  cold_chain_art: "cold-chain",
  last_mile_electrification: "last-mile",
  disclosure_regimes: "disclosure",
};

function assignTheme(item: ResearchPipelineItem): ThemeKey | null {
  // Column-first. ResearchPipelineItem is built from a separate
  // fetcher (getResearchPipeline) that has its own row shape; the
  // theme column is read through there when available. For Phase 3C
  // this check is defensive in case the pipeline fetcher starts
  // passing the theme column through.
  const themeCol = (item as unknown as { theme?: string }).theme;
  if (themeCol && THEME_COLUMN_TO_KEY[themeCol]) {
    return THEME_COLUMN_TO_KEY[themeCol];
  }
  const text = `${item.title} ${item.summary}`;
  for (const theme of THEMES) {
    for (const re of THEME_KEYWORDS[theme.key]) {
      if (re.test(text)) return theme.key;
    }
  }
  return null;
}

// ── Severity derivation ──

function deriveSeverity(item: ResearchPipelineItem): Severity {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  // Highest priority: explicit action language.
  if (/\b(action required|immediate|deadline|must file|cease)\b/.test(text)) {
    return "action";
  }
  // Cost signals.
  if (/\b(cost|surcharge|pass[- ]?through|price|margin)\b/.test(text)) {
    return "cost";
  }
  // Recently added items with strong source default to monitor.
  if (item.addedDate) {
    const age = Date.now() - new Date(item.addedDate).getTime();
    if (age >= 0 && age < 14 * 24 * 60 * 60 * 1000) {
      return "monitor";
    }
  }
  return "background";
}

// ── Vertical relevance ──

const VERTICAL_KEYWORDS = [
  /fine art/i,
  /art handling/i,
  /live event/i,
  /art freight/i,
  /tour logistics/i,
  /conservation/i,
  /climate[- ]?control/i,
  /\bcrate\b/i,
];

function isVerticalRelevant(item: ResearchPipelineItem): boolean {
  const text = `${item.title} ${item.summary}`;
  return VERTICAL_KEYWORDS.some((re) => re.test(text));
}

// ── Date formatting ──

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

// ── Source coverage class buckets (for the right rail card) ──

// Phase 4 M2 (2026-05-25): Reuters bucket merged into "Analytical press".
// Reuters Sustainable Business is one named analytical-press outlet among
// several (Loadstar, FreightWaves, Edie, GreenBiz, Environmental Finance,
// Splash247) — surfacing it as a distinct coverage class on the rail
// implied a tier of its own. Per skill Section 3 + migration 086 trade-
// press routing, it is tier 5 analytical press alongside the others.
const COVERAGE_CLASSES = [
  { key: "peer-reviewed", label: "Peer-reviewed", domains: [/journal/i, /research/i, /\bscience\b/i] },
  { key: "think-tank", label: "Think tank", domains: [/\biea\b/i, /\birena\b/i, /\bipcc\b/i, /\bicct\b/i, /think tank/i, /carbon trust/i] },
  { key: "quantified", label: "Quantified research", domains: [/drawdown/i, /quantified/i] },
  { key: "analytical", label: "Analytical press", domains: [/loadstar/i, /freightwaves/i, /\bedie\b/i, /greenbiz/i, /environmental finance/i, /splash247/i, /reuters sustainable/i] },
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

// Filter source-fetch-error items so 403 / blocked / unavailable strings
// don't surface in customer-facing content. Audit 2026-05-24 found
// "Content unavailable, Source returned 403 Forbidden" leaking into a
// finding body and "Access Blocked" leaking into a title. Reject these
// from the displayed set rather than render the raw fetch error.
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

function withinWindow(addedDate: string | null, windowKey: "7d" | "30d" | "90d" | "all"): boolean {
  if (windowKey === "all") return true;
  if (!addedDate) return false;
  const d = new Date(addedDate);
  if (isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  const limits = { "7d": 7, "30d": 30, "90d": 90 };
  return ageMs >= 0 && ageMs <= limits[windowKey] * 24 * 60 * 60 * 1000;
}

export function ResearchView({
  items,
  aggregates,
  total,
  shown,
  cap,
}: ResearchViewProps) {
  // Derive theme + severity + vertical-relevance once per item.
  // Fetch-error items rejected at the enriched stage so they never
  // surface, regardless of filter state (audit fix).
  const enriched = useMemo(
    () =>
      items
        .filter((it) => !isFetchErrorItem(it))
        .map((it) => ({
          item: it,
          theme: assignTheme(it),
          severity: deriveSeverity(it),
          vertical: isVerticalRelevant(it),
        })),
    [items]
  );

  // Filter state. Stat tiles, window pills, vertical chips all drive
  // `displayed` (audit 2026-05-24: previously these toggled visual
  // state only and never filtered content).
  const [activeTheme, setActiveTheme] = useState<ThemeKey | "all">("all");
  const [activeSeverity, setActiveSeverity] = useState<Severity | "all">("all");
  const [verticalsOn, setVerticalsOn] = useState<Set<string>>(new Set(["live-events", "fine-art"]));
  const [windowFilter, setWindowFilter] = useState<"7d" | "30d" | "90d" | "all">("all");

  // Apply the filter set to derive what the page actually renders.
  // Verticals filter behaviour: when "live-events" or "fine-art" are
  // on, vertical-relevant items pass; when both are off, everything
  // passes (the chips behave additively, not subtractively).
  const displayed = useMemo(() => {
    const verticalsActive = verticalsOn.has("live-events") || verticalsOn.has("fine-art");
    return enriched.filter((e) => {
      if (!withinWindow(e.item.addedDate, windowFilter)) return false;
      if (activeSeverity !== "all" && e.severity !== activeSeverity) return false;
      // Vertical filter is a recommendation surface, not a hard gate:
      // items flagged as vertical-relevant always pass; non-vertical
      // items pass only when the user has additional verticals on
      // (signalling "show me everything"). When verticals are off
      // entirely, everything passes.
      if (verticalsActive) {
        // Pass vertical items; non-vertical items only render when
        // any "broad" vertical chip is on.
        if (e.vertical) return true;
        const broadOn = ["luxury", "automotive", "humanitarian"].some((v) => verticalsOn.has(v));
        return broadOn;
      }
      return true;
    });
  }, [enriched, windowFilter, activeSeverity, verticalsOn]);

  // Aggregate severity counts for the 4 stat tiles (over displayed).
  const severityCounts = useMemo(() => {
    const c: Record<Severity, number> = { action: 0, cost: 0, monitor: 0, background: 0 };
    for (const e of displayed) c[e.severity]++;
    return c;
  }, [displayed]);

  // Theme counts.
  const themeCounts = useMemo(() => {
    const c: Record<ThemeKey, { total: number; vertical: number }> = {} as Record<ThemeKey, { total: number; vertical: number }>;
    for (const t of THEMES) c[t.key] = { total: 0, vertical: 0 };
    for (const e of displayed) {
      if (e.theme) {
        c[e.theme].total++;
        if (e.vertical) c[e.theme].vertical++;
      }
    }
    return c;
  }, [displayed]);

  // Source coverage counts by class (over displayed).
  const coverageClassCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cls of COVERAGE_CLASSES) c[cls.key] = 0;
    for (const e of displayed) {
      const key = classifySource(e.item.sourceName);
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }, [displayed]);

  // Featured item: highest-priority severity, most recent (over displayed).
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

  // Verticals-in-your-sector count.
  const verticalCount = useMemo(
    () => displayed.filter((e) => e.vertical).length,
    [displayed]
  );

  // Items grouped by theme (excluding the featured one to avoid double-render).
  const itemsByTheme = useMemo(() => {
    const map = new Map<ThemeKey, typeof displayed>();
    for (const t of THEMES) map.set(t.key, []);
    for (const e of displayed) {
      if (e === featuredItem) continue;
      if (!e.theme) continue;
      map.get(e.theme)!.push(e);
    }
    return map;
  }, [displayed, featuredItem]);

  // Phase 2A (2026-05-24): masthead total reads from the
  // get_workspace_intelligence_aggregates RPC via aggregates.totalItems
  // (workspace-wide authoritative count, the LIMIT-50 page payload is
  // only the rendered slice).
  const totalDisplay = aggregates?.totalItems ?? total ?? items.length;
  const themesActive = THEMES.filter((t) => themeCounts[t.key].total > 0).length;

  const themeColorTokens: Record<Severity, string> = SEVERITY_TILE_COLOR;

  return (
    <div>
      <EditorialMasthead
        title="Research"
        meta={
          <>
            Horizon-scan content from peer-reviewed journals, think tanks, quantified-climate research, and named analytical press
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalDisplay}</b> active findings this week
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{themesActive}</b> themes active
            {" · "}
            workspace verticals: <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>Live events · Fine art</b>
          </>
        }
      />

      {/* Stat zone: priority legend + 4 tiles */}
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
          <LegendItem color={themeColorTokens.action} label="Action required" desc="Decision pressure now" />
          <LegendItem color={themeColorTokens.cost} label="Cost alert" desc="Margin impact" />
          <LegendItem color={themeColorTokens.monitor} label="Monitor" desc="Worth tracking" />
          <LegendItem color={themeColorTokens.background} label="Background" desc="Awareness only" />
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
            sub="Trending themes"
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
        {/* Theme rail */}
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
            <span>Research, what we cover by theme</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
              {themesActive} active themes, filtered to your verticals
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 1,
              background: "var(--color-border-subtle)",
              borderTop: "1px solid var(--color-text-primary)",
              borderBottom: "1px solid var(--color-text-primary)",
            }}
          >
            {THEMES.filter((t) => themeCounts[t.key].total > 0).map((theme) => {
              const counts = themeCounts[theme.key];
              const isActive = activeTheme === theme.key;
              return (
                <button
                  key={theme.key}
                  onClick={() => setActiveTheme(isActive ? "all" : theme.key)}
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
                    {theme.label}
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
                    {counts.total} new
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4, alignSelf: "start" }}>
                    {theme.summary.split(".")[0]}.{" "}
                    {counts.vertical > 0 && (
                      <b style={{ color: "var(--color-text-primary)" }}>
                        {counts.vertical} affect your verticals.
                      </b>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI bar */}
        <div style={{ marginBottom: 22 }}>
          <AiPromptBar
            placeholder="Ask anything about research, e.g. What findings affect my FY26 Scope 3 baseline?"
            chips={[
              "Charter Scope 3 factor",
              "SAF cost curve",
              "PPWR verifiable reuse",
              "EU ETS Phase 4 outlook",
            ]}
          />
        </div>

        {/* Filter row */}
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
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            Verticals
          </span>
          <FilterChip on={verticalsOn.has("live-events")} onClick={() => toggleVertical(verticalsOn, setVerticalsOn, "live-events")}>
            Live events
          </FilterChip>
          <FilterChip on={verticalsOn.has("fine-art")} onClick={() => toggleVertical(verticalsOn, setVerticalsOn, "fine-art")}>
            Fine art
          </FilterChip>
          <FilterChip on={verticalsOn.has("luxury")} onClick={() => toggleVertical(verticalsOn, setVerticalsOn, "luxury")}>
            + Luxury
          </FilterChip>
          <FilterChip on={verticalsOn.has("automotive")} onClick={() => toggleVertical(verticalsOn, setVerticalsOn, "automotive")}>
            + Automotive
          </FilterChip>
          <FilterChip on={verticalsOn.has("humanitarian")} onClick={() => toggleVertical(verticalsOn, setVerticalsOn, "humanitarian")}>
            + Humanitarian
          </FilterChip>
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
            {/* Featured finding */}
            {featuredItem && <FindingCard item={featuredItem.item} severity={featuredItem.severity} featured />}

            {/* Theme-grouped sections */}
            {THEMES.filter(
              (t) => activeTheme === "all" || activeTheme === t.key
            ).map((theme) => {
              const themeItems = itemsByTheme.get(theme.key) || [];
              if (themeItems.length === 0) return null;
              const verticalCountInTheme = themeCounts[theme.key].vertical;
              return (
                <section
                  key={theme.key}
                  id={`theme-${theme.key}`}
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
                      T{theme.num}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
                      {theme.label}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--color-text-muted)", fontWeight: 600 }}>
                      {themeCounts[theme.key].total} new
                      {verticalCountInTheme > 0 && ` · ${verticalCountInTheme} in your verticals`}
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
                    {theme.summary}
                  </p>
                  <div style={{ padding: "8px 14px 14px" }}>
                    {themeItems.slice(0, 3).map((e) => (
                      <FindingCard key={e.item.id} item={e.item} severity={e.severity} />
                    ))}
                    {themeItems.length > 3 && (
                      <div style={{ fontSize: 11.5, color: "var(--color-primary)", textAlign: "right", padding: "6px 22px 14px", fontWeight: 600 }}>
                        + {themeItems.length - 3} more in this theme
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            <p style={{ textAlign: "center", padding: 20, color: "var(--color-text-muted)", fontSize: 12 }}>
              All <b>{totalDisplay}</b> findings this week organized by theme
            </p>
          </div>

          {/* Right rail */}
          <aside>
            <RailCard accent>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
                In your sector this week
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--color-primary)", lineHeight: 1, margin: "4px 0 8px" }}>
                {verticalCount}
              </p>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
                findings explicitly relevant to live events + fine art workspaces, of {totalDisplay} total this week.
              </p>
            </RailCard>

            <RailCard>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
                Source coverage matrix
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
                Distribution across the spec's 5 source classes. Discriminator is analytical depth, not publication form.
              </p>
            </RailCard>

            <RailCard>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
                Methodology
              </div>
              <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
                Findings render with editorial provenance, source tier, bias tags, citation count, and recency. Each Research Summary brief follows the 6-section format; click any finding to read the structured detail.
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

function toggleVertical(
  set: Set<string>,
  setSet: (next: Set<string>) => void,
  key: string
) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  setSet(next);
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

function FindingCard({
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
          {item.sourceUrl ? (
            <Link href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
              {item.title}
            </Link>
          ) : (
            item.title
          )}
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
      </div>
    </article>
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
