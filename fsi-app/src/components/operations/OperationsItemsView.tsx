"use client";

/**
 * OperationsItemsView — live items list for the /operations surface.
 *
 * Mirrors the FindingCard / ResearchView card pattern:
 * - 1fr / 220px grid
 * - Item-head strip: severity pill + jurisdiction kicker + date when
 * - Left column: title + note (summary) + source byline
 * - Right column: tier badge + severity pill + "What it changes" callout
 * - Entire card wrapped in <Link href="/operations/[id]">
 *
 * Severity derivation is identical to OperationsPage's
 * deriveRegulationSeverity (reuses the same column-first + regex
 * fallback against Resource.severity + priority).
 *
 * Items grouped by jurisdiction (flat list fallback when jurisdiction
 * is absent). Empty state ("No active operations items yet") when
 * items is empty.
 *
 * Surface-honesty: only renders when parent confirms items.length > 0.
 * No fabricated grouping labels — jurisdiction strings come directly
 * from the data layer.
 */

import Link from "next/link";
import type { Resource } from "@/types/resource";

// ── Severity vocabulary (Operations: Critical / High / Moderate / Low) ──

type Severity = "critical" | "high" | "moderate" | "low";

const SEVERITY_PILL_TONE: Record<Severity, { fg: string; bg: string; bd: string }> = {
  critical: { fg: "var(--color-critical)", bg: "var(--color-critical-bg)", bd: "var(--color-critical-border)" },
  high: { fg: "var(--color-high)", bg: "var(--color-high-bg)", bd: "var(--color-high-border)" },
  moderate: { fg: "var(--color-moderate)", bg: "var(--color-moderate-bg)", bd: "var(--color-moderate-border)" },
  low: { fg: "var(--color-low)", bg: "var(--color-low-bg)", bd: "var(--color-low-border)" },
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low",
};

// Column-first severity mapping (same as OperationsPage).
const SEVERITY_COLUMN_TO_KEY: Record<string, Severity> = {
  critical: "critical",
  high: "high",
  moderate: "moderate",
  low: "low",
  action_required: "critical",
  cost_alert: "high",
  window_closing: "moderate",
  competitive_edge: "moderate",
  monitoring: "low",
  immediate: "critical",
  watch: "moderate",
  reference: "low",
  background: "low",
};

function deriveSeverity(r: Resource): Severity {
  if (r.severity && SEVERITY_COLUMN_TO_KEY[r.severity]) {
    return SEVERITY_COLUMN_TO_KEY[r.severity];
  }
  const text = `${r.title} ${r.note || ""}`.toLowerCase();
  if (/\b(action required|immediate|deadline|effective \d|in force)\b/.test(text)) return "critical";
  if (/\b(window|q\d|by 20|consultation|phase-in)\b/.test(text)) return "moderate";
  if (r.priority === "CRITICAL") return "critical";
  if (r.priority === "HIGH") return "high";
  if (r.priority === "MODERATE") return "moderate";
  return "low";
}

// ── Date formatting (mirrors ResearchView) ──

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

// ── Severity pill ──

function SeverityPill({ severity }: { severity: Severity }) {
  const tone = SEVERITY_PILL_TONE[severity];
  return (
    <span
      style={{
        alignSelf: "flex-start",
        display: "inline-block",
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 3,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
      }}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

// ── Item card (mirrors FindingCard from ResearchView) ──

function OperationsItemCard({ item }: { item: Resource }) {
  const severity = deriveSeverity(item);
  const tier = item.sourceTier ?? undefined;
  const when = formatShortDate(item.added);
  const jurisdiction = item.jurisdiction || item.jurisdictionIso?.[0] || null;

  return (
    <Link
      href={`/operations/${encodeURIComponent(item.id)}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <article
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderLeft: "3px solid var(--color-primary)",
          borderRadius: "var(--radius-sm)",
          padding: "16px 20px 18px",
          margin: "10px 0",
          boxShadow: "var(--shadow-card)",
          display: "grid",
          gridTemplateColumns: "1fr 220px",
          gap: 22,
          alignItems: "start",
          cursor: "pointer",
        }}
      >
        {/* Body column */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <SeverityPill severity={severity} />
            {jurisdiction && (
              <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>
                {jurisdiction}
              </span>
            )}
            {when && (
              <span
                style={{
                  marginLeft: "auto",
                  color: "var(--color-text-muted)",
                  fontWeight: 600,
                  fontSize: 10.5,
                }}
              >
                {when}
              </span>
            )}
          </div>
          <h4
            style={{
              fontSize: 17,
              fontWeight: 700,
              lineHeight: 1.35,
              margin: "4px 0 6px",
              color: "var(--color-text-primary)",
            }}
          >
            {item.title}
          </h4>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--color-text-secondary)",
              margin: "0 0 6px",
            }}
          >
            {item.note}
          </p>
          {item.sourceName && (
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8 }}>
              <b style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>
                {item.sourceName}
              </b>
              {tier !== undefined && (
                <span style={{ marginLeft: 8 }}>· T{tier}</span>
              )}
            </p>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tier !== undefined && (
            <span
              style={{
                alignSelf: "flex-start",
                fontFamily: "var(--font-display)",
                fontSize: 11,
                padding: "1px 6px",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              T{tier}
            </span>
          )}
          <SeverityPill severity={severity} />
          {/* "What it changes" callout — mirrors ResearchView's FindingCard.
              Optional-chained: get_operations_items may not return this field. */}
          {item.whatItChanges && (
            <div
              style={{
                borderLeft: "3px solid var(--color-secondary, var(--color-primary))",
                padding: "8px 10px 8px 12px",
                background: "var(--color-surface-raised, var(--color-bg-raised))",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  marginBottom: 4,
                }}
              >
                What it changes
              </div>
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                {item.whatItChanges}
              </p>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

// ── Jurisdiction grouping helpers ──

function groupByJurisdiction(items: Resource[]): Map<string, Resource[]> {
  const map = new Map<string, Resource[]>();
  for (const item of items) {
    const key =
      item.jurisdiction ||
      item.jurisdictionIso?.[0] ||
      "Other";
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

// ── Main component ──

interface OperationsItemsViewProps {
  items: Resource[];
}

export function OperationsItemsView({ items }: OperationsItemsViewProps) {
  if (items.length === 0) {
    return (
      <p
        style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          fontStyle: "italic",
          margin: 0,
          padding: "12px 0",
        }}
      >
        No active operations items yet.
      </p>
    );
  }

  const grouped = groupByJurisdiction(items);
  const sortedKeys = Array.from(grouped.keys()).sort();

  // If there is only one jurisdiction bucket (or all fall to "Other"),
  // render a flat list without the group header to avoid noisy chrome.
  const showGroupHeaders = sortedKeys.length > 1;

  return (
    <div>
      {sortedKeys.map((jurisdiction) => {
        const group = grouped.get(jurisdiction)!;
        return (
          <div key={jurisdiction}>
            {showGroupHeaders && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  padding: "12px 0 4px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  marginBottom: 4,
                }}
              >
                {jurisdiction}
              </div>
            )}
            {group.map((item) => (
              <OperationsItemCard key={item.id} item={item} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
