"use client";

/**
 * OperationsPage — /operations route.
 *
 * Matches design_handoff_2026-04/preview/operations.html:
 *   - EditorialMasthead (title + meta)
 *   - 4-color legend strip
 *   - 4-up StatStrip with Critical primary tile
 *   - AiPromptBar with operations chips
 *   - Tabs: "By Jurisdiction" | "Facility Data"
 *
 * Data sources (from intelligence_items):
 *   - Jurisdiction tab: items where item_type === "regional_data"
 *     (mapped to Resource.type by lib/supabase-server.ts).
 *   - Facility tab: items where domain === 6.
 *
 * Both tabs gracefully fall back to a stub message when no data is
 * present yet — the worker populates these progressively.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Globe, Sun, Zap, Users, Building, Battery, FileText, Layers } from "lucide-react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { StatStrip, type StatTone } from "@/components/shell/StatStrip";
import { CitationCountChip } from "@/components/credibility/CitationCountChip";
import { RecencyChip } from "@/components/credibility/RecencyChip";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import { OPERATIONS_REGIONAL_DOMAIN, OPERATIONS_FACILITY_DOMAIN } from "@/lib/domains";

interface OperationsPageProps {
  initialResources: Resource[];
  /**
   * Scoped aggregates (migration 069) over the operations slice
   * (regional_data + domain 3 + domain 6). Powers the masthead meta line
   * with true page-scoped totals. Optional so existing callers / fallback
   * paths (seed mode) still render with row-derived counts.
   */
  aggregates?: WorkspaceAggregates;
  /**
   * Build 9 Priority 1: regulation items (domain 1 or item_type ∈
   * {regulation, directive, standard, guidance, framework, law}) from the
   * full workspace payload, used to cross-reference regulatory feasibility
   * by region. Per caros-ledge-platform-intent SKILL Section 3 the canonical
   * content lives on /regulations; /operations links into it. Optional so
   * the page degrades gracefully when the workspace has no regulation data
   * (e.g. anon caller). Defaults to [].
   */
  regulationsByRegion?: Resource[];
}

const LEGEND: Array<{ tone: StatTone; label: string; helper: string }> = [
  { tone: "critical", label: "Critical", helper: "Block / immediate cost impact" },
  { tone: "high",     label: "High",     helper: "Plan ahead" },
  { tone: "moderate", label: "Moderate", helper: "Monitor" },
  { tone: "low",      label: "Low",      helper: "Background awareness" },
];

const CHIPS = ["Warehouse costs in Dubai", "EV charging in the EU", "Solar permitting timelines"];

const TONE_COLOR: Record<StatTone, string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  moderate: "var(--moderate)",
  low: "var(--low)",
  muted: "var(--text-2)",
};

// Map the categorical chips inside a region card. Labels mirror the
// preview "Solar / Electricity / Labor / EV Charging / Green Building"
// taxonomy plus capability extensions (Materials Sourcing, Infrastructure)
// per caros-ledge-platform-intent SKILL Section 3. A single regional_data
// item rarely fills every chip — we use tag/text inference to slot
// whatever the worker has ingested into the right chip. Build 9 added the
// `other` catch-all chip so ingested rows that don't match any regex
// matcher SURFACE rather than dropping out of the UI (OBS-19: the regex
// matchers mis-attributed wiring gaps as coverage gaps).
const CHIP_DEFS: Array<{ key: string; label: string; icon: typeof Sun; matcher: RegExp | null }> = [
  { key: "solar",        label: "Solar",            icon: Sun,      matcher: /\b(solar|pv|photovoltaic|rooftop|shams)\b/i },
  { key: "electricity",  label: "Electricity",      icon: Zap,      matcher: /\b(electricity|tariff|kwh|kilowatt|grid|utility)\b/i },
  { key: "labor",        label: "Labor",            icon: Users,    matcher: /\b(labor|labour|wage|salary|workforce|wages)\b/i },
  { key: "ev_charging",  label: "EV Charging",      icon: Battery,  matcher: /\b(ev|electric vehicle|charging|charger)\b/i },
  { key: "green_building", label: "Green Building", icon: Building, matcher: /\b(green building|leed|breeam|estidama|green mark|dgnb|certif)\b/i },
  { key: "materials",    label: "Materials Sourcing", icon: Layers, matcher: /\b(material|mill|supplier|recycl|aluminium|aluminum|steel|fiber|fibre|composite)\b/i },
  { key: "infrastructure", label: "Infrastructure",  icon: Building, matcher: /\b(port|rail|terminal|airport|drayage|handling)\b/i },
  // Catch-all: items that don't match any specific matcher above land here
  // so they remain visible. Honest "Other regional data" framing per the
  // OBS-19 finding that real ingested items were dropping out of the UI.
  { key: "other",        label: "Other regional data", icon: FileText, matcher: null },
];

interface RegionGroup {
  region: string;
  items: Resource[];
}

function groupByRegion(items: Resource[]): RegionGroup[] {
  const map = new Map<string, Resource[]>();
  for (const r of items) {
    const region = r.jurisdiction || "Unspecified";
    const arr = map.get(region) || [];
    arr.push(r);
    map.set(region, arr);
  }
  return Array.from(map.entries())
    .map(([region, items]) => ({ region, items }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

// Slot an item into the most specific chip whose matcher catches it.
// Falls back to the `other` chip (matcher === null) so unmatched items
// remain visible instead of dropping out of the UI (OBS-19 close).
function inferChipKey(item: Resource): string {
  const text = `${item.title} ${item.note || ""} ${(item.tags || []).join(" ")}`;
  for (const def of CHIP_DEFS) {
    if (def.matcher && def.matcher.test(text)) return def.key;
  }
  return "other";
}

type PriorityKey = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export function OperationsPage({ initialResources, aggregates, regulationsByRegion = [] }: OperationsPageProps) {
  const [tab, setTab] = useState<"juris" | "facility">("juris");
  const [priorityFilter, setPriorityFilter] = useState<PriorityKey | null>(null);

  // Resources flowing from intelligence_items. type is r.type, domain is r.domain.
  // Operations card surface uses item_type === "regional_data" for the jurisdiction
  // tab and OPERATIONS_FACILITY_DOMAIN (facility) for the facility tab. We also
  // fall back to OPERATIONS_REGIONAL_DOMAIN for jurisdiction items the worker
  // may have tagged that way.
  const regionalItems = useMemo(
    () => initialResources.filter((r) => r.type === "regional_data" || r.domain === OPERATIONS_REGIONAL_DOMAIN),
    [initialResources]
  );
  const facilityItems = useMemo(
    () => initialResources.filter((r) => r.domain === OPERATIONS_FACILITY_DOMAIN),
    [initialResources]
  );

  // Stat-strip counts pull from regional+facility (the two surfaces this
  // page covers). Critical is the primary tile.
  const opsItems = useMemo(
    () => [...regionalItems, ...facilityItems],
    [regionalItems, facilityItems]
  );

  const counts = {
    CRITICAL: opsItems.filter((r) => r.priority === "CRITICAL").length,
    HIGH:     opsItems.filter((r) => r.priority === "HIGH").length,
    MODERATE: opsItems.filter((r) => r.priority === "MODERATE").length,
    LOW:      opsItems.filter((r) => r.priority === "LOW").length,
  };

  // Toggle filter on tile click; clicking the active tile clears.
  const onTile = (p: PriorityKey) => () =>
    setPriorityFilter((current) => (current === p ? null : p));

  const stripTiles = [
    { tone: "critical" as const, eyebrow: "Critical", helper: "Threshold breached — immediate cost impact", icon: "⚠", numeral: counts.CRITICAL, primary: priorityFilter === null || priorityFilter === "CRITICAL", onClick: onTile("CRITICAL"), ariaLabel: `Critical · ${counts.CRITICAL} items · click to filter` },
    { tone: "high"     as const, eyebrow: "High",     helper: "Plan ahead — material impact",               icon: "▲", numeral: counts.HIGH,     primary: priorityFilter === "HIGH",                                  onClick: onTile("HIGH"),     ariaLabel: `High · ${counts.HIGH} items · click to filter` },
    { tone: "moderate" as const, eyebrow: "Moderate", helper: "Monitor — within range",                     icon: "◎", numeral: counts.MODERATE, primary: priorityFilter === "MODERATE",                              onClick: onTile("MODERATE"), ariaLabel: `Moderate · ${counts.MODERATE} items · click to filter` },
    { tone: "low"      as const, eyebrow: "Low",      helper: "Background awareness",                       icon: "◯", numeral: counts.LOW,      primary: priorityFilter === "LOW",                                   onClick: onTile("LOW"),      ariaLabel: `Low · ${counts.LOW} items · click to filter` },
  ];

  // Filter regions/items by priority if a filter is active.
  const filteredRegional = useMemo(
    () => priorityFilter ? regionalItems.filter((r) => r.priority === priorityFilter) : regionalItems,
    [regionalItems, priorityFilter]
  );
  const filteredFacility = useMemo(
    () => priorityFilter ? facilityItems.filter((r) => r.priority === priorityFilter) : facilityItems,
    [facilityItems, priorityFilter]
  );
  const regions = useMemo(() => groupByRegion(filteredRegional), [filteredRegional]);

  // Build 9 Priority 1: regulatory feasibility cross-references. Group
  // regulation items (passed from /operations/page.tsx) by jurisdiction so
  // each RegionCard can list the binding rules that apply in that region.
  // Match uses normalized jurisdiction strings; "Unspecified" buckets
  // regulations with no jurisdiction so they still surface for any region
  // missing a more specific match.
  const regulationsByJurisdiction = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const r of regulationsByRegion) {
      const region = (r.jurisdiction || "Unspecified").trim();
      const arr = map.get(region) || [];
      arr.push(r);
      map.set(region, arr);
    }
    return map;
  }, [regulationsByRegion]);

  // Masthead meta: parity with `/` (date · N items · M jurisdictions).
  // Falls back to row-derived counts when aggregates are missing / zero
  // (seed fallback path or RPC error) so the meta line always renders.
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const itemsCount =
    aggregates && aggregates.totalItems > 0
      ? aggregates.totalItems
      : opsItems.length;
  const jurisdictionsCount =
    aggregates && aggregates.totalJurisdictions > 0
      ? aggregates.totalJurisdictions
      : new Set(
          opsItems
            .map((r) => (r.jurisdiction || "").trim())
            .filter(Boolean)
        ).size;
  const meta = `${dateStr} · ${itemsCount} ${itemsCount === 1 ? "item" : "items"} in scope · ${jurisdictionsCount} ${jurisdictionsCount === 1 ? "jurisdiction" : "jurisdictions"} in scope`;

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <EditorialMasthead
        title="Operations Intelligence"
        meta={meta}
        belowSlot={
          <div style={{ marginTop: 18 }}>
            <Legend />
            <div style={{ marginTop: 14 }}>
              <StatStrip tiles={stripTiles} />
            </div>
          </div>
        }
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
        <AiPromptBar
          placeholder="Ask anything about your operations — e.g. What are warehouse costs in Dubai?"
          chips={CHIPS}
        />

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid var(--border-sub)" }}>
          <TabButton active={tab === "juris"} onClick={() => setTab("juris")}>By Jurisdiction</TabButton>
          <TabButton active={tab === "facility"} onClick={() => setTab("facility")}>Facility Data</TabButton>
        </div>

        {tab === "juris" && (
          <JurisdictionPanel
            regions={regions}
            totalItems={filteredRegional.length}
            priorityFilter={priorityFilter}
            regulationsByJurisdiction={regulationsByJurisdiction}
          />
        )}
        {tab === "facility" && (
          <FacilityPanel items={filteredFacility} />
        )}
      </div>
    </div>
  );
}

// ── Legend ──

function Legend() {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        padding: "6px 0 0",
        fontSize: 11,
        color: "var(--text-2)",
      }}
    >
      {LEGEND.map((l) => (
        <span key={l.label} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: TONE_COLOR[l.tone] }}>●</span>
          <b style={{ fontWeight: 800, letterSpacing: "0.06em" }}>{l.label}</b>
          <span>{l.helper}</span>
        </span>
      ))}
    </div>
  );
}

// ── Tab Button ──

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        padding: "12px 18px",
        fontSize: 13,
        fontWeight: 700,
        color: active ? "var(--accent)" : "var(--text-2)",
        borderBottom: active ? "3px solid var(--accent)" : "3px solid transparent",
        background: "transparent",
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

// ── By Jurisdiction Panel ──

function JurisdictionPanel({
  regions,
  totalItems,
  priorityFilter,
  regulationsByJurisdiction,
}: {
  regions: RegionGroup[];
  totalItems: number;
  priorityFilter: PriorityKey | null;
  regulationsByJurisdiction: Map<string, Resource[]>;
}) {
  // When the priority tile is active, the side-rail "X jurisdictions"
  // count drops because regions with no items at that priority drop out
  // of the group-by. Make that explicit in the copy so the user doesn't
  // wonder where the missing jurisdictions went.
  const priorityLabel = priorityFilter
    ? priorityFilter.charAt(0) + priorityFilter.slice(1).toLowerCase()
    : null;
  return (
    <section
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] grid-cols-1"
      style={{ alignItems: "start" }}
    >
      <div>
        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: "0.02em",
              margin: "0 0 6px",
              color: "var(--text)",
            }}
          >
            Regional Operations Intelligence
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)", margin: "0 0 18px", maxWidth: "88ch" }}>
            Regulatory feasibility, regional resources, energy tariffs, labor markets, materials sourcing, infrastructure capacity, and operational cost data by jurisdiction.
          </p>
        </div>

        {regions.length === 0 ? (
          <EmptyJurisdiction />
        ) : (
          <div className="space-y-3">
            {/* Accordion default-state policy (CLAUDE.md, in force from
                2026-05-07): accordions are CLOSED across the platform.
                The pattern `defaultOpen={i === 0}` is forbidden. Prior
                A5 dispatch left region accordions opening the first
                region by default; this dispatch reverses that decision
                so Operations matches the rest of the surface. */}
            {regions.map((rg) => (
              <RegionCard
                key={rg.region}
                group={rg}
                defaultOpen={false}
                regulations={regulationsByJurisdiction.get(rg.region) || []}
              />
            ))}
          </div>
        )}
      </div>

      {/* Side rail */}
      <aside className="space-y-3 hidden lg:block">
        <SideCard label="Coverage">
          <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
            <b>{regions.length} jurisdictions</b>
            {priorityLabel ? ` at ${priorityLabel} priority` : " with data"}.
            {" "}
            {totalItems === 0
              ? "No regional data is available for this workspace yet."
              : priorityLabel
                ? "Clear the priority tile to see all coverage."
                : "Coverage expands as regional intelligence is added."}
          </p>
        </SideCard>
        <SideCard label="Methodology">
          <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
            Regional data points sourced from published regulator and utility schedules. Regulatory feasibility entries cross-reference items from Regulations; click any rule to read the full brief on /regulations.
          </p>
        </SideCard>
      </aside>
    </section>
  );
}

function RegionCard({
  group,
  defaultOpen,
  regulations,
}: {
  group: RegionGroup;
  defaultOpen?: boolean;
  /** Build 9 Priority 1: regulation items applicable to this region. */
  regulations: Resource[];
}) {
  const [open, setOpen] = useState(!!defaultOpen);

  // Decide priority badge color from the worst priority of contained items
  // (regional data + regulations both contribute to the region's overall
  // priority signal).
  const priorityRank = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 } as const;
  const allForPriority = [...group.items, ...regulations];
  const sortedByP = [...allForPriority].sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority]
  );
  const top = sortedByP[0];
  const topTone: StatTone = top
    ? top.priority === "CRITICAL" ? "critical"
    : top.priority === "HIGH"     ? "high"
    : top.priority === "MODERATE" ? "moderate"
    : "low"
    : "low";

  // Bucket items by chip key for the chip grid. inferChipKey now falls
  // back to `other` so every ingested item lands in a visible bucket
  // (OBS-19 close).
  const chips = useMemo(() => {
    const byKey = new Map<string, Resource[]>();
    for (const it of group.items) {
      const k = inferChipKey(it);
      const arr = byKey.get(k) || [];
      arr.push(it);
      byKey.set(k, arr);
    }
    return CHIP_DEFS.map((d) => ({ ...d, items: byKey.get(d.key) || [] }));
  }, [group.items]);

  // Build 9 Priority 1: regulatory feasibility cross-references. Surface
  // up to 8 regulations applicable to this region. The CONTENT lives on
  // /regulations; this section is a structured pointer per caros-ledge-
  // platform-intent SKILL Section 3.
  const visibleRegulations = regulations.slice(0, 8);

  // Q9 Operations credibility signals (per source-credibility-model SKILL
  // Section 8): tier + jurisdiction + applicability as primary, with the
  // citation count + recency rolled up from the underlying source. The
  // rollup uses the freshest lastCitedAt across the region's items and the
  // sum of citationCounts so the chips reflect the region card's full
  // body, not a single row.
  const credRollup = useMemo(() => {
    let count = 0;
    let latest: string | null = null;
    for (const it of [...group.items, ...visibleRegulations]) {
      if (typeof it.citationCount === "number") count += it.citationCount;
      if (it.lastCitedAt) {
        if (!latest || new Date(it.lastCitedAt).getTime() > new Date(latest).getTime()) {
          latest = it.lastCitedAt;
        }
      }
    }
    return { count, latest };
  }, [group.items, visibleRegulations]);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "14px 20px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          width: "100%",
          background: "transparent",
          cursor: "pointer",
          border: 0,
          textAlign: "left",
        }}
      >
        <Globe size={16} style={{ color: "var(--accent)" }} />
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{group.region}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 3,
                color: TONE_COLOR[topTone],
                background: `var(--${topTone}-bg)`,
                border: `1px solid var(--${topTone}-bd)`,
              }}
            >
              {top?.priority || "—"}
            </span>
            {/* Build 9: Q9 Operations credibility chips on the region
                header. CitationCountChip suppresses when count < 1; this
                mirrors the Build 8.1 PipelineRow pattern in
                fsi-app/src/components/research/ResearchView.tsx. */}
            {credRollup.count >= 1 && <CitationCountChip count={credRollup.count} />}
            {credRollup.latest && <RecencyChip timestamp={credRollup.latest} />}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {group.items.length} data point{group.items.length === 1 ? "" : "s"}
            {visibleRegulations.length > 0 && (
              <> · {regulations.length} regulation{regulations.length === 1 ? "" : "s"}</>
            )}
          </div>
        </div>
        <ChevronDown
          size={18}
          style={{
            color: "var(--muted)",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 180ms ease",
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "4px 20px 20px", borderTop: "1px solid var(--border-sub)" }}>
          {/* Build 9 Priority 1: Regulatory Feasibility section.
              Cross-references regulation items applicable to this region
              per caros-ledge-platform-intent SKILL Section 3. Content
              lives on /regulations; this is a structured pointer, NOT a
              separate decision-engine UI (OBS-29 framing). */}
          {visibleRegulations.length > 0 && (
            <RegulatoryFeasibilitySection
              regulations={visibleRegulations}
              totalCount={regulations.length}
            />
          )}

          {/* Resource availability chip grid. Honest empty state when the
              region has no regional_data items yet (OBS-19: replace
              phase-language "Coming soon" with workspace-anchored copy). */}
          {chips.every((c) => c.items.length === 0) ? (
            <div style={{ margin: "14px 0" }}>
              <NoDataBanner
                note="No regional resource data has been ingested for this jurisdiction yet. Coverage expands across solar, electricity, labor, EV charging, green building, materials sourcing, and infrastructure as workspace data lands."
              />
            </div>
          ) : (
            <>
              <SectionHeading>Regional resources</SectionHeading>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                  margin: "8px 0 14px",
                }}
              >
                {chips.filter((c) => c.items.length > 0).map((c) => (
                  <ChipCell key={c.key} def={c} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Build 9 Priority 1: regulatory feasibility cross-reference section per
// caros-ledge-platform-intent SKILL Section 3. Lists regulations applicable
// to the parent region; each item links to /regulations/[slug] where the
// canonical content lives.
function RegulatoryFeasibilitySection({
  regulations,
  totalCount,
}: {
  regulations: Resource[];
  totalCount: number;
}) {
  return (
    <div style={{ margin: "14px 0" }}>
      <SectionHeading>Regulatory feasibility</SectionHeading>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--text-2)",
          margin: "0 0 8px",
          lineHeight: 1.5,
        }}
      >
        Binding rules that apply in this region. Full briefs live on Regulations.
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {regulations.map((r) => (
          <li key={r.id} style={{ marginBottom: 6 }}>
            <Link
              href={`/regulations/${encodeURIComponent(r.id)}`}
              prefetch={false}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                background: "var(--bg)",
                border: "1px solid var(--border-sub)",
                borderRadius: "var(--r-sm)",
                padding: "8px 10px",
                textDecoration: "none",
                color: "inherit",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
              className="hover:bg-[var(--raised)]"
            >
              <FileText size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span style={{ flex: 1, color: "var(--text)", fontWeight: 600 }}>{r.title}</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: 3,
                  color:
                    r.priority === "CRITICAL" ? "var(--critical)"
                    : r.priority === "HIGH"   ? "var(--high)"
                    : r.priority === "MODERATE" ? "var(--moderate)"
                    : "var(--low)",
                  background:
                    r.priority === "CRITICAL" ? "var(--critical-bg)"
                    : r.priority === "HIGH"   ? "var(--high-bg)"
                    : r.priority === "MODERATE" ? "var(--moderate-bg)"
                    : "var(--low-bg)",
                  border: `1px solid ${
                    r.priority === "CRITICAL" ? "var(--critical-bd)"
                    : r.priority === "HIGH"   ? "var(--high-bd)"
                    : r.priority === "MODERATE" ? "var(--moderate-bd)"
                    : "var(--low-bd)"
                  }`,
                }}
              >
                {r.priority}
              </span>
              {/* Per-source credibility chips per Q9 Operations signal set. */}
              {typeof r.citationCount === "number" && r.citationCount >= 1 && (
                <CitationCountChip count={r.citationCount} />
              )}
              {r.lastCitedAt && <RecencyChip timestamp={r.lastCitedAt} />}
            </Link>
          </li>
        ))}
      </ul>
      {totalCount > regulations.length && (
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 0" }}>
          Showing {regulations.length} of {totalCount} regulations. Open Regulations for full coverage.
        </p>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--muted)",
        margin: "12px 0 6px",
      }}
    >
      {children}
    </div>
  );
}

function ChipCell({ def }: { def: { key: string; label: string; icon: typeof Sun; items: Resource[] } }) {
  const Icon = def.icon;
  const [drillOpen, setDrillOpen] = useState(false);
  const head = def.items[0];

  // Build 9: chip cells now ONLY render when they have items (filtering
  // happens upstream in RegionCard), so the prior empty-cell dimming
  // branch is gone. Per Q9 Operations credibility signal set, citation
  // chips render alongside the title when source data is available.
  if (!head) return null;

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-sm)",
        padding: "12px 14px",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <div className="flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--high)" }}>
          <Icon size={12} />
          {def.label}
        </div>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 4, color: "var(--text)" }}>
        {head.title}
      </div>
      {head.note && (
        <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, fontStyle: "italic" }}>
          {head.note}
        </div>
      )}
      {/* Q9 Operations credibility chips on the chip head. */}
      {(typeof head.citationCount === "number" && head.citationCount >= 1) || head.lastCitedAt ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {typeof head.citationCount === "number" && head.citationCount >= 1 && (
            <CitationCountChip count={head.citationCount} />
          )}
          {head.lastCitedAt && <RecencyChip timestamp={head.lastCitedAt} />}
        </div>
      ) : null}
      {def.items.length > 1 && (
        <button
          type="button"
          onClick={() => setDrillOpen((v) => !v)}
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--accent)",
            fontWeight: 700,
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {drillOpen ? "Hide" : `+${def.items.length - 1} more`}
        </button>
      )}
      {drillOpen && (
        <ul style={{ marginTop: 6, paddingLeft: 16, fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
          {def.items.slice(1).map((it) => (
            <li key={it.id}>{it.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SideCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// Build 9 (OBS-19 close): honest empty state for the regional view. Prior
// copy ("Regional intelligence coming soon") leaked phase-language to the
// customer per caros-ledge-platform-intent SKILL Section 11 anti-pattern.
// Replaced with workspace-anchored copy that names what is and is not
// available without promising a delivery date.
function EmptyJurisdiction() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "28px 22px",
        boxShadow: "var(--shadow)",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
        No regional data for this workspace yet
      </p>
      <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
        Operations surfaces regulatory feasibility by region, regional resource availability (solar, electricity, labor, EV charging, green building, materials sourcing, infrastructure), and operational cost data. Regional coverage appears here as workspace data lands.
      </p>
    </div>
  );
}

// ── Facility Data Panel ──

function FacilityPanel({ items }: { items: Resource[] }) {
  // Group facility items by category. The intelligence_items category column
  // populates Resource.topic. If empty, fall back to grouping by item.sub.
  const groups = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const it of items) {
      const key = it.topic || it.sub || "Uncategorized";
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([cat, items]) => ({ cat, items }));
  }, [items]);

  return (
    <section className="space-y-3">
      <div>
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 400,
            letterSpacing: "0.02em",
            margin: "0 0 6px",
            color: "var(--text)",
          }}
        >
          Warehouse &amp; Facility Optimization
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)", margin: "0 0 18px", maxWidth: "88ch" }}>
          Electricity tariffs, solar ROI, battery storage, labor benchmarks, and green building certifications by location.
        </p>
      </div>

      {groups.length === 0 ? (
        // Build 9 (OBS-19 close): honest empty state per caros-ledge-
        // platform-intent SKILL Section 11 anti-pattern guidance. Prior
        // copy ("Facility data coming soon") leaked promise-language.
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-sub)",
            borderRadius: "var(--r-md)",
            padding: "28px 22px",
            boxShadow: "var(--shadow)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
            No facility data for this workspace yet
          </p>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
            Facility intelligence surfaces electricity tariffs, solar ROI, battery storage, labor benchmarks, and green building certifications by location. Coverage appears here as facility data lands.
          </p>
        </div>
      ) : (
        groups.map((g) => <FacilityCategoryCard key={g.cat} group={g} defaultOpen={false} />)
      )}
    </section>
  );
}

function FacilityCategoryCard({ group, defaultOpen }: { group: { cat: string; items: Resource[] }; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "14px 20px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          width: "100%",
          background: "transparent",
          cursor: "pointer",
          border: 0,
          textAlign: "left",
        }}
      >
        <div className="flex-1">
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", textTransform: "capitalize" }}>
            {group.cat}
          </span>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {group.items.length} item{group.items.length === 1 ? "" : "s"}
          </div>
        </div>
        <ChevronDown
          size={18}
          style={{
            color: "var(--muted)",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 180ms ease",
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "8px 20px 20px", borderTop: "1px solid var(--border-sub)" }}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }} className="space-y-2">
            {group.items.map((it) => (
              <li key={it.id}>
                {/* Card-level Link → /regulations/[slug] detail. No
                    interactive children inside; clean wrap. */}
                <Link
                  href={`/regulations/${encodeURIComponent(it.id)}`}
                  prefetch={false}
                  style={{
                    display: "block",
                    background: "var(--bg)",
                    border: "1px solid var(--border-sub)",
                    borderRadius: "var(--r-sm)",
                    padding: "10px 12px",
                    textDecoration: "none",
                    color: "inherit",
                    cursor: "pointer",
                    transition: "background-color 120ms ease",
                  }}
                  className="hover:bg-[var(--raised)]"
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{it.title}</div>
                  {it.note && (
                    <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginTop: 4 }}>
                      {it.note}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    {it.jurisdiction && (
                      <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {it.jurisdiction}
                      </span>
                    )}
                    {/* Q9 Operations credibility chips per source-credibility-
                        model SKILL Section 8 (Build 9 mount, mirrors Build
                        8.1 ResearchView PipelineRow). */}
                    {typeof it.citationCount === "number" && it.citationCount >= 1 && (
                      <CitationCountChip count={it.citationCount} />
                    )}
                    {it.lastCitedAt && <RecencyChip timestamp={it.lastCitedAt} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── NoDataBanner ──
//
// Build 9 (OBS-19 close): inline banner for region accordions that have
// no regional_data items ingested yet. Replaces the prior ComingSoonBanner
// whose label leaked phase/promise language to the customer per the
// caros-ledge-platform-intent SKILL Section 11 anti-pattern. Visual
// treatment kept (muted strip + dot + label + note) but the wording is
// honest about the present state without promising a delivery date.
function NoDataBanner({ note }: { note: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        background: "var(--high-bg)",
        border: "1px solid var(--high-bd)",
        borderRadius: "var(--r-md)",
        padding: "12px 16px",
        fontSize: 12,
        color: "var(--text)",
        lineHeight: 1.55,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--high)",
          flexShrink: 0,
          marginTop: 5,
        }}
      />
      <span>
        <b style={{ color: "var(--high)", letterSpacing: "0.04em" }}>
          No data yet
        </b>
        , {note}
      </span>
    </div>
  );
}
