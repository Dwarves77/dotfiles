"use client";

import { Toggle } from "@/components/ui/Toggle";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/cn";

export function DashboardSettings() {
  const {
    showSummaryStrip,
    showWeeklyBriefing,
    showWhatChanged,
    showTopUrgency,
    showDueThisQuarter,
    showSupersessions,
    defaultSort,
    exportFormat,
    briefingDay,
    alertPriorities,
    theme,
    toggleSection,
    setDefaultSort,
    setExportFormat,
    setBriefingDay,
    setAlertPriorities,
    setTheme,
  } = useSettingsStore();

  const sections = [
    { key: "SummaryStrip", label: "Summary Strip", value: showSummaryStrip },
    { key: "WeeklyBriefing", label: "Weekly Briefing", value: showWeeklyBriefing },
    { key: "WhatChanged", label: "What Changed", value: showWhatChanged },
    { key: "TopUrgency", label: "Top Urgency", value: showTopUrgency },
    { key: "DueThisQuarter", label: "Due This Quarter", value: showDueThisQuarter },
    { key: "Supersessions", label: "Supersessions", value: showSupersessions },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-[11px] font-semibold uppercase text-text-primary" style={{ letterSpacing: "1.5px" }}>
        Dashboard Settings
      </h3>

      {/* Appearance */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase text-text-secondary" style={{ letterSpacing: "1.5px" }}>
          Appearance
        </span>
        <div className="flex gap-1.5">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-[6px] border cursor-pointer transition-colors",
                theme === t
                  ? "border-active-border bg-active-bg text-text-primary"
                  : "border-border-subtle text-text-secondary"
              )}
            >
              {t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>

      {/* Home Section Visibility */}
      <div className="space-y-3">
        <span className="text-[11px] font-semibold uppercase text-text-secondary" style={{ letterSpacing: "1.5px" }}>
          Home Sections
        </span>
        {sections.map(({ key, label, value }) => (
          <Toggle
            key={key}
            checked={value}
            onChange={() => toggleSection(key)}
            label={label}
          />
        ))}
      </div>

      {/* Default Sort */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase text-text-secondary" style={{ letterSpacing: "1.5px" }}>
          Default Sort
        </span>
        <div className="flex gap-1.5">
          {(["urgency", "priority", "alpha", "added"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setDefaultSort(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-[6px] border cursor-pointer transition-colors",
                defaultSort === s
                  ? "border-border-medium bg-active-bg text-text-primary"
                  : "border-border-subtle text-text-secondary"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Export Format */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase text-text-secondary" style={{ letterSpacing: "1.5px" }}>
          Default Export Format
        </span>
        <div className="flex gap-1.5">
          {(["html", "slack"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setExportFormat(f)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-[6px] border cursor-pointer transition-colors",
                exportFormat === f
                  ? "border-border-medium bg-active-bg text-text-primary"
                  : "border-border-subtle text-text-secondary"
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Briefing Day */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase text-text-secondary" style={{ letterSpacing: "1.5px" }}>
          Briefing Day
        </span>
        <select
          value={briefingDay}
          onChange={(e) => setBriefingDay(e.target.value as any)}
          className="text-xs p-1.5 bg-surface-overlay border border-border-light rounded-[6px] text-text-primary"
        >
          {["monday", "tuesday", "wednesday", "thursday", "friday"].map((d) => (
            <option key={d} value={d}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Alert Priorities */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase text-text-secondary" style={{ letterSpacing: "1.5px" }}>
          Alert Priorities
        </span>
        <div className="flex gap-1.5">
          {["CRITICAL", "HIGH", "MODERATE", "LOW"].map((p) => (
            <button
              key={p}
              onClick={() => {
                const next = alertPriorities.includes(p)
                  ? alertPriorities.filter((x) => x !== p)
                  : [...alertPriorities, p];
                setAlertPriorities(next);
              }}
              className={cn(
                "px-2.5 py-1 text-xs rounded-[6px] border cursor-pointer transition-colors",
                alertPriorities.includes(p)
                  ? "border-border-medium bg-active-bg text-text-primary"
                  : "border-border-subtle text-text-secondary"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
