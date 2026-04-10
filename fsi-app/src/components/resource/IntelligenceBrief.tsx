"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface IntelligenceBriefProps {
  markdown: string;
}

// Custom component overrides for the intelligence brief style
const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-text-primary mt-6 mb-3 pb-2 border-b border-border-subtle">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[15px] font-bold text-text-primary mt-5 mb-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13px] font-bold text-text-primary mt-4 mb-1.5 uppercase tracking-wide">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-[13px] leading-[22px] text-text-primary/85 mb-3">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="space-y-1.5 mb-3 ml-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-1.5 mb-3 ml-1 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[13px] leading-[20px] text-text-primary/80 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[8px] before:w-1 before:h-1 before:rounded-full before:bg-text-primary/30">
      {children}
    </li>
  ),
  strong: ({ children }) => {
    const text = String(children);
    // Business action flags — highlighted callouts for items requiring team confirmation
    if (text.startsWith("Action Required") || text.startsWith("Confirm for Your Business") || text.startsWith("Legal Confirmation Required")) {
      return (
        <div className="flex items-start gap-2 text-[12px] font-bold text-[#FF9500] bg-[#FF9500]/8 border border-[#FF9500]/25 rounded-md px-3 py-2 my-2">
          <span className="shrink-0 mt-0.5">&#9888;</span>
          <span>{children}</span>
        </div>
      );
    }
    // Source citations
    if (text.startsWith("Source:")) {
      return (
        <span className="block text-[11px] font-medium text-text-accent mt-1 mb-2 pl-3 border-l-2 border-text-accent/30">
          {children}
        </span>
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
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-border-subtle">
      <table className="w-full text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-surface-raised border-b border-border-subtle">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left px-3 py-2 font-semibold text-text-primary text-[11px] uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-text-primary/80 border-t border-border-subtle">
      {children}
    </td>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-primary)] hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr className="my-4 border-border-subtle" />
  ),
  code: ({ children, className }) => {
    // Inline code for article references, regulation numbers
    if (!className) {
      return (
        <code className="text-[12px] font-mono bg-surface-raised px-1.5 py-0.5 rounded border border-border-subtle text-text-primary">
          {children}
        </code>
      );
    }
    // Code blocks (unlikely but supported)
    return (
      <code className={`${className} text-[12px] font-mono`}>{children}</code>
    );
  },
};

export function IntelligenceBrief({ markdown }: IntelligenceBriefProps) {
  return (
    <div className="intelligence-brief">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border-subtle">
        <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--color-primary)]">
          Intelligence Brief
        </span>
        <span className="text-[10px] text-text-muted">Skill-standard regulatory analysis</span>
      </div>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
