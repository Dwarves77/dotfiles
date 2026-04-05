"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Toast } from "@/components/ui/Toast";
import { TabBar } from "@/components/TabBar";
import { NavigationStack } from "@/components/NavigationStack";
import { FocusView } from "@/components/FocusView";
import { ExportBuilder } from "@/components/ExportBuilder";
import { BackToTop } from "@/components/BackToTop";

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
}: DashboardProps) {
  const { resources: platformResources, archived: platformArchived, setResources, setArchived, filters, sort, expandedId, setExpanded, overrides } =
    useResourceStore();
  const { tab, focusView } = useNavigationStore();
  const settings = useSettingsStore();
  const { toggleSelection, selectedIds } = useExportStore();
  const { setSources, setProvisionalSources, setOpenConflicts } = useSourceStore();
  const jurisdictionWeights = useWorkspaceStore((s) => s.jurisdictionWeights);

  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
  }, []);

  // Initialize resources on mount
  useEffect(() => {
    const scored = initialResources.map((r) => ({
      ...r,
      urgencyScore: urgencyScore(r, jurisdictionWeights),
      impactScores: scoreResource(r),
    }));
    setResources(scored);
    setArchived(initialArchived);
  }, [initialResources, initialArchived, setResources, setArchived]);

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

  // Initialize source data on mount
  useEffect(() => {
    setSources(initialSources);
    setProvisionalSources(initialProvisionalSources);
    setOpenConflicts(initialOpenConflicts);
  }, [initialSources, initialProvisionalSources, initialOpenConflicts, setSources, setProvisionalSources, setOpenConflicts]);

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
  const isSourcesTab = tab === "sources";

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {/* Header */}
        <header className="mb-4 flex items-start justify-between">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              {APP_NAME}
            </h1>
            <p
              className="text-xs font-medium tracking-wide uppercase mt-0.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {APP_TAGLINE}
            </p>
          </div>
          <UserMenu />
        </header>

        {/* Tab Bar */}
        <TabBar />

        {/* Navigation */}
        <NavigationStack />

        {/* ── HOME TAB ── */}
        {tab === "home" && !focusView && (
          <div className="space-y-6 mt-4">
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {settings.showTopUrgency && <TopUrgency resources={resources} />}
              {settings.showDueThisQuarter && <DueThisQuarter resources={resources} />}
            </div>
            {settings.showSupersessions && supersessions.length > 0 && (
              <Supersessions supersessions={supersessions} resourceMap={resourceMap} />
            )}
          </div>
        )}

        {/* ── DOMAIN TABS (Regulations, Technology, Regional, Geopolitical, Facilities, Research) ── */}
        {(isDomainTab || focusView) && (
          <div className="space-y-4 mt-4">
            {!focusView && (
              <div
                className="sticky top-[49px] z-20 pb-3 space-y-3 backdrop-blur-sm"
                style={{ backgroundColor: "var(--color-background)" }}
              >
                <SearchBar />
                <FilterBar />
                <div
                  className="flex items-center justify-between pb-3 border-b"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  <SortSelector />
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

            {!focusView && (
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

        {/* ── SOURCES TAB (Domain 5) ── */}
        {isSourcesTab && !focusView && (
          <div className="mt-4">
            <SourceHealthDashboard />
          </div>
        )}

        {/* ── TECHNOLOGY TAB (Domain 2) ── */}
        {tab === "technology" && !focusView && (
          <div className="mt-4">
            <TechnologyTracker />
          </div>
        )}

        {/* ── REGIONAL TAB (Domain 3) ── */}
        {tab === "regional" && !focusView && (
          <div className="mt-4">
            <RegionalIntelligence />
          </div>
        )}

        {/* ── GEOPOLITICAL TAB (Domain 4) ── */}
        {tab === "geopolitical" && !focusView && (
          <div className="mt-4">
            <GeopoliticalSignals />
          </div>
        )}

        {/* ── FACILITIES TAB (Domain 6) ── */}
        {tab === "facilities" && !focusView && (
          <div className="mt-4">
            <FacilityOptimization />
          </div>
        )}

        {/* ── RESEARCH TAB (Domain 7) ── */}
        {tab === "research" && !focusView && (
          <div className="mt-4">
            <ResearchPipeline />
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
