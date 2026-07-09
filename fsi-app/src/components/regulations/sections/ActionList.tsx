/**
 * ActionList — §3 Issues Requiring Immediate Action.
 *
 * Sprint 3 A5.3 (2026-05-27). Renders parsed action items with a
 * severity chip + label + body. Integrity-preserving: when items is
 * empty, returns null so the parent SectionCard can choose to suppress.
 */

import type { ActionListItem, Severity } from "@/lib/agent/extract-regulation-sections";
import { isPlaceholderText } from "@/lib/agent/source-entry-filter.mjs";

const SEVERITY_LABEL: Record<Severity, string> = {
  action_required: "Action required",
  cost_alert: "Cost alert",
  window_closing: "Window closing",
  competitive_edge: "Competitive edge",
  monitoring: "Monitoring",
};

const SEVERITY_TONE: Record<Severity, { fg: string; bg: string; bd: string }> = {
  action_required: { fg: "var(--color-critical)", bg: "var(--color-critical-bg)", bd: "var(--color-critical-border)" },
  cost_alert: { fg: "var(--color-high)", bg: "var(--color-high-bg)", bd: "var(--color-high-border)" },
  window_closing: { fg: "var(--color-high)", bg: "var(--color-high-bg)", bd: "var(--color-high-border)" },
  competitive_edge: { fg: "var(--color-moderate)", bg: "var(--color-moderate-bg)", bd: "var(--color-moderate-border)" },
  monitoring: { fg: "var(--color-text-muted)", bg: "var(--color-surface)", bd: "var(--color-border)" },
};

export function ActionList({ items }: { items: ActionListItem[] }) {
  // F-1 class guard: drop an action row only when it has NO backed content at all
  // (both label and body empty/header-echo) — a body-only or label-only action is real.
  const shown = items.filter((it) => it && !(isPlaceholderText(it.label) && isPlaceholderText(it.body)));
  if (shown.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((it, i) => {
        const tone = it.severity ? SEVERITY_TONE[it.severity] : null;
        return (
          <li
            key={i}
            style={{
              borderLeft: `3px solid ${tone?.fg ?? "var(--color-border)"}`,
              paddingLeft: 14,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              {it.severity && tone && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: tone.fg,
                    background: tone.bg,
                    border: `1px solid ${tone.bd}`,
                    padding: "3px 8px",
                    borderRadius: 3,
                    whiteSpace: "nowrap",
                  }}
                >
                  {SEVERITY_LABEL[it.severity]}
                </span>
              )}
              {it.label && (
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {it.label}
                </span>
              )}
            </div>
            {it.body && (
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
                {it.body}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
