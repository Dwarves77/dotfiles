"use client";

/**
 * DashboardTopPriority — the "This week" priority glance list (left column).
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock). One glance row per top-priority
 * item: severity eyebrow + jurisdiction tag (left) / deadline chip + tier chip
 * (right), title, then a LABELED-ANALYSIS line (epistemic grammar §3 — ink on
 * paper, caps label, never colored as fact) + suggested owner. Footer expander
 * links into Regulations filtered to the band.
 *
 * HONESTY (binding):
 *   - Every rendered value binds a REAL field. The analysis line renders the
 *     item's stored `whyMatters` under an "OUR ANALYSIS" label (labeled
 *     analysis, not a fabricated "do now" directive — no per-item do-now field
 *     exists yet; see DESIGN-DEVIATIONS.md). Owner renders `actionOwner` only
 *     when present.
 *   - Tier chip binds `sourceTier`, clamped 1–7 (DO-NOT-REVERT), suppressed
 *     when the field is absent — never a chip without its backing field.
 *   - An absent deadline renders an em-dash with a muted reason (§4), never a
 *     fabricated "In force".
 *   - Zero top-priority items renders the honest-state frame (§4).
 */

import Link from "next/link";
import { useMemo } from "react";
import type { Resource } from "@/types/resource";

interface DashboardTopPriorityProps {
  resources: Resource[];
  /** Workspace jurisdiction total for the sub-line (true total, not row-derived). */
  jurisdictionsCount: number;
}

const SHOWN_CAP = 5;

type Band = "CRITICAL" | "HIGH";

const SEV_COLOR: Record<Band, string> = {
  CRITICAL: "var(--reg-band-immediate)",
  HIGH: "var(--reg-band-action)",
};

// Priority-derived eyebrow. The mock's per-item flavour labels ("Window
// closing", "Cost alert") have no backing field; a priority-derived label is
// the honest equivalent. See DESIGN-DEVIATIONS.md.
const SEV_EYEBROW: Record<Band, string> = {
  CRITICAL: "Action required",
  HIGH: "High priority",
};

function clampTier(tier: number): number {
  return Math.max(1, Math.min(7, Math.round(tier)));
}

function jurTag(r: Resource): string {
  const iso = r.jurisdictionIso?.[0];
  if (iso) return iso.toUpperCase();
  if (r.jurisdiction) return r.jurisdiction.toUpperCase();
  return "GLOBAL";
}

/** Nearest future deadline label + whether one exists.
 *  V-07 (2026-07-11): compute "today" and parse date-only deadlines in UTC so the SSR render and
 *  the client hydration agree on the day-count (local-midnight math varied by the viewer's
 *  timezone → React #418). UTC is deterministic across server and client; the only residual
 *  divergence is a sub-second render straddling UTC midnight, which is negligible. */
function deadlineLabel(r: Resource): string | null {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const candidates: string[] = [];
  if (r.complianceDeadline) candidates.push(r.complianceDeadline);
  if (r.timeline) for (const t of r.timeline) if (t.date) candidates.push(t.date);
  let best: number | null = null;
  for (const raw of candidates) {
    const d = new Date(raw + (raw.length === 10 ? "T00:00:00Z" : ""));
    const ms = d.getTime();
    if (Number.isNaN(ms)) continue;
    if (ms < today) continue;
    if (best === null || ms < best) best = ms;
  }
  if (best === null) return null;
  const diff = Math.round((best - today) / 86400000);
  if (diff <= 365) return `${diff} day${diff === 1 ? "" : "s"}`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(best);
}

export function DashboardTopPriority({
  resources,
  jurisdictionsCount,
}: DashboardTopPriorityProps) {
  const { shown, band, totalInBand } = useMemo(() => {
    const critical = resources.filter((r) => r.priority === "CRITICAL");
    const high = resources.filter((r) => r.priority === "HIGH");
    const activeBand: Band = critical.length > 0 ? "CRITICAL" : "HIGH";
    const pool = activeBand === "CRITICAL" ? critical : high;
    const sorted = pool.slice().sort((a, b) => {
      const ua = a.urgencyScore ?? 0;
      const ub = b.urgencyScore ?? 0;
      if (ub !== ua) return ub - ua;
      return a.title.localeCompare(b.title);
    });
    return {
      shown: sorted.slice(0, SHOWN_CAP),
      band: activeBand,
      totalInBand: pool.length,
    };
  }, [resources]);

  const headingId = "priority";

  if (shown.length === 0) {
    // Honest-state frame (§4): no top-priority items right now.
    return (
      <div style={{ minWidth: 0 }}>
        <h3 id={headingId} style={{ fontSize: 15, fontWeight: 800, margin: "0 0 12px" }}>
          Top priority this week
        </h3>
        <div
          style={{
            border: "1px dashed rgba(0,0,0,0.25)",
            borderRadius: 8,
            background: "var(--color-bg-base)",
            padding: "16px 18px",
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--brass)",
              margin: "0 0 6px",
            }}
          >
            Nothing critical this week
          </p>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
            No critical or high-priority items are open right now. New items appear here as they
            enter scope and are verified.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          margin: "0 0 12px",
          gap: 12,
        }}
      >
        <h3 id={headingId} style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
          Top priority this week — {shown.length} item{shown.length === 1 ? "" : "s"}
        </h3>
        <span style={{ fontSize: 11.5, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
          across {jurisdictionsCount} jurisdiction{jurisdictionsCount === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map((r) => {
          const sevColor = SEV_COLOR[band];
          const tier = r.sourceTier != null ? clampTier(r.sourceTier) : null;
          const deadline = deadlineLabel(r);
          const analysis = r.whyMatters?.trim();
          return (
            <Link
              key={r.id}
              href={`/regulations/${r.id}`}
              prefetch={false}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                borderLeft: `3px solid ${sevColor}`,
                borderRadius: 8,
                padding: "14px 18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      color: sevColor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {SEV_EYEBROW[band]}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.09em",
                      color: "var(--brass)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {jurTag(r)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                  {deadline ? (
                    <span style={{ fontSize: 12, fontWeight: 800, color: sevColor }}>{deadline}</span>
                  ) : (
                    <span
                      title="No dated deadline on record"
                      style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)" }}
                    >
                      — no date
                    </span>
                  )}
                  {tier != null && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: "var(--accent-blue)",
                        color: "#FFFFFF",
                      }}
                    >
                      T{tier}
                    </span>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 15, fontWeight: 800, margin: "5px 0 0" }}>{r.title}</p>
              {analysis && (
                <p
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: "var(--color-text-primary)",
                    margin: "7px 0 0",
                    borderLeft: "3px solid var(--color-text-primary)",
                    padding: "1px 0 1px 10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--color-text-primary)",
                      display: "block",
                      margin: "0 0 2px",
                    }}
                  >
                    Our analysis
                  </span>
                  {analysis}
                  {r.actionOwner && (
                    <span style={{ color: "var(--color-text-muted)" }}> Owner: {r.actionOwner}.</span>
                  )}
                </p>
              )}
            </Link>
          );
        })}

        <Link
          href={`/regulations?priority=${band}`}
          prefetch={false}
          style={{
            textDecoration: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 18px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-bg-surface)",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--color-primary)" }}>
            All {totalInBand} priority item{totalInBand === 1 ? "" : "s"} →
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            opens Regulations, filtered to {band === "CRITICAL" ? "Immediate" : "High"}
          </span>
        </Link>
      </div>
    </div>
  );
}
