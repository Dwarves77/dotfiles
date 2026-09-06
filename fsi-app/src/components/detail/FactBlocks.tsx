/**
 * FactBlocks — renders a section's content_md as an ordered mix of prose
 * paragraphs and FactCards (lane uidetails, 2026-09-06). One shared
 * renderer for all four detail surfaces so the FACT/ANALYSIS/LEGAL ->
 * FactCard mapping (src/lib/detail/fact-paragraphs.ts) is applied exactly
 * once, not reimplemented per surface.
 */

import { FactCard } from "@/components/ui/FactCard";
import { parseFactParagraphs } from "@/lib/detail/fact-paragraphs";

const PROSE_STYLE: React.CSSProperties = {
  fontSize: "var(--fs-13)",
  lineHeight: 1.7,
  color: "var(--ink-2)",
  margin: "0 0 10px",
  maxWidth: "72ch",
  overflowWrap: "anywhere",
};

export function FactBlocks({ markdown }: { markdown: string | null | undefined }) {
  const blocks = parseFactParagraphs(markdown);
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "prose") {
          return (
            <p key={i} style={PROSE_STYLE}>
              {b.text}
            </p>
          );
        }
        return (
          <FactCard
            key={i}
            variant={b.kind === "fact" ? "sourced" : b.kind}
            text={b.text}
            source={b.kind === "fact" ? b.source : undefined}
            label={b.kind === "inference" ? b.label : undefined}
          />
        );
      })}
    </>
  );
}
