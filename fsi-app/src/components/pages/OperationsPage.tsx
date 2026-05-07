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
import { ChevronDown, Globe, Sun, Zap, Users, Building, Battery } from "lucide-react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { StatStrip, type StatTone } from "@/components/shell/StatStrip";
import type { Resource } from "@/types/resource";

interface OperationsPageProps {
  initialResources: Resource[];
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
// taxonomy. A single regional_data item rarely fills every chip — we
// use tag/text inference to slot whatever the worker has ingested into
// the right chip and leave the rest empty.
const CHIP_DEFS: Array<{ key: string; label: string; icon: typeof Sun; matcher: RegExp }> = [
  { key: "solar",        label: "Solar",          icon: Sun,      matcher: /\b(solar|pv|photovoltaic|rooftop|shams)\b/i },
  { key: "electricity",  label: "Electricity",    icon: Zap,      matcher: /\b(electricity|tariff|kwh|kilowatt|grid|utility)\b/i },
  { key: "labor",        label: "Labor",          icon: Users,    matcher: /\b(labor|labour|wage|salary|workforce|wages)\b/i },
  { key: "ev_charging",  label: "EV Charging",    icon: Battery,  matcher: /\b(ev|electric vehicle|charging|charger)\b/i },
  { key: "green_building", label: "Green Building", icon: Building, matcher: /\b(green building|leed|breeam|estidama|green mark|dgnb|certif)\b/i },
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

function inferChipKey(item: Resource): string | null {
  const text = `${item.title} ${item.note || ""} ${(item.tags || []).join(" ")}`;
  for (const def of CHIP_DEFS) {
    if (def.matcher.test(text)) return def.key;
  }
  return null;
}

type PriorityKey = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export function OperationsPage({ initialResources }: OperationsPageProps) {
  const [tab, setTab] = useState<"juris" | "facility">("juris");
  const [priorityFilter, setPriorityFilter] = useState<PriorityKey | null>(null);

  // Resources flowing from intelligence_items. type is r.type, domain is r.domain.
  // Operations card surface uses item_type === "regional_data" for the jurisdiction
  // tab and domain === 6 (facility) for the facility tab. We also fall back to
  // domain === 3 for jurisdiction items the worker may have tagged that way.
  const regionalItems = useMemo(
    () => initialResources.filter((r) => r.type === "regional_data" || r.domain === 3),
    [initialResources]
  );
  const facilityItems = useMemo(
    () => initialResources.filter((r) => r.domain === 6),
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

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <EditorialMasthead
        title="Operations Intelligence"
        meta="Before operating in a new region, understand what it will cost and what rules apply. Energy costs, labor rates, and sustainability requirements by location."
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
}: {
  regions: RegionGroup[];
  totalItems: number;
  priorityFilter: PriorityKey | null;
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
            Energy tariffs, labor costs, solar permitting, EV infrastructure, and green building requirements by jurisdiction.
          </p>
        </div>

        {regions.length === 0 ? (
          <EmptyJurisdiction />
        ) : (
          <div className="space-y-3">
            {regions.map((rg, i) => (
              <RegionCard key={rg.region} group={rg} defaultOpen={i === 0} />
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
            {totalItems === 0 ? "Worker has not yet ingested regional_data items." : priorityLabel ? "Clear the priority tile to see all coverage." : "Coverage expands as the source monitoring system ingests regional_data items."}
          </p>
        </SideCard>
        <SideCard label="Methodology">
          <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
            Data points sourced from published regulator and utility schedules. Where ranges shown, reflects regional / tariff-tier variance.
          </p>
        </SideCard>
      </aside>
    </section>
  );
}

function RegionCard({ group, defaultOpen }: { group: RegionGroup; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);

  // Decide priority badge color from the worst priority of contained items.
  const priorityRank = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 } as const;
  const sortedByP = [...group.items].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const top = sortedByP[0];
  const topTone: StatTone = top
    ? top.priority === "CRITICAL" ? "critical"
    : top.priority === "HIGH"     ? "high"
    : top.priority === "MODERATE" ? "moderate"
    : "low"
    : "low";

  // Bucket items by chip key for the chip grid.
  const chips = useMemo(() => {
    const byKey = new Map<string, Resource[]>();
    for (const it of group.items) {
      const k = inferChipKey(it);
      if (!k) continue;
      const arr = byKey.get(k) || [];
      arr.push(it);
      byKey.set(k, arr);
    }
    return CHIP_DEFS.map((d) => ({ ...d, items: byKey.get(d.key) || [] }));
  }, [group.items]);

  // Active regulations: surface unique titles from contained items.
  const activeRegs = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; title: string }[] = [];
    for (const it of group.items) {
      if (!seen.has(it.title)) {
        seen.add(it.title);
        out.push({ id: it.id, title: it.title });
      }
    }
    return out.slice(0, 6);
  }, [group.items]);

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
          <div className="flex items-center gap-2">
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
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {group.items.length} data point{group.items.length === 1 ? "" : "s"}
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
          {chips.every((c) => c.items.length === 0) ? (
            <div style={{ margin: "14px 0" }}>
              <ComingSoonBanner
                note="Operations data points (solar, electricity, labor, EV charging, green building) for this jurisdiction will populate here as the source monitoring system ingests them."
              />
            </div>
          ) : (
            /* Chip grid — only renders when at least one chip has real data. */
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                margin: "14px 0",
              }}
            >
              {chips.map((c) => (
                <ChipCell key={c.key} def={c} />
              ))}
            </div>
          )}

          {/* Active regulations */}
          {activeRegs.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  margin: "16px 0 8px",
                }}
              >
                Active items
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--text-2)" }}>
                {activeRegs.map((r) => (
                  <li key={r.id}>{r.title}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChipCell({ def }: { def: { key: string; label: string; icon: typeof Sun; items: Resource[] } }) {
  const Icon = def.icon;
  const [drillOpen, setDrillOpen] = useState(false);
  const head = def.items[0];
  const empty = !head;

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-sm)",
        padding: "12px 14px",
        opacity: empty ? 0.55 : 1,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <div className="flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--high)" }}>
          <Icon size={12} />
          {def.label}
        </div>
      </div>
      {empty ? (
        // Empty chip in a partially-populated region: render dimmed header
        // only (no per-cell placeholder text). The region-level
        // ComingSoonBanner handles the fully-empty case.
        null
      ) : (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 4, color: "var(--text)" }}>
            {head.title}
          </div>
          {head.note && (
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, fontStyle: "italic" }}>
              {head.note}
            </div>
          )}
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
        </>
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
        Regional intelligence not yet ingested
      </p>
      <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
        Operations data points (energy tariffs, labor rates, solar permitting, EV charging, green building) will populate as the worker scans <code>item_type = &lsquo;regional_data&rsquo;</code> records.
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
            Facility data not yet ingested
          </p>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
            Electricity tariffs, solar ROI tables, labor benchmarks, and green building certifications will populate here as the worker writes <code>domain = 6</code> intelligence items.
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
              <li
                key={it.id}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border-sub)",
                  borderRadius: "var(--r-sm)",
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{it.title}</div>
                {it.note && (
                  <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginTop: 4 }}>
                    {it.note}
                  </div>
                )}
                {it.jurisdiction && (
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
                    {it.jurisdiction}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── ComingSoonBanner ──
//
// Inlined copy of the Admin "Coming soon — Phase D" banner pattern from
// AdminDashboard.tsx (used for tabs whose backing service isn't online
// yet). Inlined here per the no-premature-abstractions guidance — same
// visual treatment (high-tone amber strip + dot + bold label + note),
// no shared-component extraction.
function ComingSoonBanner({ note }: { note: string }) {
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
          Coming soon — Phase D
        </b>{" "}
        — {note}
      </span>
    </div>
  );
}
