"use client";

/**
 * StatBlock — label / Anton numeral / note (UI system handoff 2026-09-06,
 * README §0.4). What profile and admin counters use — never a band tile.
 *
 * `layout="stack"` (default) is the profile/admin counter card: label
 * above a large Anton numeral, note below. `layout="row"` is the same
 * three fields read left-to-right — label + note on the left, numeral on
 * the right — for a stat used inline in a list (the dashboard rail's
 * "Across the platform" rows, README screen 1).
 *
 * `tone="critical"` (additive extension, admin lane 2026-09-06 — README
 * screen 13 "Platform admin": Sources/Ingest counters read in
 * `--immediate` red because they are needs-attention queue depths, not
 * a second priority scale — see docs/design/handoff-2026-09-06/
 * DEVIATION-LOG.md) paints the numeral in the immediate band colour
 * instead of ink. Never used to invent a fifth urgency vocabulary: it is
 * one on/off tone, not a band.
 *
 * `size="tile"` (additive extension, train 58 2026-09-07, dc.html id="p13"
 * — Platform admin's 8-tile summary grid) is a compact variant sized for a
 * 4-up grid cell: 11px uppercase label / 16px Anton numeral on one baseline
 * row, 11.5px note below. The tile's own card chrome (border, radius,
 * shadow, padding) is the CALLER's — AdminDashboard.tsx's `AdminStatTile`
 * wrapper, per the artboard — StatBlock itself only sets type. `size="tile"`
 * ignores `layout`.
 */

export interface StatBlockProps {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  loading?: boolean;
  layout?: "stack" | "row";
  tone?: "default" | "critical";
  size?: "default" | "tile";
}

export function StatBlock({ label, value, note, loading, layout = "stack", tone = "default", size = "default" }: StatBlockProps) {
  if (size === "tile") {
    const numeral_ = loading ? (
      <span
        aria-hidden="true"
        style={{ display: "block", width: 28, height: 16, borderRadius: 4, background: "var(--tag)" }}
      />
    ) : (
      <span
        data-guard-display="stat-block-numeral"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          lineHeight: 1,
          color: tone === "critical" ? "var(--immediate)" : "var(--ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    );
    const label_tile = (
      <span
        style={{
          fontSize: "var(--fs-11)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 800,
          color: "var(--ink)",
        }}
      >
        {label}
      </span>
    );
    const note_tile = note != null && (
      <span style={{ display: "block", fontSize: "var(--fs-115)", color: "var(--ink-2)", marginTop: 4, lineHeight: 1.45 }}>
        {note}
      </span>
    );
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          {label_tile}
          {numeral_}
        </div>
        {note_tile}
      </div>
    );
  }

  const numeral = loading ? (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width: layout === "row" ? 36 : 48,
        height: layout === "row" ? 20 : 26,
        borderRadius: 5,
        background: "var(--tag)",
      }}
    />
  ) : (
    <span
      data-guard-display="stat-block-numeral"
      style={{
        display: "block",
        fontFamily: "var(--font-display)",
        fontSize: layout === "row" ? 18 : 26,
        lineHeight: 1,
        letterSpacing: "0.04em",
        color: tone === "critical" ? "var(--immediate)" : "var(--ink)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </span>
  );

  const label_ = (
    <span
      style={{
        display: "block",
        fontSize: layout === "row" ? "var(--fs-125)" : "var(--fs-10)",
        fontWeight: 700,
        letterSpacing: layout === "row" ? "normal" : "0.12em",
        textTransform: layout === "row" ? "none" : "uppercase",
        color: layout === "row" ? "var(--ink)" : "var(--ink-3)",
      }}
    >
      {label}
    </span>
  );

  const note_ = note != null && (
    <span
      style={{
        display: "block",
        fontSize: "var(--fs-105)",
        color: "var(--ink-3)",
        marginTop: layout === "row" ? 2 : 4,
      }}
    >
      {note}
    </span>
  );

  if (layout === "row") {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={{ minWidth: 0 }}>
          {label_}
          {note_}
        </span>
        <span style={{ flexShrink: 0 }}>{numeral}</span>
      </div>
    );
  }

  return (
    <div>
      {label_}
      <div style={{ margin: "4px 0 0" }}>{numeral}</div>
      {note_}
    </div>
  );
}
