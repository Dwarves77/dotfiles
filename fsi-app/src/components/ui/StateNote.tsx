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

/**
 * The action's TARGET BOX (lane BRIEFDATA, 2026-09-08).
 *
 * Both branches below rendered their action with `padding: 0` and no height of their own, so the
 * hit target was the text's own ~13px line box — under law-2's floor (docs/design/ux-laws.md: 44px
 * on the shorter axis, or 24px with 8px of clearance). Nothing had caught it because no ux smoke
 * spec had ever mounted a StateNote CARRYING an action; this lane's dashboard failure/empty states
 * are the first, and they failed the guard at 375 and at 1280 on their first run.
 *
 * 24px + clearance rather than 44px: the note is a one-line strip (9px 12px padding, README §0.4),
 * and a 44px control inside it would be taller than the strip the artboard draws. The type
 * treatment statenote.json pins (11px / 600) is untouched; only the box around it grows.
 */
const ACTION_TARGET = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  // FOLD 62 (2026-09-08): lane layoutguard fixed this same box from the other end, and the two
  // fixes are ONE box, not two. Its L9 row measured the link at 90.4x24 ("Watchlist ->" on the
  // dashboard) and 157.6x24 ("Browse what to watch ->" on /watchlist and the watchlist rail),
  // under the operator's 28px short-axis floor on every surface that declares a state; 8px of
  // VERTICAL padding on the 11px line box clears it, and horizontal padding stays 0 so the link
  // keeps sitting flush with the strip's right edge, which is what README 0.4 draws ("text left,
  // one action link right"). So the 24px of law-2's small branch becomes the operator's 28px and
  // the 0 2px becomes 8px 0: strictly the stronger of the two floors, one declaration, both
  // element types.
  padding: "8px 0",
} as const;

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
              ...ACTION_TARGET,
              fontSize: "var(--fs-11)",
              fontWeight: 600,
              color: "var(--ink)",
              textDecoration: "underline",
              textDecorationColor: "rgba(0,0,0,.3)",
            }}
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              ...ACTION_TARGET,
              fontSize: "var(--fs-11)",
              fontWeight: 600,
              color: "var(--ink)",
              textDecoration: "underline",
              textDecorationColor: "rgba(0,0,0,.3)",
              background: "none",
              border: "none",
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
