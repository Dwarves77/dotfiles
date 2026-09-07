/**
 * FactBlocks — renders a section's content_md as an ordered mix of prose
 * paragraphs and FactCards (lane uidetails, 2026-09-06). One shared
 * renderer for all four detail surfaces so the FACT/ANALYSIS/LEGAL ->
 * FactCard mapping (src/lib/detail/fact-paragraphs.ts) is applied exactly
 * once, not reimplemented per surface.
 *
 * Lane uidetails2 (2026-09-07, 09-operations-profile.png): a "prose" block
 * is not always plain text — GfmSection's own header measured 978 sections
 * carrying a markdown table and 714 a bullet list. `parseFactParagraphs`
 * deliberately leaves those blocks as raw markdown in a `prose` block (its
 * own header: "a caller that wants tables handled specially... should
 * detect those blocks before calling this"); rather than special-casing a
 * table detector here, this now routes every `prose` block through the
 * ALREADY-SHARED GfmSection renderer (remark-gfm) instead of a plain <p>,
 * so a structured concession table (the operations port-dues section) or
 * any other GFM block renders as a real table/list, not a paragraph of
 * pipe characters. Additive fix, one shared renderer, no page-local table
 * component (CLAUDE.md rule 13) — see DEVIATION-LOG.md's operations row.
 */

import { FactCard } from "@/components/ui/FactCard";
import { GfmSection } from "@/components/shared/GfmSection";
import { parseFactParagraphs } from "@/lib/detail/fact-paragraphs";

export function FactBlocks({ markdown }: { markdown: string | null | undefined }) {
  const blocks = parseFactParagraphs(markdown);
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "prose") {
          return <GfmSection key={i} markdown={b.text} />;
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
