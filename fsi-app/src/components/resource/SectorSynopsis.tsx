"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useResourceStore, type StoredSynopsis, type StoredChange } from "@/stores/resourceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { IntelligenceBrief } from "./IntelligenceBrief";

// ── Urgency badge colors ──

function urgencyBadge(score: number | null): { label: string; bg: string; text: string; border: string } {
  if (score === null) return { label: "—", bg: "transparent", text: "var(--color-text-muted)", border: "var(--color-border)" };
  if (score >= 0.9) return { label: score.toFixed(1), bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" };
  if (score >= 0.6) return { label: score.toFixed(1), bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" };
  if (score >= 0.3) return { label: score.toFixed(1), bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" };
  return { label: score.toFixed(1), bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" };
}

function severityBadge(severity: string): { label: string; bg: string; text: string; border: string } {
  switch (severity) {
    case "critical": return { label: "CRITICAL", bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" };
    case "significant": return { label: "SIGNIFICANT", bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" };
    case "minor": return { label: "MINOR", bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" };
    case "administrative": return { label: "ADMINISTRATIVE", bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" };
    default: return { label: severity.toUpperCase(), bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" };
  }
}

// ── Markdown renderer for synopsis content ──

function SynopsisMarkdown({ content }: { content: string }) {
  return (
    <div className="synopsis-content text-[13px] leading-[22px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-3" style={{ color: "var(--color-text-primary)", opacity: 0.85 }}>{children}</p>
          ),
          strong: ({ children }) => {
            const text = String(children);
            if (text.startsWith("Action Required")) {
              return (
                <div className="rounded-r-md my-3" style={{ background: "#FFF7F0", borderLeft: "3px solid #E8610A", padding: "10px 14px" }}>
                  <strong className="block mb-1" style={{ color: "#E8610A", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
                    Action Required
                  </strong>
                  <span className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
                    {text.replace(/^Action Required\s*[-—:]\s*(Confirm for Your Business\s*[-—:]\s*)?/i, "")}
                  </span>
                </div>
              );
            }
            return <strong className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{children}</strong>;
          },
          ol: ({ children }) => <ol className="space-y-2 mb-3 list-decimal list-inside">{children}</ol>,
          li: ({ children }) => <li className="text-[13px] leading-[20px]" style={{ color: "var(--color-text-primary)", opacity: 0.8 }}>{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }} onClick={(e) => e.stopPropagation()}>
              {children}
            </a>
          ),
        }}
      />
    </div>
  );
}

// ── Single sector synopsis display ──

function SingleSectorSynopsis({ synopsis, sectorName }: { synopsis: StoredSynopsis; sectorName: string }) {
  const badge = urgencyBadge(synopsis.urgencyScore);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-primary)" }}>
          {sectorName}
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
        >
          Urgency {badge.label}
        </span>
      </div>
      <SynopsisMarkdown content={synopsis.summary} />
    </div>
  );
}

// ── Accordion item for multi-sector view ──

function SectorAccordion({ synopsis, sectorName }: { synopsis: StoredSynopsis; sectorName: string }) {
  const [open, setOpen] = useState(false);
  const badge = urgencyBadge(synopsis.urgencyScore);

  return (
    <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer transition-colors"
        style={{ backgroundColor: open ? "var(--color-surface-raised)" : "transparent" }}
      >
        <span className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {open ? <ChevronDown size={11} className="inline mr-1.5" /> : <ChevronRight size={11} className="inline mr-1.5" />}
          {sectorName}
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
        >
          {badge.label}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1">
          <SynopsisMarkdown content={synopsis.summary} />
        </div>
      )}
    </div>
  );
}

// ── Main export: SectorSynopsisView ──

interface SectorSynopsisViewProps {
  itemId: string;
  /** Full intelligence brief markdown (existing 89 briefs) */
  fullBrief?: string;
  /** Fallback content when no synopsis AND no brief exists */
  fallbackWhatIsIt?: string;
  fallbackWhyMatters?: string;
  fallbackKeyData?: string[];
}

export function SectorSynopsisView({ itemId, fullBrief, fallbackWhatIsIt, fallbackWhyMatters, fallbackKeyData }: SectorSynopsisViewProps) {
  const [showAll, setShowAll] = useState(false);
  const synopsesMap = useResourceStore((s) => s.synopses);
  const changeMap = useResourceStore((s) => s.intelligenceChanges);
  const displayNames = useResourceStore((s) => s.sectorDisplayNames);
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);

  const itemSynopses = synopsesMap.get(itemId);
  const change = changeMap.get(itemId);
  const primarySector = sectorProfile[0];
  const primarySynopsis = itemSynopses?.get(primarySector);

  // Get synopses for all active sectors that actually have data
  const activeSectorSynopses = sectorProfile
    .filter((s) => s !== primarySector && itemSynopses?.has(s))
    .map((s) => ({ sector: s, synopsis: itemSynopses!.get(s)!, name: displayNames.get(s) || s }));

  const primaryName = displayNames.get(primarySector) || primarySector;

  // ── No synopsis exists: check for fullBrief, then old fields ──
  if (!primarySynopsis) {
    // Tier 2: Full intelligence brief exists (89 items have this)
    if (fullBrief) {
      return <IntelligenceBrief markdown={fullBrief} />;
    }

    // Tier 3: Old whatIsIt/whyMatters/keyData fields
    return (
      <div>
        <div
          className="text-[11px] font-medium px-3 py-1.5 rounded-md mb-3"
          style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-muted)" }}
        >
          General summary — sector-specific analysis not yet available
        </div>
        {fallbackWhatIsIt && (
          <div className="mb-3">
            <span className="text-xs font-semibold tracking-wider uppercase block mb-1" style={{ color: "var(--color-text-secondary)" }}>
              What This Is
            </span>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-primary)", opacity: 0.8 }}>{fallbackWhatIsIt}</p>
          </div>
        )}
        {fallbackWhyMatters && (
          <div className="border-l-2 pl-3 py-1 mb-3" style={{ borderColor: "#059669" }}>
            <span className="text-xs font-semibold tracking-wider uppercase block mb-1" style={{ color: "#059669" }}>
              Why It Matters
            </span>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-primary)" }}>{fallbackWhyMatters}</p>
          </div>
        )}
        {fallbackKeyData && fallbackKeyData.length > 0 && (
          <div>
            <span className="text-xs font-semibold tracking-wider uppercase block mb-1" style={{ color: "var(--color-text-secondary)" }}>
              Key Data
            </span>
            <ul className="space-y-0.5">
              {fallbackKeyData.map((d, i) => (
                <li key={i} className="text-xs leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1 before:h-1 before:rounded-full" style={{ color: "var(--color-text-primary)", opacity: 0.7 }}>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── Synopsis exists: sector-specific view ──
  return (
    <div>
      {/* Cross-sector headline */}
      {change && (
        <div
          className="flex items-center gap-2 flex-wrap mb-4 px-3 py-2 rounded-md"
          style={{ backgroundColor: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}
        >
          <p className="text-[12px] flex-1 min-w-0" style={{ color: "var(--color-text-primary)" }}>
            {change.changeSummary}
          </p>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
            style={{
              ...(() => { const b = severityBadge(change.changeSeverity); return { backgroundColor: b.bg, color: b.text, border: `1px solid ${b.border}` }; })(),
            }}
          >
            {severityBadge(change.changeSeverity).label}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
            style={{
              ...(() => { const b = urgencyBadge(primarySynopsis.urgencyScore); return { backgroundColor: b.bg, color: b.text, border: `1px solid ${b.border}` }; })(),
            }}
          >
            Urgency {urgencyBadge(primarySynopsis.urgencyScore).label}
          </span>
        </div>
      )}

      {/* Primary sector synopsis */}
      <div className="pt-2 mt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
        <SingleSectorSynopsis synopsis={primarySynopsis} sectorName={primaryName} />
      </div>

      {/* Toggle for all active sectors */}
      {activeSectorSynopses.length > 0 && (
        <div className="mt-4">
          <button
            onClick={(e) => { e.stopPropagation(); setShowAll(!showAll); }}
            className="text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer transition-colors"
            style={{
              color: showAll ? "var(--color-text-primary)" : "var(--color-primary)",
              backgroundColor: showAll ? "var(--color-active-bg)" : "transparent",
              border: `1px solid ${showAll ? "var(--color-active-border)" : "var(--color-border)"}`,
            }}
          >
            {showAll ? "Hide other sectors" : `View all my sectors (${activeSectorSynopses.length + 1})`}
          </button>

          {showAll && (
            <div className="mt-3 space-y-2">
              {activeSectorSynopses.map(({ sector, synopsis, name }) => (
                <SectorAccordion key={sector} synopsis={synopsis} sectorName={name} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
