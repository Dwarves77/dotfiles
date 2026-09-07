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
  const color = band ? band.cssVar : "var(--ink-2)";
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
              fontWeight: 700,
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
              flexShrink: 0,
              fontSize: "var(--fs-11)",
              fontWeight: 700,
              color: "var(--ink)",
              textDecoration: "underline",
              textDecorationColor: "rgba(0,0,0,.3)",
              background: "none",
              border: "none",
              padding: 0,
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
