"use client";

/**
 * AuthPanel — shared right-panel bits for /login and /signup (UI system
 * handoff 2026-09-06, README screen 16): the "Sign in / Create account" tab
 * strip and the field geometry both forms share ("same inputs and buttons
 * as Settings" per the artboard's note). Extracted here rather than
 * duplicated in both page.tsx files (CLAUDE.md rule 13).
 */

import type { CSSProperties, ReactNode } from "react";
import { MailCheck } from "lucide-react";

export const AUTH_FIELD_LABEL_STYLE: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  fontWeight: 700,
  marginBottom: 5,
  display: "block",
};

export const AUTH_INPUT_STYLE: CSSProperties = {
  width: "100%",
  height: 36,
  border: "1px solid rgba(0,0,0,.25)",
  borderRadius: "var(--radius-control)",
  padding: "0 10px",
  fontSize: "var(--fs-13)",
  background: "var(--card)",
  color: "var(--ink)",
  outline: "none",
};

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span style={AUTH_FIELD_LABEL_STYLE}>{label}</span>
      {children}
    </div>
  );
}

export function AuthTabs({
  active,
  redirect,
}: {
  active: "signin" | "signup";
  redirect?: string | null;
}) {
  const suffix = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line-1)" }}>
      <a
        href={`/login${suffix}`}
        style={{
          padding: "9px 12px",
          fontSize: "var(--fs-125)",
          fontWeight: active === "signin" ? 700 : 600,
          color: active === "signin" ? "var(--ink)" : "var(--ink-2)",
          borderBottom: active === "signin" ? "2px solid var(--brand)" : "2px solid transparent",
          marginBottom: -1,
          textDecoration: "none",
        }}
      >
        Sign in
      </a>
      <a
        href={`/signup${suffix}`}
        style={{
          padding: "9px 12px",
          fontSize: "var(--fs-125)",
          fontWeight: active === "signup" ? 700 : 600,
          color: active === "signup" ? "var(--ink)" : "var(--ink-2)",
          borderBottom: active === "signup" ? "2px solid var(--brand)" : "2px solid transparent",
          marginBottom: -1,
          textDecoration: "none",
        }}
      >
        Create account
      </a>
    </div>
  );
}

export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius-control)",
        background: "var(--immediate-tint)",
        border: "1px solid rgba(220,38,38,.2)",
        color: "var(--immediate)",
        fontSize: "var(--fs-125)",
      }}
    >
      {message}
    </div>
  );
}

export function AuthDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
      <span style={{ flex: 1, borderTop: "1px solid var(--line-1)" }} />
      or
      <span style={{ flex: 1, borderTop: "1px solid var(--line-1)" }} />
    </div>
  );
}

/** Post-submit "check your email" state — shared by signup (confirmation
 *  link) and the magic-link path on /login. */
export function CheckEmailPanel({ email, note }: { email: string; note: string }) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--line-1)",
        background: "var(--card)",
        padding: 20,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--accent-bg)",
          color: "var(--brand)",
        }}
      >
        <MailCheck size={18} />
      </div>
      <h2 style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>
        Check your email
      </h2>
      <p style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", margin: 0 }}>
        {note}{" "}
        <span style={{ color: "var(--ink)", fontWeight: 600 }}>{email}</span>.
      </p>
    </div>
  );
}
