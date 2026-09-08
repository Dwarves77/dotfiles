"use client";

/**
 * StateNote — the state note strip (UI system handoff 2026-09-06, README
 * §0.4): border-left 3px solid <band>; background <band tint>; radius
 * 0 6px 6px 0; padding 9px 12px; text left, one action link right. Sits at
 * the foot of the primary card on every page that has a state worth
 * declaring. Neutral variant uses --ink-2 on --tag.
 */

import type { UrgencyBand } from "@/lib/urgency/bands";

export interface StateNoteProps {
  band?: UrgencyBand | null;
  children: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function StateNote({ band, children, action }: StateNoteProps) {
  // Operator audit item 2.6 (2026-09-07, CLOSED ruling): "Neutral variant #5A5552 on #F5F2EE" —
  // the prior neutral edge was --ink-2 (#5A6B67), a shade off the ruled value. --brand is #5A5552.
  const color = band ? band.cssVar : "var(--brand)";
  const bg = band ? band.tintCssVar : "var(--tag)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderLeft: `3px solid ${color}`,
        background: bg,
        borderRadius: "0 6px 6px 0",
        padding: "9px 12px",
      }}
    >
      <span style={{ fontSize: "var(--fs-12)", color: "var(--ink)" }}>{children}</span>
      {action &&
        (action.href ? (
          <a
            href={action.href}
            style={{
              flexShrink: 0,
              fontSize: "var(--fs-11)",
              fontWeight: 600,
              color: "var(--ink)",
              textDecoration: "underline",
              textDecorationColor: "rgba(0,0,0,.3)",
              // Same L9 floor as the button branch below: one link, two element types, one height.
              display: "inline-block",
              padding: "8px 0",
            }}
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              flexShrink: 0,
              fontSize: "var(--fs-11)",
              fontWeight: 600,
              color: "var(--ink)",
              textDecoration: "underline",
              textDecorationColor: "rgba(0,0,0,.3)",
              background: "none",
              border: "none",
              // L9 (site-wide layout guard, lane layoutguard 2026-09-08): the state note's one
              // action link measured 90.4x24 ("Watchlist →" on the dashboard) and 157.6x24
              // ("Browse what to watch →" on /watchlist and the watchlist rail) - 4px under the
              // operator's 28px short-axis floor, on every surface that declares a state, which
              // is all of them. 8px vertical padding on the 11px line box clears it. Horizontal
              // padding stays 0 so the link keeps sitting flush with the strip's right edge, which
              // is what the artboard draws (README §0.4: "text left, one action link right").
              padding: "8px 0",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
