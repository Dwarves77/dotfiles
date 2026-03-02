"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { AmbientOrbs } from "@/components/ui/AmbientOrbs";
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

// Explore
import { FilterBar } from "@/components/explore/FilterBar";
import { SearchBar } from "@/components/explore/SearchBar";
import { SortSelector } from "@/components/explore/SortSelector";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { ResourceDetail } from "@/components/resource/ResourceDetail";

// Settings
import { DashboardSettings } from "@/components/settings/DashboardSettings";
import { ArchiveViewer } from "@/components/settings/ArchiveViewer";
import { DataSummary } from "@/components/settings/DataSummary";
import { SupersessionHistory } from "@/components/settings/SupersessionHistory";

// Stores
import { useResourceStore } from "@/stores/resourceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useExportStore } from "@/stores/exportStore";

// Logic
import { urgencyScore, scoreResource, filterResources, sortResources } from "@/lib/scoring";
import { useScrollToResource } from "@/hooks/useScrollToResource";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

// Data
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";

interface DashboardProps {
  initialResources: Resource[];
  initialArchived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  auditDate: string;
}

export function Dashboard({
  initialResources,
  initialArchived,
  changelog,
  disputes,
  xrefPairs,
  supersessions,
  auditDate,
}: DashboardProps) {
  const { resources, archived, setResources, setArchived, filters, sort, expandedId, setExpanded } =
    useResourceStore();
  const { tab, focusView } = useNavigationStore();
  const settings = useSettingsStore();
  const { toggleSelection, selectedIds } = useExportStore();

  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
  }, []);

  // Initialize resources on mount
  useEffect(() => {
    // Compute urgency scores and impact scores
    const scored = initialResources.map((r) => ({
      ...r,
      urgencyScore: urgencyScore(r),
      impactScores: scoreResource(r),
    }));
    setResources(scored);
    setArchived(initialArchived);
  }, [initialResources, initialArchived, setResources, setArchived]);

  // Build resource map for lookups
  const resourceMap = useMemo(() => {
    const map = new Map<string, Resource>();
    resources.forEach((r) => map.set(r.id, r));
    archived.forEach((r) => map.set(r.id, r));
    return map;
  }, [resources, archived]);

  // Filter and sort for Explore
  const displayResources = useMemo(() => {
    let items = focusView
      ? focusView.resourceIds
          .map((id) => resources.find((r) => r.id === id))
          .filter(Boolean) as Resource[]
      : resources;

    items = filterResources(items, filters);
    items = sortResources(items, sort);
    return items;
  }, [resources, focusView, filters, sort]);

  // Auto-scroll on expand
  useScrollToResource(expandedId);

  return (
    <div className="relative min-h-screen bg-[var(--navy)]">
      <AmbientOrbs />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-6">
        {/* Header */}
        <header className="mb-6">
          <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-tight text-white">
            {APP_NAME}
          </h1>
          <p className="text-xs font-light tracking-[0.2em] uppercase text-[var(--sage)] mt-1">
            {APP_TAGLINE}
          </p>
          <div className="mt-3 h-px bg-gradient-to-r from-white/15 via-white/5 to-transparent" />
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

        {/* ── EXPLORE TAB ── */}
        {(tab === "explore" || focusView) && (
          <div className="space-y-4 mt-4">
            {!focusView && (
              <>
                <SearchBar />
                <FilterBar />
                <div className="flex items-center justify-between">
                  <SortSelector />
                  <span className="text-xs text-[var(--sage)] tabular-nums">
                    {displayResources.length} resource{displayResources.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </>
            )}

            {focusView && <FocusView resources={resources} />}

            {!focusView && (
              <div className="space-y-2">
                {displayResources.map((r) => (
                  <div key={r.id}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelection(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3 h-3 accent-[var(--cyan)] cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <ResourceCard resource={r} />
                      </div>
                    </div>
                    {expandedId === r.id && (
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
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && !focusView && (
          <div className="space-y-8 mt-4">
            <DashboardSettings />
            <div className="h-px bg-white/6" />
            <DataSummary resources={resources} archived={archived} />
            <div className="h-px bg-white/6" />
            <SupersessionHistory supersessions={supersessions} resourceMap={resourceMap} />
            <div className="h-px bg-white/6" />
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
