"use client";

/**
 * PriorityDropdown — ⋯ menu for manual priority retag + Dismiss.
 *
 * Sprint 3 followup Part 2.
 *
 * Renders a round 24-26px button rendered as "⋯". On click, opens a
 * popover anchored to its right edge with five menu items:
 *
 *   - Mark Critical    (red dot)     → priority=CRITICAL, dismissed=null
 *   - Mark High        (amber dot)   → priority=HIGH,     dismissed=null
 *   - Mark Moderate    (yellow dot)  → priority=MODERATE, dismissed=null
 *   - Mark Background  (green dot)   → priority=LOW,      dismissed=null
 *   ─────────────────────────────────────────────────────────────
 *   - Dismiss this regulation        → dismissed=now,     priority=null
 *
 * Two layout variants:
 *
 *   - "card"  — small ⋯ glyph button, ~22px round, 200px wide popover.
 *               Used on each regulation card in the Kanban grid.
 *   - "hero"  — pill-shaped button that reads "● <currentLabel> ▾",
 *               220px wide popover. Used in the hero actions row on
 *               /regulations/[slug].
 *
 * Outside-click + Escape close the popover. Click inside the popover
 * does NOT propagate to the surrounding card link (this is what makes
 * the dropdown safe to drop into a <Link>-wrapped card).
 *
 * No emoji per CLAUDE.md global rule: ⋯, ▾, ✕ are Unicode glyphs; the
 * priority dots are inline-block <span> with CSS background.
 */

import { useEffect, useRef, useState } from "react";
import type { PriorityKey } from "@/lib/constants";

export type PriorityValue = PriorityKey;

interface PriorityDropdownProps {
  /** Current effective priority for this regulation. Used to bold the
   *  currently-selected menu item and (in "hero" variant) to render
   *  the colored dot + label in the button. */
  currentPriority: PriorityValue;
  /** Whether the regulation is currently dismissed. When true, the
   *  "Dismiss" item is rendered as inactive (or hidden) since dismiss
   *  is a one-way action from this surface; restore happens from the
   *  dismissed-stash drawer. */
  isDismissed?: boolean;
  /** Fires when the operator picks one of the priority menu items.
   *  Caller is responsible for the optimistic write + persist. */
  onSetPriority: (p: PriorityValue) => void;
  /** Fires when the operator picks the Dismiss menu item. */
  onDismiss: () => void;
  /** Layout variant. "card" = ⋯ glyph button; "hero" = pill button. */
  variant?: "card" | "hero";
}

// Priority color tokens — mapped to the existing semantic --color-*
// variables in theme.css. Sprint 3 changed --color-moderate to #EAB308
// (commit d99b7dc); this dropdown picks up that token via CSS var, so
// the bright-yellow dot is the new operative value automatically.
const PRIORITY_TOKENS: Record<
  PriorityValue,
  { dotVar: string; label: string }
> = {
  CRITICAL: { dotVar: "var(--color-critical)", label: "Mark Critical" },
  HIGH:     { dotVar: "var(--color-high)",     label: "Mark High" },
  MODERATE: { dotVar: "var(--color-moderate)", label: "Mark Moderate" },
  LOW:      { dotVar: "var(--color-low)",      label: "Mark Background" },
};

// Short labels used in the hero pill button (e.g. "● Action required").
// Mirrors the PRIORITY_DISPLAY_LABEL_SHORT vocabulary but kept local so
// the dropdown doesn't take a hard dep on the editorial label map (the
// dispatch spec calls the LOW button "Mark Background", not "Mark Low").
const PRIORITY_PILL_LABEL: Record<PriorityValue, string> = {
  CRITICAL: "Action required",
  HIGH: "High",
  MODERATE: "Moderate",
  LOW: "Background",
};

const PRIORITY_ORDER: PriorityValue[] = ["CRITICAL", "HIGH", "MODERATE", "LOW"];

export function PriorityDropdown({
  currentPriority,
  isDismissed = false,
  onSetPriority,
  onDismiss,
  variant = "card",
}: PriorityDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside click + Escape close. Pointerdown rather than click so the
  // close fires before any sibling click handler runs.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // stopPropagation on every interactive element inside the menu so a
  // click inside the dropdown never bubbles up to the surrounding card
  // <Link>. Without this, clicking "Mark High" would also navigate to
  // the detail page.
  function handleSelectPriority(e: React.MouseEvent, p: PriorityValue) {
    e.preventDefault();
    e.stopPropagation();
    onSetPriority(p);
    setOpen(false);
  }
  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onDismiss();
    setOpen(false);
  }
  function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  }

  const popoverWidth = variant === "hero" ? 220 : 200;
  const tok = PRIORITY_TOKENS[currentPriority] ?? PRIORITY_TOKENS.MODERATE;

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "inline-block" }}
      // Defensive: in case the dropdown sits inside a Link and our
      // explicit stopPropagation on the trigger ever misses a path.
      onClick={(e) => e.stopPropagation()}
    >
      {variant === "card" ? (
        <button
          type="button"
          aria-label="Regulation actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={handleToggle}
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          {/* Unicode "horizontal ellipsis" — not an emoji */}
          {"⋯"}
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={handleToggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 14px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-focus, var(--color-border))",
            borderRadius: 999,
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--color-text-primary)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: isDismissed
                ? "var(--color-text-muted)"
                : tok.dotVar,
              display: "inline-block",
            }}
          />
          {isDismissed ? "Dismissed" : PRIORITY_PILL_LABEL[currentPriority]}
          <span style={{ fontSize: 10 }}>{"▾"}</span>
        </button>
      )}

      {open && (
        <div
          role="menu"
          aria-label="Set priority or dismiss"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: popoverWidth,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md, 8px)",
            boxShadow:
              "var(--shadow-card-hover, 0 8px 24px rgba(0,0,0,0.12))",
            padding: 4,
            zIndex: 50,
            fontFamily: "inherit",
          }}
        >
          {PRIORITY_ORDER.map((p) => {
            const t = PRIORITY_TOKENS[p];
            const isCurrent = !isDismissed && currentPriority === p;
            return (
              <button
                key={p}
                type="button"
                role="menuitem"
                onClick={(e) => handleSelectPriority(e, p)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 36,
                  padding: "0 10px",
                  background: isCurrent
                    ? "var(--color-surface-raised)"
                    : "transparent",
                  border: 0,
                  borderRadius: "var(--radius-sm, 4px)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: isCurrent ? 700 : 500,
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: t.dotVar,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {t.label}
              </button>
            );
          })}

          <button
            type="button"
            role="menuitem"
            onClick={handleDismiss}
            disabled={isDismissed}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 36,
              padding: "0 10px",
              marginTop: 4,
              borderTop: "1px solid var(--color-border-subtle)",
              paddingTop: 8,
              background: "transparent",
              border: 0,
              borderRadius: "var(--radius-sm, 4px)",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              color: isDismissed
                ? "var(--color-text-muted)"
                : "var(--color-text-primary)",
              cursor: isDismissed ? "default" : "pointer",
              textAlign: "left",
              opacity: isDismissed ? 0.6 : 1,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                border: "1.5px solid var(--color-text-muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-muted)",
                fontSize: 8,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {/* Unicode multiplication sign — not an emoji */}
              {"×"}
            </span>
            Dismiss this regulation
          </button>
        </div>
      )}
    </div>
  );
}
