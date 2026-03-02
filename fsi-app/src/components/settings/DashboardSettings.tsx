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
    toggleSection,
    setDefaultSort,
    setExportFormat,
    setBriefingDay,
    setAlertPriorities,
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
      <h3 className="text-xs font-semibold tracking-wider uppercase text-white">
        Dashboard Settings
      </h3>

      {/* Home Section Visibility */}
      <div className="space-y-3">
        <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)]">
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
        <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)]">
          Default Sort
        </span>
        <div className="flex gap-1.5">
          {(["urgency", "priority", "alpha", "added"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setDefaultSort(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-[2px] border cursor-pointer transition-colors",
                defaultSort === s
                  ? "border-white/15 bg-white/8 text-white"
                  : "border-white/6 text-[var(--sage)]"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Export Format */}
      <div className="space-y-2">
        <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)]">
          Default Export Format
        </span>
        <div className="flex gap-1.5">
          {(["html", "slack"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setExportFormat(f)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-[2px] border cursor-pointer transition-colors",
                exportFormat === f
                  ? "border-white/15 bg-white/8 text-white"
                  : "border-white/6 text-[var(--sage)]"
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Briefing Day */}
      <div className="space-y-2">
        <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)]">
          Briefing Day
        </span>
        <select
          value={briefingDay}
          onChange={(e) => setBriefingDay(e.target.value as any)}
          className="text-xs p-1.5 bg-white/5 border border-white/10 rounded-[2px] text-white"
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
        <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)]">
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
                "px-2.5 py-1 text-xs rounded-[2px] border cursor-pointer transition-colors",
                alertPriorities.includes(p)
                  ? "border-white/15 bg-white/8 text-white"
                  : "border-white/6 text-[var(--sage)]"
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
