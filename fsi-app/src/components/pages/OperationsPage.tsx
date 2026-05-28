"use client";

/**
 * OperationsPage, Sequence C rebuild (2026-05-24).
 *
 * Layout mirrors design_handoff_2026-05/operations.html:
 *   - Masthead + priority legend + 4 stat tiles (Critical / High /
 *     Moderate / Low)
 *   - Coverage rail (6 dimensions D1-D6)
 *   - AI prompt bar with operations chips
 *   - Tabs: By Jurisdiction (default) | Facility Data
 *   - Layout: 2-col (1fr + 280px)
 *   - Region accordions (EU open by default; US, Asia, UK, UAE collapsed)
 *   - Each region: 6 dimension cards (D1 regulation refs, D2-D6 fact
 *     tables)
 *   - Right rail: Coverage card + By dimension list + Recent updates +
 *     Methodology
 *
 * Operator binding (caros-ledge-platform-intent SKILL Section 3 +
 * design_handoff_2026-05 HANDOFF Section 7): Operations surfaces
 * structured content. The customer reads the content and uses the
 * Intelligence Assistant for cross-cutting questions. NOT a decision-
 * engine UI.
 *
 * Data layer compromise: D2-D6 dimension facts are hard-coded for the
 * EU region as a vertical slice that demonstrates the structure;
 * other regions render empty-state placeholders. When the
 * `regions.operations_decisions` and `regional_data_facts` tables land,
 * the inline data swaps for a server-side projection.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import type { OperationsCoverageData } from "@/lib/supabase-server";

interface OperationsPageProps {
  initialResources: Resource[];
  aggregates?: WorkspaceAggregates;
  regulationsByRegion?: Resource[];
  /**
   * Sprint 3 A6.3 (2026-05-27): live regions + coverage state + facts
   * from migrations 106 + 109 + A6.2 backfill. Replaces the prior
   * hard-coded EU vertical-slice fact tables. Empty arrays when not
   * configured (graceful: page renders region accordions with the
   * "Coverage gaps" empty-dim callouts).
   */
  operationsCoverage?: OperationsCoverageData;
}

// ── Severity vocabulary (operations: priority labels) ──

type Severity = "critical" | "high" | "moderate" | "low";

const SEVERITY_TILE_COLOR: Record<Severity, string> = {
  critical: "var(--color-critical)",
  high: "var(--color-high)",
  moderate: "var(--color-moderate)",
  low: "var(--color-low)",
};

const SEVERITY_PILL_TONE: Record<Severity, { fg: string; bg: string; bd: string }> = {
  critical: { fg: "var(--color-critical)", bg: "var(--color-critical-bg)", bd: "var(--color-critical-border)" },
  high: { fg: "var(--color-high)", bg: "var(--color-high-bg)", bd: "var(--color-high-border)" },
  moderate: { fg: "var(--color-moderate)", bg: "var(--color-moderate-bg)", bd: "var(--color-moderate-border)" },
  low: { fg: "var(--color-low)", bg: "var(--color-low-bg)", bd: "var(--color-low-border)" },
};

// ── Region + dimension vocabulary ──

interface Region {
  key: string;
  label: string;
  severity: Severity;
  defaultOpen?: boolean;
}

// Sprint 3 A6.3 (2026-05-27): accordion default-state CLOSED per CLAUDE.md
// "Accordions are CLOSED across the platform" rule. The earlier `defaultOpen: true`
// on EU pre-judged region attention before operator interaction.
const REGIONS: Region[] = [
  { key: "EU", label: "European Union", severity: "critical" },
  { key: "US", label: "United States", severity: "critical" },
  { key: "ASIA", label: "Asia · Singapore + Hong Kong", severity: "high" },
  { key: "UK", label: "United Kingdom", severity: "high" },
  { key: "UAE", label: "UAE · Dubai", severity: "moderate" },
];

interface Dimension {
  num: number;
  key: string;
  name: string;
  summary: string;
}

const DIMENSIONS: Dimension[] = [
  {
    num: 1,
    key: "regulatory",
    name: "Regulatory feasibility",
    summary: "Which rules apply in this region and what they bind. Items cross-reference Regulations; click a rule to read the full brief.",
  },
  {
    num: 2,
    key: "resources",
    name: "Regional resource availability",
    summary: "Whether the materials, recyclables, and qualified suppliers your live-events and fine-art operations depend on are present, constrained, or absent here.",
  },
  {
    num: 3,
    key: "labor",
    name: "Labor markets",
    summary: "Loaded-cost wages and workforce availability for warehouse, driver, and art-handler roles. Inputs to automation-vs-hire and capacity decisions.",
  },
  {
    num: 4,
    key: "materials",
    name: "Materials sourcing",
    summary: "Where to qualify supply for crating, packaging, and structural materials. In-region versus import economics, and certification status.",
  },
  {
    num: 5,
    key: "infrastructure",
    name: "Infrastructure capacity",
    summary: "Port dwell, air-cargo capacity, shore power, and electric-truck charging. Where lanes flow and where they bottleneck.",
  },
  {
    num: 6,
    key: "cost",
    name: "Operational cost data",
    summary: "Per-unit grid, fuel, handling, and drayage rates. The cost-baseline inputs for tender pricing and pass-through math.",
  },
];

// ── Fact tables (hard-coded vertical slice for EU; placeholders elsewhere) ──

interface Fact {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
  source: string;
}

const FACTS: Record<string, Partial<Record<string, Fact[]>>> = {
  EU: {
    resources: [
      { label: "Recycled PET supply (DE)", value: "Constrained", trend: "flat", source: "Plastics Recyclers Europe Q1 2026 outlook · 9 May" },
      { label: "Reusable transport packaging, qualified suppliers", value: "14 registered", trend: "up", source: "German VerpackG registry · 12 May" },
      { label: "Aluminum (rolled, low-CO2 certified)", value: "Available", source: "Hydro / Speira / Norsk Hydro" },
      { label: "FSC-certified hardwood crating", value: "Available, DE / FI / SE", source: "EUDR-ready supplier list maintained by FIATA EU chapter" },
    ],
    labor: [
      { label: "Warehouse operative, DE avg fully-loaded", value: "EUR 34.20 / hr", trend: "up", source: "Destatis Q1 2026" },
      { label: "LGV / Class 1 driver, DE avg", value: "EUR 41.60 / hr", trend: "up", source: "BAG Bundesamt Gueterverkehr · Apr 2026" },
      { label: "Workforce availability, Frankfurt area", value: "Constrained", source: "2.1% unemployment in transport & logistics" },
      { label: "Art-handling specialist labor", value: "Tight pool, Berlin / Munich", source: "Industry interpretation; no public benchmark" },
    ],
    materials: [
      { label: "Cold-rolled steel mills serving DE/NL/BE", value: "8 active", source: "EUROFER member directory" },
      { label: "Climate-controlled crate fabricators (art)", value: "4 in DE · 2 in FR", source: "ROKBOX / TURTLE / regional independents" },
      { label: "In-region vs import (recycled PET resin)", value: "In-region ~EUR 140/t premium", source: "vs. SE Asia FOB landed cost; trend stable" },
    ],
    infrastructure: [
      { label: "Rotterdam, container dwell time", value: "3.4 days", trend: "up", source: "Port of Rotterdam KPI dashboard · w/c 19 May" },
      { label: "Frankfurt FRA, air cargo capacity utilization", value: "87%", source: "Fraport monthly stats Apr 2026" },
      { label: "Public HGV charging, DE motorway corridors", value: "Limited", source: "AFIR rollout target 2027; 11 sites operational vs 86 mandated · ACEA tracker" },
      { label: "Rotterdam, shore power for vessels", value: "Operational at 3 of 12 terminals", source: "Port shore-power plan · 23 Apr" },
    ],
    cost: [
      { label: "Industrial electricity, DE", value: "EUR 0.184 / kWh", trend: "up", source: "Destatis Q1 2026 industrial band IC" },
      { label: "Diesel, DE retail avg", value: "EUR 1.62 / L", trend: "down", source: "BAFA week 21 · 23 May" },
      { label: "SAF, EU spot", value: "EUR 1,840 / t", trend: "up", source: "IEA SAF Outlook Q2 2026 + Argus Bioenergy" },
      { label: "Rotterdam, container handling THC", value: "EUR 185 / TEU", trend: "flat", source: "Lloyd's List shipper tariff snapshot · May" },
      { label: "Drayage, Rotterdam to Eindhoven 110km", value: "EUR 340 / load", trend: "up", source: "Industry tracking; EVO/Fenedex member survey Q2" },
    ],
  },
  US: {
    resources: [
      { label: "Recyclable PET, CA pre-treatment capacity", value: "Adequate", source: "CalRecycle Q1 2026 facility utilization 71%" },
      { label: "FSC hardwood crating, Pacific NW", value: "Available · 3 qualified mills", source: "FSC-US chain-of-custody registry" },
    ],
    labor: [
      { label: "Warehouse operative, LA County avg", value: "USD 24.80 / hr", trend: "up", source: "BLS QCEW NAICS 4931 · Q4 2025" },
      { label: "Class A CDL driver, Long Beach", value: "USD 31.50 / hr", trend: "up", source: "BLS OEWS / industry interpretation" },
      { label: "Art handling specialist, NYC market", value: "Highly constrained", source: "No public benchmark; industry interpretation only" },
    ],
    materials: [
      { label: "Low-CO2 aluminum, domestic supply", value: "Limited", source: "Century / Alcoa Hawesville · capacity 60% allocated; lead times 16-22 wks" },
      { label: "Climate-controlled crate fabricators", value: "5 in CA · 4 in NY/NJ", source: "Trade directory survey · May 2026" },
    ],
    infrastructure: [
      { label: "LA / Long Beach, container dwell", value: "4.1 days", trend: "down", source: "PortVision weekly · w/c 19 May" },
      { label: "JFK air cargo capacity", value: "Available, belly & freighter mix", source: "PANYNJ stats Apr 2026" },
      { label: "Class 8 truck charging, I-5 corridor", value: "Sparse", source: "FHWA NEVI deployment tracker · CA section, 19 sites operational" },
    ],
    cost: [
      { label: "Industrial electricity, CA avg", value: "USD 0.196 / kWh", trend: "flat", source: "EIA April 2026 industrial sector · CA" },
      { label: "Diesel, CA retail avg", value: "USD 4.82 / gal", trend: "flat", source: "EIA weekly · 19 May" },
      { label: "Drayage, LA/LB to Inland Empire", value: "USD 485 / load", trend: "up", source: "JOC drayage tracker · Q1 2026" },
      { label: "LAX air cargo handling", value: "USD 0.24 / kg", trend: "up", source: "Industry rate card; airline-specific variation" },
    ],
  },
  ASIA: {
    labor: [
      { label: "Warehouse operative, Singapore", value: "SGD 14.20 / hr", trend: "up", source: "MOM labour market Q1 2026" },
      { label: "Warehouse operative, HK", value: "HKD 95 / hr", source: "Census & Statistics Dept · Q1 2026" },
    ],
    infrastructure: [
      { label: "Singapore, port shore power", value: "Operational at 4 terminals", source: "MPA shore power program · 12 May" },
      { label: "Changi air cargo", value: "High capacity", source: "CAG monthly stats" },
    ],
    cost: [
      { label: "Industrial electricity, SG", value: "SGD 0.272 / kWh", trend: "up", source: "EMA quarterly · Q1 2026" },
      { label: "Industrial electricity, HK", value: "HKD 1.21 / kWh", trend: "flat", source: "CLP / HK Electric current tariff" },
    ],
  },
  UK: {
    labor: [
      { label: "Warehouse operative, London avg", value: "GBP 15.80 / hr", trend: "up", source: "ONS ASHE 2026 · NAICS 522" },
      { label: "HGV Class 1 driver, UK avg", value: "GBP 17.20 / hr", trend: "flat", source: "RHA wage survey Q1 2026" },
    ],
    cost: [
      { label: "Industrial electricity, UK avg", value: "GBP 0.221 / kWh", trend: "flat", source: "BEIS quarterly · Q1 2026 industrial band IC" },
      { label: "Diesel, UK retail avg", value: "GBP 1.49 / L", trend: "up", source: "RAC fuel watch · 22 May" },
      { label: "SAF, UK spot", value: "GBP 1,560 / t", trend: "up", source: "Argus UK desk" },
      { label: "SEG export tariff, best available", value: "GBP 0.078 / kWh", source: "Octopus Outgoing Fixed · current" },
    ],
  },
  UAE: {
    cost: [
      { label: "Industrial electricity, Dubai", value: "AED 0.42 / kWh", source: "DEWA commercial tariff slab" },
      { label: "Diesel, UAE retail", value: "AED 3.10 / L", source: "ENOC weekly · May" },
      { label: "Grid export (sell back)", value: "Prohibited", source: "DEWA grid-code, commercial PV self-consumption only" },
    ],
  },
};

// ── Region grouping for regulations ──

const REGION_MATCH: Record<string, RegExp[]> = {
  EU: [/^eu$/i, /european union/i, /\bgermany\b/i, /\bfrance\b/i, /\bnetherlands\b/i, /\bbelgium\b/i, /\bitaly\b/i, /\bspain\b/i, /\beur\b/i],
  US: [/^us$/i, /united states/i, /\bcalifornia\b/i, /\bnew york\b/i, /\btexas\b/i, /us-[a-z]{2}/i, /\bepa\b/i, /\bcarb\b/i],
  ASIA: [/singapore/i, /hong kong/i, /\bsg\b/i, /\bhk\b/i, /asia/i, /\bchina\b/i, /\bjapan\b/i, /\bkorea\b/i],
  UK: [/^uk$/i, /united kingdom/i, /\bgb\b/i, /\bbritain\b/i],
  UAE: [/\buae\b/i, /\bdubai\b/i, /united arab/i, /\babu dhabi\b/i],
};

function regionForResource(r: Resource): string | null {
  const text = `${r.jurisdiction || ""} ${r.title}`;
  for (const region of Object.keys(REGION_MATCH)) {
    for (const re of REGION_MATCH[region]) {
      if (re.test(text)) return region;
    }
  }
  return null;
}

// ── Severity derivation for regulations ──

// Phase 3C (2026-05-24): map severity column to Operations' 4-label
// Severity type (Critical / High / Moderate / Low).
const SEVERITY_COLUMN_TO_OPS_KEY: Record<string, Severity> = {
  critical: "critical",
  high: "high",
  moderate: "moderate",
  low: "low",
  // Broader enum values that map to Operations' tier vocabulary
  action_required: "critical",
  cost_alert: "high",
  window_closing: "moderate",
  competitive_edge: "moderate",
  monitoring: "low",
  immediate: "critical",
  watch: "moderate",
  reference: "low",
  background: "low",
};

function deriveRegulationSeverity(r: Resource): Severity {
  // Column-first. When migration 102 severity column populates,
  // this skips regex and reads the authoritative value.
  if (r.severity && SEVERITY_COLUMN_TO_OPS_KEY[r.severity]) {
    return SEVERITY_COLUMN_TO_OPS_KEY[r.severity];
  }
  const text = `${r.title} ${r.note || ""}`.toLowerCase();
  if (/\b(action required|immediate|deadline|effective \d|in force)\b/.test(text)) return "critical";
  if (/\b(window|q\d|by 20|consultation|phase-in)\b/.test(text)) return "moderate";
  if (r.priority === "CRITICAL") return "critical";
  if (r.priority === "HIGH") return "high";
  if (r.priority === "MODERATE") return "moderate";
  return "low";
}

// ── Component ──

export function OperationsPage({
  initialResources,
  aggregates,
  regulationsByRegion = [],
  operationsCoverage,
}: OperationsPageProps) {
  // Phase 4 (2026-05-24): Facility Data tab stripped per operator
  // standing rule (no non-functional elements). The tab rendered a
  // one-line "Domain 6 facility intelligence renders here when
  // ingested" placeholder; until the facility data path lands, the
  // chrome is removed entirely rather than shown empty. Returns
  // when regional_data_facts is populated for D6 cost data per the
  // 106 migration. The setTab state is retained to make future
  // multi-tab restoration trivial.
  const [tab] = useState<"jurisdiction">("jurisdiction");

  // Group regulations by region for D1 cross-reference rendering.
  const regulationsByRegionMap = useMemo(() => {
    const map: Record<string, Resource[]> = { EU: [], US: [], ASIA: [], UK: [], UAE: [] };
    for (const r of regulationsByRegion) {
      const region = regionForResource(r);
      if (region) map[region].push(r);
    }
    return map;
  }, [regulationsByRegion]);

  // Phase 2A (2026-05-24): stat tile counts now consume the
  // get_workspace_intelligence_aggregates RPC via the aggregates prop
  // rather than deriving locally from regulationsByRegion. Prior code
  // summed 416 across tiles (cross-referenced regulations) while the
  // masthead read 78 from the same RPC, an internal mismatch.
  // Operations uses the Critical / High / Moderate / Low vocabulary
  // which maps 1:1 to byPriority. When the severity column lands per
  // Q1, this swaps to aggregates.bySeverity for the 5-label vocab
  // surfaces (Market, Research).
  const counts: Record<Severity, number> = aggregates?.byPriority
    ? {
        critical: aggregates.byPriority.CRITICAL,
        high: aggregates.byPriority.HIGH,
        moderate: aggregates.byPriority.MODERATE,
        low: aggregates.byPriority.LOW,
      }
    : { critical: 0, high: 0, moderate: 0, low: 0 };

  const totalItems = aggregates?.totalItems ?? initialResources.length;
  const totalJurisdictions = aggregates?.totalJurisdictions ?? 0;

  // Sprint 3 A6.3b (2026-05-27): live-vs-hardcoded fact lookup.
  // Maps the component's local dim.key vocab to the DB enum used in
  // regional_data_facts.dimension. Operator-locked mapping per
  // migration 106's CHECK constraint.
  const DIM_KEY_TO_DB: Record<string, string> = useMemo(
    () => ({
      resources: "regional_resources",
      labor: "labor_markets",
      materials: "materials_sourcing",
      infrastructure: "infrastructure",
      cost: "operational_cost",
      regulatory: "regulatory_feasibility",
    }),
    []
  );

  // Build a (region_code, dim.key) → live facts map from
  // operationsCoverage.facts. Adapts the OperationsFact shape into the
  // component-local Fact interface so the render-side render(fact)
  // signature stays unchanged.
  const liveFactsByCell = useMemo(() => {
    const map = new Map<string, Fact[]>();
    if (!operationsCoverage) return map;
    for (const f of operationsCoverage.facts) {
      // Reverse-lookup: find the component dim.key matching this DB dim value.
      const dimKey = Object.entries(DIM_KEY_TO_DB).find(
        ([, db]) => db === f.dimension
      )?.[0];
      if (!dimKey) continue;
      const cellKey = `${f.region_code}|${dimKey}`;
      const arr = map.get(cellKey) || [];
      arr.push({
        label: f.fact_label,
        value: f.value,
        trend: f.trend ?? undefined,
        source: f.source_name || f.source_note || "",
      });
      map.set(cellKey, arr);
    }
    return map;
  }, [operationsCoverage, DIM_KEY_TO_DB]);

  // Helper: prefer live facts when populated for this (region, dim);
  // fall back to the hard-coded FACTS vertical-slice for cells that
  // haven't been backfilled yet (EU + US under the operator-stated
  // demonstration scope).
  const getFactsFor = useCallback(
    (regionKey: string, dimKey: string): Fact[] => {
      const live = liveFactsByCell.get(`${regionKey}|${dimKey}`);
      if (live && live.length > 0) return live;
      return (FACTS[regionKey]?.[dimKey] as Fact[] | undefined) ?? [];
    },
    [liveFactsByCell]
  );

  // Coverage stats (per dimension, count of regions with data).
  // Sprint 3 A6.3b: counts BOTH live-backfilled AND hardcoded coverage.
  const dimensionCoverage = useMemo(() => {
    const cov: Record<string, number> = {};
    for (const dim of DIMENSIONS) {
      if (dim.key === "regulatory") {
        cov[dim.key] = Object.values(regulationsByRegionMap).filter((arr) => arr.length > 0).length;
      } else {
        cov[dim.key] = REGIONS.filter((r) => getFactsFor(r.key, dim.key).length > 0).length;
      }
    }
    return cov;
  }, [regulationsByRegionMap, getFactsFor]);

  // Sprint 3 A6.3b: includes Asia/UK/UAE backfilled by A6.2 (75 facts)
  // in addition to hard-coded EU + US.
  const regionsWithData = REGIONS.filter(
    (r) => DIMENSIONS.some((d) => d.key !== "regulatory" && getFactsFor(r.key, d.key).length > 0)
  ).length;

  // Phase 4 (2026-05-24): cell-level fill rate (region x dimension
  // pairs that have at least one fact). D1 is regulation cross-refs,
  // not a facts cell; the denominator is REGIONS x (DIMENSIONS - 1).
  const totalCells = REGIONS.length * (DIMENSIONS.length - 1);
  const filledCells = REGIONS.reduce((sum, region) => {
    const factsForRegion = FACTS[region.key] || {};
    const filled = DIMENSIONS.filter((d) => {
      if (d.key === "regulatory") return false;
      return Array.isArray(factsForRegion[d.key]) && (factsForRegion[d.key] as Fact[]).length > 0;
    }).length;
    return sum + filled;
  }, 0);
  const cellFillRate = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

  return (
    <div>
      <EditorialMasthead
        title="Operations Intelligence"
        meta={
          <>
            May 24, 2026
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalItems}</b> active items
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalJurisdictions || REGIONS.length}</b> jurisdictions in scope
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
          <LegendItem color={SEVERITY_TILE_COLOR.critical} label="Critical" desc="Block / immediate cost impact" />
          <LegendItem color={SEVERITY_TILE_COLOR.high} label="High" desc="Plan ahead" />
          <LegendItem color={SEVERITY_TILE_COLOR.moderate} label="Moderate" desc="Monitor" />
          <LegendItem color={SEVERITY_TILE_COLOR.low} label="Low" desc="Background awareness" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <StatTile severity="critical" count={counts.critical} label="Critical" sub="Threshold breached, immediate cost impact" />
          <StatTile severity="high" count={counts.high} label="High" sub="Plan ahead, material impact" />
          <StatTile severity="moderate" count={counts.moderate} label="Moderate" sub="Monitor, within range" />
          <StatTile severity="low" count={counts.low} label="Low" sub="Background awareness" />
        </div>
      </div>

      <div style={{ padding: "26px 40px 60px" }}>
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
            <span>Operations, what we cover by dimension</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
              6 dimensions across your jurisdictions
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
            {DIMENSIONS.map((dim, i) => {
              const isActive = i === 0;
              const coverage = dimensionCoverage[dim.key] || 0;
              const total = REGIONS.length;
              return (
                <div
                  key={dim.key}
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
                    D{dim.num} {dim.name.split(" ").slice(0, 2).join(" ")}
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
                    {coverage} / {total}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4, alignSelf: "start" }}>
                    {coverage === total ? "All regions" : coverage === 0 ? "No regions yet" : `${total - coverage} gaps`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI bar */}
        <div style={{ marginBottom: 18 }}>
          <AiPromptBar
            placeholder="Ask anything about your operations, e.g. What are warehouse labor rates in Singapore vs LA?"
            chips={[
              "Warehouse labor, EU vs US",
              "SAF availability at EU airports",
              "Solar permitting timelines",
              "Drayage rates, LA / NY / Rotterdam",
            ]}
          />
        </div>

        {/* Phase 4 (2026-05-24): single "By Jurisdiction" view.
            Facility Data tab stripped until D6 facility-cost facts
            populate via the regional_data_facts table (migration
            106). Single-view headings render as a section title
            rather than a tab button. */}
        <div
          style={{
            paddingBottom: 12,
            marginBottom: 22,
            borderBottom: "1px solid var(--color-border)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--color-secondary)",
          }}
        >
          By Jurisdiction
        </div>

        {/* Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 28, alignItems: "start" }}>
          {/* Main column */}
          <div>
            {(
              <>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "0.025em", margin: "0 0 6px", fontWeight: 400 }}>
                    Regional Operations Intelligence
                  </h2>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0, maxWidth: "90ch" }}>
                    Regulatory feasibility, regional resources, energy tariffs, labor markets, materials sourcing, infrastructure capacity, and operational cost data by jurisdiction. Six dimensions per region; click a region to expand.
                  </p>
                </div>
                {REGIONS.map((region) => (
                  <RegionAccordion
                    key={region.key}
                    region={region}
                    regulations={regulationsByRegionMap[region.key] || []}
                    getFactsFor={getFactsFor}
                  />
                ))}
              </>
            )}
          </div>

          {/* Right rail */}
          <aside>
            <SideCard accent>
              <div style={cardLblStyle}>Coverage</div>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, color: "var(--color-primary)", display: "block", marginBottom: 6 }}>
                {regionsWithData}
              </span>
              <span style={{ fontSize: 11, color: "var(--color-text-primary)", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", display: "block" }}>
                Jurisdictions with data
              </span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4, fontWeight: 500, display: "block" }}>
                of <b style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{REGIONS.length}</b> in scope
              </span>
              <div style={{ height: 6, background: "var(--color-bg-raised)", borderRadius: 999, overflow: "hidden", margin: "12px 0" }}>
                <div style={{ height: "100%", background: "var(--color-primary)", width: `${cellFillRate}%` }} />
              </div>
              {/* Phase 4 (2026-05-24): prose was "100% of jurisdictions
                  have regional data populated" while D2-D6 breakdown
                  showed 2/5 etc. Now reports cell-level fill rate
                  (filled cells across all region x dimension pairs). */}
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5, margin: 0 }}>
                {cellFillRate}% of (region x dimension) cells populated ({filledCells} of {totalCells}). D1 regulatory feasibility renders through Regulations cross-refs; D2-D6 coverage detail below. Coverage expands weekly for cost data, quarterly for regulatory.
              </p>
            </SideCard>

            <SideCard>
              <div style={cardLblStyle}>By dimension</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                {DIMENSIONS.map((dim) => {
                  const c = dimensionCoverage[dim.key] || 0;
                  const cls = c === REGIONS.length ? "ok" : c >= 3 ? "warn" : "bad";
                  return (
                    <div
                      key={dim.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                        padding: "5px 0",
                        borderBottom: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      <b style={{ fontWeight: 600 }}>D{dim.num} {dim.name}</b>
                      <span
                        style={{
                          fontWeight: 700,
                          fontFamily: "var(--font-display)",
                          fontSize: 15,
                          color:
                            cls === "ok"
                              ? "var(--color-low)"
                              : cls === "warn"
                              ? "var(--color-high)"
                              : "var(--color-critical)",
                        }}
                      >
                        {c} / {REGIONS.length}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 10 }}>
                Cells are populated when at least one sourced, dated fact exists. Cost data refreshes weekly.
              </p>
            </SideCard>

            <SideCard>
              <div style={cardLblStyle}>Methodology</div>
              <p style={{ fontSize: 12.5, color: "var(--color-text-primary)", marginBottom: 6, lineHeight: 1.55 }}>
                Regional data points sourced from published regulator and utility schedules, industry surveys, and trade-press reporting. Every fact carries a source and date. Regulatory feasibility entries cross-reference items from Regulations; click any rule to read the full brief.
              </p>
              <p style={{ fontSize: 12.5, color: "var(--color-text-primary)", margin: 0, lineHeight: 1.55 }}>
                Use the Intelligence Assistant for cross-cutting questions, comparisons across regions, parameterized cost models, or asking "what if rates rise X%". The page surfaces structured content; the Assistant grounds against it.
              </p>
            </SideCard>
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

// tabStyle removed Phase 4 (2026-05-24): Operations is now a
// single-view surface (Facility Data tab stripped). Restore this
// helper when the facility-cost facts path lands.

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
  const isActive = severity === "critical";
  const color = SEVERITY_TILE_COLOR[severity];
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
        {severity === "critical" || severity === "high" ? "▲" : severity === "moderate" ? "◎" : "○"}
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

function SideCard({ accent, children }: { accent?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: accent ? "18px 18px 16px" : "16px 18px",
        boxShadow: "var(--shadow-card)",
        marginBottom: 14,
        position: "relative",
        overflow: "hidden",
        borderTop: accent ? "3px solid var(--color-primary)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

function RegionAccordion({
  region,
  regulations,
  getFactsFor,
}: {
  region: Region;
  regulations: Resource[];
  getFactsFor: (regionKey: string, dimKey: string) => Fact[];
}) {
  return (
    <details
      open={region.defaultOpen}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        marginBottom: 14,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          padding: "18px 24px",
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span style={{ color: "var(--color-primary)", fontSize: 18, width: 22 }}>⊕</span>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {region.label}
        </span>
        <SeverityPill severity={region.severity} />
        <span style={{ fontSize: 11.5, color: "var(--color-text-muted)", display: "flex", gap: 14, marginLeft: 4 }}>
          <b style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{regulations.length}</b> regulations
        </span>
      </summary>
      <div style={{ borderTop: "1px solid var(--color-border-subtle)", padding: 0 }}>
        {DIMENSIONS.map((dim) => {
          // Sprint 3 A6.3b: prefer live facts from regional_data_facts
          // when populated, fall back to hard-coded FACTS otherwise.
          const facts = getFactsFor(region.key, dim.key);
          const isD1 = dim.key === "regulatory";
          // Phase 4 (2026-05-24): empty dimensions previously
          // returned null and the accordion jumped D1 -> D3 -> D5
          // silently. Now render a labeled "Coverage pending" empty
          // state so the reader sees what's missing vs what's
          // intentionally not in scope.
          const showEmpty = !isD1 && (!facts || facts.length === 0);
          return (
            <div
              key={dim.key}
              style={{
                padding: "0 0 22px",
                borderBottom: "1px solid var(--color-border)",
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
                  D{dim.num}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
                  {dim.name}
                </span>
                {isD1 && (
                  <span style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginLeft: "auto", fontWeight: 600 }}>
                    {regulations.length} regulations apply
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-text-secondary)", padding: "14px 22px 4px", margin: "0 0 8px", maxWidth: "78ch" }}>
                {dim.summary}
              </p>
              <div style={{ padding: "8px 22px 4px" }}>
                {isD1 ? (
                  regulations.length > 0 ? (
                    regulations.slice(0, 6).map((r) => (
                      <RegulationLinkCard key={r.id} regulation={r} />
                    ))
                  ) : (
                    <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                      No regulations indexed for this region yet.
                    </p>
                  )
                ) : showEmpty ? (
                  <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    Coverage pending for {dim.name.toLowerCase()} in this region. Facts populate via the regional_data_facts table (migration 106) as the operator team backfills regions.
                  </p>
                ) : (
                  <FactTable facts={facts || []} />
                )}
              </div>
            </div>
          );
        })}
        {/* Sprint 3 A6.3b: empty-region note. Renders when the region
            has no facts in ANY non-regulatory dim (live + hardcoded
            combined). A6.2 populated Asia/UK/UAE so this hits only
            edge cases (e.g. brand-new region added without backfill). */}
        {!DIMENSIONS.some(
          (d) => d.key !== "regulatory" && getFactsFor(region.key, d.key).length > 0
        ) && (
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", fontStyle: "italic", padding: "12px 24px" }}>
            Regional data populated for D1 (regulations) only. D2-D6 coverage queued for next quarter.
          </p>
        )}
      </div>
    </details>
  );
}

function RegulationLinkCard({ regulation }: { regulation: Resource }) {
  const sev = deriveRegulationSeverity(regulation);
  return (
    <Link
      href={`/regulations/${regulation.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 220px",
        gap: 22,
        alignItems: "start",
        padding: "16px 20px 18px",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: "3px solid var(--color-primary)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-card)",
        textDecoration: "none",
        color: "inherit",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
            flexWrap: "wrap",
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
          }}
        >
          <SeverityPill severity={sev} />
          <span>{regulation.jurisdiction || "Global"}</span>
        </div>
        <h4 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35, margin: "4px 0 6px", color: "var(--color-text-primary)" }}>
          {regulation.title}
        </h4>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-text-secondary)", margin: 0 }}>
          {regulation.note || "Regulatory item in scope for the regional intelligence."}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SeverityPill severity={sev} />
      </div>
    </Link>
  );
}

// H2 Path A revert (2026-05-25): D2-D6 rendering reverted from FactCard
// grid back to FactTable per design-reference-protocol.md Section 4
// Correction B. The mockup at fsi-app/design_handoff_2026-05/operations.html
// + README Section 5 item 7 specifies D2-D6 bodies as fact tables (not
// cards). Each row: label / value (display-font numeric + unit) / 4-week
// trend / source line. Every cell sourced and dated.
//
// The visual asymmetry vs D1 (which renders RegulationLinkCard) is
// intentional and content-driven: D1 = regulation cross-references that
// click into /regulations/[slug]; D2-D6 = sourced operational facts where
// the value IS the value, not a link target.
function FactTable({ facts }: { facts: Fact[] }) {
  if (!facts.length) {
    return (
      <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", fontStyle: "italic" }}>
        Coverage pending for this dimension.
      </p>
    );
  }
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <tbody>
        {facts.map((f, i) => (
          <tr key={i} style={{ borderBottom: i === facts.length - 1 ? 0 : "1px solid var(--color-border-subtle)" }}>
            <td style={{ padding: "8px 12px 8px 0", color: "var(--color-text-secondary)", width: "38%", verticalAlign: "top" }}>
              {f.label}
            </td>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {f.value}
              </span>
              {f.trend && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    color:
                      f.trend === "up"
                        ? "var(--color-error)"
                        : f.trend === "down"
                        ? "var(--color-success)"
                        : "var(--color-text-muted)",
                  }}
                  title="4-week trend"
                >
                  {f.trend === "up" ? "▲" : f.trend === "down" ? "▼" : "→"}
                </span>
              )}
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginTop: 2, fontWeight: 400 }}>
                {f.source}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone = SEVERITY_PILL_TONE[severity];
  return (
    <span
      style={{
        display: "inline-block",
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
      {severity === "critical" ? "Critical" : severity === "high" ? "High" : severity === "moderate" ? "Moderate" : "Low"}
    </span>
  );
}

// FacilityDataPlaceholder removed Phase 4 (2026-05-24) with the
// Facility Data tab strip. Returns when the facility-cost facts
// path lands via regional_data_facts (migration 106).
