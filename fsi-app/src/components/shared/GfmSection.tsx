/**
 * GfmSection — the shared section renderer for surfaces whose content is structured.
 *
 * WHY THIS EXISTS. `regulations/sections/ProseSection.tsx` splits on blank lines and emits <p>. It
 * supports bold, italic, inline code and bare links, and NOTHING else — no table, no list, no
 * heading. Its own docstring scopes it to "the tight 2-3-paragraph surface the mockup specifies" and
 * names the escape hatch: "For full markdown features, callers can swap in IntelligenceBrief's
 * renderer." It was nevertheless imported by Operations, Market Intel and Research, whose section
 * content is tabular: measured 2026-08-17 across `intelligence_item_sections`, 978 sections carry a
 * markdown table and 714 carry a bullet list, and on those three surfaces 114 of 116 items hold
 * content this renderer cannot draw. A GFM table handed to ProseSection renders as a paragraph of
 * pipe characters. The defect is a renderer used outside its stated design envelope, not a missing
 * capability — react-markdown + remark-gfm are already installed and already used by
 * `resource/IntelligenceBrief.tsx` and `resource/SectorSynopsis.tsx`.
 *
 * WHY NOT REUSE IntelligenceBrief's `createComponents`. That map is brief-scoped: it takes a
 * `briefId`, and its h1/h2/h3 overrides carry per-brief anchor identity. Lifting it into section
 * rendering would drag that coupling onto three surfaces that have no brief id. This component keeps
 * the same LIBRARIES and adds a section-scoped component map instead.
 *
 * PROSE IS A VISUAL NO-OP. The <p> style here is byte-for-byte ProseSection's (14px / 1.7 /
 * text-primary / 0 0 12px / 78ch), so a section that was already paragraphs-only renders identically.
 * Only content ProseSection was destroying changes appearance. The block-detection logic that decides
 * what "rich" means is extracted to `@/lib/render/section-markdown.mjs` where `node --test` executes
 * it (rule 15 — this repo has no component render harness, so a component-level test would be a
 * proof that never runs).
 *
 * SCOPE. RegulationSections keeps ProseSection deliberately: sections 10 and 11 are 2-3 paragraphs by
 * design and that renderer is correct in its own home. Do not "fix" it there.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface GfmSectionProps {
  markdown: string;
  /** Optional trailing source line (the ProseWithSource composition on section 4). */
  source?: string | null;
}

const PARA: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: "var(--color-text-primary)",
  margin: "0 0 12px",
  maxWidth: "78ch",
};

const CELL_BASE: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  padding: "6px 10px",
  fontSize: 13,
  lineHeight: 1.5,
  textAlign: "left",
  verticalAlign: "top",
};

const COMPONENTS: Components = {
  p: ({ children }) => <p style={PARA}>{children}</p>,

  // Tables — the whole point of this component. Wrapped in an overflow container because a
  // region x dimension matrix is wider than the prose column and must scroll rather than clip.
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ backgroundColor: "var(--color-surface-raised)" }}>{children}</thead>
  ),
  th: ({ children, style }) => (
    <th style={{ ...CELL_BASE, fontWeight: 600, color: "var(--color-text-primary)", ...(style ?? {}) }}>
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={{ ...CELL_BASE, color: "var(--color-text-secondary)", ...(style ?? {}) }}>{children}</td>
  ),

  ul: ({ children }) => (
    <ul style={{ ...PARA, paddingLeft: 20, listStyleType: "disc" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ ...PARA, paddingLeft: 20, listStyleType: "decimal" }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: "0 0 4px" }}>{children}</li>,

  // Sections already carry their own heading from the surface shell, so in-content headings render
  // subordinate to it — never competing with the section title.
  h1: ({ children }) => <h4 style={{ fontSize: 14, fontWeight: 600, margin: "16px 0 8px", color: "var(--color-text-primary)" }}>{children}</h4>,
  h2: ({ children }) => <h4 style={{ fontSize: 14, fontWeight: 600, margin: "16px 0 8px", color: "var(--color-text-primary)" }}>{children}</h4>,
  h3: ({ children }) => <h5 style={{ fontSize: 13, fontWeight: 600, margin: "14px 0 6px", color: "var(--color-text-primary)" }}>{children}</h5>,
  h4: ({ children }) => <h5 style={{ fontSize: 13, fontWeight: 600, margin: "14px 0 6px", color: "var(--color-text-primary)" }}>{children}</h5>,

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--color-primary)", textDecoration: "underline" }}
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code style={{ fontSize: "0.9em", backgroundColor: "var(--color-surface-raised)", padding: "1px 4px", borderRadius: 3 }}>
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{ ...PARA, borderLeft: "3px solid var(--color-border)", paddingLeft: 12, color: "var(--color-text-secondary)" }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: 0, borderTop: "1px solid var(--color-border)", margin: "16px 0" }} />,
};

export function GfmSection({ markdown, source }: GfmSectionProps) {
  if (!markdown || !markdown.trim()) return null;

  return (
    <div>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {markdown}
      </ReactMarkdown>
      {source && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "8px 0 0", fontStyle: "italic" }}>
          Source: {source}
        </p>
      )}
    </div>
  );
}
