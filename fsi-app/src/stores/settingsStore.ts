"use client";

import { create } from "zustand";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { ListSurfaceSortKey } from "@/components/list-surface/list-surface-helpers";

// Artboard 15 (dc.html id="p15") names the dashboard's six switchable regions by the names the
// rebuilt dashboard actually renders: Band tiles, Due next, What changed, Watchlist rail, Across
// the platform, Supersessions. The store's original keys (summaryStrip / weeklyBriefing /
// topUrgency / dueThisQuarter) predate that rebuild and named regions the dashboard no longer has,
// so the settings page could only have pasted the artboard's words onto fields that meant
// something else. The fields carry the region names instead; `readSection` below still reads rows
// written under the old JSON keys, so no workspace loses saved state.
export type DashboardRegionKey =
  | "BandTiles"
  | "DueNext"
  | "WhatChanged"
  | "WatchlistRail"
  | "AcrossPlatform"
  | "Supersessions";

interface SettingsState {
  // Dashboard region visibility (artboard 15 "Dashboard defaults" toggle grid)
  showBandTiles: boolean;
  showDueNext: boolean;
  showWhatChanged: boolean;
  showWatchlistRail: boolean;
  showAcrossPlatform: boolean;
  showSupersessions: boolean;

  // Preferences
  /** Artboard 15's "Default sort" segments are the list surfaces' own sort vocabulary
   *  (list-surface-helpers.ts `ListSurfaceSortKey`: Next date | Newest | A-Z), not a second scale. */
  defaultSort: ListSurfaceSortKey;
  exportFormat: "html" | "slack";
  briefingDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  alertPriorities: string[];

  // Saved filter defaults (persisted to localStorage)
  savedFilters: {
    modes: string[];
    topics: string[];
    jurisdictions: string[];
    priorities: string[];
  } | null;

  // Sync state
  orgId: string | null;
  loaded: boolean;

  // Actions
  toggleSection: (section: DashboardRegionKey) => void;
  setDefaultSort: (sort: SettingsState["defaultSort"]) => void;
  setExportFormat: (format: SettingsState["exportFormat"]) => void;
  setBriefingDay: (day: SettingsState["briefingDay"]) => void;
  setAlertPriorities: (priorities: string[]) => void;
  saveFilterDefaults: (filters: { modes: string[]; topics: string[]; jurisdictions: string[]; priorities: string[] }) => void;
  clearFilterDefaults: () => void;
  loadFromWorkspace: (orgId: string) => Promise<void>;
}

// Debounced save to Supabase
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(orgId: string | null, state: SettingsState) {
  if (!orgId) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase
        .from("workspace_settings")
        .update({
          home_sections: {
            bandTiles: state.showBandTiles,
            dueNext: state.showDueNext,
            whatChanged: state.showWhatChanged,
            watchlistRail: state.showWatchlistRail,
            acrossPlatform: state.showAcrossPlatform,
            supersessions: state.showSupersessions,
          },
          default_export_format: state.exportFormat,
          alert_config: {
            priorities: state.alertPriorities,
            briefingDay: state.briefingDay,
          },
          default_filters: {
            defaultSort: state.defaultSort,
          },
        })
        .eq("org_id", orgId);
    } catch {
      // Silent fail — settings will persist in local state
    }
  }, 1000);
}

/** Reads one dashboard-region flag out of a persisted `home_sections` object, accepting both the
 *  current region key and the pre-rebuild key the same region used to be stored under. */
function readSection(
  hs: Record<string, unknown> | null | undefined,
  key: string,
  legacyKey: string,
): boolean {
  if (!hs) return true;
  const current = hs[key];
  if (typeof current === "boolean") return current;
  const legacy = hs[legacyKey];
  return typeof legacy === "boolean" ? legacy : true;
}

/** The pre-rebuild sort values (`urgency`/`priority`/`alpha`/`added`/`modified`) map onto the list
 *  surfaces' three real sorts. Nothing outside this store ever read the old values. */
function readSortKey(value: unknown): ListSurfaceSortKey | null {
  switch (value) {
    case "next-date":
    case "newest":
    case "az":
    case "my-order":
      return value;
    case "urgency":
    case "priority":
      return "next-date";
    case "alpha":
      return "az";
    case "added":
    case "modified":
      return "newest";
    default:
      return null;
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  showBandTiles: true,
  showDueNext: true,
  showWhatChanged: true,
  showWatchlistRail: true,
  showAcrossPlatform: true,
  showSupersessions: true,

  defaultSort: "next-date",
  exportFormat: "html",
  briefingDay: "monday",
  alertPriorities: ["CRITICAL", "HIGH"],
  savedFilters: (typeof window !== "undefined" ? (() => { try { return JSON.parse(localStorage.getItem("fsi-saved-filters") || "null"); } catch { return null; } })() : null),

  orgId: null,
  loaded: false,

  toggleSection: (section) =>
    set((state) => {
      const key = `show${section}` as keyof SettingsState;
      if (typeof state[key] === "boolean") {
        const newState = { [key]: !state[key] } as Partial<SettingsState>;
        const merged = { ...state, ...newState };
        debouncedSave(state.orgId, merged as SettingsState);
        return newState;
      }
      return state;
    }),

  setDefaultSort: (defaultSort) => {
    set({ defaultSort });
    const state = get();
    debouncedSave(state.orgId, { ...state, defaultSort });
  },

  setExportFormat: (exportFormat) => {
    set({ exportFormat });
    const state = get();
    debouncedSave(state.orgId, { ...state, exportFormat });
  },

  setBriefingDay: (briefingDay) => {
    set({ briefingDay });
    const state = get();
    debouncedSave(state.orgId, { ...state, briefingDay });
  },

  setAlertPriorities: (alertPriorities) => {
    set({ alertPriorities });
    const state = get();
    debouncedSave(state.orgId, { ...state, alertPriorities });
  },

  saveFilterDefaults: (filters) => {
    set({ savedFilters: filters });
    if (typeof window !== "undefined") {
      localStorage.setItem("fsi-saved-filters", JSON.stringify(filters));
    }
  },

  clearFilterDefaults: () => {
    set({ savedFilters: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem("fsi-saved-filters");
    }
  },

  // Load settings from workspace_settings table
  loadFromWorkspace: async (orgId: string) => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("workspace_settings")
        .select("home_sections, default_export_format, alert_config, default_filters")
        .eq("org_id", orgId)
        .single();

      if (data) {
        const hs = data.home_sections as any;
        const ac = data.alert_config as any;
        const df = data.default_filters as any;

        set({
          orgId,
          loaded: true,
          ...(hs ? {
            showBandTiles: readSection(hs, "bandTiles", "summaryStrip"),
            showDueNext: readSection(hs, "dueNext", "dueThisQuarter"),
            showWhatChanged: readSection(hs, "whatChanged", "whatChanged"),
            showWatchlistRail: readSection(hs, "watchlistRail", "topUrgency"),
            showAcrossPlatform: readSection(hs, "acrossPlatform", "weeklyBriefing"),
            showSupersessions: readSection(hs, "supersessions", "supersessions"),
          } : {}),
          ...(data.default_export_format ? { exportFormat: data.default_export_format as "html" | "slack" } : {}),
          ...(ac?.priorities ? { alertPriorities: ac.priorities } : {}),
          ...(ac?.briefingDay ? { briefingDay: ac.briefingDay } : {}),
          ...((() => {
            const sort = readSortKey(df?.defaultSort);
            return sort ? { defaultSort: sort } : {};
          })()),
        });
      } else {
        set({ orgId, loaded: true });
      }
    } catch {
      set({ orgId, loaded: true });
    }
  },
}));
