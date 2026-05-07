"use client";

/**
 * RegulationsSurface — client wrapper for the /regulations page.
 *
 * Mounts the resource store, exposes search + chip-toggle filters
 * (priority / topic / region / sector / confidence), sort row, view
 * toggles, and bulk-select with bulk actions. The kanban view (default)
 * keeps the existing 4-column priority layout; new dense-list and table
 * views surface the full filtered set in alternate densities.
 *
 * Decision #1 wiring (DISPATCH E):
 *   - 28 sector chips (Dietl/Rockit cargo verticals)
 *   - CONFIDENCE facet (Resource.authorityLevel)
 *   - Sort row: newest / priority / confidence / alphabetical
 *   - View toggles: card grid / dense list / table
 *   - Bulk select with: Add to watchlist, Export TSV, Clear, Done
 *   - Save as default + Reset to my sectors persisted to localStorage
 *
 * Sector filtering wires through `matchResourceSector` so the chips
 * surface real items (no inert UI). Items without authority_level are
 * grouped under the "Unclassified" confidence chip so the facet is
 * honest about coverage.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { RowCard } from "@/components/ui/RowCard";
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { urgencyScore, scoreResource, matchResourceSector } from "@/lib/scoring";
import {
  PRIORITIES,
  PRIORITY_DISPLAY_LABEL,
  PRIORITY_DISPLAY_LABEL_SHORT,
  TOPICS,
  TOPIC_COLORS,
  JURISDICTIONS,
  MODES,
  AUTHORITY_LEVELS,
  type PriorityKey,
} from "@/lib/constants";
import type { Resource } from "@/types/resource";
import {
  REGULATIONS_SECTOR_CHIPS,
  SectorChipFilter,
} from "./SectorChipFilter";
import {
  ConfidenceFacet,
  CONFIDENCE_UNCLASSIFIED_ID,
} from "./ConfidenceFacet";
import { SortRow, authorityRank, type SortKey } from "./SortRow";
import { ViewToggles, type ViewMode } from "./ViewToggles";
import {
  BulkSelectBar,
  loadWatchlist,
  saveWatchlist,
} from "./BulkSelectBar";

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

const PRI_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MODERATE: 2,
  LOW: 3,
};

// ── localStorage keys for filter persistence (regulations-scoped) ──
// Separate from the global `fsi-saved-filters` key so this surface
// can capture sectors/confidence/view/sort without colliding with
// the simpler dashboard-level filter defaults.
const REG_DEFAULTS_KEY = "fsi-regulations-defaults";

interface RegulationsDefaults {
  sectors: string[];
  confidence: string[];
  priorities: string[];
  topics: string[];
  regions: string[];
  modes: string[];
  sort: SortKey;
  view: ViewMode;
}

function loadDefaults(): RegulationsDefaults | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REG_DEFAULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as RegulationsDefaults;
  } catch {
    return null;
  }
}

function saveDefaults(d: RegulationsDefaults): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REG_DEFAULTS_KEY, JSON.stringify(d));
  } catch {
    // ignore quota errors
  }
}

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

  const [activePriorities, setActivePriorities] =
    useState<Set<string>>(initialPrioritySet);
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const [activeModes, setActiveModes] = useState<Set<string>>(new Set());
  const [activeSectors, setActiveSectors] = useState<Set<string>>(new Set());
  const [activeConfidence, setActiveConfidence] = useState<Set<string>>(
    new Set()
  );
  // Default closed per intended-use rule: never auto-open by default.
  // User clicks to expand filters when they want to filter.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [sort, setSort] = useState<SortKey>("priority");
  const [view, setView] = useState<ViewMode>("kanban");

  // Bulk selection state.
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Saved-defaults state — null means "no saved default exists yet". The
  // banner reads this to enable/disable the Reset action.
  const [savedDefaults, setSavedDefaults] =
    useState<RegulationsDefaults | null>(null);

  // Toast for save / reset / watchlist confirmation.
  const [toast, setToast] = useState<string | null>(null);

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  // ── Hydrate from saved defaults on mount ─────────────────────────────
  useEffect(() => {
    const d = loadDefaults();
    setSavedDefaults(d);
    if (d) {
      setActiveSectors(new Set(d.sectors || []));
      setActiveConfidence(new Set(d.confidence || []));
      // Only override the URL-driven priority initial state if the user
      // saved an explicit priority preference. Otherwise the URL wins.
      if (Array.isArray(d.priorities) && d.priorities.length > 0) {
        setActivePriorities(new Set(d.priorities));
      }
      setActiveTopics(new Set(d.topics || []));
      setActiveRegions(new Set(d.regions || []));
      setActiveModes(new Set(d.modes || []));
      if (d.sort) setSort(d.sort);
      if (d.view) setView(d.view);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resource hydration & scoring ────────────────────────────────────
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

  // ── Filtering ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regulatory.filter((r) => {
      if (activePriorities.size > 0 && !activePriorities.has(r.priority))
        return false;
      if (activeTopics.size > 0 && !activeTopics.has(r.topic || r.sub))
        return false;
      if (activeRegions.size > 0 && !activeRegions.has(r.jurisdiction || ""))
        return false;
      if (activeModes.size > 0) {
        const modes = r.modes || [r.cat];
        if (!modes.some((m) => activeModes.has(m))) return false;
      }
      // Sector filter via ALL_SECTORS keyword inference. OR semantics.
      if (activeSectors.size > 0) {
        const matched = matchResourceSector(r, [...activeSectors]);
        if (!matched) return false;
      }
      // Confidence filter via authorityLevel; "unclassified" matches
      // items with no authorityLevel set.
      if (activeConfidence.size > 0) {
        const lvl = r.authorityLevel;
        const key = lvl ?? CONFIDENCE_UNCLASSIFIED_ID;
        if (!activeConfidence.has(key)) return false;
      }
      if (q) {
        const hay = `${r.title} ${r.note} ${(r.tags || []).join(" ")} ${
          r.whatIsIt || ""
        } ${r.whyMatters || ""} ${r.jurisdiction || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    regulatory,
    search,
    activePriorities,
    activeTopics,
    activeRegions,
    activeModes,
    activeSectors,
    activeConfidence,
  ]);

  // ── Sort ───────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case "newest":
        return arr.sort((a, b) => (b.added || "").localeCompare(a.added || ""));
      case "priority":
        return arr.sort(
          (a, b) =>
            (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9)
        );
      case "confidence":
        return arr.sort(
          (a, b) =>
            authorityRank(a.authorityLevel) - authorityRank(b.authorityLevel)
        );
      case "alpha":
        return arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      default:
        return arr;
    }
  }, [filtered, sort]);

  // ── Kanban grouping ────────────────────────────────────────────────
  const groups = useMemo(() => {
    const out: Record<string, Resource[]> = {
      CRITICAL: [],
      HIGH: [],
      MODERATE: [],
      LOW: [],
    };
    for (const r of sorted) {
      if (out[r.priority]) out[r.priority].push(r);
    }
    return out;
  }, [sorted]);

  // ── Per-facet counts (computed against the regulatory total, not the
  //     filtered set, so chip counts always show full coverage) ───────
  const counts = useMemo(() => {
    const priC: Record<string, number> = {};
    const topC: Record<string, number> = {};
    const regC: Record<string, number> = {};
    const modC: Record<string, number> = {};
    const secC: Record<string, number> = {};
    const confC: Record<string, number> = {};
    for (const r of regulatory) {
      priC[r.priority] = (priC[r.priority] || 0) + 1;
      const topic = r.topic || r.sub;
      if (topic) topC[topic] = (topC[topic] || 0) + 1;
      if (r.jurisdiction) regC[r.jurisdiction] = (regC[r.jurisdiction] || 0) + 1;
      const modes = r.modes || [r.cat];
      modes.forEach((m) => {
        modC[m] = (modC[m] || 0) + 1;
      });
      // Sector counts: count once per sector chip the item matches.
      for (const chip of REGULATIONS_SECTOR_CHIPS) {
        if (matchResourceSector(r, [chip.id])) {
          secC[chip.id] = (secC[chip.id] || 0) + 1;
        }
      }
      // Confidence counts: bucket by authorityLevel or "unclassified".
      const lvl = r.authorityLevel ?? CONFIDENCE_UNCLASSIFIED_ID;
      confC[lvl] = (confC[lvl] || 0) + 1;
    }
    return {
      pri: priC,
      topic: topC,
      region: regC,
      mode: modC,
      sector: secC,
      confidence: confC,
    };
  }, [regulatory]);

  // ── Filter helpers ─────────────────────────────────────────────────
  function isolate(
    set: Set<string>,
    val: string,
    setter: (s: Set<string>) => void
  ) {
    if (set.size === 1 && set.has(val)) {
      setter(new Set());
    } else {
      setter(new Set([val]));
    }
  }

  function toggleMember(
    set: Set<string>,
    val: string,
    setter: (s: Set<string>) => void
  ) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  function isolatePriority(p: PriorityKey) {
    setActivePriorities((prev) => {
      if (prev.size === 1 && prev.has(p)) {
        return new Set(PRIORITIES);
      }
      return new Set([p]);
    });
  }

  // ── Save / reset ──────────────────────────────────────────────────
  function handleSaveAsDefault() {
    const d: RegulationsDefaults = {
      sectors:    [...activeSectors],
      confidence: [...activeConfidence],
      priorities: [...activePriorities],
      topics:     [...activeTopics],
      regions:    [...activeRegions],
      modes:      [...activeModes],
      sort,
      view,
    };
    saveDefaults(d);
    setSavedDefaults(d);
    flashToast("Saved as default filter combination");
  }

  function handleResetToMySectors() {
    // Reset = restore the workspace sector profile as the active sector
    // chip selection. If the workspace has no sector profile, the chips
    // are simply cleared (sector-agnostic view).
    setActiveSectors(new Set(sectorProfile));
    setActiveConfidence(new Set());
    setActiveTopics(new Set());
    setActiveRegions(new Set());
    setActiveModes(new Set());
    setActivePriorities(new Set(PRIORITIES));
    setSort("priority");
    setView("kanban");
    flashToast(
      sectorProfile.length > 0
        ? `Reset to your ${sectorProfile.length} workspace sector(s)`
        : "Reset filters (no workspace sectors set)"
    );
  }

  function handleClearSavedDefault() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(REG_DEFAULTS_KEY);
    }
    setSavedDefaults(null);
    flashToast("Cleared saved default");
  }

  // ── Bulk select ───────────────────────────────────────────────────
  function toggleBulkMode() {
    setBulkMode((v) => {
      if (v) setSelected(new Set()); // exiting bulk mode clears
      return !v;
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(sorted.map((r) => r.id)));
  }

  function clearSelected() {
    setSelected(new Set());
  }

  function addSelectedToWatchlist(ids: string[]) {
    const wl = loadWatchlist();
    ids.forEach((id) => wl.add(id));
    saveWatchlist(wl);
    flashToast(`Added ${ids.length} to watchlist`);
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

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 18,
            right: 18,
            zIndex: 100,
            padding: "10px 14px",
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-bd)",
            color: "var(--accent)",
            borderRadius: "var(--r-md)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            boxShadow: "var(--shadow)",
          }}
        >
          {toast}
        </div>
      )}

      {/* Bulk action bar (sticky when active) */}
      <BulkSelectBar
        active={bulkMode}
        selected={selected}
        resources={sorted}
        onClear={clearSelected}
        onExitBulkMode={() => {
          setBulkMode(false);
          setSelected(new Set());
        }}
        onAddToWatchlist={addSelectedToWatchlist}
      />

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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
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
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--muted)",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <SortRow value={sort} onChange={setSort} />
          <ViewToggles value={view} onChange={setView} />

          <button
            onClick={toggleBulkMode}
            aria-pressed={bulkMode}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: bulkMode ? "var(--accent)" : "var(--surface)",
              border: `1px solid ${bulkMode ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--r-sm)",
              padding: "6px 12px",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: bulkMode ? "white" : "var(--text-2)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {bulkMode ? "Bulk: ON" : "Bulk select"}
          </button>

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
            <span
              style={{
                fontSize: 10,
                transition: "transform 0.2s ease",
                transform: filtersOpen ? "rotate(0)" : "rotate(180deg)",
              }}
            >
              ▴
            </span>
          </button>
        </div>

        {filtersOpen && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              paddingTop: 8,
            }}
          >
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
                const tone = p.toLowerCase() as
                  | "critical"
                  | "high"
                  | "moderate"
                  | "low";
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

            <SectorChipFilter
              active={activeSectors}
              counts={counts.sector}
              onToggle={(id) => toggleMember(activeSectors, id, setActiveSectors)}
              onClear={() => setActiveSectors(new Set())}
              onResetToMySectors={() =>
                setActiveSectors(new Set(sectorProfile))
              }
              hasMySectors={sectorProfile.length > 0}
            />

            <ConfidenceFacet
              active={activeConfidence}
              counts={counts.confidence}
              onToggle={(id) =>
                toggleMember(activeConfidence, id, setActiveConfidence)
              }
            />

            {/* Save-default action row */}
            <div
              style={{
                display: "flex",
                gap: 8,
                paddingTop: 8,
                borderTop: "1px solid var(--border-sub)",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={handleSaveAsDefault}
                style={smallActionBtnStyle()}
              >
                Save as default
              </button>
              <button
                type="button"
                onClick={handleResetToMySectors}
                style={smallActionBtnStyle()}
                title="Reset filters and restore your workspace sector profile"
              >
                Reset to my sectors
              </button>
              {savedDefaults && (
                <button
                  type="button"
                  onClick={handleClearSavedDefault}
                  style={{
                    ...smallActionBtnStyle(),
                    color: "var(--muted)",
                  }}
                >
                  Clear saved default
                </button>
              )}
              <span style={{ flex: 1 }} />
              {savedDefaults && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  Default saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Result count headline. */}
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
              ? `${sorted.length} matching your sector profile · ${platformTotal} platform total`
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
          <b style={{ color: "var(--accent)" }}>{sorted.length}</b> Regulations
          {platformTotal !== null && platformTotal !== sorted.length && (
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

        {bulkMode && (
          <button
            type="button"
            onClick={selectAllVisible}
            style={smallActionBtnStyle()}
          >
            Select all visible ({sorted.length})
          </button>
        )}
      </div>

      {/* View body */}
      {view === "kanban" && (
        <KanbanView
          groups={groups}
          bulkMode={bulkMode}
          selected={selected}
          onToggleSelected={toggleSelected}
        />
      )}
      {view === "list" && (
        <DenseListView
          rows={sorted}
          bulkMode={bulkMode}
          selected={selected}
          onToggleSelected={toggleSelected}
        />
      )}
      {view === "table" && (
        <TableView
          rows={sorted}
          bulkMode={bulkMode}
          selected={selected}
          onToggleSelected={toggleSelected}
        />
      )}
    </div>
  );
}

// ── Kanban view ─────────────────────────────────────────────────────────

function KanbanView({
  groups,
  bulkMode,
  selected,
  onToggleSelected,
}: {
  groups: Record<string, Resource[]>;
  bulkMode: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
}) {
  return (
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
                items.map((r) => (
                  <KanbanCard
                    key={r.id}
                    r={r}
                    tone={col.tone}
                    bulkMode={bulkMode}
                    isSelected={selected.has(r.id)}
                    onToggleSelected={() => onToggleSelected(r.id)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ── Dense list view ───────────────────────────────────────────────────

function DenseListView({
  rows,
  bulkMode,
  selected,
  onToggleSelected,
}: {
  rows: Resource[];
  bulkMode: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 13,
          background: "var(--surface)",
          border: "1px solid var(--border-sub)",
          borderRadius: "var(--r-md)",
        }}
      >
        No regulations match the current filters.
      </div>
    );
  }
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r) => {
        const tone = r.priority.toLowerCase() as
          | "critical"
          | "high"
          | "moderate"
          | "low";
        const c = TONE_VARS[tone];
        const due = formatDue(r);
        const conf = r.authorityLevel
          ? AUTHORITY_LEVELS.find((a) => a.id === r.authorityLevel)
          : null;
        const isSelected = selected.has(r.id);
        const Wrapper: React.ElementType = bulkMode ? "div" : Link;
        const wrapperProps = bulkMode
          ? { onClick: () => onToggleSelected(r.id) }
          : { href: `/regulations/${encodeURIComponent(r.id)}` };
        return (
          <Wrapper
            key={r.id}
            {...wrapperProps}
            style={{
              display: "grid",
              gridTemplateColumns: bulkMode
                ? "32px 80px 1fr auto auto auto"
                : "80px 1fr auto auto auto",
              gap: 12,
              alignItems: "center",
              padding: "10px 14px",
              background: isSelected ? "var(--accent-bg)" : "var(--surface)",
              border: `1px solid ${
                isSelected ? "var(--accent-bd)" : "var(--border-sub)"
              }`,
              borderLeft: `3px solid ${c.color}`,
              borderRadius: "var(--r-sm)",
              textDecoration: "none",
              color: "inherit",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {bulkMode && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelected(r.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${r.title}`}
              />
            )}
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: c.color,
              }}
            >
              {PRIORITY_DISPLAY_LABEL_SHORT[r.priority as PriorityKey]}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.title}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              {r.jurisdiction || "GLOBAL"}
            </span>
            {conf && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 6px",
                  background: conf.bg,
                  color: conf.color,
                  border: `1px solid ${conf.border}`,
                  borderRadius: 3,
                }}
              >
                {conf.short}
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                color: "var(--text-2)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 72,
                textAlign: "right",
              }}
            >
              {due || "—"}
            </span>
          </Wrapper>
        );
      })}
    </section>
  );
}

// ── Table view ───────────────────────────────────────────────────────

function TableView({
  rows,
  bulkMode,
  selected,
  onToggleSelected,
}: {
  rows: Resource[];
  bulkMode: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 13,
          background: "var(--surface)",
          border: "1px solid var(--border-sub)",
          borderRadius: "var(--r-md)",
        }}
      >
        No regulations match the current filters.
      </div>
    );
  }
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "inherit",
          fontSize: 12,
        }}
      >
        <thead>
          <tr
            style={{
              background: "var(--bg)",
              textAlign: "left",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {bulkMode && <th style={cellStyle(true)} />}
            <th style={cellStyle(true)}>ID</th>
            <th style={cellStyle(true)}>Title</th>
            <th style={cellStyle(true)}>Priority</th>
            <th style={cellStyle(true)}>Jurisdiction</th>
            <th style={cellStyle(true)}>Topic</th>
            <th style={cellStyle(true)}>Confidence</th>
            <th style={cellStyle(true)}>Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = r.priority.toLowerCase() as
              | "critical"
              | "high"
              | "moderate"
              | "low";
            const c = TONE_VARS[tone];
            const due = formatDue(r);
            const conf = r.authorityLevel
              ? AUTHORITY_LEVELS.find((a) => a.id === r.authorityLevel)
              : null;
            const isSelected = selected.has(r.id);
            return (
              <tr
                key={r.id}
                onClick={() => {
                  if (bulkMode) onToggleSelected(r.id);
                }}
                style={{
                  borderTop: "1px solid var(--border-sub)",
                  background: isSelected ? "var(--accent-bg)" : "transparent",
                  cursor: bulkMode ? "pointer" : "default",
                }}
              >
                {bulkMode && (
                  <td style={cellStyle(false)}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelected(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${r.title}`}
                    />
                  </td>
                )}
                <td
                  style={{
                    ...cellStyle(false),
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--muted)",
                  }}
                >
                  {r.id}
                </td>
                <td style={cellStyle(false)}>
                  {bulkMode ? (
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>
                      {r.title}
                    </span>
                  ) : (
                    <Link
                      href={`/regulations/${encodeURIComponent(r.id)}`}
                      style={{
                        color: "var(--text)",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {r.title}
                    </Link>
                  )}
                </td>
                <td style={cellStyle(false)}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: c.color,
                    }}
                  >
                    {PRIORITY_DISPLAY_LABEL_SHORT[r.priority as PriorityKey]}
                  </span>
                </td>
                <td style={cellStyle(false)}>
                  {(r.jurisdiction || "global").toUpperCase()}
                </td>
                <td style={cellStyle(false)}>{r.topic || r.sub || "—"}</td>
                <td style={cellStyle(false)}>
                  {conf ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        background: conf.bg,
                        color: conf.color,
                        border: `1px solid ${conf.border}`,
                        borderRadius: 3,
                      }}
                    >
                      {conf.short}
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td
                  style={{
                    ...cellStyle(false),
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {due || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function cellStyle(isHeader: boolean): React.CSSProperties {
  return {
    padding: isHeader ? "10px 12px" : "10px 12px",
    textAlign: "left",
    verticalAlign: "middle",
  };
}

// ── Local subcomponents ──────────────────────────────────────────────

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
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
  bulkMode,
  isSelected,
  onToggleSelected,
}: {
  r: Resource;
  tone: "critical" | "high" | "moderate" | "low";
  bulkMode: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
}) {
  const c = TONE_VARS[tone];
  const due = formatDue(r);
  const jurisLabel =
    JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction;
  const tags = (r.tags || []).slice(0, 3);

  const inner = (
    <RowCard priority={tone} padding="sm">
      {bulkMode && (
        <div style={{ marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelected}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${r.title}`}
          />
        </div>
      )}
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
          ? `${r.jurisdiction.toUpperCase()}${
              jurisLabel ? ` · ${jurisLabel}` : ""
            }`
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
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            marginTop: 6,
          }}
        >
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
  );

  if (bulkMode) {
    return (
      <div
        onClick={onToggleSelected}
        style={{
          cursor: "pointer",
          opacity: isSelected ? 1 : 0.92,
          outline: isSelected ? "2px solid var(--accent)" : "none",
          borderRadius: "var(--r-sm)",
        }}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/regulations/${encodeURIComponent(r.id)}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      {inner}
    </Link>
  );
}

function smallActionBtnStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "6px 10px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-2)",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };
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
  if (days < 0)
    return future.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  if (days <= 365) return `${days} days`;
  return future.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}
