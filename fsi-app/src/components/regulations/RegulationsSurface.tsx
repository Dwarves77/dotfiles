"use client";

/**
 * RegulationsSurface — client wrapper for the /regulations page.
 *
 * Mounts the resource store, exposes search + chip-toggle filters
 * (priority / topic / region), and renders a 4-column kanban grouped by
 * priority (Critical / High / Moderate / Low) using <RowCard>.
 *
 * Layout matches design_handoff_2026-04/preview/regulations.html:
 *   - Toolbar row: search input + collapsible filter section
 *   - Filter rows: Mode / Priority / Topic / Region chip toggles
 *   - Result count "<N> Regulations" headline
 *   - 4-column kanban with tinted column backgrounds, swatch + count headers,
 *     priority-tinted RowCards inside.
 *
 * Card content: jurisdiction tag (uppercase), title, ID line, due-date
 * bottom row, topic chips. Click → /regulations/[id].
 *
 * The masthead (EditorialMasthead + 4-up DashboardHero stat strip) is
 * rendered server-side in app/regulations/page.tsx.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { RowCard } from "@/components/ui/RowCard";
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { urgencyScore, scoreResource } from "@/lib/scoring";
import {
  PRIORITIES,
  PRIORITY_DISPLAY_LABEL,
  PRIORITY_DISPLAY_LABEL_SHORT,
  TOPICS,
  TOPIC_COLORS,
  JURISDICTIONS,
  MODES,
  type PriorityKey,
} from "@/lib/constants";
import type { Resource } from "@/types/resource";

interface RegulationsSurfaceProps {
  initialResources: Resource[];
  initialArchived: Resource[];
  initialOverrides?: {
    itemId: string;
    priorityOverride: string | null;
    isArchived: boolean;
    archiveReason: string | null;
    archiveNote: string | null;
    notes: string;
  }[];
  // Platform-total regulation count (regardless of sector profile). Used
  // to render the "<matched> matching your sector profile · <total>
  // platform total" tooltip on the count heading. Null when Supabase is
  // not reachable — heading degrades to the matched count alone.
  platformTotal?: number | null;
  // Initial priority filter from ?priority=CRITICAL etc. Drives the
  // dashboard tile → regulations deep link. Falls back to "all priorities
  // active" when null/invalid.
  initialPriorityFilter?: string | null;
}

// Column titles use the shared PRIORITY_DISPLAY_LABEL editorial vocabulary
// so kanban headers, filter chips, sidebar badges, and stat tiles all
// speak one language. The lower-case `tone` is the visual key into
// TONE_VARS only.
const PRIORITY_COLUMNS: Array<{
  key: PriorityKey;
  title: string;
  tone: "critical" | "high" | "moderate" | "low";
}> = [
  { key: "CRITICAL", title: PRIORITY_DISPLAY_LABEL.CRITICAL, tone: "critical" },
  { key: "HIGH",     title: PRIORITY_DISPLAY_LABEL.HIGH,     tone: "high" },
  { key: "MODERATE", title: PRIORITY_DISPLAY_LABEL.MODERATE, tone: "moderate" },
  { key: "LOW",      title: PRIORITY_DISPLAY_LABEL.LOW,      tone: "low" },
];

const TONE_VARS: Record<
  "critical" | "high" | "moderate" | "low",
  { color: string; bg: string; bd: string }
> = {
  critical: { color: "var(--critical)", bg: "var(--critical-bg)", bd: "var(--critical-bd)" },
  high:     { color: "var(--high)",     bg: "var(--high-bg)",     bd: "var(--high-bd)" },
  moderate: { color: "var(--moderate)", bg: "var(--moderate-bg)", bd: "var(--moderate-bd)" },
  low:      { color: "var(--low)",      bg: "var(--low-bg)",      bd: "var(--low-bd)" },
};

export function RegulationsSurface({
  initialResources,
  initialArchived,
  initialOverrides = [],
  platformTotal = null,
  initialPriorityFilter = null,
}: RegulationsSurfaceProps) {
  const {
    resources: platformResources,
    setResources,
    setArchived,
    overrides,
    setOverrides,
  } = useResourceStore();
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const sectorWeights = useWorkspaceStore((s) => s.sectorWeights);
  const jurisdictionWeights = useWorkspaceStore((s) => s.jurisdictionWeights);

  const [search, setSearch] = useState("");
  // Honor ?priority=CRITICAL etc. on first paint so dashboard tile clicks
  // land on the priority-filtered kanban. Validates against the closed
  // PriorityKey vocabulary; anything else falls back to "all priorities".
  const initialPrioritySet = useMemo<Set<string>>(() => {
    const upper = (initialPriorityFilter || "").toUpperCase();
    if (PRIORITIES.includes(upper as PriorityKey)) {
      return new Set([upper]);
    }
    return new Set(PRIORITIES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activePriorities, setActivePriorities] = useState<Set<string>>(
    initialPrioritySet
  );
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const [activeModes, setActiveModes] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    const sectorCtx = { activeSectors: sectorProfile, sectorWeights };
    const scored = initialResources.map((r) => ({
      ...r,
      urgencyScore: urgencyScore(r, jurisdictionWeights, sectorCtx),
      impactScores: scoreResource(r),
    }));
    setResources(scored);
    setArchived(initialArchived);
    if (initialOverrides.length > 0) setOverrides(initialOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResources]);

  const effectiveResources =
    platformResources.length > 0 ? platformResources : initialResources;
  const { active: resources } = useMemo(
    () => mergeWithOverrides(effectiveResources, overrides),
    [effectiveResources, overrides]
  );

  // Domain 1 = regulatory only on this page.
  const regulatory = useMemo(
    () => resources.filter((r) => (r.domain || 1) === 1),
    [resources]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regulatory.filter((r) => {
      if (activePriorities.size > 0 && !activePriorities.has(r.priority)) return false;
      if (activeTopics.size > 0 && !activeTopics.has(r.topic || r.sub)) return false;
      if (activeRegions.size > 0 && !activeRegions.has(r.jurisdiction || "")) return false;
      if (activeModes.size > 0) {
        const modes = r.modes || [r.cat];
        if (!modes.some((m) => activeModes.has(m))) return false;
      }
      if (q) {
        const hay = `${r.title} ${r.note} ${(r.tags || []).join(" ")} ${
          r.whatIsIt || ""
        } ${r.whyMatters || ""} ${r.jurisdiction || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [regulatory, search, activePriorities, activeTopics, activeRegions, activeModes]);

  const groups = useMemo(() => {
    const out: Record<string, Resource[]> = {
      CRITICAL: [],
      HIGH: [],
      MODERATE: [],
      LOW: [],
    };
    for (const r of filtered) {
      if (out[r.priority]) out[r.priority].push(r);
    }
    return out;
  }, [filtered]);

  const counts = useMemo(() => {
    const priC: Record<string, number> = {};
    const topC: Record<string, number> = {};
    const regC: Record<string, number> = {};
    const modC: Record<string, number> = {};
    for (const r of regulatory) {
      priC[r.priority] = (priC[r.priority] || 0) + 1;
      const topic = r.topic || r.sub;
      if (topic) topC[topic] = (topC[topic] || 0) + 1;
      if (r.jurisdiction) regC[r.jurisdiction] = (regC[r.jurisdiction] || 0) + 1;
      const modes = r.modes || [r.cat];
      modes.forEach((m) => {
        modC[m] = (modC[m] || 0) + 1;
      });
    }
    return { pri: priC, topic: topC, region: regC, mode: modC };
  }, [regulatory]);

  // Isolate-on-click semantics for priority, topic, and mode chips per
  // the audit. First click on a chip narrows to that chip alone; clicking
  // the same chip again restores the full set. Clicking a different chip
  // isolates to that one. Empty `allValues` means "no filter active" —
  // we re-create that state by clearing the set.
  //
  // Behaviour matrix:
  //   Set is empty (no filter)    + click X → isolate to {X}
  //   Set is {X} (only X)         + click X → clear (back to no filter)
  //   Set is {X} (only X)         + click Y → isolate to {Y}
  //   Set has many                 + click X → isolate to {X}
  function isolate(set: Set<string>, val: string, setter: (s: Set<string>) => void) {
    if (set.size === 1 && set.has(val)) {
      setter(new Set());
    } else {
      setter(new Set([val]));
    }
  }

  // Priority filters use a slightly different convention because the
  // initial state is "all priorities active". When user clicks one,
  // isolate to it; clicking it again restores ALL priorities.
  function isolatePriority(p: PriorityKey) {
    setActivePriorities((prev) => {
      if (prev.size === 1 && prev.has(p)) {
        return new Set(PRIORITIES);
      }
      return new Set([p]);
    });
  }

  return (
    <div className="px-9 pt-8 pb-16 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <AiPromptBar
          placeholder="Ask anything about your regulations — e.g. What's due in the next 30 days?"
          chips={[
            "What's due in 30 days?",
            "What changed this week?",
            "CBAM obligations Q2",
          ]}
        />
      </div>

      {/* Toolbar */}
      <div
        className="cl-reg-toolbar"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-sub)",
          borderRadius: "var(--r-lg)",
          padding: "14px 16px",
          marginBottom: 22,
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              minWidth: 220,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 999,
            }}
          >
            <Search size={14} style={{ color: "var(--muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, tags, jurisdiction…"
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                background: "transparent",
                fontFamily: "inherit",
                fontSize: 13,
                color: "var(--text)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted)" }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--accent-bg)",
              border: "1px solid var(--accent-bd)",
              borderRadius: "var(--r-sm)",
              padding: "7px 14px",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--accent)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Filters
            <span style={{ fontSize: 10, transition: "transform 0.2s ease", transform: filtersOpen ? "rotate(0)" : "rotate(180deg)" }}>
              ▴
            </span>
          </button>
        </div>

        {filtersOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
            <FilterRow label="Mode">
              {MODES.map((m) => (
                <Chip
                  key={m.id}
                  label={m.label}
                  active={activeModes.has(m.id)}
                  count={counts.mode[m.id]}
                  onClick={() => isolate(activeModes, m.id, setActiveModes)}
                />
              ))}
            </FilterRow>
            <FilterRow label="Priority">
              {PRIORITIES.map((p) => {
                const isOn = activePriorities.has(p);
                const tone = p.toLowerCase() as "critical" | "high" | "moderate" | "low";
                const c = TONE_VARS[tone];
                return (
                  <button
                    key={p}
                    onClick={() => isolatePriority(p)}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: `1px solid ${isOn ? c.bd : "var(--border)"}`,
                      background: isOn ? c.bg : "var(--surface)",
                      color: isOn ? c.color : "var(--text-2)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: isOn ? c.color : "var(--text-2)",
                        display: "inline-block",
                      }}
                    />
                    {PRIORITY_DISPLAY_LABEL_SHORT[p]}
                    {counts.pri[p] !== undefined && (
                      <span style={{ opacity: 0.7, fontWeight: 600 }}>
                        {counts.pri[p]}
                      </span>
                    )}
                  </button>
                );
              })}
            </FilterRow>
            <FilterRow label="Topic">
              {TOPICS.filter((t) => counts.topic[t.id]).map((t) => (
                <Chip
                  key={t.id}
                  label={t.label}
                  active={activeTopics.has(t.id)}
                  count={counts.topic[t.id]}
                  color={TOPIC_COLORS[t.id]}
                  onClick={() => isolate(activeTopics, t.id, setActiveTopics)}
                />
              ))}
            </FilterRow>
            <FilterRow label="Region">
              {JURISDICTIONS.filter((j) => counts.region[j.id]).map((j) => (
                <Chip
                  key={j.id}
                  label={j.label}
                  active={activeRegions.has(j.id)}
                  count={counts.region[j.id]}
                  onClick={() =>
                    isolate(activeRegions, j.id, setActiveRegions)
                  }
                />
              ))}
            </FilterRow>
          </div>
        )}
      </div>

      {/* Result count headline.
          Tooltip surfaces the gap the audit flagged: the page count is
          sector-filtered ("123 matching your sector profile"), while
          the platform total ("182 regulations tracked") is what the
          masthead meta line shows. Tooltip + footnote keep both numbers
          honest. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          padding: "0 2px",
        }}
      >
        <div
          title={
            platformTotal !== null
              ? `${filtered.length} matching your sector profile · ${platformTotal} platform total`
              : undefined
          }
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text)",
            cursor: platformTotal !== null ? "help" : "default",
          }}
        >
          <b style={{ color: "var(--accent)" }}>{filtered.length}</b> Regulations
          {platformTotal !== null && platformTotal !== filtered.length && (
            <span
              style={{
                fontFamily: "inherit",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "none",
                color: "var(--muted)",
                marginLeft: 12,
                fontWeight: 400,
              }}
            >
              of {platformTotal} platform total
            </span>
          )}
        </div>
      </div>

      {/* Kanban — 4 columns by priority */}
      <section
        className="cl-reg-kanban"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}
      >
        <style>{`
          @media (max-width: 1100px) { .cl-reg-kanban { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (max-width: 640px)  { .cl-reg-kanban { grid-template-columns: 1fr !important; } }
        `}</style>
        {PRIORITY_COLUMNS.map((col) => {
          const c = TONE_VARS[col.tone];
          const items = groups[col.key] || [];
          return (
            <div
              key={col.key}
              style={{
                background: `linear-gradient(180deg, ${c.bg} 0%, var(--raised) 60%)`,
                border: `1px solid ${c.bd}`,
                borderRadius: "var(--r-lg)",
                padding: "14px 12px 16px",
                minHeight: 400,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0 6px 12px",
                  borderBottom: "1px solid var(--border-sub)",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: c.color,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: c.color,
                      display: "inline-block",
                    }}
                  />
                  {col.title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 24,
                    lineHeight: 1,
                    color: c.color,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {items.length}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.length === 0 ? (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      textAlign: "center",
                      padding: "12px 4px",
                    }}
                  >
                    No regulations in this column.
                  </p>
                ) : (
                  items.map((r) => <KanbanCard key={r.id} r={r} tone={col.tone} />)
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ── Local subcomponents ──────────────────────────────────────────────────────

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr",
        gap: 12,
        alignItems: "start",
        padding: "6px 2px",
        borderTop: "1px solid var(--border-sub)",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          paddingTop: 8,
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {children}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  count,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--accent-bd)" : "var(--border)"}`,
        background: active ? "var(--accent-bg)" : "var(--surface)",
        color: active ? "var(--accent)" : "var(--text-2)",
        cursor: "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderLeft: color ? `3px solid ${color}` : undefined,
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{ opacity: 0.7, fontWeight: 600, fontSize: 10.5 }}>
          {count}
        </span>
      )}
    </button>
  );
}

function KanbanCard({
  r,
  tone,
}: {
  r: Resource;
  tone: "critical" | "high" | "moderate" | "low";
}) {
  const c = TONE_VARS[tone];
  const due = formatDue(r);
  const jurisLabel =
    JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction;
  const tags = (r.tags || []).slice(0, 3);

  return (
    <Link
      href={`/regulations/${encodeURIComponent(r.id)}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <RowCard priority={tone} padding="sm">
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 4,
          }}
        >
          {r.jurisdiction
            ? `${r.jurisdiction.toUpperCase()}${jurisLabel ? ` · ${jurisLabel}` : ""}`
            : "GLOBAL"}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text)",
            lineHeight: 1.3,
            marginBottom: 6,
          }}
        >
          {r.title}
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  padding: "2px 6px",
                  background: "var(--bg)",
                  borderRadius: 3,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "var(--text-2)",
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--border-sub)",
          }}
        >
          <span style={{ fontFamily: "ui-monospace, monospace" }}>{r.id}</span>
          {due && (
            <span
              style={{
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: c.color,
              }}
            >
              {due}
            </span>
          )}
        </div>
      </RowCard>
    </Link>
  );
}

function formatDue(r: Resource): string | null {
  // Pull the next future timeline milestone, or fallback to complianceDeadline.
  const candidates: string[] = [];
  if (r.timeline) {
    for (const t of r.timeline) {
      if (t.status !== "past") candidates.push(t.date);
    }
  }
  if (r.complianceDeadline) candidates.push(r.complianceDeadline);
  if (candidates.length === 0) return null;
  // Earliest future date
  const future = candidates
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!future) return null;
  const now = new Date();
  const days = Math.round(
    (future.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 0) return future.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days <= 365) return `${days} days`;
  return future.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
