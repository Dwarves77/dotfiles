"use client";

/**
 * AccountPrimitives — shared presentational pieces for the Account surface
 * (T10). Values lifted from "Pages - 10 Account" inline styles; colours go
 * through the T02 semantic tokens (theme.css), never raw hex.
 */

import type { ReactNode, CSSProperties } from "react";

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

// ── Card with a #F5F2EE plate header (bg-plate) ──────────────────────────

export function AccountCard({
  title,
  meta,
  children,
  maxWidth,
  bodyPad = true,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  bodyPad?: boolean;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
        maxWidth,
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          background: "var(--color-surface-raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "12.5px",
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
          }}
        >
          {title}
        </span>
        {meta != null && (
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: 700,
              color: "var(--color-text-muted)",
            }}
          >
            {meta}
          </span>
        )}
      </div>
      <div style={bodyPad ? { padding: "16px 20px" } : undefined}>{children}</div>
    </section>
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
        width: 36,
        height: 20,
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
          width: 16,
          height: 16,
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
