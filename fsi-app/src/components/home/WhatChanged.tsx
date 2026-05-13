"use client";

import Link from "next/link";
import type { Resource, ChangeLogEntry } from "@/types/resource";

interface WhatChangedProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  auditDate?: string;
}

const PRIORITY_BAR: Record<string, string> = {
  CRITICAL: "var(--color-critical)",
  HIGH: "var(--color-high)",
  MODERATE: "var(--color-moderate)",
  LOW: "var(--color-low)",
};

const PRIORITY_LABEL_COLOR: Record<string, string> = {
  CRITICAL: "var(--color-critical)",
  HIGH: "var(--color-high)",
  MODERATE: "var(--color-moderate)",
  LOW: "var(--color-low)",
};

function dayCountMeta(r: Resource): { label: string; color: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates: string[] = [];
  if (r.complianceDeadline) candidates.push(r.complianceDeadline);
  if (r.timeline) {
    for (const t of r.timeline) {
      if (t.date) candidates.push(t.date);
    }
  }
  for (const raw of candidates) {
    const d = new Date(raw + (raw.length === 10 ? "T00:00:00" : ""));
    if (Number.isNaN(d.getTime())) continue;
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0) continue;
    if (diff <= 365) {
      return { label: `${diff} day${diff === 1 ? "" : "s"}`, color: PRIORITY_LABEL_COLOR[r.priority] || "var(--color-text-muted)" };
    }
    const q = Math.floor(d.getMonth() / 3) + 1;
    const yy = String(d.getFullYear()).slice(-2);
    return { label: `Q${q} '${yy}`, color: PRIORITY_LABEL_COLOR[r.priority] || "var(--color-text-muted)" };
  }
  return { label: "—", color: "var(--color-text-muted)" };
}

interface ItemRow {
  id: string;
  resource: Resource;
  changeType: "New" | "Updated";
  detail: string;
  priorityForLabel: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
}

export function WhatChanged({ resources, changelog, auditDate }: WhatChangedProps) {
  // "New" uses a rolling 7-day window from today, not exact-equality against
  // auditDate (the most-recent changelog date). The prior filter only matched
  // when added_date and auditDate coincided exactly, which rarely happens with
  // prod ingestion cadence, so the entire section silently disappeared when no
  // items were added on auditDate AND no items had changelog entries. Mirrors
  // the rolling-window fix applied to WeeklyBriefing in this PR.
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const newResources = resources.filter((r) => r.added && r.added >= cutoff);
  const changedIds = Object.keys(changelog);
  const changed = resources.filter((r) => changedIds.includes(r.id));
  void auditDate; // kept on prop signature for parent backward-compat

  if (newResources.length === 0 && changed.length === 0) return null;

  const newRows: ItemRow[] = newResources.map((r) => ({
    id: `new-${r.id}`,
    resource: r,
    changeType: "New",
    detail: r.note,
    priorityForLabel: r.priority,
  }));

  const updatedRows: ItemRow[] = changed.flatMap((r) => {
    const entries = changelog[r.id] || [];
    const head = entries[0];
    return [
      {
        id: `upd-${r.id}`,
        resource: r,
        changeType: "Updated" as const,
        detail: head?.now || head?.impact || head?.fields?.join(", ") || r.note,
        priorityForLabel: r.priority,
      },
    ];
  });

  // Dedup: an item that's both NEW and in changelog should only show as New.
  const seen = new Set<string>();
  const allRows = [...newRows, ...updatedRows].filter((row) => {
    const k = row.resource.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const total = allRows.length;
  const newCriticalCount = newRows.filter((r) => r.priorityForLabel === "CRITICAL").length;

  const summary =
    newCriticalCount > 0
      ? `${newCriticalCount} new critical item${newCriticalCount === 1 ? "" : "s"} entered scope this audit.`
      : `${total} change${total === 1 ? "" : "s"} since last audit — review and update workflows accordingly.`;

  return (
    <div
      className="cl-card"
      style={{ padding: "18px 22px 20px" }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          color: "var(--color-text-primary)",
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        What changed — {total} since last audit
      </div>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--color-text-secondary)",
          margin: "0 0 14px",
        }}
      >
        {summary}
      </p>
      {allRows.map((row, idx) => {
        const meta = dayCountMeta(row.resource);
        const labelColor = PRIORITY_LABEL_COLOR[row.priorityForLabel] || "var(--color-text-muted)";
        return (
          <Link
            key={row.id}
            href={`/regulations/${row.resource.id}`}
            prefetch={false}
            style={{
              display: "grid",
              gridTemplateColumns: "3px 1fr auto",
              gap: 12,
              padding: "14px 0",
              borderTop: idx === 0 ? "0" : "1px solid var(--color-border)",
              paddingTop: idx === 0 ? 2 : 14,
              alignItems: "flex-start",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span
              style={{
                alignSelf: "stretch",
                borderRadius: 2,
                background: PRIORITY_BAR[row.priorityForLabel] || "var(--color-text-muted)",
                minHeight: 28,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 2,
                  color: labelColor,
                }}
              >
                {row.changeType} · {row.priorityForLabel.charAt(0) + row.priorityForLabel.slice(1).toLowerCase()}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                }}
              >
                {row.resource.title}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--color-text-secondary)",
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                {row.detail}
              </div>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                color: meta.color,
              }}
            >
              {meta.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
