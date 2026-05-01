"use client";

/**
 * MarketPage — /market route.
 *
 * Matches design_handoff_2026-04/preview/market-intel.html:
 *   - EditorialMasthead
 *   - Watch / Elevated / Stable / Informational legend
 *   - 4-up StatStrip with Watch primary tile
 *   - AiPromptBar with market chips
 *   - Tabs: "Technology Readiness" | "Price Signals & Trade"
 *
 * Data sources (from intelligence_items):
 *   - Tech tab: items where item_type IN ("technology", "innovation").
 *     Grouped by category column (Resource.topic).
 *   - Price Signals tab: items where item_type === "market_signal".
 *     Grouped by category, surfaced as price-row cards with the
 *     "Why this matters to your business" call-out (item.whyMatters).
 *
 * Lifecycle labels (Watch / Elevated / Stable / Informational) map from
 * the existing severity/priority field per the design_handoff lifecycle
 * table:
 *   CRITICAL → Watch
 *   HIGH     → Elevated
 *   MODERATE → Stable
 *   LOW      → Informational
 */

import { useMemo, useState } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { StatStrip, type StatTone } from "@/components/shell/StatStrip";
import type { Resource } from "@/types/resource";

interface MarketPageProps {
  initialResources: Resource[];
}

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

// Lifecycle label mapping from priority. Watch is the urgency-equivalent
// of CRITICAL on this surface; Elevated/Stable/Informational follow.
const LIFECYCLE: Record<Resource["priority"], { tone: StatTone; label: string }> = {
  CRITICAL: { tone: "critical", label: "Watch" },
  HIGH:     { tone: "high",     label: "Elevated" },
  MODERATE: { tone: "moderate", label: "Stable" },
  LOW:      { tone: "low",      label: "Informational" },
};

export function MarketPage({ initialResources }: MarketPageProps) {
  const [tab, setTab] = useState<"tech" | "prices">("tech");

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

  const stripTiles = [
    { tone: "critical" as const, eyebrow: "Watch",         helper: "Threshold breached — immediate cost impact", icon: "⚠", numeral: counts.CRITICAL, primary: true },
    { tone: "high"     as const, eyebrow: "Elevated",      helper: "Significant movement — review models",      icon: "▲", numeral: counts.HIGH },
    { tone: "moderate" as const, eyebrow: "Stable",        helper: "Within normal range — monitor",             icon: "◎", numeral: counts.MODERATE },
    { tone: "low"      as const, eyebrow: "Informational", helper: "Background awareness",                       icon: "◯", numeral: counts.LOW },
  ];

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <EditorialMasthead
        title="Market Intelligence"
        meta="Track how emerging technology, commodity prices, and trade policy shifts will affect your freight costs and carrier options."
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

        {tab === "tech" && <TechnologyPanel items={techItems} watchCount={counts.CRITICAL} elevatedCount={counts.HIGH} />}
        {tab === "prices" && <PriceSignalsPanel items={priceItems} watchCount={counts.CRITICAL} />}
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

// ── Technology Readiness Panel ──

function TechnologyPanel({
  items,
  watchCount,
  elevatedCount,
}: {
  items: Resource[];
  watchCount: number;
  elevatedCount: number;
}) {
  const groups = useMemo(() => groupByCategory(items), [items]);

  return (
    <section
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] grid-cols-1"
      style={{ alignItems: "start" }}
    >
      <div>
        <PanelHead
          title="Energy & Technology Innovation"
          subtitle="Category-level tracking across transport energy and technology. Cost curves, deployment status, and policy signals."
        />

        {groups.length === 0 ? (
          <EmptyState
            title="Technology intelligence not yet ingested"
            body="Battery, SAF, hydrogen, marine fuels, and other technology categories will populate as the worker writes item_type = 'technology' or 'innovation' records."
          />
        ) : (
          <div className="space-y-3">
            {groups.map((g, i) => (
              <CategoryAccordion
                key={g.category}
                title={g.category}
                items={g.items}
                defaultOpen={i === 0}
                renderBody={(items) => <TechBody items={items} />}
                modeBadges={Array.from(new Set(g.items.flatMap((it) => it.modes || [])))}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-3 hidden lg:block">
        {watchCount + elevatedCount > 0 ? (
          <SideCard label="Watch this week" tone="alert">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: "var(--high)", marginBottom: 6 }}>
              {watchCount + elevatedCount} {watchCount + elevatedCount === 1 ? "alert" : "alerts"}
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
              {watchCount} watch-level item{watchCount === 1 ? "" : "s"} and {elevatedCount} elevated movement{elevatedCount === 1 ? "" : "s"} across tracked technologies.
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
            TRL bands per IEA. Lifecycle labels mapped from priority tier — Watch (critical), Elevated (high), Stable (moderate), Informational (low). Sources updated daily, weekly, or quarterly as marked.
          </p>
        </SideCard>
      </aside>
    </section>
  );
}

function TechBody({ items }: { items: Resource[] }) {
  return (
    <>
      <Label>Key items</Label>
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border-sub)",
              borderRadius: "var(--r-sm)",
              padding: "12px 14px",
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{it.title}</div>
              <LifecyclePill priority={it.priority} />
            </div>
            {it.note && (
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginTop: 4 }}>{it.note}</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Price Signals & Trade Panel ──

function PriceSignalsPanel({ items, watchCount }: { items: Resource[]; watchCount: number }) {
  const groups = useMemo(() => groupByCategory(items), [items]);

  return (
    <section
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] grid-cols-1"
      style={{ alignItems: "start" }}
    >
      <div>
        <PanelHead
          title="Geopolitical & Market Signals"
          subtitle="Commodity prices, carbon markets, trade restrictions, critical minerals, and shipping chokepoint monitoring."
        />

        {groups.length === 0 ? (
          <EmptyState
            title="Price signals not yet ingested"
            body="Energy prices, carbon markets, critical minerals, trade restrictions, and chokepoints will populate as the worker writes item_type = 'market_signal' records."
          />
        ) : (
          <div className="space-y-3">
            {groups.map((g, i) => (
              <PriceCategoryAccordion key={g.category} group={g} defaultOpen={i === 0} />
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-3 hidden lg:block">
        {watchCount > 0 ? (
          <SideCard label={watchCount === 1 ? "1 threshold breached" : `${watchCount} thresholds breached`} tone="alert">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: "var(--high)", marginBottom: 6 }}>
              {watchCount}
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
              Items at watch level — review carrier surcharge and customer pass-through clauses.
            </p>
          </SideCard>
        ) : (
          <SideCard label="No active breaches">
            <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
              All tracked price signals are within normal range.
            </p>
          </SideCard>
        )}
      </aside>
    </section>
  );
}

function PriceCategoryAccordion({ group, defaultOpen }: { group: { category: string; items: Resource[] }; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const hasWatch = group.items.some((i) => i.priority === "CRITICAL");

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "14px 20px",
          width: "100%",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted)",
            padding: "3px 8px",
            background: "var(--bg)",
            border: "1px solid var(--border-sub)",
            borderRadius: 3,
          }}
        >
          {categoryTag(group.category)}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{prettifyCategory(group.category)}</span>
        {hasWatch && (
          <AlertTriangle size={14} style={{ color: "var(--high)", marginLeft: "auto", marginRight: 8 }} />
        )}
        <ChevronDown
          size={18}
          style={{
            color: "var(--muted)",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 180ms ease",
            marginLeft: hasWatch ? 0 : "auto",
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {group.items.map((it) => (
            <PriceRow key={it.id} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function PriceRow({ item }: { item: Resource }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        margin: "6px 0",
        borderRadius: "var(--r-sm)",
        padding: "14px 16px",
        position: "relative",
        border: "1px solid var(--border-sub)",
      }}
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
    </div>
  );
}

// ── Shared UI helpers ──

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
}: {
  title: string;
  items: Resource[];
  defaultOpen?: boolean;
  renderBody: (items: Resource[]) => React.ReactNode;
  modeBadges?: string[];
}) {
  const [open, setOpen] = useState(!!defaultOpen);

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
  for (const it of items) {
    const key = it.topic || it.sub || "Uncategorized";
    const arr = map.get(key) || [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}

function prettifyCategory(s: string): string {
  return s
    .split(/[_\-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function categoryTag(s: string): string {
  // Short pill text for the price-cat header, e.g. "Energy prices".
  const t = prettifyCategory(s);
  return t.length > 24 ? t.slice(0, 22) + "…" : t;
}
