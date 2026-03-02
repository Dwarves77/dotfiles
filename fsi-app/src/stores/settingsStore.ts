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
  alertPriorities: string[];
  theme: "light" | "dark";

  // Actions
  toggleSection: (section: string) => void;
  setDefaultSort: (sort: SettingsState["defaultSort"]) => void;
  setExportFormat: (format: SettingsState["exportFormat"]) => void;
  setBriefingDay: (day: SettingsState["briefingDay"]) => void;
  setAlertPriorities: (priorities: string[]) => void;
  setTheme: (theme: "light" | "dark") => void;
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
  theme: ((typeof window !== "undefined" ? localStorage.getItem("fsi-theme") : null) || "light") as "light" | "dark",

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
  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== "undefined") {
      localStorage.setItem("fsi-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
  },
}));
