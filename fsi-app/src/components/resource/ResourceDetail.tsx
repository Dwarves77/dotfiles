"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { Tag } from "@/components/ui/Tag";
import { ImpactScores } from "./ImpactScores";
import { TimelineBar } from "./TimelineBar";
import { ShareMenu } from "./ShareMenu";
import { useResourceStore } from "@/stores/resourceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { scoreResource, urgencyScore, getJurisdiction } from "@/lib/scoring";
import { getVerification, getXrefs } from "@/lib/verification";
import { getLineage } from "@/lib/lineage";
import { PRIORITY_COLORS, TOPIC_COLORS, ARCHIVE_REASONS } from "@/lib/constants";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import {
  ExternalLink, Shield, AlertTriangle, GitBranch, Link2,
  Archive, ChevronUp, Share2,
} from "lucide-react";

interface ResourceDetailProps {
  resource: Resource;
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  resourceMap: Map<string, Resource>;
  onToast: (msg: string) => void;
}

export function ResourceDetail({
  resource: r,
  changelog,
  disputes,
  xrefPairs,
  supersessions,
  resourceMap,
  onToast,
}: ResourceDetailProps) {
  const { setExpanded, archiveResource, updatePriority } = useResourceStore();
  const { navigateToResource } = useNavigationStore();
  const [showShare, setShowShare] = useState(false);
  const [archiveMode, setArchiveMode] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveNote, setArchiveNote] = useState("");

  const modes = r.modes || [r.cat];
  const topicColor = TOPIC_COLORS[r.topic || ""] || undefined;
  const scores = scoreResource(r);
  const urgency = urgencyScore(r);
  const verification = getVerification(r.id, xrefPairs, disputes as any);
  const { refs, refBy } = getXrefs(r.id, xrefPairs);
  const lineage = getLineage(r.id, supersessions, resourceMap);
  const changes = changelog[r.id];
  const dispute = disputes[r.id];

  return (
    <div className="border-t border-white/6 px-4 pb-4 space-y-5 stagger-enter">
      {/* Share Menu */}
      {showShare && (
        <ShareMenu
          resource={r}
          changelog={changelog}
          disputes={disputes}
          onClose={() => setShowShare(false)}
          onToast={onToast}
        />
      )}

      {/* Verification Badge */}
      <div className="flex items-center gap-3 pt-3">
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border text-xs font-medium"
          style={{
            color: verification.color,
            borderColor: `${verification.color}30`,
            backgroundColor: `${verification.color}10`,
          }}
        >
          <Shield size={10} strokeWidth={2.5} />
          {verification.label}
          {verification.xrefCount > 0 && (
            <span className="opacity-60">({verification.xrefCount} links)</span>
          )}
        </div>
        <span className="text-xs tabular-nums text-[var(--sage)]">
          Urgency: {urgency}
        </span>
        <button
          onClick={() => setShowShare(!showShare)}
          className="ml-auto flex items-center gap-1 text-xs text-[var(--sage)] hover:text-white cursor-pointer transition-colors"
        >
          <Share2 size={11} strokeWidth={2} />
          Share
        </button>
      </div>

      {/* Priority Reasoning */}
      {r.reasoning && (
        <div className="border-l-2 border-[var(--cyan)] pl-3 py-1">
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--cyan)] block mb-1">
            Why {r.priority}
          </span>
          <p className="text-xs text-white/80 leading-relaxed">{r.reasoning}</p>
        </div>
      )}

      {/* What Changed */}
      {changes?.length > 0 && (
        <div className="border border-[#C77700]/20 rounded-[2px] bg-[#C77700]/5 p-3 space-y-2">
          <span className="text-xs font-semibold tracking-wider uppercase text-[#C77700]">
            What Changed
          </span>
          {changes.map((ch, i) => (
            <div key={i} className="space-y-0.5">
              <span className="text-xs font-semibold text-white">
                {ch.fields?.join(", ")}
              </span>
              {ch.prev && (
                <p className="text-xs text-[var(--sage)] line-through">{ch.prev}</p>
              )}
              {ch.now && (
                <p className="text-xs text-white font-medium">{ch.now}</p>
              )}
              {ch.impact && (
                <p className="text-xs text-[#C77700]">Impact: {ch.impact}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* What This Is */}
      {r.whatIsIt && (
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] block mb-1">
            What This Is
          </span>
          <p className="text-xs text-white/80 leading-relaxed">{r.whatIsIt}</p>
        </div>
      )}

      {/* Why It Matters */}
      {r.whyMatters && (
        <div className="border-l-2 border-[#059669] pl-3 py-1">
          <span className="text-xs font-semibold tracking-wider uppercase text-[#059669] block mb-1">
            Why It Matters
          </span>
          <p className="text-xs text-white leading-relaxed">{r.whyMatters}</p>
        </div>
      )}

      {/* Key Data */}
      {r.keyData?.length > 0 && (
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] block mb-1">
            Key Data
          </span>
          <ul className="space-y-0.5">
            {r.keyData.map((d, i) => (
              <li key={i} className="text-xs text-white/70 leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1 before:h-1 before:rounded-full before:bg-white/30">
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Impact Scores */}
      <ImpactScores scores={scores} reasoning={r.impactReasoning} />

      {/* Disputes */}
      {dispute?.note && (
        <div className="border border-[#FF9500]/20 rounded-[2px] bg-[#FF9500]/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={12} strokeWidth={2.5} className="text-[#FF9500]" />
            <span className="text-xs font-semibold tracking-wider uppercase text-[#FF9500]">
              Disputed
            </span>
          </div>
          <p className="text-xs text-white/70 leading-relaxed">{dispute.note}</p>
          {dispute.sources?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {dispute.sources.map((s: any, i: number) => {
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
      )}

      {/* Timeline */}
      {r.timeline && r.timeline.length > 0 && (
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] block mb-1">
            Timeline
          </span>
          <TimelineBar items={r.timeline} color={topicColor} />
        </div>
      )}

      {/* Regulatory Lineage */}
      {lineage.length > 1 && (
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] block mb-1.5">
            <GitBranch size={10} className="inline mr-1" />
            Regulatory Lineage
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {lineage.map((node, i) => (
              <span key={node.id} className="flex items-center gap-1">
                <button
                  onClick={() => !node.isCurrent && navigateToResource(node.id)}
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded-[2px] border",
                    node.isCurrent
                      ? "border-white/15 bg-white/8 text-white font-medium"
                      : "border-white/6 text-[var(--sage)] hover:text-white cursor-pointer"
                  )}
                >
                  {node.title.slice(0, 40)}
                </button>
                {i < lineage.length - 1 && (
                  <span className="text-[var(--sage)] text-xs">&rarr;</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cross-References */}
      {(refs.length > 0 || refBy.length > 0) && (
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] block mb-1.5">
            <Link2 size={10} className="inline mr-1" />
            Cross-References
          </span>
          {refs.length > 0 && (
            <div className="mb-1">
              <span className="text-xs text-[var(--sage)]">References:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {refs.map((id) => {
                  const ref = resourceMap.get(id);
                  return (
                    <button
                      key={id}
                      onClick={() => navigateToResource(id)}
                      className="text-xs px-1.5 py-0.5 rounded-[2px] border border-white/6 text-[var(--sage)] hover:text-white cursor-pointer transition-colors"
                    >
                      {ref?.title?.slice(0, 35) || id}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {refBy.length > 0 && (
            <div>
              <span className="text-xs text-[var(--sage)]">Referenced by:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {refBy.map((id) => {
                  const ref = resourceMap.get(id);
                  return (
                    <button
                      key={id}
                      onClick={() => navigateToResource(id)}
                      className="text-xs px-1.5 py-0.5 rounded-[2px] border border-white/6 text-[var(--sage)] hover:text-white cursor-pointer transition-colors"
                    >
                      {ref?.title?.slice(0, 35) || id}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source */}
      {r.url && (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--cyan)] hover:text-white transition-colors"
        >
          <ExternalLink size={10} strokeWidth={2} />
          Source
        </a>
      )}

      {/* Priority Override */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--sage)]">Priority:</span>
        {(["CRITICAL", "HIGH", "MODERATE", "LOW"] as const).map((pri) => (
          <button
            key={pri}
            onClick={() => updatePriority(r.id, pri)}
            className={cn(
              "text-xs px-1.5 py-0.5 rounded-[2px] border cursor-pointer transition-colors",
              r.priority === pri
                ? "border-current font-medium"
                : "border-white/6 opacity-40 hover:opacity-70"
            )}
            style={{ color: PRIORITY_COLORS[pri] }}
          >
            {pri}
          </button>
        ))}
      </div>

      {/* Archive */}
      {!archiveMode ? (
        <button
          onClick={() => setArchiveMode(true)}
          className="flex items-center gap-1 text-xs text-[var(--sage)] hover:text-[var(--critical)] cursor-pointer transition-colors"
        >
          <Archive size={10} strokeWidth={2} />
          Archive
        </button>
      ) : (
        <div className="border border-white/6 rounded-[2px] p-3 space-y-2">
          <span className="text-xs font-semibold text-white">Archive Resource</span>
          <select
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            className="w-full text-xs p-1.5 bg-white/5 border border-white/10 rounded-[2px] text-white"
          >
            <option value="">Select reason...</option>
            {ARCHIVE_REASONS.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Optional note..."
            value={archiveNote}
            onChange={(e) => setArchiveNote(e.target.value)}
            className="w-full text-xs p-1.5 bg-white/5 border border-white/10 rounded-[2px] text-white placeholder:text-[var(--sage)]/50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (archiveReason) {
                  archiveResource(r.id, archiveReason, archiveNote);
                  setExpanded(null);
                  onToast("Resource archived");
                }
              }}
              disabled={!archiveReason}
              className="text-xs px-3 py-1 rounded-[2px] border border-[var(--critical)]/30 text-[var(--critical)] hover:bg-[var(--critical)] hover:text-white disabled:opacity-30 cursor-pointer transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setArchiveMode(false)}
              className="text-xs px-3 py-1 text-[var(--sage)] hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Collapse Bar */}
      <button
        onClick={() => setExpanded(null)}
        className="w-full flex items-center justify-center gap-1.5 py-2 mt-2 border border-white/6 rounded-[2px] text-xs text-[var(--sage)] hover:text-white hover:border-white/10 cursor-pointer transition-all duration-200"
      >
        <ChevronUp size={12} strokeWidth={2} />
        Collapse
      </button>
    </div>
  );
}
