"use client";

/**
 * SectorChipFilter — 28 freight vertical sector chips for /regulations.
 *
 * Each chip references an entry in ALL_SECTORS by id, so filtering wires
 * through the canonical `matchResourceSector` keyword-matching mechanism
 * already in use by the workspace sector profile and urgency scoring.
 *
 * Visual: condensed chip row with active state, optional count badge,
 * and a left-edge tone bar for visual grouping. Same chip vocabulary as
 * FilterRow but specialised for the sector taxonomy.
 *
 * The 28 chip IDs below are the curated Dietl/Rockit cargo verticals per
 * docs/FINISHING-DISPATCH-2026-05-06.md DISPATCH E (Decision #1). All 28
 * resolve to existing entries in ALL_SECTORS — no orphan chips.
 */

import { useMemo } from "react";
import { ALL_SECTORS } from "@/lib/constants";

// 28 curated freight vertical chips per dispatch.
// Each entry is `{ id, displayLabel }` where id MUST match an
// ALL_SECTORS.id and displayLabel is the short marketing copy
// surfaced in the chip (the master ALL_SECTORS labels are longer
// "for filter dropdown" copy; chips need shorter forms).
export const REGULATIONS_SECTOR_CHIPS: Array<{ id: string; label: string }> = [
  { id: "fine-art",           label: "Fine Art" },
  { id: "live-events",        label: "Live Events" },
  { id: "luxury-goods",       label: "Luxury Goods" },
  { id: "film-tv",            label: "Film/TV" },
  { id: "automotive",         label: "Automotive" },
  { id: "humanitarian",       label: "Humanitarian" },
  { id: "industrial",         label: "Industrial Equipment" },
  { id: "construction",       label: "Construction" },
  { id: "metals-steel",       label: "Metals" },
  { id: "mining-minerals",    label: "Mining" },
  { id: "aerospace-defense",  label: "Aerospace" },
  { id: "energy",             label: "Energy" },
  { id: "oil-gas",            label: "Oil & Gas" },
  { id: "dangerous-goods",    label: "Dangerous Goods" },
  { id: "electronics",        label: "Electronics" },
  { id: "agriculture",        label: "Agriculture" },
  { id: "live-animals",       label: "Live Animals" },
  { id: "forestry",           label: "Forestry" },
  { id: "general-air",        label: "Air Freight" },
  { id: "general-ocean",      label: "Ocean FCL/LCL" },
  { id: "general-road",       label: "Road" },
  { id: "rail-intermodal",    label: "Rail" },
  { id: "personal-effects",   label: "Personal Effects" },
  { id: "government-military",label: "Government/Military" },
  { id: "sports-equipment",   label: "Sports" },
  { id: "precious-valuables", label: "Precious Goods" },
  { id: "nuclear-radioactive",label: "Nuclear" },
  { id: "bulk-commodity",     label: "Dry Bulk" },
];

export interface SectorChipFilterProps {
  /** Currently selected sector chip ids. */
  active: Set<string>;
  /** Per-sector match counts from the parent (post-filter). */
  counts?: Record<string, number>;
  /** Toggle a chip — multi-select OR semantics. */
  onToggle: (sectorId: string) => void;
  /** Clear all sector selections. */
  onClear: () => void;
  /** Reset to the user's workspace sector profile. */
  onResetToMySectors: () => void;
  /** Whether the workspace has a sector profile (controls reset visibility). */
  hasMySectors: boolean;
}

export function SectorChipFilter({
  active,
  counts = {},
  onToggle,
  onClear,
  onResetToMySectors,
  hasMySectors,
}: SectorChipFilterProps) {
  // Validate every chip id maps to an ALL_SECTORS entry. Build-time
  // typecheck won't catch a typo in the static array above, so we
  // surface a console warning at mount in dev only. This is one of the
  // halt-conditions inverted: the chip list is fail-loud if a sector
  // id ever drifts away from the master taxonomy.
  const orphanIds = useMemo(() => {
    const allIds = new Set(ALL_SECTORS.map((s) => s.id));
    return REGULATIONS_SECTOR_CHIPS.filter((c) => !allIds.has(c.id)).map((c) => c.id);
  }, []);
  if (orphanIds.length > 0 && typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      "[SectorChipFilter] Chip ids missing from ALL_SECTORS:",
      orphanIds
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr auto",
        gap: 12,
        alignItems: "start",
        padding: "6px 2px",
        borderTop: "1px solid var(--border-sub)",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          paddingTop: 8,
        }}
      >
        Sector
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {REGULATIONS_SECTOR_CHIPS.map((chip) => {
          const isActive = active.has(chip.id);
          const n = counts[chip.id];
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onToggle(chip.id)}
              aria-pressed={isActive}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${isActive ? "var(--accent-bd)" : "var(--border)"}`,
                background: isActive ? "var(--accent-bg)" : "var(--surface)",
                color: isActive ? "var(--accent)" : "var(--text-2)",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {chip.label}
              {n !== undefined && (
                <span style={{ opacity: 0.7, fontWeight: 600, fontSize: 10.5 }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, paddingTop: 4 }}>
        {active.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            style={chipActionStyle()}
          >
            Clear
          </button>
        )}
        {hasMySectors && (
          <button
            type="button"
            onClick={onResetToMySectors}
            style={chipActionStyle()}
            title="Reset to your workspace sector profile"
          >
            My sectors
          </button>
        )}
      </div>
    </div>
  );
}

function chipActionStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "5px 9px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--muted)",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };
}
