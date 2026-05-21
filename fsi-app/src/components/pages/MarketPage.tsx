"use client";

/**
 * MarketPage — /market route.
 *
 * Matches design_handoff_2026-04/preview/market-intel.html and the
 * Wave 2 PR-G dispatch (Market Intel content pattern + F11b template
 * propagation):
 *
 * Page chrome:
 *   - EditorialMasthead with title, meta, legend, 4-up StatStrip
 *   - AiPromptBar with market chips
 *   - Tabs: "Technology Readiness" | "Price Signals & Trade"
 *
 * Each tab body shares the SAME structural template (this is the F11b
 * parity contract — Tech Readiness mirrors Price Signals & Trade):
 *   - Two-column layout (main + 320px right rail)
 *   - Main column:
 *       PolicySignals (POLICY ACCELERATION SIGNALS, sourced badges per CC3)
 *       FreightRelevanceCallout (yellow Dietl/Rockit-specific framing)
 *       KeyMetricsRow (KEY METRICS rows with delta indicators)
 *       CostTrajectoryChart (multi-line per cargo vertical)
 *       Category accordions (existing item feed)
 *   - Right rail:
 *       WatchlistSidebar (highest-lifecycle items)
 *       OwnersContent (per-owner feed)
 *       Watch / Methodology side cards (preserved from prior pattern)
 *
 * Data sources (from intelligence_items via Resource):
 *   - Tech tab: items where item_type IN ("technology", "innovation")
 *     OR domain === 2. Grouped by category column (Resource.topic).
 *   - Price Signals tab: items where item_type === "market_signal"
 *     OR domain === 4. Grouped by category, surfaced as price-row cards.
 *
 * URL params:
 *   - ?priority=CRITICAL|HIGH|MODERATE|LOW pre-filters the StatStrip
 *     toggle. Powers the dashboard hero callout deep link (PR-G F4/F5).
 *   - ?tab=tech|prices selects the active tab (default: tech).
 *
 * Lifecycle labels mapping from priority:
 *   CRITICAL → Watch
 *   HIGH     → Elevated
 *   MODERATE → Stable
 *   LOW      → Informational
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { StatStrip, type StatTone } from "@/components/shell/StatStrip";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { WatchlistSidebar } from "@/components/market/WatchlistSidebar";
import { KeyMetricsRow } from "@/components/market/KeyMetricsRow";
import { CostTrajectoryChart } from "@/components/market/CostTrajectoryChart";
import { PolicySignals } from "@/components/market/PolicySignals";
import { FreightRelevanceCallout } from "@/components/market/FreightRelevanceCallout";
import { OwnersContent } from "@/components/market/OwnersContent";
import { CitationCountChip } from "@/components/credibility/CitationCountChip";
import { RecencyChip } from "@/components/credibility/RecencyChip";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates, SourceCitationStatsMap } from "@/lib/data";

interface MarketPageProps {
  initialResources: Resource[];
  /**
   * Scoped aggregates (migration 069) over the market slice
   * (technology + innovation + market_signal + domain 2 + domain 4).
   * Powers the masthead meta line with true page-scoped totals. Optional
   * so existing callers / fallback paths still render with row-derived counts.
   */
  aggregates?: WorkspaceAggregates;
  /**
   * Build 7: per-source citation stats keyed by source_id. Mirrors Build 8.1
   * /research pattern. Optional so the page renders without chips on fallback
   * paths or when the RPC fails.
   */
  citationStats?: SourceCitationStatsMap;
}

type PriorityKey = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
type TabKey = "tech" | "prices";

const LEGEND: Array<{ tone: StatTone; label: string; helper: string }> = [
  { tone: "critical", label: "Watch",         helper: "Threshold breached" },
  { tone: "high",     label: "Elevated",      helper: "Significant movement" },
  { tone: "moderate", label: "Stable",        helper: "Within normal range" },
  { tone: "low",      label: "Informational", helper: "Background awareness" },
];

const CHIPS = ["SAF cost outlook", "Carbon pricing on ocean freight", "Diesel forward curve"];

const TONE_COLOR: Record<StatTone, string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  moderate: "var(--moderate)",
  low: "var(--low)",
  muted: "var(--text-2)",
};

const LIFECYCLE: Record<Resource["priority"], { tone: StatTone; label: string }> = {
  CRITICAL: { tone: "critical", label: "Watch" },
  HIGH:     { tone: "high",     label: "Elevated" },
  MODERATE: { tone: "moderate", label: "Stable" },
  LOW:      { tone: "low",      label: "Informational" },
};

function isPriorityKey(s: string | null): s is PriorityKey {
  return s === "CRITICAL" || s === "HIGH" || s === "MODERATE" || s === "LOW";
}
function isTabKey(s: string | null): s is TabKey {
  return s === "tech" || s === "prices";
}

export function MarketPage({ initialResources, aggregates, citationStats = {} }: MarketPageProps) {
  const searchParams = useSearchParams();

  const initialPriority = isPriorityKey(searchParams.get("priority"))
    ? (searchParams.get("priority") as PriorityKey)
    : null;
  const initialTab: TabKey = isTabKey(searchParams.get("tab"))
    ? (searchParams.get("tab") as TabKey)
    : "tech";

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [priorityFilter, setPriorityFilter] = useState<PriorityKey | null>(
    initialPriority
  );

  // Re-sync state when the URL changes (e.g. dashboard hero callout).
  useEffect(() => {
    const p = searchParams.get("priority");
    if (isPriorityKey(p)) setPriorityFilter(p);
    const t = searchParams.get("tab");
    if (isTabKey(t)) setTab(t);
  }, [searchParams]);

  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);

  const techItems = useMemo(
    () =>
      initialResources.filter(
        (r) => r.type === "technology" || r.type === "innovation" || r.domain === 2
      ),
    [initialResources]
  );

  const priceItems = useMemo(
    () => initialResources.filter((r) => r.type === "market_signal" || r.domain === 4),
    [initialResources]
  );

  const all = useMemo(() => [...techItems, ...priceItems], [techItems, priceItems]);

  const counts = {
    CRITICAL: all.filter((r) => r.priority === "CRITICAL").length,
    HIGH:     all.filter((r) => r.priority === "HIGH").length,
    MODERATE: all.filter((r) => r.priority === "MODERATE").length,
    LOW:      all.filter((r) => r.priority === "LOW").length,
  };

  const onTile = (p: PriorityKey) => () =>
    setPriorityFilter((current) => (current === p ? null : p));

  const stripTiles = [
    { tone: "critical" as const, eyebrow: "Watch",         helper: "Threshold breached — immediate cost impact", icon: "⚠", numeral: counts.CRITICAL, primary: priorityFilter === null || priorityFilter === "CRITICAL", onClick: onTile("CRITICAL"), ariaLabel: `Watch · ${counts.CRITICAL} items · click to filter` },
    { tone: "high"     as const, eyebrow: "Elevated",      helper: "Significant movement — review models",      icon: "▲", numeral: counts.HIGH,     primary: priorityFilter === "HIGH",                                  onClick: onTile("HIGH"),     ariaLabel: `Elevated · ${counts.HIGH} items · click to filter` },
    { tone: "moderate" as const, eyebrow: "Stable",        helper: "Within normal range — monitor",             icon: "◎", numeral: counts.MODERATE, primary: priorityFilter === "MODERATE",                              onClick: onTile("MODERATE"), ariaLabel: `Stable · ${counts.MODERATE} items · click to filter` },
    { tone: "low"      as const, eyebrow: "Informational", helper: "Background awareness",                       icon: "◯", numeral: counts.LOW,      primary: priorityFilter === "LOW",                                   onClick: onTile("LOW"),      ariaLabel: `Informational · ${counts.LOW} items · click to filter` },
  ];

  const filteredTech = useMemo(
    () => priorityFilter ? techItems.filter((r) => r.priority === priorityFilter) : techItems,
    [techItems, priorityFilter]
  );
  const filteredPrice = useMemo(
    () => priorityFilter ? priceItems.filter((r) => r.priority === priorityFilter) : priceItems,
    [priceItems, priorityFilter]
  );

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
      : all.length;
  const jurisdictionsCount =
    aggregates && aggregates.totalJurisdictions > 0
      ? aggregates.totalJurisdictions
      : new Set(
          all
            .map((r) => (r.jurisdiction || "").trim())
            .filter(Boolean)
        ).size;
  const meta = `${dateStr} · ${itemsCount} ${itemsCount === 1 ? "item" : "items"} in scope · ${jurisdictionsCount} ${jurisdictionsCount === 1 ? "jurisdiction" : "jurisdictions"} in scope`;

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <EditorialMasthead
        title="Market Intelligence"
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
          placeholder="Ask anything about market intel — e.g. What's the cost outlook for SAF fuel?"
          chips={CHIPS}
        />

        <div className="flex" style={{ borderBottom: "1px solid var(--border-sub)" }}>
          <TabButton active={tab === "tech"} onClick={() => setTab("tech")}>Technology Readiness</TabButton>
          <TabButton active={tab === "prices"} onClick={() => setTab("prices")}>Price Signals &amp; Trade</TabButton>
        </div>

        {tab === "tech" && (
          <SectionTemplate
            section="tech"
            heading="Energy & Technology Innovation"
            subhead="Category-level tracking across transport energy and technology. Cost curves, deployment status, and policy signals."
            items={filteredTech}
            sectorProfile={sectorProfile}
            watchCount={counts.CRITICAL}
            elevatedCount={counts.HIGH}
            citationStats={citationStats}
            renderCategoryBody={(items) => <TechBody items={items} citationStats={citationStats} />}
          />
        )}
        {tab === "prices" && (
          <SectionTemplate
            section="prices"
            heading="Geopolitical & Market Signals"
            subhead="Commodity prices, carbon markets, trade restrictions, critical minerals, and shipping chokepoint monitoring."
            items={filteredPrice}
            sectorProfile={sectorProfile}
            watchCount={counts.CRITICAL}
            elevatedCount={counts.HIGH}
            citationStats={citationStats}
            renderCategoryBody={(items) => <PriceBody items={items} citationStats={citationStats} />}
            categoryHeaderHasWatch
          />
        )}
      </div>
    </div>
  );
}

// ── Shared section template (F11b parity) ─────────────────────────────
//
// Both tabs render the same structure. Differences are scoped to the
// renderCategoryBody callback (per-row content) and the heading text.

function SectionTemplate({
  section,
  heading,
  subhead,
  items,
  sectorProfile,
  watchCount,
  elevatedCount,
  citationStats,
  renderCategoryBody,
  categoryHeaderHasWatch = false,
}: {
  section: "tech" | "prices";
  heading: string;
  subhead: string;
  items: Resource[];
  sectorProfile?: string[];
  watchCount: number;
  elevatedCount: number;
  citationStats: SourceCitationStatsMap;
  renderCategoryBody: (items: Resource[]) => React.ReactNode;
  categoryHeaderHasWatch?: boolean;
}) {
  const groups = useMemo(() => groupByCategory(items), [items]);

  return (
    <section
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] grid-cols-1"
      style={{ alignItems: "start" }}
    >
      <div>
        <PanelHead title={heading} subtitle={subhead} />

        {/* POLICY ACCELERATION SIGNALS + FREIGHT FORWARDING RELEVANCE.
            Walkthrough P0: the FFR callout previously floated between
            PolicySignals and KeyMetricsRow, which on the tech tab read
            as freestanding even though its copy is about the SAF / fuel
            signals immediately above. Wrapping the two in a shared
            grouped surface and passing `attachedAbove` to FFR makes the
            visual association explicit — the callout reads as "these
            signals → here's what they mean for freight" instead of an
            ungrouped editorial aside. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            // Bottom margin preserves the gap to KeyMetricsRow that the
            // standalone FreightRelevanceCallout used to provide.
            marginBottom: 0,
          }}
        >
          <PolicySignals items={items} />
          <FreightRelevanceCallout
            section={section}
            sectorProfile={sectorProfile}
            attachedAbove
          />
        </div>

        {/* KEY METRICS rows with delta indicators */}
        <KeyMetricsRow items={items} citationStats={citationStats} />

        {/* COST TRAJECTORY chart (multi-vertical) */}
        <CostTrajectoryChart verticals={sectorProfile} />

        {/* Category accordions — preserved from prior MarketPage */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted)",
            margin: "20px 0 10px",
          }}
        >
          Categories
        </div>
        {groups.length === 0 ? (
          <EmptyState
            title={
              section === "tech"
                ? "Technology intelligence coming soon"
                : "Price signals coming soon"
            }
            body={
              section === "tech"
                ? "Battery, SAF, hydrogen, marine fuels, and other technology categories will appear here as coverage expands."
                : "Energy prices, carbon markets, critical minerals, trade restrictions, and chokepoints will appear here as coverage expands."
            }
          />
        ) : (
          <div className="space-y-3">
            {groups.map((g, i) => (
              <CategoryAccordion
                key={g.category}
                title={g.category}
                items={g.items}
                defaultOpen={false}
                renderBody={renderCategoryBody}
                modeBadges={Array.from(new Set(g.items.flatMap((it) => it.modes || [])))}
                showWatchIcon={categoryHeaderHasWatch}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-3 hidden lg:block">
        <WatchlistSidebar items={items} citationStats={citationStats} />
        <OwnersContent items={items} section={section} />

        {watchCount + elevatedCount > 0 ? (
          <SideCard label="Watch this week" tone="alert">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: "var(--high)", marginBottom: 6 }}>
              {watchCount + elevatedCount} {watchCount + elevatedCount === 1 ? "alert" : "alerts"}
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
              {watchCount} watch-level item{watchCount === 1 ? "" : "s"} and {elevatedCount} elevated movement{elevatedCount === 1 ? "" : "s"} across tracked
              {section === "tech" ? " technologies" : " price signals"}.
            </p>
          </SideCard>
        ) : (
          <SideCard label="Watch this week">
            <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
              No threshold-breach items active.
            </p>
          </SideCard>
        )}
        <SideCard label="Methodology">
          <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
            {section === "tech"
              ? "TRL bands per IEA. Lifecycle labels mapped from priority tier — Watch (critical), Elevated (high), Stable (moderate), Informational (low). Sources updated daily, weekly, or quarterly as marked."
              : "Price levels and trade signals sourced from primary regulators (EUR-Lex, CARB, UK DfT, Federal Register) and tier-1 commodity dashboards. Lifecycle labels mapped from priority tier."}
          </p>
        </SideCard>
      </aside>
    </section>
  );
}

// ── Per-tab content body renderers ────────────────────────────────────

function TechBody({ items, citationStats }: { items: Resource[]; citationStats: SourceCitationStatsMap }) {
  return (
    <>
      <Label>Key items</Label>
      <div className="space-y-2">
        {items.map((it) => {
          // Build 7: Q9 chip mounts. Mirror Build 8.1 ResearchView pattern.
          // CitationCountChip suppresses itself when count < 1. RecencyChip
          // omits if recency is absent. Both fall back gracefully when the
          // RPC was unavailable (citationStats is the empty map).
          const stat = it.sourceId ? citationStats[it.sourceId] : undefined;
          return (
            <Link
              key={it.id}
              href={`/regulations/${encodeURIComponent(it.id)}`}
              prefetch={false}
              style={{
                display: "block",
                background: "var(--bg)",
                border: "1px solid var(--border-sub)",
                borderRadius: "var(--r-sm)",
                padding: "12px 14px",
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
                transition: "background-color 120ms ease",
              }}
              className="hover:bg-[var(--raised)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{it.title}</div>
                <LifecyclePill priority={it.priority} />
              </div>
              {it.note && (
                <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginTop: 4 }}>{it.note}</div>
              )}
              {(stat && stat.count >= 1) || stat?.recency ? (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {stat && stat.count >= 1 && <CitationCountChip count={stat.count} />}
                  {stat?.recency && <RecencyChip timestamp={stat.recency} />}
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </>
  );
}

function PriceBody({ items, citationStats }: { items: Resource[]; citationStats: SourceCitationStatsMap }) {
  return (
    <div style={{ padding: "0 0 4px" }}>
      {items.map((it) => (
        <PriceRow key={it.id} item={it} citationStats={citationStats} />
      ))}
    </div>
  );
}

function PriceRow({ item, citationStats }: { item: Resource; citationStats: SourceCitationStatsMap }) {
  const stat = item.sourceId ? citationStats[item.sourceId] : undefined;
  return (
    // Card-level Link → /regulations/[slug] detail. No interactive
    // children inside; clean wrap.
    <Link
      href={`/regulations/${encodeURIComponent(item.id)}`}
      prefetch={false}
      style={{
        display: "block",
        background: "var(--bg)",
        margin: "6px 0",
        borderRadius: "var(--r-sm)",
        padding: "14px 16px",
        position: "relative",
        border: "1px solid var(--border-sub)",
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        transition: "background-color 120ms ease",
      }}
      className="hover:bg-[var(--raised)]"
    >
      <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{item.title}</div>
        <LifecyclePill priority={item.priority} />
      </div>
      {item.note && (
        <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 8 }}>
          {item.note}
        </div>
      )}
      {(item.whyMatters || item.note) && (
        <div
          style={{
            background: "var(--surface)",
            borderLeft: "3px solid var(--high)",
            borderRadius: "var(--r-sm)",
            padding: "10px 14px",
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          <b
            style={{
              display: "block",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--high)",
              marginBottom: 3,
            }}
          >
            Why this matters to your business
          </b>
          <span style={{ color: "var(--text)" }}>{item.whyMatters || item.note}</span>
        </div>
      )}
      {(stat && stat.count >= 1) || stat?.recency ? (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {stat && stat.count >= 1 && <CitationCountChip count={stat.count} />}
          {stat?.recency && <RecencyChip timestamp={stat.recency} />}
        </div>
      ) : null}
    </Link>
  );
}

// ── Legend / Tab / Shared UI helpers ──

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

function PanelHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
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
        {title}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)", margin: "0 0 18px", maxWidth: "88ch" }}>
        {subtitle}
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--muted)",
        margin: "16px 0 10px",
      }}
    >
      {children}
    </div>
  );
}

function LifecyclePill({ priority }: { priority: Resource["priority"] }) {
  const lc = LIFECYCLE[priority];
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 3,
        color: TONE_COLOR[lc.tone],
        background: `var(--${lc.tone}-bg)`,
        border: `1px solid var(--${lc.tone}-bd)`,
        whiteSpace: "nowrap",
      }}
    >
      {lc.label}
    </span>
  );
}

function CategoryAccordion({
  title,
  items,
  defaultOpen,
  renderBody,
  modeBadges,
  showWatchIcon,
}: {
  title: string;
  items: Resource[];
  defaultOpen?: boolean;
  renderBody: (items: Resource[]) => React.ReactNode;
  modeBadges?: string[];
  showWatchIcon?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const hasWatch = items.some((i) => i.priority === "CRITICAL");

  // Worst priority for the badge.
  const priorityRank = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 } as const;
  const top = [...items].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])[0];

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
          padding: "16px 20px",
          width: "100%",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          display: "grid",
          gridTemplateColumns: "36px 1fr auto",
          gap: 14,
          alignItems: "center",
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--r-sm)",
            background: "var(--accent-strip)",
            border: "1px solid var(--accent-strip-bd)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent)",
            fontSize: 16,
            fontFamily: "var(--font-display)",
          }}
        >
          ⏚
        </span>
        <span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{prettifyCategory(title)}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {(modeBadges || []).slice(0, 3).map((m) => (
              <span key={m} style={pillStyle}>
                {m.toUpperCase()}
              </span>
            ))}
            {top && <LifecyclePill priority={top.priority} />}
          </div>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {showWatchIcon && hasWatch && (
            <AlertTriangle size={14} style={{ color: "var(--high)" }} />
          )}
          <ChevronDown
            size={18}
            style={{
              color: "var(--muted)",
              transform: open ? "rotate(180deg)" : undefined,
              transition: "transform 180ms ease",
            }}
          />
        </span>
      </button>

      {open && (
        <div style={{ padding: "4px 20px 20px", borderTop: "1px solid var(--border-sub)" }}>
          {renderBody(items)}
        </div>
      )}
    </div>
  );
}

const pillStyle = {
  fontSize: 10,
  padding: "2px 8px",
  background: "var(--bg)",
  border: "1px solid var(--border-sub)",
  borderRadius: 3,
  color: "var(--text-2)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};

function SideCard({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "alert";
}) {
  const isAlert = tone === "alert";
  return (
    <div
      style={{
        background: isAlert ? "var(--high-bg)" : "var(--surface)",
        border: isAlert ? "1px solid var(--high-bd)" : "1px solid var(--border-sub)",
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
          color: isAlert ? "var(--high)" : "var(--muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
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
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>{title}</p>
      <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}

// ── Helpers ──

function groupByCategory(items: Resource[]): { category: string; items: Resource[] }[] {
  const map = new Map<string, Resource[]>();
  // Map normalized key → canonical display label. Normalization collapses
  // case and separator variants so an item with topic "technology" and
  // an item that falls back to the "Technology" fallback bucket do not
  // render as two adjacent identical accordions (the duplicate-category
  // render bug previously visible on /market). Canonical labels are
  // stored on first sighting so display casing is stable.
  const labelByKey = new Map<string, string>();
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[_\-\s]+/g, "");
  for (const it of items) {
    const fallback =
      it.type === "technology" || it.type === "innovation"
        ? "Technology"
        : it.type === "market_signal"
          ? "Market signal"
          : "Other";
    const raw = it.topic || it.sub || fallback;
    const key = normalize(raw);
    if (!labelByKey.has(key)) labelByKey.set(key, raw);
    const arr = map.get(key) || [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    category: labelByKey.get(key) || key,
    items,
  }));
}

function prettifyCategory(s: string): string {
  return s
    .split(/[_\-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
