"use client";

import { create } from "zustand";

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
  alertPriorities: string[]; // which priorities trigger alerts

  // Actions
  toggleSection: (section: string) => void;
  setDefaultSort: (sort: SettingsState["defaultSort"]) => void;
  setExportFormat: (format: SettingsState["exportFormat"]) => void;
  setBriefingDay: (day: SettingsState["briefingDay"]) => void;
  setAlertPriorities: (priorities: string[]) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
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

  toggleSection: (section) =>
    set((state) => {
      const key = `show${section}` as keyof SettingsState;
      if (typeof state[key] === "boolean") {
        return { [key]: !state[key] } as Partial<SettingsState>;
      }
      return state;
    }),

  setDefaultSort: (defaultSort) => set({ defaultSort }),
  setExportFormat: (exportFormat) => set({ exportFormat }),
  setBriefingDay: (briefingDay) => set({ briefingDay }),
  setAlertPriorities: (alertPriorities) => set({ alertPriorities }),
}));
