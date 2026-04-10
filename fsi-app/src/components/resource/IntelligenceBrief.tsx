"use client";

import { useState, useMemo, useId } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ChevronDown, ChevronRight } from "lucide-react";

interface IntelligenceBriefProps {
  markdown: string;
}

// Extract section headings from markdown for TOC
function extractTOC(markdown: string): { id: string; title: string; level: number }[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const toc: { id: string; title: string; level: number }[] = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const title = match[2].replace(/\*\*/g, "").trim();
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (level <= 2) toc.push({ id, title, level });
  }
  return toc;
}

// Detect row type for color-coding tables
function getRowStyle(cellText: string): string {
  const lower = cellText.toLowerCase();
  // Exempt / not applicable
  if (lower.includes("exempt") || lower.includes("0%") || lower.includes("not subject") || lower.includes("do not apply") || lower.includes("no.") || lower.includes("lower compliance risk"))
    return "bg-[#059669]/8";
  // High risk / required / obligated
  if (lower.includes("high") || lower.includes("100%") || lower.includes("yes") || lower.includes("non-compliant") || lower.includes("banned"))
    return "bg-[#FF3B30]/6";
  // Medium / conditional
  if (lower.includes("medium") || lower.includes("40%") || lower.includes("conditional") || lower.includes("10%"))
    return "bg-[#FF9500]/6";
  return "";
}

// Build components with anchor IDs for TOC navigation
function createComponents(briefId: string): Components {
  return {
    // H1 — Primary document title
    h1: ({ children }) => {
      const text = String(children);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return (
        <h1
          id={`${briefId}-${id}`}
          className="text-[17px] font-bold text-text-primary mt-6 mb-3 pb-2 border-b-2 border-[var(--color-primary)]/30"
        >
          {children}
        </h1>
      );
    },

    // H2 — Major sections: shaded header bar (#9)
    h2: ({ children }) => {
      const text = String(children);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return (
        <h2
          id={`${briefId}-${id}`}
          className="text-[14px] font-bold text-text-primary mt-6 mb-3 px-3 py-2 rounded-md uppercase tracking-wide"
          style={{ backgroundColor: "var(--color-surface-raised)", borderLeft: "3px solid var(--color-primary)" }}
        >
          {children}
        </h2>
      );
    },

    // H3 — Sub-sections: lighter treatment
    h3: ({ children }) => {
      const text = String(children);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return (
        <h3
          id={`${briefId}-${id}`}
          className="text-[13px] font-semibold text-text-primary mt-4 mb-1.5 pl-2 border-l-2 border-border-medium"
        >
          {children}
        </h3>
      );
    },

    p: ({ children }) => (
      <p className="text-[13px] leading-[22px] text-text-primary/85 mb-3">
        {children}
      </p>
    ),

    ul: ({ children }) => (
      <ul className="space-y-1.5 mb-3 ml-1">{children}</ul>
    ),

    ol: ({ children }) => (
      <ol className="space-y-2 mb-3 ml-1 list-none counter-reset-item">{children}</ol>
    ),

    // Numbered list items — styled as mini-cards for action items (#2)
    li: ({ children }) => {
      const text = String(children);
      // Detect if this is an action/numbered item with a heading pattern
      const isActionItem = /^(Commission|EPR|Case|Packaging|Vendor|Mandatory|Legal|Begin|Audit|Review|Monitor)/.test(text);
      if (isActionItem) {
        return (
          <li className="text-[13px] leading-[20px] text-text-primary/80 pl-3 py-2 mb-1 rounded-md border-l-3 border-[var(--color-primary)]/40 bg-surface-raised/50">
            {children}
          </li>
        );
      }
      return (
        <li className="text-[13px] leading-[20px] text-text-primary/80 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[8px] before:w-1 before:h-1 before:rounded-full before:bg-text-primary/30">
          {children}
        </li>
      );
    },

    strong: ({ children }) => {
      const text = String(children);

      // Business action flags (#4) — prominent amber callout blocks
      if (text.startsWith("Action Required") || text.startsWith("Confirm for Your Business") || text.startsWith("Legal Confirmation Required")) {
        return (
          <div className="flex items-start gap-2.5 text-[12px] font-bold text-[#B45309] bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-lg px-4 py-3 my-3 shadow-sm">
            <span className="text-[16px] shrink-0 mt-0.5">&#9888;&#65039;</span>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#92400E] mb-0.5">
                Action Required
              </span>
              <span className="text-[12px] font-medium text-[#78350F] leading-relaxed">
                {String(children).replace(/^(Action Required|Confirm for Your Business|Legal Confirmation Required)\s*[-—:]\s*/i, "")}
              </span>
            </div>
          </div>
        );
      }

      // Source citations — compact accent bar
      if (text.startsWith("Source:")) {
        return (
          <span className="block text-[11px] font-medium text-text-accent mt-1 mb-3 pl-3 border-l-2 border-text-accent/30 opacity-75">
            {children}
          </span>
        );
      }

      // Flowerpot/IV Bag analogy labels
      if (text.endsWith("Analogy:") || text.endsWith("Definition:") || text.endsWith("Definition")) {
        return (
          <strong className="font-bold text-[var(--color-primary)] text-[12px]">{children}</strong>
        );
      }

      return <strong className="font-semibold text-text-primary">{children}</strong>;
    },

    em: ({ children }) => (
      <em className="italic text-text-secondary">{children}</em>
    ),

    blockquote: ({ children }) => (
      <blockquote className="border-l-3 border-[var(--color-primary)] bg-[var(--color-primary)]/5 pl-4 pr-3 py-2 my-3 rounded-r-md">
        {children}
      </blockquote>
    ),

    // Tables — color-coded rows (#3)
    table: ({ children }) => (
      <div className="overflow-x-auto my-4 rounded-lg border border-border-subtle shadow-sm">
        <table className="w-full text-[12px]">{children}</table>
      </div>
    ),

    thead: ({ children }) => (
      <thead
        className="border-b border-border-subtle"
        style={{ backgroundColor: "var(--color-surface-raised)" }}
      >
        {children}
      </thead>
    ),

    th: ({ children }) => (
      <th className="text-left px-3 py-2.5 font-bold text-text-primary text-[11px] uppercase tracking-wider">
        {children}
      </th>
    ),

    // Table cells with automatic row color-coding
    td: ({ children }) => {
      const cellText = String(children);
      const rowStyle = getRowStyle(cellText);
      return (
        <td className={`px-3 py-2 text-text-primary/80 border-t border-border-subtle text-[12px] leading-relaxed ${rowStyle}`}>
          {children}
        </td>
      );
    },

    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-primary)] hover:underline font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    ),

    hr: () => <hr className="my-5 border-border-subtle" />,

    code: ({ children, className }) => {
      if (!className) {
        return (
          <code className="text-[12px] font-mono bg-surface-raised px-1.5 py-0.5 rounded border border-border-subtle text-text-primary">
            {children}
          </code>
        );
      }
      return <code className={`${className} text-[12px] font-mono`}>{children}</code>;
    },
  };
}

export function IntelligenceBrief({ markdown }: IntelligenceBriefProps) {
  const [tocOpen, setTocOpen] = useState(true);
  const briefId = useId().replace(/:/g, "");
  const toc = useMemo(() => extractTOC(markdown), [markdown]);
  const components = useMemo(() => createComponents(briefId), [briefId]);

  return (
    <div className="intelligence-brief">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-[var(--color-primary)]/20">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--color-primary)]">
            Intelligence Brief
          </span>
          <span className="text-[10px] text-text-muted">Full regulatory analysis</span>
        </div>
      </div>

      {/* Table of Contents (#1) */}
      {toc.length > 3 && (
        <div className="mb-5 rounded-lg border border-border-subtle overflow-hidden">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors hover:bg-surface-raised"
            style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}
          >
            <span>Contents ({toc.length} sections)</span>
            {tocOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {tocOpen && (
            <nav className="px-3 py-2 space-y-0.5">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${briefId}-${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById(`${briefId}-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="block text-[12px] py-0.5 text-text-secondary hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                  style={{ paddingLeft: item.level === 2 ? "12px" : "0" }}
                >
                  {item.level === 2 && <span className="text-text-muted mr-1">—</span>}
                  {item.title}
                </a>
              ))}
            </nav>
          )}
        </div>
      )}

      {/* Brief content */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
