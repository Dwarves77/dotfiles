"use client";

import { Toggle } from "@/components/ui/Toggle";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ALL_SECTORS } from "@/lib/constants";
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

      {/* Freight Sectors */}
      <SectorProfileSection />

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

// ── Sector Profile Selection ──

function SectorProfileSection() {
  const { sectorProfile, setSectorProfile } = useWorkspaceStore();

  const toggleSector = (sectorId: string) => {
    const next = sectorProfile.includes(sectorId)
      ? sectorProfile.filter((s) => s !== sectorId)
      : [...sectorProfile, sectorId];
    setSectorProfile(next);
  };

  const selectAll = () => setSectorProfile(ALL_SECTORS.map((s) => s.id));
  const clearAll = () => setSectorProfile([]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase" style={{ letterSpacing: "1.5px", color: "var(--color-text-secondary)" }}>
          Freight Sectors
        </span>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-[11px] font-medium cursor-pointer transition-colors"
            style={{ color: "var(--color-primary)" }}
          >
            Select all
          </button>
          <button
            onClick={clearAll}
            className="text-[11px] font-medium cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            Clear
          </button>
        </div>
      </div>
      <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Select the sectors your organization operates in. This filters your default view, briefings, and urgency scoring.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {ALL_SECTORS.map((sector) => {
          const active = sectorProfile.includes(sector.id);
          return (
            <button
              key={sector.id}
              onClick={() => toggleSector(sector.id)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-[13px] cursor-pointer transition-all duration-150",
              )}
              style={{
                borderColor: active ? "var(--color-primary)" : "var(--color-border)",
                backgroundColor: active ? "var(--color-active-bg)" : "var(--color-surface)",
                color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: active ? 600 : 400,
              }}
            >
              <span
                className="shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px]"
                style={{
                  borderColor: active ? "var(--color-primary)" : "var(--color-border-strong)",
                  backgroundColor: active ? "var(--color-primary)" : "transparent",
                  color: active ? "#fff" : "transparent",
                }}
              >
                ✓
              </span>
              {sector.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {sectorProfile.length === 0
          ? "No sectors selected — showing all freight sectors by default."
          : `${sectorProfile.length} sector${sectorProfile.length !== 1 ? "s" : ""} selected.`}
      </p>
    </div>
  );
}
