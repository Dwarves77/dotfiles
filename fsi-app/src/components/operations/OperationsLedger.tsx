"use client";

/**
 * OperationsLedger — the redesigned /operations surface (Redesign TEMPLATE 07).
 *
 * Shape (HANDOFF §6.7): severity tiles → D1–D6 dimension chips (n/N coverage,
 * click to spotlight across regions) → Ask bar → regional ledger of region
 * cards (whole header row clickable + explicit orange "Expand ▾" button;
 * expanded = a 2-col dimension grid; the US card carries a "By state" sub-list)
 * → active operations items → right rail (Coverage / By dimension / Methodology).
 *
 * Operator binding (caros-ledge-platform-intent §3): Operations surfaces
 * STRUCTURED CONTENT. The customer reads it and uses the Intelligence Assistant
 * for cross-cutting questions — NOT a decision-engine UI.
 *
 * COUNTS (binding): severity-tile numbers read get_surface_counts('operations')
 * via getSurfaceCounts (migration 148/#173), verified-gated, fail-soft to the
 * scoped-aggregates RPC. Dimension-coverage n/N, region "N regulations", the
 * Coverage rail, and the By-dimension list all derive from the loaded rows /
 * live regional_data_facts — never hard-coded, never the mock snapshot.
 *
 * HONEST STATE (HANDOFF §4): a dimension cell with no sourced fact renders the
 * dashed pending frame + a one-line reason (never 0/blank). STATE-LEVEL data is
 * state-level (HANDOFF §1): a US state without a sourced cost figure shows "—" +
 * reason, never a national number. State-level cost facts are known new backend
 * (§7 / migration 151 state_cost_facts) — the By-state sub-list ships with the
 * pending frame until sourced, cited rows land.
 */

import Link from "next/link";
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import type { OperationsCoverageData, OperationsFact } from "@/lib/supabase-server";
import { OperationsItemsView } from "@/components/operations/OperationsItemsView";

// ── Severity vocabulary (Operations: Critical / High / Moderate / Low) ──
// Hues + tints reuse the --reg-band-* tokens (identical hex in the mock).

type Severity = "critical" | "high" | "moderate" | "low";

const SEV_HUE: Record<Severity, string> = {
  critical: "var(--reg-band-immediate)",
  high: "var(--reg-band-action)",
  moderate: "var(--reg-band-monitor)",
  low: "var(--reg-band-awareness)",
};

const SEV_META: Record<Severity, { hue: string; bg: string; bd: string; label: string }> = {
  critical: { hue: "var(--reg-band-immediate)", bg: "var(--reg-band-immediate-bg)", bd: "var(--ops-critical-bd)", label: "Critical" },
  high: { hue: "var(--reg-band-action)", bg: "var(--reg-band-action-bg)", bd: "var(--ops-high-bd)", label: "High" },
  moderate: { hue: "var(--reg-band-monitor)", bg: "var(--reg-band-monitor-bg)", bd: "var(--ops-moderate-bd)", label: "Moderate" },
  low: { hue: "var(--reg-band-awareness)", bg: "var(--reg-band-awareness-bg)", bd: "var(--ops-low-bd)", label: "Low" },
};

// Severity-tile bottom rules (mock gradients = the --reg-band-*-strip tokens).
const SEV_STRIP: Record<Severity, string> = {
  critical: "var(--reg-band-immediate-strip)",
  high: "var(--reg-band-action-strip)",
  moderate: "var(--reg-band-monitor-strip)",
  low: "var(--reg-band-awareness-strip)",
};

// ── Dimensions (D1–D6) ──

interface Dimension {
  num: number;
  key: string; // component-local key
  db: string; // regional_data_facts.dimension enum value
  name: string;
  summary: string;
}

const DIMENSIONS: Dimension[] = [
  { num: 1, key: "regulatory", db: "regulatory_feasibility", name: "Regulatory feasibility", summary: "Which rules apply in this region and what they bind. Entries cross-reference Regulations; open any rule to read the full brief." },
  { num: 2, key: "resources", db: "regional_resources", name: "Regional resource availability", summary: "Whether the materials, recyclables, and qualified suppliers your operations depend on are present, constrained, or absent here." },
  { num: 3, key: "labor", db: "labor_markets", name: "Labor markets", summary: "Loaded-cost wages and workforce availability for warehouse, driver, and handler roles. Inputs to automation-versus-hire and capacity decisions." },
  { num: 4, key: "materials", db: "materials_sourcing", name: "Materials sourcing", summary: "Where to qualify supply for crating, packaging, and structural materials. In-region versus import economics, and certification status." },
  { num: 5, key: "infrastructure", db: "infrastructure", name: "Infrastructure capacity", summary: "Port dwell, air-cargo capacity, shore power, and electric-truck charging. Where lanes flow and where they bottleneck." },
  { num: 6, key: "cost", db: "operational_cost", name: "Operational cost data", summary: "Per-unit grid, fuel, handling, and drayage rates. The cost-baseline inputs for tender pricing and pass-through math." },
];

// Short dimension names for the chip strip (mock uses first two words).
const DIM_SHORT: Record<string, string> = {
  regulatory: "Regulatory feasibility",
  resources: "Regional resource",
  labor: "Labor markets",
  materials: "Materials sourcing",
  infrastructure: "Infrastructure capacity",
  cost: "Operational cost",
};

// ── Region grouping for regulation cross-refs (D1) ──

const REGION_MATCH: Record<string, RegExp[]> = {
  EU: [/^eu$/i, /european union/i, /\bgermany\b/i, /\bfrance\b/i, /\bnetherlands\b/i, /\bbelgium\b/i, /\bitaly\b/i, /\bspain\b/i, /\beur\b/i],
  US: [/^us$/i, /united states/i, /\bcalifornia\b/i, /\bnew york\b/i, /\btexas\b/i, /us-[a-z]{2}/i, /\bepa\b/i, /\bcarb\b/i, /\bnorth carolina\b/i],
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

// US sub-national grouping for the By-state sub-list. A regulation tagged to a
// state IS that state's data (regulation cross-ref); its per-state COST figure
// is separate sourced backend (migration 151) and shows pending until landed.
const US_STATE_MATCH: { code: string; label: string; patterns: RegExp[] }[] = [
  { code: "US-CA", label: "California", patterns: [/california/i, /\bCARB\b/, /los angeles/i, /port of la\b/i, /\bSB[\s-]?25[13]\b/i] },
  { code: "US-NY", label: "New York", patterns: [/new york/i, /\bNYC\b/, /local law 97/i, /\bLL97\b/i, /ny harbor/i] },
  { code: "US-NC", label: "North Carolina", patterns: [/north carolina/i, /\bNC DEQ\b/i, /\bNC Register\b/i] },
  { code: "US-TX", label: "Texas", patterns: [/\btexas\b/i, /\bTCEQ\b/i] },
];

function usStateForResource(r: Resource): { code: string; label: string } | null {
  const text = `${r.jurisdiction || ""} ${r.title} ${r.note || ""}`;
  for (const s of US_STATE_MATCH) {
    for (const re of s.patterns) if (re.test(text)) return { code: s.code, label: s.label };
  }
  return null;
}

// ── Severity derivation for regulations ──

const SEVERITY_COLUMN_TO_KEY: Record<string, Severity> = {
  critical: "critical", high: "high", moderate: "moderate", low: "low",
  action_required: "critical", cost_alert: "high", window_closing: "moderate",
  competitive_edge: "moderate", monitoring: "low", immediate: "critical",
  watch: "moderate", reference: "low", background: "low",
};

function deriveRegionSeverity(regs: Resource[], fallback: Severity): Severity {
  // The region card's chip = the most severe regulation in scope, so the chip
  // never over- or under-states the region relative to its own rows.
  const order: Severity[] = ["critical", "high", "moderate", "low"];
  let worst = 3;
  for (const r of regs) {
    let sev: Severity = "low";
    if (r.severity && SEVERITY_COLUMN_TO_KEY[r.severity]) sev = SEVERITY_COLUMN_TO_KEY[r.severity];
    else if (r.priority === "CRITICAL") sev = "critical";
    else if (r.priority === "HIGH") sev = "high";
    else if (r.priority === "MODERATE") sev = "moderate";
    const idx = order.indexOf(sev);
    if (idx < worst) worst = idx;
  }
  return regs.length > 0 ? order[worst] : fallback;
}

// ── Region model ──

interface Region {
  key: string;
  label: string;
  severity: Severity;
}

// Fallback region roster if the regions table has not been configured (the
// live roster comes from operationsCoverage.regions when present).
const DEFAULT_REGIONS: Region[] = [
  { key: "EU", label: "European Union", severity: "critical" },
  { key: "US", label: "United States", severity: "critical" },
  { key: "ASIA", label: "Asia · Singapore + Hong Kong", severity: "high" },
  { key: "UK", label: "United Kingdom", severity: "high" },
  { key: "UAE", label: "UAE · Dubai", severity: "moderate" },
];

// ── Component ──

/** A sourced sub-national cost fact (state_cost_facts) — each carries its own
 *  statute citation + source, never a national average (migration 152). */
export interface StateCostFactVM {
  stateCode: string;
  factLabel: string;
  value: string;
  unit: string | null;
  trend: string | null;
  statuteCitation: string | null;
  sourceName: string | null;
  effectiveDate: string | null;
}

interface OperationsLedgerProps {
  initialResources: Resource[];
  aggregates?: WorkspaceAggregates;
  regulationsByRegion?: Resource[];
  operationsCoverage?: OperationsCoverageData;
  /** Sourced per-state cost facts (US By-state sub-list). Empty until sourced. */
  stateCosts?: StateCostFactVM[];
}

export function OperationsLedger({
  initialResources,
  aggregates,
  regulationsByRegion = [],
  operationsCoverage,
  stateCosts = [],
}: OperationsLedgerProps) {
  // Index the sourced per-state facts by state code for the By-state sub-list.
  // One primary figure per state (the first fact — minimum wage today).
  const stateCostByCode = useMemo(() => {
    const m = new Map<string, StateCostFactVM>();
    for (const f of stateCosts) if (!m.has(f.stateCode)) m.set(f.stateCode, f);
    return m;
  }, [stateCosts]);
  // Live region roster (regions table) or the fallback roster.
  const regions: Region[] = useMemo(() => {
    const live = operationsCoverage?.regions ?? [];
    if (live.length > 0) {
      return live.map((r) => ({
        key: r.code,
        label: r.label,
        severity: (["critical", "high", "moderate", "low"].includes(r.severity || "")
          ? r.severity
          : "low") as Severity,
      }));
    }
    return DEFAULT_REGIONS;
  }, [operationsCoverage]);

  // Region open-state (all CLOSED by default per the platform accordion rule).
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({});
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [askValue, setAskValue] = useState("");

  // Regulations grouped by region for D1 cross-refs.
  const regsByRegion = useMemo(() => {
    const map: Record<string, Resource[]> = {};
    for (const r of regions) map[r.key] = [];
    for (const r of regulationsByRegion) {
      const region = regionForResource(r);
      if (region && map[region]) map[region].push(r);
    }
    return map;
  }, [regulationsByRegion, regions]);

  // Live facts keyed by `${regionCode}|${dimKey}`.
  const factsByCell = useMemo(() => {
    const map = new Map<string, OperationsFact[]>();
    const dbToKey: Record<string, string> = {};
    for (const d of DIMENSIONS) dbToKey[d.db] = d.key;
    for (const f of operationsCoverage?.facts ?? []) {
      const dimKey = dbToKey[f.dimension];
      if (!dimKey) continue;
      const cellKey = `${f.region_code}|${dimKey}`;
      const arr = map.get(cellKey) ?? [];
      arr.push(f);
      map.set(cellKey, arr);
    }
    return map;
  }, [operationsCoverage]);

  const factsFor = useCallback(
    (regionKey: string, dimKey: string): OperationsFact[] => factsByCell.get(`${regionKey}|${dimKey}`) ?? [],
    [factsByCell]
  );

  // Dimension coverage (regions with data / total regions). Computed, never
  // hard-coded. D1 counts regions with ≥1 regulation; D2–D6 count regions with
  // ≥1 live fact.
  const dimCoverage = useMemo(() => {
    const cov: Record<string, number> = {};
    for (const d of DIMENSIONS) {
      if (d.key === "regulatory") {
        cov[d.key] = regions.filter((r) => (regsByRegion[r.key]?.length ?? 0) > 0).length;
      } else {
        cov[d.key] = regions.filter((r) => factsFor(r.key, d.key).length > 0).length;
      }
    }
    return cov;
  }, [regions, regsByRegion, factsFor]);

  const regionCount = regions.length;

  // Regions with ANY live D2–D6 fact (for the Coverage rail headline).
  const regionsWithData = regions.filter((r) =>
    DIMENSIONS.some((d) => d.key !== "regulatory" && factsFor(r.key, d.key).length > 0)
  ).length;

  // Cell-level fill rate over the region × (D2–D6) grid.
  const totalCells = regionCount * (DIMENSIONS.length - 1);
  const filledCells = regions.reduce(
    (sum, r) => sum + DIMENSIONS.filter((d) => d.key !== "regulatory" && factsFor(r.key, d.key).length > 0).length,
    0
  );
  const cellFillRate = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

  // Severity-tile counts from the verified-gated RPC bundle (fail-soft).
  const tileCounts: Record<Severity, number> = aggregates?.byPriority
    ? { critical: aggregates.byPriority.CRITICAL, high: aggregates.byPriority.HIGH, moderate: aggregates.byPriority.MODERATE, low: aggregates.byPriority.LOW }
    : { critical: 0, high: 0, moderate: 0, low: 0 };

  const totalItems = aggregates?.totalItems ?? initialResources.length;
  const totalJurisdictions = aggregates?.totalJurisdictions || regionCount;

  function submitAsk(q: string) {
    const question = q.trim();
    if (!question) return;
    window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { question, anchor: null } }));
    setAskValue("");
  }

  const cardBorder = "1px solid var(--color-border)";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 36px 80px" }}>
      {/* ── Severity tiles (display; counts from the RPC bundle) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, margin: "0 0 18px" }} className="cl-ops-tiles">
        {(["critical", "high", "moderate", "low"] as Severity[]).map((sev) => (
          <SeverityTile
            key={sev}
            severity={sev}
            count={tileCounts[sev]}
            label={SEV_META[sev].label}
            sub={
              sev === "critical" ? "Threshold breached, immediate cost impact"
                : sev === "high" ? "Plan ahead, material impact"
                : sev === "moderate" ? "Monitor, within range"
                : "Background awareness"
            }
          />
        ))}
      </div>

      {/* ── Dimension chips — click to spotlight across regions ── */}
      <div role="group" aria-label="Spotlight a dimension across regions" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, margin: "0 0 18px" }} className="cl-ops-dims">
        {DIMENSIONS.map((d) => {
          const cov = dimCoverage[d.key] ?? 0;
          const pressed = activeDim === d.key;
          const full = cov >= regionCount && regionCount > 0;
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={pressed}
              aria-label={`${d.name}: ${cov} of ${regionCount} regions with data. Spotlight this dimension.`}
              onClick={() => setActiveDim(pressed ? null : d.key)}
              style={{
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "left",
                background: pressed ? "var(--accent-tint)" : "var(--color-bg-surface)",
                border: pressed ? "2px solid var(--color-primary)" : cardBorder,
                borderRadius: 8,
                padding: pressed ? "10px 12px" : "11px 13px",
              }}
            >
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brass)", margin: "0 0 4px" }}>
                D{d.num} {DIM_SHORT[d.key]}
              </p>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1, margin: 0, color: full ? "var(--reg-band-awareness)" : "var(--reg-band-action)", fontVariantNumeric: "tabular-nums" }}>
                {cov}
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}> /{regionCount}</span>
              </p>
              <p style={{ fontSize: 10, color: "var(--color-text-secondary)", margin: "3px 0 0" }}>
                {full ? "All regions" : cov === 0 ? "No regions yet" : `${regionCount - cov} ${regionCount - cov === 1 ? "gap" : "gaps"}`}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── Ask bar (boxed, matches the mock + T02) ── */}
      <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderRadius: 8, padding: "14px 16px", margin: "0 0 22px" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); submitAsk(askValue); }}
          style={{ display: "flex", gap: 10, alignItems: "center" }}
        >
          <input
            value={askValue}
            onChange={(e) => setAskValue(e.target.value)}
            aria-label="Ask anything about your operations"
            placeholder="Ask anything about your operations, e.g. What are warehouse labor rates in Singapore vs LA?"
            style={{ flex: 1, minWidth: 0, fontFamily: "inherit", fontSize: 13.5, padding: "11px 14px", border: "1px solid var(--color-border-medium)", borderRadius: 6, outline: "none", background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
          />
          <button type="submit" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, padding: "11px 20px", borderRadius: 6, border: "1px solid var(--color-primary)", background: "var(--color-primary)", color: "var(--color-text-inverse, #fff)", cursor: "pointer" }}>
            Ask
          </button>
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 0" }}>
          {["Warehouse labor, EU vs US", "SAF availability at EU airports", "Solar permitting timelines", "Drayage rates, LA / NY / Rotterdam"].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setAskValue(chip)}
              style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "var(--color-text-secondary)", background: "var(--color-bg-base)", border: "1px solid var(--color-border)", borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section header ── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "2px solid var(--color-text-primary)", padding: "0 0 8px", margin: "0 0 16px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 26, letterSpacing: "0.02em", textTransform: "uppercase", margin: 0 }}>Regional operations</h2>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Six dimensions per region · click to expand</span>
      </div>

      {/* ── Two-column grid ── */}
      <div id="ops-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 24, alignItems: "start" }} className="cl-ops-grid">
        {/* Regions column */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {regions.map((region) => {
            const regs = regsByRegion[region.key] ?? [];
            const chipSev = deriveRegionSeverity(regs, region.severity);
            const populated = DIMENSIONS.filter((d) => d.key === "regulatory" ? regs.length > 0 : factsFor(region.key, d.key).length > 0).length;
            return (
              <RegionCard
                key={region.key}
                region={region}
                chipSev={chipSev}
                regs={regs}
                populated={populated}
                open={!!open[region.key]}
                onToggle={() => setOpen((s) => ({ ...s, [region.key]: !s[region.key] }))}
                activeDim={activeDim}
                factsFor={factsFor}
                subOpen={!!subOpen[region.key]}
                onSubToggle={() => setSubOpen((s) => ({ ...s, [region.key]: !s[region.key] }))}
                stateCosts={stateCostByCode}
              />
            );
          })}

          {/* Active operations items (reuses OperationsItemsView; links to detail) */}
          {initialResources.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "2px solid var(--color-text-primary)", padding: "14px 0 8px", margin: "14px 0 4px" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 22, letterSpacing: "0.02em", textTransform: "uppercase", margin: 0 }}>Active operations items</h2>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                  <b style={{ color: "var(--color-text-primary)" }}>{totalItems}</b> items · grouped by region
                </span>
              </div>
              <OperationsItemsView items={initialResources} />
            </>
          )}
        </div>

        {/* Right rail */}
        <aside id="ops-rail" style={{ display: "flex", flexDirection: "column", gap: 14 }} className="cl-ops-rail">
          {/* Coverage */}
          <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderLeft: "3px solid var(--color-primary)", borderRadius: 8, padding: "14px 16px" }}>
            <p style={railLbl}>Coverage</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--color-primary)", margin: 0 }}>
              {regionsWithData} <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>of {regionCount} jurisdictions with data</span>
            </p>
            <div style={{ height: 5, background: "var(--color-bg-raised)", borderRadius: 3, overflow: "hidden", margin: "8px 0" }}>
              <div style={{ height: "100%", width: `${cellFillRate}%`, background: "var(--color-primary)" }} />
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
              {cellFillRate}% of region × dimension cells populated ({filledCells} of {totalCells}). D1 renders through Regulations cross-refs; coverage expands weekly for cost data, quarterly for regulatory.
            </p>
          </div>

          {/* By dimension */}
          <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ ...railLbl, marginBottom: 10 }}>By dimension</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DIMENSIONS.map((d) => {
                const c = dimCoverage[d.key] ?? 0;
                const hue = c >= regionCount && regionCount > 0 ? "var(--reg-band-awareness)" : c === 0 ? "var(--reg-band-immediate)" : "var(--reg-band-action)";
                return (
                  <div key={d.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>D{d.num} {d.name}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: hue }}>{c}/{regionCount}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.55, margin: "10px 0 0" }}>
              Cells populate when at least one sourced, dated fact exists. Cost data refreshes weekly.
            </p>
          </div>

          {/* Methodology */}
          <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderRadius: 8, padding: "14px 16px" }}>
            <p style={railLbl}>Methodology</p>
            <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
              Regional data points come from published regulator and utility schedules, industry surveys, and trade-press reporting. Every fact carries a source and date. Regulatory feasibility entries cross-reference Regulations; open any rule to read the full brief. Use the Intelligence Assistant for cross-cutting questions across regions.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Severity tile ──

function SeverityTile({ severity, count, label, sub }: { severity: Severity; count: number; label: string; sub: string }) {
  return (
    <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px" }}>
        <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: SEV_HUE[severity], margin: "0 0 4px" }}>{label}</p>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 38, lineHeight: 1, color: SEV_HUE[severity], margin: 0, fontVariantNumeric: "tabular-nums" }}>{count}</p>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", margin: "5px 0 0" }}>{sub}</p>
      </div>
      <div style={{ height: 5, background: SEV_STRIP[severity] }} />
    </div>
  );
}

// ── Region card ──

function RegionCard({
  region, chipSev, regs, populated, open, onToggle, activeDim, factsFor, subOpen, onSubToggle, stateCosts,
}: {
  region: Region;
  chipSev: Severity;
  regs: Resource[];
  populated: number;
  open: boolean;
  onToggle: () => void;
  activeDim: string | null;
  factsFor: (regionKey: string, dimKey: string) => OperationsFact[];
  subOpen: boolean;
  onSubToggle: () => void;
  stateCosts: Map<string, StateCostFactVM>;
}) {
  const meta = SEV_META[chipSev];
  const hasSubs = region.key === "US";

  return (
    <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderLeft: `3px solid ${meta.hue}`, borderRadius: 8, overflow: "hidden" }}>
      {/* Whole header row is the toggle button */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: "100%", textAlign: "left", fontFamily: "inherit", background: "transparent", border: "none", cursor: "pointer", padding: "14px 18px", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 17, letterSpacing: "0.03em", textTransform: "uppercase" }}>{region.label}</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: meta.hue, border: `1px solid ${meta.bd}`, background: meta.bg, borderRadius: 4, padding: "2px 8px" }}>{meta.label}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-secondary)" }}>
            <b style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{regs.length}</b> regulations
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted)" }}>{populated} of 6 dimensions populated</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-primary)", whiteSpace: "nowrap" }}>{open ? "Collapse ▴" : "Expand ▾"}</span>
        </span>
      </button>

      {open && (
        <>
          {/* Dimension grid (2-col) */}
          <div style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="cl-ops-dimgrid">
            {DIMENSIONS.map((d) => (
              <DimensionCell
                key={d.key}
                dim={d}
                spotlight={activeDim === d.key}
                regionKey={region.key}
                regionHue={meta.hue}
                regs={d.key === "regulatory" ? regs : []}
                facts={d.key === "regulatory" ? [] : factsFor(region.key, d.key)}
              />
            ))}
          </div>

          {/* By-state sub-list (US) */}
          {hasSubs && (
            <ByStateSubList
              regs={regs}
              subOpen={subOpen}
              onSubToggle={onSubToggle}
              stateCosts={stateCosts}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Dimension cell ──

function DimensionCell({
  dim, spotlight, regionKey, regionHue, regs, facts,
}: {
  dim: Dimension;
  spotlight: boolean;
  regionKey: string;
  regionHue: string;
  regs: Resource[];
  facts: OperationsFact[];
}) {
  const isD1 = dim.key === "regulatory";
  const pending = !isD1 && facts.length === 0;

  const base: CSSProperties = {
    borderRadius: 6,
    padding: "12px 14px",
    border: spotlight
      ? "2px solid var(--color-primary)"
      : pending
      ? "1px dashed var(--honest-dashed)"
      : "1px solid var(--color-border)",
    background: pending ? "var(--color-bg-base)" : "var(--color-bg-surface)",
  };

  // Headline figure: D2–D6 use the first sourced fact value, in the region's
  // context hue (HANDOFF §2). D1 carries no figure (regulation cross-refs).
  const figure = !isD1 && facts.length > 0 ? facts[0].value : null;

  return (
    <div style={base}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, margin: "0 0 5px" }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brass)" }}>
          D{dim.num} · {dim.name}
        </span>
        {figure && (
          <span style={{ fontFamily: "var(--font-display)", fontSize: 19, color: regionHue, whiteSpace: "nowrap" }}>{figure}</span>
        )}
      </div>

      {isD1 ? (
        <D1Body regionKey={regionKey} regs={regs} summary={dim.summary} />
      ) : pending ? (
        <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
          {dim.name} pending for this region — populates when a sourced, dated fact lands.
        </p>
      ) : (
        <FactList facts={facts} />
      )}
    </div>
  );
}

function D1Body({ regionKey, regs, summary }: { regionKey: string; regs: Resource[]; summary: string }) {
  if (regs.length === 0) {
    return (
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
        No regulations indexed for this region yet — {summary.charAt(0).toLowerCase()}{summary.slice(1)}
      </p>
    );
  }
  return (
    <>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-primary)", margin: 0 }}>
        <b style={{ fontWeight: 700 }}>{regs.length}</b> active {regs.length === 1 ? "regulation" : "regulations"} in scope. {summary}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, margin: "7px 0 0" }}>
        {regs.slice(0, 3).map((r) => (
          <Link key={r.id} href={`/regulations/${encodeURIComponent(r.id)}`} style={{ fontSize: 11.5, color: "var(--color-text-secondary)", textDecoration: "none", lineHeight: 1.4 }}>
            · {r.title}
          </Link>
        ))}
      </div>
      <Link href={`/regulations?region=${encodeURIComponent(regionKey.toLowerCase())}`} style={{ display: "inline-block", fontSize: 11, fontWeight: 800, color: "var(--color-primary)", textDecoration: "none", margin: "7px 0 0" }}>
        Open {regionKey} regulations →
      </Link>
    </>
  );
}

function FactList({ facts }: { facts: OperationsFact[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0 }}>
      {facts.map((f, i) => {
        const source = f.source_name || f.source_note || "";
        return (
          <div key={i} style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--color-text-primary)" }}>
            <span style={{ color: "var(--color-text-secondary)" }}>{f.fact_label}: </span>
            <b style={{ fontWeight: 700 }}>{f.value}</b>
            {f.trend && (
              <span title="trend" style={{ marginLeft: 5, fontSize: 10.5, color: f.trend === "up" ? "var(--reg-band-immediate)" : f.trend === "down" ? "var(--reg-band-awareness)" : "var(--color-text-muted)" }}>
                {f.trend === "up" ? "▲" : f.trend === "down" ? "▼" : "→"}
              </span>
            )}
            {source && (
              <span style={{ display: "block", fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 1 }}>
                {f.source_url ? (
                  <a href={f.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>{source}</a>
                ) : source}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── By-state sub-list (US) ──

function ByStateSubList({
  regs,
  subOpen,
  onSubToggle,
  stateCosts,
}: {
  regs: Resource[];
  subOpen: boolean;
  onSubToggle: () => void;
  stateCosts: Map<string, StateCostFactVM>;
}) {
  // Group US regulations by state (regulation cross-ref data is real). Per-state
  // COST figures come from state_cost_facts (migration 152) — each carries its
  // own statute citation + source. A state with no sourced fact shows a dash,
  // never a national average presented as state law.
  const states = useMemo(() => {
    const map = new Map<string, { code: string; label: string; regs: Resource[] }>();
    for (const r of regs) {
      const s = usStateForResource(r);
      if (!s) continue;
      const entry = map.get(s.code) ?? { code: s.code, label: s.label, regs: [] };
      entry.regs.push(r);
      map.set(s.code, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.regs.length - a.regs.length);
  }, [regs]);

  return (
    <>
      <button
        type="button"
        onClick={onSubToggle}
        aria-expanded={subOpen}
        style={{ width: "100%", textAlign: "left", fontFamily: "inherit", padding: "11px 18px", background: "var(--color-bg-base)", border: "none", borderTop: "1px solid var(--color-border-subtle)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-primary)" }}>
          {subOpen ? "Hide state breakdown" : `By state · ${states.length} with regulations →`}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>state law is state-level data — never a national average</span>
      </button>

      {subOpen && (
        <div style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
          {states.map((st) => (
            <div key={st.code} style={{ display: "grid", gridTemplateColumns: "150px 1fr auto auto", gap: 12, alignItems: "center", padding: "11px 18px", borderBottom: "1px solid var(--color-border-subtle)" }} className="cl-ops-state">
              <span style={{ fontSize: 12.5, fontWeight: 800 }}>{st.label}</span>
              <span style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                {st.regs.slice(0, 2).map((r) => r.title).join(" · ") || "Regulations in scope"}
              </span>
              {/* Per-state cost figure: real sourced fact where present (each with
                  its own citation, in the tooltip + a visible source line); an
                  honest dash where none is sourced — never a national number. */}
              {(() => {
                const fact = stateCosts.get(st.code);
                if (!fact) {
                  return (
                    <span
                      title="No sourced state cost fact yet"
                      style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                    >
                      —
                    </span>
                  );
                }
                const citation = [
                  fact.factLabel,
                  fact.statuteCitation,
                  fact.sourceName ? `Source: ${fact.sourceName}` : null,
                  fact.effectiveDate ? `Effective ${fact.effectiveDate}` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <span title={citation} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--color-text-primary)" }}>
                      {fact.value}
                    </span>
                    {fact.unit && (
                      <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{fact.unit}</span>
                    )}
                    <span style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>
                      {fact.factLabel}{fact.sourceName ? ` · ${fact.sourceName}` : ""}
                    </span>
                  </span>
                );
              })()}
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{st.regs.length} regs</span>
            </div>
          ))}

          {/* Pending frame — state-level cost facts (HANDOFF §4 + §7) */}
          <div style={{ padding: "11px 18px", background: "var(--color-bg-base)" }}>
            <div style={{ border: "1px dashed var(--honest-dashed)", borderRadius: 6, padding: "10px 13px" }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brass)", margin: "0 0 4px" }}>
                State-level cost facts — sourced where available
              </p>
              <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
                Per-state figures (minimum wage first; labor rates and fuel taxes next) carry their own citation and source — hover a figure for it. A state with no sourced figure shows a dash, never a national average presented as state law.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Shared styles ──

const railLbl: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  margin: "0 0 4px",
};
