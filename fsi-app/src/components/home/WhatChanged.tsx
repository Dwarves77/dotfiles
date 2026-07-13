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
import type { Resource, ChangeLogEntry } from "@/types/resource";
import { formatRelative, toDate } from "@/lib/relative-time";

interface WhatChangedProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  auditDate?: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--reg-band-immediate)",
  HIGH: "var(--reg-band-action)",
  MODERATE: "var(--reg-band-monitor)",
  LOW: "var(--reg-band-awareness)",
};

interface ItemRow {
  id: string;
  resource: Resource;
  changeType: "New" | "Updated";
  priorityForLabel: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
}

export function WhatChanged({ resources, changelog, auditDate }: WhatChangedProps) {
  // Trailing 7-day window from today for "New" (real added dates). "Updated"
  // rows come from the last detection pass (changelog), never live. Read the
  // clock once via a state initializer so the cutoff is render-stable (avoids
  // an impure Date.now() at render — react-hooks/purity, matching the shipped
  // RegulationsLedger pattern).
  const [cutoff] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const newResources = resources.filter((r) => r.added && r.added >= cutoff);
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

  const newRows: ItemRow[] = newResources.map((r) => ({
    id: `new-${r.id}`,
    resource: r,
    changeType: "New",
    priorityForLabel: r.priority,
  }));
  const updatedRows: ItemRow[] = changed.map((r) => ({
    id: `upd-${r.id}`,
    resource: r,
    changeType: "Updated" as const,
    priorityForLabel: r.priority,
  }));

  const seen = new Set<string>();
  const allRows = [...newRows, ...updatedRows].filter((row) => {
    if (seen.has(row.resource.id)) return false;
    seen.add(row.resource.id);
    return true;
  });
  const total = allRows.length;

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
            {allRows.map((row, idx) => (
              <Link
                key={row.id}
                href={`/regulations/${row.resource.id}`}
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
                    {row.resource.title}
                  </p>
                </div>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }} aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
