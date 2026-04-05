"use client";

import { create } from "zustand";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface SettingsState {
  // Home section visibility
  showSummaryStrip: boolean;
  showWeeklyBriefing: boolean;
  showWhatChanged: boolean;
  showTopUrgency: boolean;
  showDueThisQuarter: boolean;
  showSupersessions: boolean;

  // Preferences
  defaultSort: "urgency" | "priority" | "alpha" | "added" | "modified";
  exportFormat: "html" | "slack";
  briefingDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  alertPriorities: string[];
  theme: "light" | "dark";

  // Sync state
  orgId: string | null;
  loaded: boolean;

  // Actions
  toggleSection: (section: string) => void;
  setDefaultSort: (sort: SettingsState["defaultSort"]) => void;
  setExportFormat: (format: SettingsState["exportFormat"]) => void;
  setBriefingDay: (day: SettingsState["briefingDay"]) => void;
  setAlertPriorities: (priorities: string[]) => void;
  setTheme: (theme: "light" | "dark") => void;
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
            summaryStrip: state.showSummaryStrip,
            weeklyBriefing: state.showWeeklyBriefing,
            whatChanged: state.showWhatChanged,
            topUrgency: state.showTopUrgency,
            dueThisQuarter: state.showDueThisQuarter,
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

export const useSettingsStore = create<SettingsState>((set, get) => ({
  showSummaryStrip: true,
  showWeeklyBriefing: true,
  showWhatChanged: true,
  showTopUrgency: true,
  showDueThisQuarter: true,
  showSupersessions: true,

  defaultSort: "urgency",
  exportFormat: "html",
  briefingDay: "monday",
  alertPriorities: ["CRITICAL", "HIGH"],
  theme: ((typeof window !== "undefined" ? localStorage.getItem("fsi-theme") : null) || "light") as "light" | "dark",

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

  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== "undefined") {
      localStorage.setItem("fsi-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
    // Theme is stored locally, not in workspace settings
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
            showSummaryStrip: hs.summaryStrip ?? true,
            showWeeklyBriefing: hs.weeklyBriefing ?? true,
            showWhatChanged: hs.whatChanged ?? true,
            showTopUrgency: hs.topUrgency ?? true,
            showDueThisQuarter: hs.dueThisQuarter ?? true,
            showSupersessions: hs.supersessions ?? true,
          } : {}),
          ...(data.default_export_format ? { exportFormat: data.default_export_format as "html" | "slack" } : {}),
          ...(ac?.priorities ? { alertPriorities: ac.priorities } : {}),
          ...(ac?.briefingDay ? { briefingDay: ac.briefingDay } : {}),
          ...(df?.defaultSort ? { defaultSort: df.defaultSort } : {}),
        });
      } else {
        set({ orgId, loaded: true });
      }
    } catch {
      set({ orgId, loaded: true });
    }
  },
}));
