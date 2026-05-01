"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/export/download";
import { toBriefingEmail } from "@/lib/export/htmlReport";
import { toBriefingSlack } from "@/lib/export/slackFormat";
import { urgencyScore, matchResourceSector, buildSectorContext } from "@/lib/scoring";
import { useNavigationStore } from "@/stores/navigationStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ALL_SECTORS } from "@/lib/constants";
import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import { ChevronDown, FileText, Hash } from "lucide-react";

interface WeeklyBriefingProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  auditDate: string;
  onToast: (msg: string) => void;
}

export function WeeklyBriefing({
  resources,
  changelog,
  disputes,
  auditDate,
  onToast,
}: WeeklyBriefingProps) {
  const { pushFocusView } = useNavigationStore();
  const { sectorProfile, sectorWeights } = useWorkspaceStore();
  const [expanded, setExpanded] = useState(false);
  const date = new Date().toISOString().slice(0, 10);

  const sectorCtx = buildSectorContext({ sectorProfile, sectorWeights });

  const briefing = useMemo(() => {
    const newR = resources.filter((r) => r.added === auditDate);
    const top5 = [...resources].sort((a, b) => urgencyScore(b, null, sectorCtx) - urgencyScore(a, null, sectorCtx)).slice(0, 5);
    const disputedEntries = Object.entries(disputes)
      .filter(([, d]) => d.note)
      .map(([id, d]) => ({ id, ...d, r: resources.find((x) => x.id === id) }))
      .filter((x) => x.r);

    // Group top items by sector for multi-sector workspaces
    const bySector: Record<string, typeof top5> = {};
    if (sectorProfile.length > 1) {
      for (const r of top5) {
        const matched = matchResourceSector(r, sectorProfile);
        const key = matched
          ? ALL_SECTORS.find((s) => s.id === matched)?.label || matched
          : "General";
        if (!bySector[key]) bySector[key] = [];
        bySector[key].push(r);
      }
    }

    return { newR, top5, disputedEntries, bySector };
  }, [resources, disputes, auditDate, sectorCtx, sectorProfile]);

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

  return (
    <div className="cl-card">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer"
      >
        <div className="text-left">
          <h3 className="text-sm font-bold tracking-wide uppercase" style={{ color: "var(--color-text-primary)" }}>
            Weekly Briefing
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {(() => { const d = new Date(date + "T12:00:00"); return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); })()}
          </p>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={cn(
            "text-text-secondary transition-transform duration-300",
            expanded && "rotate-180"
          )}
          style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
        />
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Executive Summary */}
          <div>
            <p className="text-xs text-text-primary/80 leading-relaxed">
              Tracking {resources.length} regulatory resources across{" "}
              {new Set(resources.map((r) => r.jurisdiction || "global")).size} jurisdictions.
              {briefing.newR.length > 0 && ` ${briefing.newR.length} new this week.`}
              {briefing.disputedEntries.length > 0 &&
                ` ${briefing.disputedEntries.length} disputed items requiring attention.`}
            </p>
          </div>

          {/* Top Priority Items — clickable talking points */}
          <div>
            <span className="text-xs font-semibold tracking-wider uppercase block mb-2" style={{ color: "var(--color-text-secondary)" }}>
              Top Priority This Week
            </span>
            {briefing.top5.map((r) => (
              <button
                key={r.id}
                onClick={(e) => { e.stopPropagation(); pushFocusView({ title: r.title, resourceIds: [r.id] }); }}
                className="w-full text-left mb-2 p-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--color-surface-raised)]"
                style={{ borderLeft: `3px solid ${r.priority === "CRITICAL" ? "#DC2626" : r.priority === "HIGH" ? "#D97706" : "#2563EB"}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>{r.title}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: r.priority === "CRITICAL" ? "#DC2626" : r.priority === "HIGH" ? "#D97706" : "#CA8A04", backgroundColor: r.priority === "CRITICAL" ? "#FEF2F2" : r.priority === "HIGH" ? "#FFF7ED" : "#FEFCE8", border: `1px solid ${r.priority === "CRITICAL" ? "#FECACA" : r.priority === "HIGH" ? "#FED7AA" : "#FEF08A"}` }}>
                    {r.priority}
                  </span>
                </div>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{r.note}</p>
                {r.reasoning && (
                  <p className="text-[11px] mt-0.5 italic" style={{ color: "var(--color-primary)" }}>{r.reasoning}</p>
                )}
              </button>
            ))}
          </div>

          {/* Disputed */}
          {briefing.disputedEntries.length > 0 && (
            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-[#FF9500] block mb-2">
                Disputed Items
              </span>
              {briefing.disputedEntries.map((x) => (
                <button
                  key={x.id}
                  onClick={(e) => { e.stopPropagation(); pushFocusView({ title: x.r!.title, resourceIds: [x.id] }); }}
                  className="w-full text-left border-l-2 border-[#FF9500] pl-2 mb-2 cursor-pointer hover:bg-[var(--color-surface-raised)] rounded-r-md transition-colors p-1"
                >
                  <p className="text-xs font-medium text-text-primary">{x.r!.title}</p>
                  <p className="text-xs text-text-secondary">
                    {x.note}
                  </p>
                  {x.sources?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(x.sources as any[]).map((s: any, i: number) => {
                        const name = typeof s === "string" ? s : s.name;
                        const url = typeof s === "string" ? null : s.url;
                        return url ? (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs px-1.5 py-0.5 rounded-md border border-[#FF9500]/20 text-[#FF9500] hover:bg-[#FF9500]/10 transition-colors"
                          >
                            {name}
                          </a>
                        ) : (
                          <span
                            key={i}
                            className="text-xs px-1.5 py-0.5 rounded-md border border-[#FF9500]/20 text-[#FF9500]"
                          >
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Download buttons */}
          <div className="flex gap-2 pt-2 border-t border-border-subtle">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload("html");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)] cursor-pointer transition-colors"
            >
              <FileText size={11} strokeWidth={2} />
              Download HTML
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload("slack");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)] cursor-pointer transition-colors"
            >
              <Hash size={11} strokeWidth={2} />
              Download Slack
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
