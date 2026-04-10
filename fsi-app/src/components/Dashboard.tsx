"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Toast } from "@/components/ui/Toast";
import { TabBar } from "@/components/TabBar";
import { NavigationStack } from "@/components/NavigationStack";
import { FocusView } from "@/components/FocusView";
import { ExportBuilder } from "@/components/ExportBuilder";
import { BackToTop } from "@/components/BackToTop";
import { PageContext } from "@/components/ui/PageContext";
import { AiPromptBar } from "@/components/ui/AiPromptBar";

// Home
import { SummaryStrip } from "@/components/home/SummaryStrip";
import { WeeklyBriefing } from "@/components/home/WeeklyBriefing";
import { WhatChanged } from "@/components/home/WhatChanged";
import { TopUrgency } from "@/components/home/TopUrgency";
import { DueThisQuarter } from "@/components/home/DueThisQuarter";
import { Supersessions } from "@/components/home/Supersessions";

// Explore (now serves domain tabs)
import { FilterBar } from "@/components/explore/FilterBar";
import { SearchBar } from "@/components/explore/SearchBar";
import { SortSelector } from "@/components/explore/SortSelector";
import { TimelineView } from "@/components/explore/TimelineView";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { ResourceDetail } from "@/components/resource/ResourceDetail";

// Sources
import { SourceHealthDashboard } from "@/components/sources/SourceHealthDashboard";

// Domain Views
import { TechnologyTracker } from "@/components/domains/TechnologyTracker";
import { RegionalIntelligence } from "@/components/domains/RegionalIntelligence";
import { GeopoliticalSignals } from "@/components/domains/GeopoliticalSignals";
import { ResearchPipeline } from "@/components/domains/ResearchPipeline";
import { FacilityOptimization } from "@/components/domains/FacilityOptimization";

// Map
import dynamic from "next/dynamic";
const MapView = dynamic(() => import("@/components/map/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-[calc(100vh-200px)] text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading map...</div>,
});

// Settings
import { DashboardSettings } from "@/components/settings/DashboardSettings";
import { ArchiveViewer } from "@/components/settings/ArchiveViewer";
import { DataSummary } from "@/components/settings/DataSummary";
import { SupersessionHistory } from "@/components/settings/SupersessionHistory";

// Stores
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useExportStore } from "@/stores/exportStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { UserMenu } from "@/components/auth/UserMenu";
import { AskAssistant } from "@/components/AskAssistant";

// Logic
import { urgencyScore, scoreResource, filterResources, sortResources } from "@/lib/scoring";
import { useScrollToResource } from "@/hooks/useScrollToResource";
import { APP_NAME, APP_TAGLINE, TOPIC_COLORS, DOMAINS } from "@/lib/constants";
import { cn } from "@/lib/cn";

// Data
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import type { Source, ProvisionalSource, SourceConflict } from "@/types/source";

// Domain tab → domain number mapping
const DOMAIN_TAB_MAP: Record<string, number> = {
  regulations: 1,
  technology: 2,
  regional: 3,
  geopolitical: 4,
  sources: 5,
  facilities: 6,
  research: 7,
};

// Tabs that show the resource explorer (only Domain 1 — regulations use the legacy resource list)
const DOMAIN_TABS = new Set(["regulations"]);

interface DashboardProps {
  initialResources: Resource[];
  initialArchived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  auditDate: string;
  initialSources?: Source[];
  initialProvisionalSources?: ProvisionalSource[];
  initialOpenConflicts?: SourceConflict[];
  /** Override the active page — when set, ignores navigationStore.tab */
  page?: string;
}

export function Dashboard({
  initialResources,
  initialArchived,
  changelog,
  disputes,
  xrefPairs,
  supersessions,
  auditDate,
  initialSources = [],
  initialProvisionalSources = [],
  initialOpenConflicts = [],
  page,
}: DashboardProps) {
  const { resources: platformResources, archived: platformArchived, setResources, setArchived, filters, sort, expandedId, setExpanded, overrides } =
    useResourceStore();
  const { tab: storeTab, focusView } = useNavigationStore();
  // Use page prop (from URL routing) if provided, otherwise fall back to store tab
  const tab = page || storeTab;
  const settings = useSettingsStore();
  const loadSettings = useSettingsStore((s) => s.loadFromWorkspace);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const { toggleSelection, selectedIds } = useExportStore();
  const { setSources, setProvisionalSources, setOpenConflicts } = useSourceStore();
  const jurisdictionWeights = useWorkspaceStore((s) => s.jurisdictionWeights);

  const [regView, setRegView] = useState<"list" | "timeline">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
  }, []);

  // Initialize resources on mount
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const sectorWeightsWs = useWorkspaceStore((s) => s.sectorWeights);
  const { initSessionSectors } = useResourceStore();

  useEffect(() => {
    const sectorCtx = { activeSectors: sectorProfile, sectorWeights: sectorWeightsWs };
    const scored = initialResources.map((r) => ({
      ...r,
      urgencyScore: urgencyScore(r, jurisdictionWeights, sectorCtx),
      impactScores: scoreResource(r),
    }));
    setResources(scored);
    setArchived(initialArchived);
    // Initialize session sector filter from workspace profile
    initSessionSectors(sectorProfile);
  }, [initialResources, initialArchived, setResources, setArchived, sectorProfile]);

  // Merge platform data with workspace overrides
  const { active: resources, archived: workspaceArchived } = useMemo(
    () => mergeWithOverrides(platformResources, overrides),
    [platformResources, overrides]
  );
  // Combined archived: platform archived + workspace archived
  const archived = useMemo(
    () => [...platformArchived, ...workspaceArchived],
    [platformArchived, workspaceArchived]
  );

  // Initialize source data on mount (only when data is provided)
  useEffect(() => {
    if (initialSources.length > 0) setSources(initialSources);
    if (initialProvisionalSources.length > 0) setProvisionalSources(initialProvisionalSources);
    if (initialOpenConflicts.length > 0) setOpenConflicts(initialOpenConflicts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load workspace settings from Supabase on mount
  useEffect(() => {
    if (!settingsLoaded) {
      // Use the dev workspace org ID — will be dynamic once auth context provides org
      loadSettings("a0000000-0000-0000-0000-000000000001");
    }
  }, [settingsLoaded, loadSettings]);

  // Build resource map for lookups
  const resourceMap = useMemo(() => {
    const map = new Map<string, Resource>();
    resources.forEach((r) => map.set(r.id, r));
    archived.forEach((r) => map.set(r.id, r));
    return map;
  }, [resources, archived]);

  // Current domain number (if on a domain tab)
  const currentDomain = DOMAIN_TAB_MAP[tab] || null;

  // Filter and sort for domain views
  const displayResources = useMemo(() => {
    let items = focusView
      ? focusView.resourceIds
          .map((id) => resources.find((r) => r.id === id))
          .filter(Boolean) as Resource[]
      : resources;

    // Domain filtering: all existing legacy resources are Domain 1 (Regulatory)
    // When on a domain tab, only show items matching that domain
    if (currentDomain && !focusView) {
      if (currentDomain === 1) {
        // All legacy resources are regulatory — show them all on Domain 1
        // Once intelligence_items table is live, this filters by item.domain
      } else {
        // Domains 2-7 have no legacy resources yet — show empty state
        items = [];
      }
    }

    items = filterResources(items, filters);
    items = sortResources(items, sort);
    return items;
  }, [resources, focusView, filters, sort, currentDomain]);

  // Auto-scroll on expand
  useScrollToResource(expandedId);

  // Is this a domain-browsing tab?
  const isDomainTab = DOMAIN_TABS.has(tab);
  // Sources tab merged into Research tab

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {/* Navigation Stack (for focus views / back button) */}
        <NavigationStack />

        {/* ── HOME TAB ── */}
        {tab === "home" && !focusView && (
          <div className="space-y-6 mt-4">
            <PageContext
              context={`Your freight operations are affected by ${resources.length} tracked regulations across ${new Set(resources.map((r) => r.jurisdiction)).size} jurisdictions. Here's what needs your attention.`}
              aiPlaceholder="Ask anything — 'What regulations affect my EU shipments?' or 'What changed this week?'"
            />
            {settings.showSummaryStrip && (
              <SummaryStrip
                resources={resources}
                changelog={changelog}
                disputes={disputes}
              />
            )}
            {settings.showWeeklyBriefing && (
              <WeeklyBriefing
                resources={resources}
                changelog={changelog}
                disputes={disputes}
                auditDate={auditDate}
                onToast={showToast}
              />
            )}
            {settings.showWhatChanged && (
              <WhatChanged resources={resources} changelog={changelog} auditDate={auditDate} />
            )}
            {settings.showDueThisQuarter && <DueThisQuarter resources={resources} />}
            {settings.showSupersessions && supersessions.length > 0 && (
              <Supersessions supersessions={supersessions} resourceMap={resourceMap} />
            )}
          </div>
        )}

        {/* ── DOMAIN TABS (Regulations, Technology, Regional, Geopolitical, Facilities, Research) ── */}
        {(isDomainTab || focusView) && (
          <div className="space-y-4 mt-4">
            {!focusView && tab === "regulations" && (
              <PageContext
                context="These regulations affect customs clearance, packaging, fuel costs, and carbon reporting for freight shipments. Sorted by how urgently they require action."
                aiPlaceholder="Ask — 'What do I need to do before shipping to the EU in 2026?' or 'Which regulations affect air cargo?'"
              />
            )}
            {!focusView && (
              <div
                className="sticky top-0 z-20 pb-3 space-y-3"
                style={{ backgroundColor: "var(--color-background)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1"><SearchBar /></div>
                  <button
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    className="shrink-0 px-3 py-2 text-xs font-medium rounded-md border cursor-pointer transition-colors"
                    style={{
                      borderColor: filtersOpen ? "var(--color-active-border)" : "var(--color-border)",
                      backgroundColor: filtersOpen ? "var(--color-active-bg)" : "transparent",
                      color: filtersOpen ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    }}
                  >
                    Filters {filtersOpen ? "▲" : "▼"}
                  </button>
                </div>
                {filtersOpen && <FilterBar />}
                <div
                  className="flex items-center justify-between pb-3 border-b"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  <div className="flex items-center gap-3">
                    <SortSelector />
                    <div className="flex gap-1">
                      {(["list", "timeline"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setRegView(v)}
                          className="px-2 py-1 text-[11px] font-medium rounded-md border cursor-pointer transition-colors"
                          style={{
                            borderColor: regView === v ? "var(--color-active-border)" : "var(--color-border)",
                            backgroundColor: regView === v ? "var(--color-active-bg)" : "transparent",
                            color: regView === v ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                          }}
                        >
                          {v === "list" ? "List" : "Timeline"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span
                    className="text-xs tabular-nums text-right"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {displayResources.length} resource{displayResources.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            )}

            {focusView && (
              <FocusView
                resources={resources}
                changelog={changelog}
                disputes={disputes}
                xrefPairs={xrefPairs}
                supersessions={supersessions}
                resourceMap={resourceMap}
                onToast={showToast}
              />
            )}

            {/* Timeline View */}
            {!focusView && regView === "timeline" && (
              <TimelineView resources={displayResources} />
            )}

            {/* List View */}
            {!focusView && regView === "list" && (
              <div className="flex flex-col gap-2">
                {displayResources.length === 0 ? (
                  <DomainEmptyState domain={currentDomain} hasFilters={filters.search !== "" || filters.modes.length > 0 || filters.topics.length > 0 || filters.jurisdictions.length > 0 || filters.priorities.length > 0} />
                ) : (
                  displayResources.map((r) => {
                    const isExpanded = expandedId === r.id;
                    const topicColor = TOPIC_COLORS[r.topic || ""] || undefined;
                    return (
                      <div key={r.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(r.id)}
                          onChange={() => toggleSelection(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "w-3 h-3 mt-4 cursor-pointer shrink-0 transition-opacity accent-[var(--color-primary)]",
                            !selectedIds.includes(r.id) && "opacity-40 hover:opacity-100"
                          )}
                        />
                        <div
                          id={`resource-${r.id}`}
                          className={cn(
                            "flex-1 min-w-0 border rounded-lg card-expand",
                            isExpanded
                              ? "border-[var(--color-border-strong)]"
                              : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:-translate-y-px"
                          )}
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: topicColor || "var(--color-border)",
                            backgroundColor: "var(--surface-card)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
                            transition: "all 200ms ease",
                          }}
                        >
                          <ResourceCard resource={r} embedded />
                          {isExpanded && (
                            <ResourceDetail
                              resource={r}
                              changelog={changelog}
                              disputes={disputes}
                              xrefPairs={xrefPairs}
                              supersessions={supersessions}
                              resourceMap={resourceMap}
                              onToast={showToast}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ── MARKET INTELLIGENCE (Technology + Geopolitical merged) ── */}
        {tab === "technology" && !focusView && (
          <MergedSection
            label="Market Intelligence"
            subtitle="Track how emerging technology, commodity prices, and trade policy shifts will affect your freight costs and carrier options."
            aiPlaceholder="Ask — 'What's the cost outlook for SAF fuel?' or 'How will carbon pricing affect ocean freight rates?'"
            tabs={[
              { id: "tech", label: "Technology Readiness", content: <TechnologyTracker /> },
              { id: "geo", label: "Price Signals & Trade", content: <GeopoliticalSignals /> },
            ]}
          />
        )}

        {/* ── OPERATIONS (Regional + Facilities merged) ── */}
        {tab === "regional" && !focusView && (
          <MergedSection
            label="Operations Intelligence"
            subtitle="Before operating in a new region, understand what it will cost and what rules apply. Energy costs, labor rates, and sustainability requirements by location."
            aiPlaceholder="Ask — 'What are warehouse costs in Dubai?' or 'What EV charging infrastructure exists in the EU?'"
            tabs={[
              { id: "regional", label: "By Jurisdiction", content: <RegionalIntelligence /> },
              { id: "facilities", label: "Facility Data", content: <FacilityOptimization /> },
            ]}
          />
        )}

        {/* ── RESEARCH & SOURCES (merged) ── */}
        {tab === "research" && !focusView && (
          <MergedSection
            label="Research & Sources"
            subtitle="We track where our data comes from and flag when academic research is about to change industry standards. This helps you trust the data and stay ahead."
            aiPlaceholder="Ask — 'What research affects carbon accounting standards?' or 'How reliable is our EU ETS data?'"
            tabs={[
              { id: "research", label: "Research Pipeline", content: <ResearchPipeline /> },
              { id: "sources", label: "Source Registry", content: <SourceHealthDashboard /> },
            ]}
          />
        )}

        {/* ── MAP TAB ── */}
        {tab === "map" && !focusView && (
          <div className="mt-4 border rounded-lg overflow-hidden -mx-4 sm:mx-0" style={{ borderColor: "var(--color-border)" }}>
            <MapView
              resources={resources}
              changelog={changelog}
              disputes={disputes}
              xrefPairs={xrefPairs}
              supersessions={supersessions}
              resourceMap={resourceMap}
              onToast={showToast}
            />
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && !focusView && (
          <div className="space-y-8 mt-4">
            <DashboardSettings />
            <div className="h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />
            <DataSummary resources={resources} archived={archived} />
            <div className="h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />
            <SupersessionHistory supersessions={supersessions} resourceMap={resourceMap} />
            <div className="h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />
            <ArchiveViewer />
          </div>
        )}
      </div>

      {/* Export Builder */}
      <ExportBuilder
        resources={resources}
        changelog={changelog}
        disputes={disputes}
        onToast={showToast}
      />

      {/* AI Assistant */}
      <AskAssistant />

      {/* Back to Top */}
      <BackToTop />

      {/* Toast */}
      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast({ message: "", visible: false })}
      />
    </div>
  );
}

// ── Domain Empty State ──

function DomainEmptyState({ domain, hasFilters }: { domain: number | null; hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          No resources match your filters
        </p>
        <p className="text-xs mt-1 max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
          Try adjusting your search or filter criteria.
        </p>
      </div>
    );
  }

  const domainDef = DOMAINS.find((d) => d.id === domain);
  const domainMessages: Record<number, { title: string; description: string }> = {
    2: {
      title: "Technology intelligence coming soon",
      description: "Battery technology, SAF, hydrogen, marine fuels, EVs, solar — category tracking across energy and transport innovation.",
    },
    3: {
      title: "Regional intelligence coming soon",
      description: "Energy tariffs, labor costs, solar permitting, EV charging infrastructure, and green building requirements by jurisdiction.",
    },
    4: {
      title: "Geopolitical signals coming soon",
      description: "Commodity prices, carbon market data, trade restrictions, critical minerals, and shipping chokepoint monitoring.",
    },
    5: {
      title: "Source intelligence",
      description: "Switch to the Sources tab to view the source registry, trust metrics, and health monitoring.",
    },
    6: {
      title: "Facility optimization coming soon",
      description: "Electricity tariffs, solar ROI calculations, BESS pricing, labor benchmarks, and green building certification by location.",
    },
    7: {
      title: "Research pipeline coming soon",
      description: "Academic research relevant to freight and logistics sustainability across all transport modes and sectors.",
    },
  };

  const msg = domain ? domainMessages[domain] : null;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "var(--color-surface-raised)" }}
      >
        <span className="text-lg" style={{ color: "var(--color-text-muted)" }}>
          {domain || "?"}
        </span>
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        {msg?.title || "No items in this domain yet"}
      </p>
      <p className="text-xs mt-1 max-w-md" style={{ color: "var(--color-text-secondary)" }}>
        {msg?.description || `${domainDef?.label || "This domain"} will be populated as the source monitoring system ingests intelligence items.`}
      </p>
    </div>
  );
}

// ── Merged Section with internal tabs ──

function MergedSection({
  label,
  subtitle,
  aiPlaceholder,
  tabs,
}: {
  label: string;
  subtitle: string;
  aiPlaceholder?: string;
  tabs: { id: string; label: string; content: React.ReactNode }[];
}) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          {label}
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          {subtitle}
        </p>
      </div>
      {aiPlaceholder && <AiPromptBar placeholder={aiPlaceholder} />}

      {/* Internal tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "relative px-3 py-2 text-sm font-medium cursor-pointer transition-colors",
              activeTab === t.id
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            )}
          >
            {t.label}
            {activeTab === t.id && (
              <span
                className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                style={{ backgroundColor: "var(--color-primary)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Active content */}
      {tabs.find((t) => t.id === activeTab)?.content}
    </div>
  );
}
