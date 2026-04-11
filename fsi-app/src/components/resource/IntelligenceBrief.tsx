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

// Map severity/likelihood text to badge classes
function riskBadge(text: string): string | null {
  const lower = text.trim().toLowerCase();
  if (lower === "high") return "cl-badge cl-badge-critical";
  if (lower === "medium") return "cl-badge cl-badge-high";
  if (lower === "low") return "cl-badge cl-badge-moderate";
  return null;
}

function createComponents(briefId: string): Components {
  return {
    // H1 — Document title
    h1: ({ children }) => {
      const text = String(children);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return (
        <h1
          id={`${briefId}-${id}`}
          className="text-[16px] font-bold text-text-primary mt-3 mb-2 pb-1.5 border-b border-[var(--color-primary)]/30"
        >
          {children}
        </h1>
      );
    },

    // H2 — Major sections: cream background band, large top margin (#1, #4)
    h2: ({ children }) => {
      const text = String(children);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return (
        <h2
          id={`${briefId}-${id}`}
          className="text-[14px] font-bold text-text-primary mt-4 mb-2 px-3 py-2 rounded-md -mx-3 uppercase tracking-wide"
          style={{
            backgroundColor: "#F0EDE8",
            borderLeft: "3px solid var(--color-primary)",
          }}
        >
          {children}
        </h2>
      );
    },

    // H3 — Sub-sections: secondary color, lighter weight (#1)
    h3: ({ children }) => {
      const text = String(children);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return (
        <h3
          id={`${briefId}-${id}`}
          className="text-[13px] font-semibold mt-3 mb-1 pl-2 border-l-2 border-border-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {children}
        </h3>
      );
    },

    p: ({ children }) => (
      <p className="text-[13px] leading-[20px] text-text-primary/85 mb-2">
        {children}
      </p>
    ),

    ul: ({ children }) => (
      <ul className="space-y-1 mb-2 ml-1">{children}</ul>
    ),

    ol: ({ children }) => (
      <ol className="space-y-1 mb-2 ml-1 list-decimal list-inside">{children}</ol>
    ),

    li: ({ children }) => (
      <li className="text-[13px] leading-[20px] text-text-primary/80 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[8px] before:w-1 before:h-1 before:rounded-full before:bg-text-primary/30">
        {children}
      </li>
    ),

    strong: ({ children }) => {
      const text = String(children);

      // Action Required callouts (#3) — warm orange pattern matching cl-ai-bar
      if (text.startsWith("Action Required") || text.startsWith("Confirm for Your Business") || text.startsWith("Legal Confirmation Required")) {
        const body = text.replace(/^(Action Required|Confirm for Your Business|Legal Confirmation Required)\s*[-—:]\s*/i, "");
        return (
          <div
            className="rounded-r-md my-3"
            style={{
              background: "#FFF7F0",
              borderLeft: "3px solid #E8610A",
              padding: "10px 14px",
            }}
          >
            <strong
              className="block mb-1"
              style={{
                color: "#E8610A",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 700,
              }}
            >
              Action Required
            </strong>
            <span className="text-[13px] leading-relaxed" style={{ color: "#1a1a1a" }}>
              {body}
            </span>
          </div>
        );
      }

      // Source citations
      if (text.startsWith("Source:")) {
        return (
          <span
            className="block text-[11px] font-medium mt-0.5 mb-2 pl-3 border-l-2 opacity-75"
            style={{ color: "var(--color-text-accent)", borderColor: "var(--color-text-accent)" }}
          >
            {children}
          </span>
        );
      }

      // Analogy labels
      if (text.endsWith("Analogy:") || text.endsWith("Definition:") || text.endsWith("Definition")) {
        return (
          <strong className="font-bold text-[12px]" style={{ color: "var(--color-primary)" }}>
            {children}
          </strong>
        );
      }

      return <strong className="font-semibold text-text-primary">{children}</strong>;
    },

    em: ({ children }) => (
      <em className="italic" style={{ color: "var(--color-text-secondary)" }}>{children}</em>
    ),

    blockquote: ({ children }) => (
      <blockquote
        className="pl-4 pr-3 py-1.5 my-2 rounded-r-md"
        style={{
          borderLeft: "3px solid var(--color-primary)",
          background: "var(--color-primary-light, rgba(232,97,10,0.05))",
        }}
      >
        {children}
      </blockquote>
    ),

    // Tables — cl-card treatment with visible borders, striping, header distinction (#2)
    table: ({ children }) => (
      <div
        className="overflow-x-auto my-4 rounded-lg"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <table className="w-full text-[12px] border-collapse">{children}</table>
      </div>
    ),

    thead: ({ children }) => (
      <thead style={{ background: "#FAFAF8", borderBottom: "1px solid var(--color-border)" }}>
        {children}
      </thead>
    ),

    th: ({ children }) => (
      <th
        className="text-left px-3 py-2.5 font-bold text-[11px] uppercase"
        style={{
          color: "var(--color-text-secondary)",
          letterSpacing: "0.04em",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {children}
      </th>
    ),

    // Table rows with alternating stripes
    tr: ({ children }) => (
      <tr
        className="even:bg-black/[0.018]"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        {children}
      </tr>
    ),

    // Table cells — risk badge mapping for Severity/Likelihood columns
    td: ({ children }) => {
      const cellText = String(children).trim();
      const badge = riskBadge(cellText);
      if (badge) {
        return (
          <td className="px-3 py-2.5 align-top" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span className={badge} style={{ fontSize: "10px", padding: "2px 8px" }}>
              {cellText}
            </span>
          </td>
        );
      }

      // Exempt/compliant rows get subtle green tint
      const lower = cellText.toLowerCase();
      let cellBg = "";
      if (lower.includes("exempt") || lower.includes("0%") || lower.includes("not subject") || lower.includes("do not apply") || lower.includes("lower compliance risk")) {
        cellBg = "rgba(5,150,105,0.06)";
      } else if (lower.includes("non-compliant") || lower.includes("banned") || lower.includes("100%")) {
        cellBg = "rgba(220,38,38,0.05)";
      }

      return (
        <td
          className="px-3 py-2.5 text-text-primary/80 align-top text-[12px] leading-relaxed"
          style={{
            borderBottom: "1px solid var(--color-border)",
            backgroundColor: cellBg || undefined,
          }}
        >
          {children}
        </td>
      );
    },

    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium hover:underline"
        style={{ color: "var(--color-primary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    ),

    hr: () => <hr className="my-6" style={{ borderColor: "var(--color-border)" }} />,

    code: ({ children, className }) => {
      if (!className) {
        return (
          <code
            className="text-[12px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: "var(--color-surface-raised, #F5F4F1)",
              border: "1px solid var(--color-border)",
            }}
          >
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
      {/* Hard separator between card metadata and document content (#5) */}
      <div className="pt-4 mt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-4">
          <span
            className="text-[11px] font-bold tracking-widest uppercase"
            style={{ color: "var(--color-primary)" }}
          >
            Intelligence Brief
          </span>
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            Full regulatory analysis
          </span>
        </div>
      </div>

      {/* Table of Contents (#1) */}
      {toc.length > 3 && (
        <div
          className="mb-5 rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--color-border)" }}
        >
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
            style={{
              background: "#FAFAF8",
              color: "var(--color-text-secondary)",
            }}
          >
            <span>Contents ({toc.length} sections)</span>
            {tocOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {tocOpen && (
            <nav className="px-3 py-2 space-y-0.5" style={{ background: "#FEFDFB" }}>
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${briefId}-${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById(`${briefId}-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="block text-[12px] py-0.5 transition-colors cursor-pointer hover:text-[var(--color-primary)]"
                  style={{
                    color: "var(--color-text-secondary)",
                    paddingLeft: item.level === 2 ? "12px" : "0",
                  }}
                >
                  {item.level === 2 && (
                    <span style={{ color: "var(--color-text-muted)" }} className="mr-1">—</span>
                  )}
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
