"use client";

import { useState, useId } from "react";
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

// ── Markdown components shared across all synopsis renderers ──

const mdComponents = {
  p: ({ children }: any) => (
    <p className="mb-3 text-[13px] leading-[22px]" style={{ color: "var(--color-text-primary)", opacity: 0.85 }}>{children}</p>
  ),
  strong: ({ children }: any) => {
    const text = String(children);
    if (text.startsWith("Action Required") || text.startsWith("Confirm for Your Business")) {
      const body = text.replace(/^(Action Required|Confirm for Your Business)\s*[-—:]\s*/i, "");
      return (
        <div className="rounded-r-md my-3" style={{ background: "#FFF7F0", borderLeft: "3px solid #E8610A", padding: "10px 14px" }}>
          <strong className="block mb-1" style={{ color: "#E8610A", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
            Action Required
          </strong>
          {body && <span className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>{body}</span>}
        </div>
      );
    }
    return <strong className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{children}</strong>;
  },
  ol: ({ children }: any) => <ol className="space-y-2 mb-3 list-decimal list-inside">{children}</ol>,
  ul: ({ children }: any) => <ul className="space-y-1.5 mb-3 ml-1">{children}</ul>,
  li: ({ children }: any) => <li className="text-[13px] leading-[20px]" style={{ color: "var(--color-text-primary)", opacity: 0.8 }}>{children}</li>,
  h2: ({ children }: any) => (
    <h2 className="text-[13px] font-bold uppercase tracking-widest mt-5 mb-2 px-3 py-2 rounded-md -mx-1" style={{ backgroundColor: "#F0EDE8", borderLeft: "3px solid var(--color-primary)", color: "var(--color-text-primary)" }}>
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-[13px] font-semibold mt-4 mb-1.5 pl-2 border-l-2" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-secondary)" }}>
      {children}
    </h3>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="pl-3 py-1 my-2 border-l-2" style={{ borderColor: "var(--color-text-accent)", color: "var(--color-text-secondary)" }}>
      {children}
    </blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }} onClick={(e: any) => e.stopPropagation()}>
      {children}
    </a>
  ),
};

// ── 10-section synopsis structure from skill ──

const SECTION_CONFIG: { pattern: RegExp; label: string; color: string }[] = [
  { pattern: /^#+\s*(?:Section\s*1|REGULATION IDENTIFICATION)/im, label: "Regulation Identification", color: "var(--color-primary)" },
  { pattern: /^#+\s*(?:Section\s*2|SOURCE AUTHORITY HIERARCHY)/im, label: "Source Authority", color: "#6B7280" },
  { pattern: /^#+\s*(?:Section\s*3|IMMEDIATE ACTION ITEMS)/im, label: "Immediate Action Items", color: "#DC2626" },
  { pattern: /^#+\s*(?:Section\s*4|COMPLIANCE CHAIN MAPPING)/im, label: "Compliance Chain", color: "#7C3AED" },
  { pattern: /^#+\s*(?:Section\s*5|CLASSIFICATION ANALYSIS)/im, label: "Classification Analysis", color: "#2563EB" },
  { pattern: /^#+\s*(?:Section\s*6|FORMAT OR OPERATION ANALYSIS)/im, label: "Format / Operation Analysis", color: "#059669" },
  { pattern: /^#+\s*(?:Section\s*7|THIRD PARTY EXPOSURE)/im, label: "Third Party Exposure", color: "#D97706" },
  { pattern: /^#+\s*(?:Section\s*8|COMPETITIVE INTELLIGENCE)/im, label: "Competitive Intelligence", color: "#0891B2" },
  { pattern: /^#+\s*(?:Section\s*9|INDUSTRY.SPECIFIC TRANSLATION)/im, label: "Industry-Specific Translation", color: "#059669" },
  { pattern: /^#+\s*(?:Section\s*10|LEGAL CONFIRMATION REQUIRED)/im, label: "Legal Confirmation Required", color: "#DC2626" },
];

function parseSections(markdown: string): { label: string; color: string; content: string }[] {
  const lines = markdown.split("\n");
  const sections: { label: string; color: string; content: string; startLine: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (const cfg of SECTION_CONFIG) {
      if (cfg.pattern.test(lines[i])) {
        sections.push({ label: cfg.label, color: cfg.color, content: "", startLine: i });
        break;
      }
    }
  }

  // If no section headers found, render as single block
  if (sections.length === 0) {
    return [{ label: "Synopsis", color: "var(--color-primary)", content: markdown }];
  }

  // Extract content between section headers
  for (let i = 0; i < sections.length; i++) {
    const startLine = sections[i].startLine + 1; // skip the header line
    const endLine = i + 1 < sections.length ? sections[i + 1].startLine : lines.length;
    sections[i].content = lines.slice(startLine, endLine).join("\n").trim();
  }

  return sections.filter((s) => s.content.length > 0);
}

// ── Structured synopsis renderer with 10-section display ──

function SynopsisMarkdown({ content, sectorName }: { content: string; sectorName: string }) {
  const sections = parseSections(content);
  const topId = useId().replace(/:/g, "") + "-top";

  return (
    <div className="synopsis-content space-y-4">
      <div id={topId} />
      {sections.map((section, i) => (
        <div key={i}>
          <div
            className="text-[11px] font-bold uppercase tracking-widest mb-2 px-3 py-1.5 rounded-md"
            style={{ backgroundColor: "#F0EDE8", borderLeft: `3px solid ${section.color}`, color: "var(--color-text-primary)" }}
          >
            {section.label === "Industry-Specific Translation" ? `${section.label}: ${sectorName}` : section.label}
          </div>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {section.content}
          </ReactMarkdown>
          {sections.length > 3 && (
            <button
              onClick={(e) => { e.stopPropagation(); document.getElementById(topId)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              className="text-[10px] font-medium mt-1 cursor-pointer transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
              Back to top
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Single sector synopsis display ──

function SingleSectorSynopsis({ synopsis, sectorName }: { synopsis: StoredSynopsis; sectorName: string }) {
  const badge = urgencyBadge(synopsis.urgencyScore);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-primary)" }}>
            {sectorName}
          </span>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" }}>
            Full Brief
          </span>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
        >
          Urgency {badge.label}
        </span>
      </div>
      <SynopsisMarkdown content={synopsis.summary} sectorName={sectorName} />
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
          <SynopsisMarkdown content={synopsis.summary} sectorName={sectorName} />
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

  // ── Prefer fullBrief when it exists — it has the deepest content ──
  if (fullBrief) {
    return (
      <div>
        <IntelligenceBrief markdown={fullBrief} />
        {/* Sector toggle below the full brief */}
        {primarySynopsis && activeSectorSynopses.length > 0 && (
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
              {showAll ? "Hide sector views" : `View sector-specific analysis (${activeSectorSynopses.length + 1})`}
            </button>
            {showAll && (
              <div className="mt-3 space-y-2">
                <SectorAccordion synopsis={primarySynopsis} sectorName={primaryName} />
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

  // ── No fullBrief: check for synopsis, then old fields ──
  if (!primarySynopsis) {

    // Tier 3: Old whatIsIt/whyMatters/keyData fields
    return (
      <div>
        <div
          className="text-[11px] font-medium px-3 py-1.5 rounded-md mb-3"
          style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-muted)" }}
        >
          Summary — full sector-specific analysis in progress
        </div>
        {fallbackWhatIsIt && (
          <div className="mb-4">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2 px-3 py-1.5 rounded-md" style={{ backgroundColor: "#F0EDE8", borderLeft: "3px solid var(--color-primary)", color: "var(--color-text-primary)" }}>
              What This Is
            </div>
            <p className="text-[13px] leading-[22px]" style={{ color: "var(--color-text-primary)", opacity: 0.85 }}>{fallbackWhatIsIt}</p>
          </div>
        )}
        {fallbackWhyMatters && (
          <div className="mb-4">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2 px-3 py-1.5 rounded-md" style={{ backgroundColor: "#F0EDE8", borderLeft: "3px solid #059669", color: "var(--color-text-primary)" }}>
              Why It Matters
            </div>
            <p className="text-[13px] leading-[22px]" style={{ color: "var(--color-text-primary)", opacity: 0.85 }}>{fallbackWhyMatters}</p>
          </div>
        )}
        {fallbackKeyData && fallbackKeyData.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2 px-3 py-1.5 rounded-md" style={{ backgroundColor: "#F0EDE8", borderLeft: "3px solid #2563EB", color: "var(--color-text-primary)" }}>
              Key Data
            </div>
            <ul className="space-y-1">
              {fallbackKeyData.map((d, i) => (
                <li key={i} className="text-[13px] leading-[20px] pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[8px] before:w-1 before:h-1 before:rounded-full before:bg-text-primary/30" style={{ color: "var(--color-text-primary)", opacity: 0.8 }}>
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
