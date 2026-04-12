"use client";

import { cn } from "@/lib/cn";
import { PRIORITY_COLORS } from "@/lib/constants";

interface UrgencyOption {
  value: string;       // The internal priority value (CRITICAL, HIGH, MODERATE, LOW)
  label: string;       // The display label for this page context
  color: string;       // Color for the button
}

interface UrgencyFilterBarProps {
  options: UrgencyOption[];
  activeFilter: string | null;
  onFilter: (value: string | null) => void;
  counts: Record<string, number>;
}

export function UrgencyFilterBar({ options, activeFilter, onFilter, counts }: UrgencyFilterBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map((opt) => {
        const isActive = activeFilter === opt.value;
        const count = counts[opt.value] || 0;
        return (
          <button
            key={opt.value}
            onClick={() => onFilter(isActive ? null : opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-all duration-200 cursor-pointer",
              isActive ? "font-bold" : "hover:opacity-80"
            )}
            style={{
              borderColor: isActive ? opt.color : `${opt.color}40`,
              backgroundColor: isActive ? `${opt.color}15` : "transparent",
              color: opt.color,
            }}
          >
            {opt.label}
            <span className={cn("tabular-nums", isActive ? "opacity-90" : "opacity-50")}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Pre-built configs for each page ──

export const REGULATIONS_URGENCY: UrgencyOption[] = [
  { value: "CRITICAL", label: "Critical", color: PRIORITY_COLORS.CRITICAL },
  { value: "HIGH", label: "High", color: PRIORITY_COLORS.HIGH },
  { value: "MODERATE", label: "Moderate", color: PRIORITY_COLORS.MODERATE },
  { value: "LOW", label: "Low", color: PRIORITY_COLORS.LOW },
];

export const MARKET_INTEL_URGENCY: UrgencyOption[] = [
  { value: "CRITICAL", label: "Watch", color: PRIORITY_COLORS.CRITICAL },
  { value: "HIGH", label: "Elevated", color: PRIORITY_COLORS.HIGH },
  { value: "MODERATE", label: "Stable", color: PRIORITY_COLORS.MODERATE },
  { value: "LOW", label: "Informational", color: PRIORITY_COLORS.LOW },
];

export const RESEARCH_URGENCY: UrgencyOption[] = [
  { value: "CRITICAL", label: "Emerging", color: PRIORITY_COLORS.CRITICAL },
  { value: "HIGH", label: "Active", color: PRIORITY_COLORS.HIGH },
  { value: "MODERATE", label: "Established", color: PRIORITY_COLORS.MODERATE },
  { value: "LOW", label: "Archived", color: PRIORITY_COLORS.LOW },
];
