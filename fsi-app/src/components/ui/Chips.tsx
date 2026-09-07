"use client";

/**
 * Chips — the one chip family (UI system handoff 2026-09-06, README §0.4).
 * Only band chips carry colour (tinted pill, band dot, band-coloured
 * label). Tier is a bordered square T1-T6. Kind/mode/topic are neutral
 * tags on --tag. Filter chips are grouped in labelled sets (Mode / Band /
 * Region) so a wrapped group keeps its label.
 */

import type { UrgencyBand } from "@/lib/urgency/bands";

export function BandChip({ band }: { band: UrgencyBand }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: "var(--fs-105)",
        fontWeight: 700,
        color: band.cssVar,
        background: band.tintCssVar,
        borderRadius: "var(--radius-pill)",
        padding: "3px 9px 3px 7px",
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: band.cssVar }} />
      {band.label}
    </span>
  );
}

/** Bordered square tier chip, T1-T6. Clamped so a raw out-of-range source
 *  tier never renders a broken label. */
export function TierChip({ tier }: { tier: number }) {
  const clamped = Math.max(1, Math.min(6, Math.round(tier)));
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 20,
        fontSize: "var(--fs-105)",
        fontWeight: 800,
        color: "var(--ink-2)",
        border: "1px solid var(--line-1)",
        borderRadius: 4,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      T{clamped}
    </span>
  );
}

/** Neutral kind/mode/topic tag on --tag. */
export function TagChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "var(--fs-105)",
        fontWeight: 600,
        color: "var(--ink-2)",
        background: "var(--tag)",
        borderRadius: "var(--radius-pill)",
        padding: "3px 9px",
      }}
    >
      {children}
    </span>
  );
}

export interface FilterChipGroupProps {
  label: string;
  children: React.ReactNode;
}

/** A labelled set of filter chips (Mode / Band / Region) — the label stays
 *  attached to its group even when the row wraps. */
export function FilterChipGroup({ label, children }: FilterChipGroupProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: "var(--fs-95)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: "var(--fs-11)",
        fontWeight: 700,
        color: active ? "#FFFFFF" : "var(--ink-2)",
        background: active ? "var(--brand)" : "var(--tag)",
        border: "1px solid transparent",
        borderRadius: "var(--radius-pill)",
        padding: "5px 11px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
