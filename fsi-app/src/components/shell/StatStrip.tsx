"use client";

/**
 * StatStrip — 4-up summary tile pattern for editorial pages.
 *
 * Matches design_handoff_2026-04/preview/{operations,market-intel,research}.html
 * and the Option 2 rule codified in DESIGN_SYSTEM.md ("Stat tiles / status strips"):
 *
 *   - Eyebrow + numeral both take the same priority/lifecycle color.
 *   - Exactly one tile per strip is `primary` — gets the 4px left rail,
 *     tinted background, and tone-color border.
 *   - Helper text is muted (`--text-2`); shadow uses `--shadow` to match
 *     the previews until the broader no-shadow flatten lands.
 *
 * The `tone="muted"` value covers neutral/inactive states (Draft / Archived
 * on Research, neutral aggregate counts elsewhere). Muted tiles cannot be
 * primary — the rail is reserved for in-flight tiles.
 */

import type { CSSProperties, ReactNode } from "react";

export type StatTone = "critical" | "high" | "moderate" | "low" | "muted";

export interface StatTile {
  tone: StatTone;
  /** Uppercase label below the numeral. Colored per tone. */
  eyebrow: string;
  /** Big Anton numeral. Colored per tone. */
  numeral: string | number;
  /** Optional small description under the eyebrow. Muted. */
  helper?: string;
  /** Optional icon character/glyph above the numeral. Colored per tone. */
  icon?: ReactNode;
  /** Adds 4px left rail + tinted bg + tone-color border. Use on one tile per strip. */
  primary?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

interface StatStripProps {
  tiles: StatTile[];
  className?: string;
}

const TONE: Record<StatTone, { color: string; bg: string; bd: string }> = {
  critical: { color: "var(--critical)", bg: "var(--critical-bg)", bd: "var(--critical-bd)" },
  high:     { color: "var(--high)",     bg: "var(--high-bg)",     bd: "var(--high-bd)" },
  moderate: { color: "var(--moderate)", bg: "var(--moderate-bg)", bd: "var(--moderate-bd)" },
  low:      { color: "var(--low)",      bg: "var(--low-bg)",      bd: "var(--low-bd)" },
  muted:    { color: "var(--text-2)",   bg: "var(--surface)",     bd: "var(--border-sub)" },
};

export function StatStrip({ tiles, className }: StatStripProps) {
  const cls = ["grid grid-cols-2 sm:grid-cols-4 gap-3", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {tiles.map((tile, i) => (
        <StatTileEl key={`${tile.eyebrow}-${i}`} {...tile} />
      ))}
    </div>
  );
}

function StatTileEl({
  tone,
  eyebrow,
  numeral,
  helper,
  icon,
  primary,
  onClick,
  ariaLabel,
}: StatTile) {
  const c = TONE[tone];
  const interactive = typeof onClick === "function";
  const isPrimary = primary && tone !== "muted";

  const tileStyle: CSSProperties = {
    background: isPrimary ? c.bg : "var(--surface)",
    border: isPrimary ? `1px solid ${c.bd}` : "1px solid var(--border-sub)",
    borderLeft: isPrimary ? `4px solid ${c.color}` : undefined,
    borderRadius: "var(--r-md)",
    padding: "18px",
    textAlign: "center",
    boxShadow: "var(--shadow)",
    cursor: interactive ? "pointer" : "default",
    fontFamily: "inherit",
    width: "100%",
    transition: "background 0.18s ease, box-shadow 0.18s ease",
  };

  const inner = (
    <>
      {icon && (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "16px",
            lineHeight: 1,
            marginBottom: "8px",
            color: c.color,
            display: "inline-block",
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "56px",
          lineHeight: 1,
          color: c.color,
        }}
      >
        {numeral}
      </div>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          margin: "8px 0 4px",
          color: c.color,
        }}
      >
        {eyebrow}
      </div>
      {helper && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-2)",
            lineHeight: 1.4,
          }}
        >
          {helper}
        </div>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `${eyebrow}: ${numeral}`}
        style={tileStyle}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {inner}
      </button>
    );
  }

  return <div style={tileStyle}>{inner}</div>;
}
