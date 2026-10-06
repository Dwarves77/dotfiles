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

import { Children, cloneElement, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { stripClaimLedgerBlocks } from "@/lib/agent/claim-ledger-block";

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

// Concession table cell geometry, dc.html p9 (Operations profile) markup: th/td both
// `padding:8px 12px`. th additionally carries `border-bottom:1px solid rgba(0,0,0,.12)`, td
// `border-bottom:1px solid rgba(0,0,0,.06)` — see the `th`/`td` component overrides below, which
// apply the lighter body-row border on top of this shared base.
const CELL_BASE: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  padding: "8px 12px",
  fontSize: 13,
  lineHeight: 1.5,
  textAlign: "left",
  verticalAlign: "top",
};

// NARROW TABLES (lane P4, 2026-10-06). The first Live smoke run measured five detail pages at 375 px whose
// markdown table sat in the `overflowX: auto` wrapper below: a 6-column table is 550 to 760 px wide, so the
// wrapper panned sideways on a phone (the scroll-container rule fails it). The house fix for a wide table at a
// phone width is the `.cl-table-cards` stacked-card reflow in globals.css (at 640 px and under every row is a
// card and every cell a "label: value" line, the label read from the cell's own `data-label`). A GFM table has
// no author-written labels, so each cell's label is the text of its column header: the `table` override reads
// the header row from the markdown tree and `labelCells` gives every cell its header. Above 640 px the table is unchanged: still a
// table, still in its scroll wrapper.
type HastNode = { type?: string; tagName?: string; value?: string; children?: HastNode[] };

function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

/** Header labels of a GFM table, in column order, from the first row of its `thead`. */
function tableHeaderLabels(table: HastNode | undefined): string[] {
  const thead = (table?.children ?? []).find((c) => c.tagName === "thead");
  const row = (thead?.children ?? []).find((c) => c.tagName === "tr");
  return (row?.children ?? [])
    .filter((c) => c.tagName === "th" || c.tagName === "td")
    .map((c) => hastText(c).replace(/\s+/g, " ").trim());
}

type WithChildren = React.ReactElement<{ children?: React.ReactNode }>;

/**
 * Hands every cell its column header as `dataLabel` (the `td` override renders it as `data-label`). No hooks and
 * no context, so this stays valid in a server component: it walks the React children react-markdown built
 * (table > thead/tbody > tr > th/td) and clones each cell with the header at its own column index.
 */
function labelCells(sections: React.ReactNode, headers: string[]): React.ReactNode {
  return Children.map(sections, (section) => {
    if (!isValidElement(section)) return section;
    const rows = Children.map((section as WithChildren).props.children, (row) => {
      if (!isValidElement(row)) return row;
      let col = 0;
      const cells = Children.map((row as WithChildren).props.children, (cell) => {
        if (!isValidElement(cell)) return cell;
        const label = headers[col] ?? "";
        col += 1;
        return cloneElement(cell as React.ReactElement<{ dataLabel?: string }>, { dataLabel: label });
      });
      return cloneElement(row as WithChildren, undefined, cells);
    });
    return cloneElement(section as WithChildren, undefined, rows);
  });
}

const COMPONENTS: Components = {
  p: ({ children }) => <p style={PARA}>{children}</p>,

  // Tables — the whole point of this component. Wrapped in an overflow container because a
  // region x dimension matrix is wider than the prose column and must scroll rather than clip
  // above 640 px; at 640 px and under `.cl-table-cards` stacks it into cards (see NARROW TABLES).
  table: ({ children, node }) => (
    <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
      <table className="cl-table-cards" style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        {labelCells(children, tableHeaderLabels(node as HastNode | undefined))}
      </table>
    </div>
  ),
  // dc.html p9 concession table thead: background #FAFAF8 (var(--page), the same off-white the
  // rest of the design system uses for a raised-but-not-card surface — not
  // var(--color-surface-raised), which resolves to the tinted #F5F2EE instead).
  thead: ({ children }) => <thead style={{ backgroundColor: "var(--page)" }}>{children}</thead>,
  th: ({ children, style }) => (
    <th
      style={{
        ...CELL_BASE,
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontWeight: 700,
        color: "var(--ink-3)",
        borderBottom: "1px solid rgba(0,0,0,.12)",
        ...(style ?? {}),
      }}
    >
      {children}
    </th>
  ),
  td: (props) => {
    // `dataLabel` is injected by LabelledRow; it is not a markdown attribute.
    const { children, style, dataLabel } = props as typeof props & { dataLabel?: string };
    return (
      <td
        data-label={dataLabel ?? ""}
        style={{ ...CELL_BASE, color: "var(--color-text-secondary)", borderBottom: "1px solid rgba(0,0,0,.06)", ...(style ?? {}) }}
      >
        {children}
      </td>
    );
  },

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

export function GfmSection({ markdown: rawMarkdown, source }: GfmSectionProps) {
  // Lane P3 (2026-10-05): a stored Claim Provenance Ledger block is never drawn, in any section or in a full brief.
  const markdown = stripClaimLedgerBlocks(rawMarkdown);
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
