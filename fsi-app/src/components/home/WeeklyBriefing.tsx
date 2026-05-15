"use client";

import { useMemo } from "react";
import Link from "next/link";
import { downloadFile } from "@/lib/export/download";
import { toBriefingEmail } from "@/lib/export/htmlReport";
import { toBriefingSlack } from "@/lib/export/slackFormat";
import { urgencyScore, buildSectorContext } from "@/lib/scoring";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import { FileText, Hash } from "lucide-react";

interface WeeklyBriefingProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  auditDate: string;
  // Scalar totals over the workspace's full active row set (migration 068).
  // Drives the summary line so it no longer reports the LIMIT-50 row count.
  aggregates: WorkspaceAggregates;
  onToast: (msg: string) => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--color-critical)",
  HIGH: "var(--color-high)",
  MODERATE: "var(--color-moderate)",
  LOW: "var(--color-low)",
};

const PRIORITY_KIND: Record<string, "crit" | "high" | "mod" | "low"> = {
  CRITICAL: "crit",
  HIGH: "high",
  MODERATE: "mod",
  LOW: "low",
};

/** Compute the day-count side-meta for a resource. Prefers complianceDeadline,
 *  falls back to the next future timeline milestone. Returns a short label
 *  ("18 days", "Q1 '27", "—") plus the priority kind for color. */
function dayCountMeta(r: Resource): string {
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
    if (diff <= 365) return `${diff} day${diff === 1 ? "" : "s"}`;
    // > 1 year out — quarterly label
    const q = Math.floor(d.getMonth() / 3) + 1;
    const yy = String(d.getFullYear()).slice(-2);
    return `Q${q} '${yy}`;
  }
  return "—";
}

export function WeeklyBriefing({
  resources,
  changelog,
  disputes,
  auditDate,
  aggregates,
  onToast,
}: WeeklyBriefingProps) {
  const { sectorProfile, sectorWeights } = useWorkspaceStore();
  const date = new Date().toISOString().slice(0, 10);
  const sectorCtx = buildSectorContext({ sectorProfile, sectorWeights });

  const briefing = useMemo(() => {
    // "New this week" uses a rolling 7-day window from today, not exact-equality
    // against auditDate (the most-recent changelog date). The prior filter only
    // matched when added_date and changelog date coincided exactly, which never
    // happens with prod ingestion cadence, so the suffix was silently dropped.
    // Note: still bounded by the dashboard payload's LIMIT 50, so this counts
    // "new in the last 7 days, among the top 50 by priority". A true count
    // would need new_last_7_days as a scalar on the aggregates RPC.
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const newR = resources.filter((r) => r.added && r.added >= cutoff);
    const top5 = [...resources]
      .sort((a, b) => urgencyScore(b, null, sectorCtx) - urgencyScore(a, null, sectorCtx))
      .slice(0, 5);
    return { newR, top5 };
  }, [resources, sectorCtx]);

  const handleDownload = (format: "html" | "slack") => {
    if (format === "html") {
      const html = toBriefingEmail(resources, date, changelog, disputes, auditDate);
      downloadFile(html, `briefing_${date}.html`);
    } else {
      const text = toBriefingSlack(resources, date, changelog, disputes, auditDate);
      downloadFile(text, `briefing_${date}_slack.txt`, "text/plain");
    }
    onToast("File downloaded");
  };

  // Totals come from the aggregates RPC (migration 068), scoped to the
  // workspace's active row set BEFORE the dashboard payload's LIMIT 50.
  // briefing.newR.length is intentionally row-derived: the LIMIT-50 payload
  // sorts by priority then added_date desc, so it accurately reflects
  // "newest urgent" for the bounded view the rest of WeeklyBriefing renders.
  // Fallback when aggregates are unavailable (anon / seed / RPC failure):
  // derive from the row array so the summary still renders sensible numbers.
  const totalItems =
    aggregates.totalItems > 0 ? aggregates.totalItems : resources.length;
  const totalJurisdictions =
    aggregates.totalJurisdictions > 0
      ? aggregates.totalJurisdictions
      : new Set(resources.map((r) => r.jurisdiction || "global")).size;
  const summary = `Tracking ${totalItems} regulatory resources across ${totalJurisdictions} jurisdictions.${
    briefing.newR.length > 0 ? ` ${briefing.newR.length} new this week.` : ""
  }`;

  return (
    <div
      className="cl-card"
      style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 0 }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          color: "var(--color-text-primary)",
          paddingBottom: 12,
          marginBottom: 12,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        Top priority this week — {briefing.top5.length} item{briefing.top5.length === 1 ? "" : "s"}
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
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {briefing.top5.map((r, i) => {
          const meta = dayCountMeta(r);
          const kind = PRIORITY_KIND[r.priority] || "mod";
          const metaColor =
            kind === "crit"
              ? "var(--color-critical)"
              : kind === "high"
              ? "var(--color-high)"
              : kind === "mod"
              ? "var(--color-moderate)"
              : "var(--color-text-muted)";
          return (
            <li
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "4px 1fr auto",
                gap: 14,
                padding: "11px 0",
                borderTop: i === 0 ? "0" : "1px solid var(--color-border)",
                paddingTop: i === 0 ? 4 : 11,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  alignSelf: "stretch",
                  borderRadius: 2,
                  background: PRIORITY_COLOR[r.priority] || "var(--color-text-muted)",
                }}
              />
              <Link
                href={`/regulations/${r.id}`}
                prefetch={false}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    lineHeight: 1.3,
                  }}
                >
                  {r.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    marginTop: 2,
                  }}
                >
                  {r.note}
                </div>
              </Link>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  color: metaColor,
                }}
              >
                {meta}
              </span>
            </li>
          );
        })}
      </ul>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <button
          onClick={() => handleDownload("html")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)] cursor-pointer transition-colors"
        >
          <FileText size={11} strokeWidth={2} />
          Download HTML
        </button>
        <button
          onClick={() => handleDownload("slack")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)] cursor-pointer transition-colors"
        >
          <Hash size={11} strokeWidth={2} />
          Download Slack
        </button>
      </div>
    </div>
  );
}
