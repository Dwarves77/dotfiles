"use client";

import { ALL_SECTORS, type SectorDefinition } from "@/lib/constants";
import { Check } from "lucide-react";

export interface SectorSelectorProps {
  selectedSectors: string[];
  onToggle: (sectorId: string) => void;
  showKeywords?: boolean;
  layout?: "grid" | "stack";
  disabled?: boolean;
}

export function SectorSelector({
  selectedSectors,
  onToggle,
  showKeywords = true,
  layout = "grid",
  disabled = false,
}: SectorSelectorProps) {
  const containerClass =
    layout === "grid"
      ? "grid grid-cols-1 sm:grid-cols-2 gap-2"
      : "flex flex-col gap-2";

  return (
    <div className={containerClass}>
      {ALL_SECTORS.map((sector) => (
        <SectorCheckbox
          key={sector.id}
          sector={sector}
          selected={selectedSectors.includes(sector.id)}
          showKeywords={showKeywords}
          disabled={disabled}
          onToggle={() => onToggle(sector.id)}
        />
      ))}
    </div>
  );
}

function SectorCheckbox({
  sector,
  selected,
  showKeywords,
  disabled,
  onToggle,
}: {
  sector: SectorDefinition;
  selected: boolean;
  showKeywords: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className="flex items-center gap-3 p-3 rounded-lg border text-left cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        borderColor: selected
          ? "var(--color-active-border)"
          : "var(--color-border)",
        backgroundColor: selected
          ? "var(--color-active-bg)"
          : "var(--color-surface)",
      }}
    >
      <div
        className="w-5 h-5 rounded flex items-center justify-center shrink-0 border"
        style={{
          borderColor: selected ? "var(--color-primary)" : "var(--color-border)",
          backgroundColor: selected ? "var(--color-primary)" : "transparent",
        }}
      >
        {selected && <Check size={12} color="white" />}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {sector.label}
        </span>
        {showKeywords && (
          <p
            className="text-[11px] mt-0.5 line-clamp-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Keywords: {sector.keywords.slice(0, 4).join(", ")}
          </p>
        )}
      </div>
    </button>
  );
}
