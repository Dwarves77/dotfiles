/**
 * ProseSection — generic markdown prose renderer for §10/§11 (and the
 * body of §4 before its source footer).
 *
 * Sprint 3 A5.3 (2026-05-27). Keeps the markdown formatting minimal:
 * paragraphs split on blank lines, bold/italic preserved via simple
 * regex, link extraction. For full markdown features, callers can swap
 * in IntelligenceBrief's renderer; this is the tight 2-3-paragraph
 * surface the mockup specifies.
 */

interface ProseSectionProps {
  markdown: string;
  /** Optional trailing source line (used by §4 ProseWithSource composition). */
  source?: string | null;
}

export function ProseSection({ markdown, source }: ProseSectionProps) {
  if (!markdown || !markdown.trim()) return null;
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--color-text-primary)",
            margin: i === 0 ? "0 0 12px" : "0 0 12px",
            maxWidth: "78ch",
          }}
        >
          {renderInlineMarkdown(p)}
        </p>
      ))}
      {source && (
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            margin: "8px 0 0",
            fontStyle: "italic",
          }}
        >
          Source: {source}
        </p>
      )}
    </div>
  );
}

/**
 * Minimal inline markdown rendering: bold (`**`), italic (`*` / `_`),
 * inline code (`` ` ``), and raw URL → link.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Split on **bold**, *italic*, `code`, http(s)://url
  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<span key={key++}>{text.slice(lastIdx, m.index)}</span>);
    }
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(<b key={key++}>{tok.slice(2, -2)}</b>);
    } else if (tok.startsWith("`")) {
      parts.push(<code key={key++} style={{ fontSize: "0.9em" }}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("*")) {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("http")) {
      parts.push(
        <a key={key++} href={tok} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", textDecoration: "underline" }}>
          {tok}
        </a>
      );
    } else {
      parts.push(<span key={key++}>{tok}</span>);
    }
    lastIdx = m.index + tok.length;
  }
  if (lastIdx < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIdx)}</span>);
  }
  return parts;
}
