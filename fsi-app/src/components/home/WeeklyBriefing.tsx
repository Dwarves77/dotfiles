"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/export/download";
import { toBriefingEmail } from "@/lib/export/htmlReport";
import { toBriefingSlack } from "@/lib/export/slackFormat";
import { urgencyScore } from "@/lib/scoring";
import { Badge } from "@/components/ui/Badge";
import { useNavigationStore } from "@/stores/navigationStore";
import { PRIORITY_COLORS } from "@/lib/constants";
import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import { ChevronDown, FileText, Hash, ArrowRight } from "lucide-react";

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
  const { navigateToResource, pushFocusView } = useNavigationStore();
  const [expanded, setExpanded] = useState(false);
  const date = new Date().toISOString().slice(0, 10);

  const briefing = useMemo(() => {
    const newR = resources.filter((r) => r.added === auditDate);
    const top5 = [...resources].sort((a, b) => urgencyScore(b) - urgencyScore(a)).slice(0, 5);
    const disputedEntries = Object.entries(disputes)
      .filter(([, d]) => d.note)
      .map(([id, d]) => ({ id, ...d, r: resources.find((x) => x.id === id) }))
      .filter((x) => x.r);

    return { newR, top5, disputedEntries };
  }, [resources, disputes, auditDate]);

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
    <div className="border border-white/[0.08] rounded-lg bg-surface-card">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 cursor-pointer"
      >
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-text-primary">
            Weekly Briefing
          </span>
          <span className="ml-2 text-xs text-text-secondary">
            {date}
          </span>
        </div>
        <ChevronDown
          size={14}
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

          {/* Talking Points — Top 5 */}
          <div>
            <span className="text-xs font-semibold tracking-wider uppercase text-[var(--critical)] block mb-2">
              Top Urgency
            </span>
            {briefing.top5.map((r) => (
              <div key={r.id} className="flex items-start gap-2 mb-2">
                <Badge label={r.priority} color={PRIORITY_COLORS[r.priority]} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-text-primary">{r.title}</p>
                    {r.added && (
                      <span className="text-xs text-text-secondary tabular-nums shrink-0">
                        {r.added}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2">
                    {r.whyMatters || r.note}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-text-accent hover:underline"
                      >
                        Source
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToResource(r.id);
                      }}
                      className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                    >
                      <ArrowRight size={10} strokeWidth={2} />
                      View in dashboard
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Disputed */}
          {briefing.disputedEntries.length > 0 && (
            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-[#FF9500] block mb-2">
                Disputed Items
              </span>
              {briefing.disputedEntries.map((x) => (
                <div key={x.id} className="border-l-2 border-[#FF9500] pl-2 mb-2">
                  <p className="text-xs font-medium text-text-primary">{x.r!.title}</p>
                  <p className="text-xs text-text-secondary line-clamp-2">
                    {x.note.slice(0, 150)}
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
                            className="text-xs px-1.5 py-0.5 rounded-[2px] border border-[#FF9500]/20 text-[#FF9500] hover:bg-[#FF9500]/10 transition-colors"
                          >
                            {name}
                          </a>
                        ) : (
                          <span
                            key={i}
                            className="text-xs px-1.5 py-0.5 rounded-[2px] border border-[#FF9500]/20 text-[#FF9500]"
                          >
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[2px] btn-invert cursor-pointer"
            >
              <FileText size={11} strokeWidth={2} />
              Download HTML
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload("slack");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[2px] btn-invert cursor-pointer"
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
