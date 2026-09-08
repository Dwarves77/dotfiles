"use client";

/**
 * AccountPrimitives — shared presentational pieces for the Account surface
 * (T10). Values lifted from "Pages - 10 Account" inline styles; colours go
 * through the T02 semantic tokens (theme.css), never raw hex.
 */

import type { ReactNode, CSSProperties } from "react";
import { SectionCard } from "@/components/ui/SectionCard";

const SANS = "var(--font-sans)";

// ── Sub-tab bar (Profile sub-tabs / Settings sub-tabs) ───────────────────
// Active tab = 3px orange underline + bold ink; resting = secondary ink.
// Real buttons, keyboard-operable, aria-current on the active one.

export interface SubTab<T extends string> {
  key: T;
  label: string;
}

export function SubTabBar<T extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
}: {
  tabs: SubTab<T>[];
  active: T;
  onSelect: (key: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: "2px",
        borderBottom: "1px solid var(--color-border)",
        margin: "0 0 18px",
        flexWrap: "wrap",
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t.key)}
            style={{
              fontFamily: SANS,
              fontSize: "12.5px",
              fontWeight: on ? 800 : 600,
              padding: "10px 16px",
              whiteSpace: "nowrap",
              border: "none",
              borderBottom: `3px solid ${on ? "var(--color-primary)" : "transparent"}`,
              background: "transparent",
              color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Card with an Anton title head (dc.html p14/p15) ──────────────────────

export function AccountCard({
  title,
  meta,
  children,
  maxWidth,
  bodyPad = true,
  bodyPadding,
  foot,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  bodyPad?: boolean;
  /** Overrides the default body padding. Artboard 15 (dc.html id="p15") pads its card bodies
   *  `14px 16px 16px`, not the `16px 20px` the profile cards use. */
  bodyPadding?: string;
  /** Optional foot strip below the body (dc.html p15 Freight sectors: `10px 16px`, top border,
   *  `#FAFAF8` ground). */
  foot?: ReactNode;
}) {
  return (
    // Operator items A1 + A3 (2026-09-08): the account/settings card is the shared `SectionCard`
    // now. It was one of the shells carrying NO shadow at all (`--shadow-card` was simply absent
    // from this style object), which is the A3 defect; the card component supplies it, so the miss
    // is not reachable from here any more. Ruling 5.1 unchanged: rule above the title, no divider
    // below it.
    <SectionCard as="section" style={{ maxWidth }}>
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid rgba(0,0,0,.08)",
          // dc.html p14 and p15 both draw this head on the card's own white, with only the
          // hairline below it. The tinted plate it used to carry is in neither artboard.
          // (Removed independently by lanes settings60 and admin60; one copy kept at the fold.)
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "20px",
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
          }}
        >
          {title}
        </span>
        {meta != null && (
          <span
            /* dc.html p14/p15 card head meta: 10.5px / .12em / uppercase / 600,
               one line (lane admin60, 2026-09-08, it used to render in
               sentence case at the same size, which read as body copy). */
            style={{
              fontSize: "10.5px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            {meta}
          </span>
        )}
      </div>
      <div style={bodyPadding ? { padding: bodyPadding } : bodyPad ? { padding: "16px 20px" } : undefined}>
        {children}
      </div>
      {foot != null && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(0,0,0,.08)",
            background: "var(--color-surface-raised)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          {foot}
        </div>
      )}
    </SectionCard>
  );
}

// ── Segmented control (dc.html p15: joined options in one 1px box, active
//    filled ink-on-white) ───────────────────────────────────────────────────
// The artboard uses this form five times on Settings alone (Default sort,
// Default export, Alert bands, Cadence, Day), so it is one part, not five
// inline copies. Multi-select groups (Alert bands) pass `multiple` so the
// buttons carry aria-pressed instead of aria-checked on a radiogroup.

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  selected,
  onSelect,
  ariaLabel,
  multiple = false,
  disabled = false,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  /** The selected option ids. Single-select groups pass exactly one. */
  selected: ReadonlyArray<T>;
  onSelect: (id: T) => void;
  ariaLabel: string;
  multiple?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        // A group whose segments cannot fit its column wraps onto a second line rather than being
        // clipped by the card edge (operator, 2026-09-07: "your text ... overlays different
        // areas"; no cell may overflow its column).
        flexWrap: "wrap",
        border: "1px solid var(--color-border-medium)",
        borderRadius: 6,
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      {options.map((option, index) => {
        const on = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : on}
            aria-pressed={multiple ? on : undefined}
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            style={{
              fontFamily: SANS,
              // dc.html p15 draws `6px 12px`, which lands at ~30px tall. Same 24px minimum box the
              // list surfaces' own sort options and the band-card foot link already carry, rather
              // than inflating the control to 44px and losing the artboard's geometry. 10px, not
              // the artboard's 12px: the built content column is 764px where the artboard's is 780
              // (AppShell puts the nav card's 16px margin outside its 252px track), and at 12px the
              // Alert bands group ran 10px past its own column.
              padding: "6px 10px",
              minHeight: 24,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
              border: "none",
              borderLeft: index === 0 ? "none" : "1px solid rgba(0,0,0,.15)",
              background: on ? "var(--color-primary)" : "transparent",
              color: on ? "#FFFFFF" : "var(--color-text-secondary)",
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Honest-state dashed frame (§4) ───────────────────────────────────────

export function HonestFrame({
  heading,
  children,
  maxWidth = 720,
}: {
  heading: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      style={{
        border: "1px dashed rgba(0,0,0,0.25)",
        borderRadius: 8,
        background: "var(--color-background)",
        padding: "16px 20px",
        maxWidth,
      }}
    >
      <p style={{ fontSize: "12.5px", fontWeight: 800, margin: "0 0 4px", color: "var(--color-text-primary)" }}>
        {heading}
      </p>
      <div style={{ fontSize: "12px", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
        {children}
      </div>
    </div>
  );
}

// Plain white card (no plate header) for simple honest/info panels.
export function PlainCard({
  children,
  maxWidth = 720,
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "16px 20px",
        maxWidth,
      }}
    >
      {children}
    </div>
  );
}

// ── Selectable chip (rounded 6px, orange-tinted when on) ──────────────────

export function Chip({
  label,
  on,
  onClick,
  pill = false,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  pill?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        fontFamily: SANS,
        fontSize: pill ? "11px" : "11.5px",
        fontWeight: on ? 800 : 600,
        padding: pill ? "5px 11px" : "7px 14px",
        borderRadius: pill ? 999 : 6,
        border: on
          ? `${pill ? 1 : 2}px solid var(--color-primary)`
          : "1px solid var(--color-border-medium)",
        background: on ? "var(--color-bg-ai-strip)" : "var(--surface)",
        color: on
          ? pill
            ? "var(--color-primary)"
            : "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ── Toggle switch (36×20, orange track when on) ──────────────────────────

export function ToggleSwitch({
  on,
  onFlip,
  locked = false,
  label,
}: {
  on: boolean;
  onFlip: () => void;
  locked?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={locked || undefined}
      disabled={locked}
      onClick={locked ? undefined : onFlip}
      style={{
        width: 32,
        height: 18,
        borderRadius: 999,
        border: "none",
        padding: 2,
        background: on ? "var(--color-primary)" : "rgba(0,0,0,0.18)",
        display: "inline-flex",
        justifyContent: on ? "flex-end" : "flex-start",
        alignItems: "center",
        opacity: locked ? 0.75 : 1,
        cursor: locked ? "default" : "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#FFFFFF",
          display: "block",
        }}
      />
    </button>
  );
}

// ── Field label + text input (mock: uppercase micro-label, tinted input) ──

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: "9.5px",
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        margin: "0 0 6px",
      }}
    >
      {children}
    </p>
  );
}

const inputBase: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: SANS,
  fontSize: "13px",
  padding: "10px 12px",
  border: "1px solid var(--color-border-medium)",
  borderRadius: 6,
  outline: "none",
  background: "var(--color-background)",
  color: "var(--color-text-primary)",
};

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  return (
    <input
      {...props}
      style={{ ...inputBase, ...(props.disabled ? { opacity: 0.7 } : null), ...(props.style as CSSProperties) }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--color-primary)";
        e.currentTarget.style.background = "var(--surface)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-medium)";
        e.currentTarget.style.background = "var(--color-background)";
        props.onBlur?.(e);
      }}
    />
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea
      {...props}
      style={{ ...inputBase, resize: "vertical", ...(props.style as CSSProperties) }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--color-primary)";
        e.currentTarget.style.background = "var(--surface)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-medium)";
        e.currentTarget.style.background = "var(--color-background)";
        props.onBlur?.(e);
      }}
    />
  );
}

// Dark ink primary button (mock "Save personal profile").
export function InkButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      style={{
        fontFamily: SANS,
        fontSize: "12.5px",
        fontWeight: 800,
        padding: "11px 20px",
        borderRadius: 6,
        border: "1px solid var(--color-invert-bg)",
        background: "var(--color-invert-bg)",
        color: "var(--color-invert-text)",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        ...(rest.style as CSSProperties),
      }}
    >
      {children}
    </button>
  );
}
