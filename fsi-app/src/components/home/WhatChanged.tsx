"use client";

/**
 * WhatChanged — the "This week" summary bar of the unified change log
 * (TEMPLATE 01, HANDOFF §6.3 + mock).
 *
 * THE WHATCHANGED RULE (binding gate): the changed-half stays DATE-STAMPED and
 * MUST NEVER imply live change detection. The item_changelog writer is Phase 3
 * (unbuilt), so there is no continuous detection. This component renders the
 * honest date-stamped state: a summary line + a "checked {relative}" stamp
 * derived from the last detection pass (auditDate). When new/updated items are
 * present within the trailing window they are listed, date-stamped, with an
 * explicit note that they reflect the last detection pass — never a fabricated
 * diff and never a claim of live monitoring.
 *
 * The "Earlier · replaced" supersessions ledger is a sibling
 * (<SupersessionsLedger>), kept out of the active-change list per the mock's
 * "superseded items never mix into active lists" rule.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { Resource, ChangeLogEntry } from "@/types/resource";
import type { RecentChangeRow } from "@/lib/supabase-server";
import { itemDetailHref } from "@/lib/item-links";
import { formatRelative, toDate } from "@/lib/relative-time";

interface WhatChangedProps {
  resources: Resource[];
  /** Window-scoped feed (get_workspace_recent_changes). The "New" half reads
   *  THIS, not `resources`: the dashboard slice is LIMIT 50 by priority, so
   *  deriving "new this week" from it went blind once the corpus outgrew the
   *  slice (2026-08-01: 216 in-window items rendered as "nothing"). */
  recentChanges: RecentChangeRow[];
  changelog: Record<string, ChangeLogEntry[]>;
  auditDate?: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--reg-band-immediate)",
  HIGH: "var(--reg-band-action)",
  MODERATE: "var(--reg-band-monitor)",
  LOW: "var(--reg-band-awareness)",
};

// Truncation (operator ruling 2026-08-01): with autonomous authorship landing
// 150+ items/day, the change list can carry hundreds of rows — rendering them
// all made the home page unscrollable. Show the top VISIBLE_ROWS by priority,
// collapsed by default (accordion doctrine), with an explicit show-all toggle.
const VISIBLE_ROWS = 5;
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };

interface ItemRow {
  id: string;
  itemId: string;
  title: string;
  changeType: "New" | "Updated";
  priorityForLabel: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  /** Canonical-surface detail link (misroute contract): both halves of the
   *  feed span ALL item types, so the href derives from surfaceOf via
   *  itemDetailHref, never a hard-coded /regulations. */
  href: string;
}

function asPriority(p: string | undefined): ItemRow["priorityForLabel"] {
  return p === "CRITICAL" || p === "HIGH" || p === "MODERATE" || p === "LOW" ? p : "LOW";
}

export function WhatChanged({ resources, recentChanges, changelog, auditDate }: WhatChangedProps) {
  // Trailing 7-day window from today for "New" (real added dates). "Updated"
  // rows come from the last detection pass (changelog), never live. Read the
  // clock once via a state initializer so the cutoff is render-stable (avoids
  // an impure Date.now() at render — react-hooks/purity, matching the shipped
  // RegulationsLedger pattern).
  const [cutoff] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  // "New" reads the WINDOW-SCOPED feed (server-filtered by added_date), never
  // the LIMIT-50 dashboard slice. The cutoff re-check is a cheap client-side
  // guard against a cached feed row drifting out of the window.
  const newInWindow = recentChanges.filter((r) => r.added && r.added >= cutoff);
  // Wave-α A2 (2026-07-11): the "Updated" half is date-gated to the same
  // 7-day window as the "New" half. Previously ANY changelog entry ever
  // recorded put the item under "This week" — the 9 March-2026 demo-era
  // item_changelog rows rendered as fresh updates months later. Stale
  // entries now render nothing (honest zero state).
  const changedIds = new Set(
    Object.entries(changelog)
      .filter(([, entries]) => entries.some((e) => e.date && e.date >= cutoff))
      .map(([id]) => id)
  );
  const changed = resources.filter((r) => changedIds.has(r.id));

  const newRows: ItemRow[] = newInWindow.map((r) => ({
    id: `new-${r.id}`,
    itemId: r.id,
    title: r.title,
    changeType: "New",
    priorityForLabel: asPriority(r.priority),
    // itemType/domain are optional on RecentChangeRow (cache-shape rule: a
    // stale cached payload lacks them); absent fields fall back to the
    // pre-fix /regulations destination inside itemDetailHref.
    href: itemDetailHref({ id: r.id, type: r.itemType, domain: r.domain }),
  }));
  const updatedRows: ItemRow[] = changed.map((r) => ({
    id: `upd-${r.id}`,
    itemId: r.id,
    title: r.title,
    changeType: "Updated" as const,
    priorityForLabel: r.priority,
    href: itemDetailHref(r),
  }));

  const seen = new Set<string>();
  const allRows = [...newRows, ...updatedRows]
    .filter((row) => {
      if (seen.has(row.itemId)) return false;
      seen.add(row.itemId);
      return true;
    })
    // Stable priority sort so the visible top-5 is the highest-signal slice,
    // not merely the first five in insertion order.
    .sort((a, b) => (PRIORITY_RANK[a.priorityForLabel] ?? 4) - (PRIORITY_RANK[b.priorityForLabel] ?? 4));
  const total = allRows.length;
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? allRows : allRows.slice(0, VISIBLE_ROWS);

  // CLIENT-ONLY relative-time (diagnosis 2026-07-13, React #418): formatRelative() buckets Date.now()-ts, so
  // computing it in the render body makes the server HTML and the client hydration land in different buckets
  // ("checked 2 hr ago" vs "3 hr ago") — a hydration text mismatch, widened by any shell caching. Hold a stable
  // value for SSR + first client render (empty when an audit date exists; the honest no-pass string otherwise),
  // then fill the relative form post-mount. Matches the shipped briefingDate client-mount pattern (V-07).
  const auditDateObj = toDate(auditDate);
  const [checkedLabel, setCheckedLabel] = useState(auditDateObj ? "" : "no detection pass on record");
  useEffect(() => {
    setCheckedLabel(auditDateObj ? `checked ${formatRelative(auditDateObj)}` : "no detection pass on record");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditDate]);

  return (
    <>
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-bg-surface)",
          padding: "13px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          margin: "0 0 10px",
        }}
      >
        <p style={{ fontSize: 13, margin: 0 }}>
          <b>This week:</b>{" "}
          <span style={{ color: "var(--color-text-secondary)" }}>
            {total === 0
              ? "nothing — no items added, updated, or replaced in the last 7 days."
              : `${total} item${total === 1 ? "" : "s"} added or updated in the last detection pass.`}
          </span>
        </p>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{checkedLabel}</span>
      </div>

      {total > 0 && (
        <>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              fontStyle: "italic",
              color: "var(--color-text-muted)",
            }}
          >
            Reflects the last detection pass{auditDateObj ? ` (${auditDate})` : ""}; continuous change-detection is
            not yet live.
          </p>
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              background: "var(--color-bg-surface)",
              overflow: "hidden",
              margin: "0 0 10px",
            }}
          >
            {visibleRows.map((row, idx) => (
              <Link
                key={row.id}
                href={row.href}
                prefetch={false}
                style={{
                  display: "grid",
                  gridTemplateColumns: "3px 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "11px 18px",
                  borderTop: idx === 0 ? "0" : "1px solid var(--color-border-subtle)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    alignSelf: "stretch",
                    borderRadius: 2,
                    background: PRIORITY_COLOR[row.priorityForLabel] || "var(--color-text-muted)",
                    minHeight: 24,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      margin: 0,
                      color: PRIORITY_COLOR[row.priorityForLabel] || "var(--color-text-muted)",
                    }}
                  >
                    {row.changeType}
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", margin: "2px 0 0" }}>
                    {row.title}
                  </p>
                </div>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }} aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
            {total > VISIBLE_ROWS && (
              <button
                type="button"
                onClick={() => setExpanded((s) => !s)}
                aria-expanded={expanded}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  width: "100%",
                  padding: "12px 18px",
                  border: 0,
                  borderTop: "1px solid var(--color-border-subtle)",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                }}
              >
                {expanded ? "Show top 5 only" : `Show all ${total} items`}
                <ChevronDown
                  size={13}
                  style={{
                    transition: "transform 200ms var(--ease-out-expo, ease-out)",
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
