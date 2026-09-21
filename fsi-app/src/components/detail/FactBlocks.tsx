/**
 * FactBlocks - renders a section's content_md as an ordered mix of prose
 * paragraphs and FactCards (lane uidetails, 2026-09-06; rewired to FactCard v2's
 * model-based render by lane w10-factcard, 2026-09-20; wrapped in ItemGroup by
 * lane w10-factcard-d, 2026-09-21, build item 4: "All four detail surfaces render
 * fact cards through ItemGroup; no page hand-builds a group (F49)"). One shared
 * renderer for all four detail surfaces so the FACT/ANALYSIS/LEGAL -> FactCard
 * mapping (src/lib/detail/fact-paragraphs.ts, extended by
 * src/lib/detail/fact-card-model.ts) and the ItemGroup wrapping are applied
 * exactly once, not reimplemented per surface.
 *
 * Grouping unit: a consecutive RUN of non-prose blocks (fact/inference/counsel)
 * becomes ONE ItemGroup; a prose block flushes the current group and renders
 * outside any group via GfmSection. This is the honest unit the data supports
 * today - per-topic segmentation (the artboard's per-issue groups) needs a
 * heading boundary neither fact-paragraphs.ts nor content_md carries structurally
 * yet, so ItemGroup.tsx's own header documents that as a real gap rather than
 * inventing a title/band/action-strip here. `mergeAdjacentSameKind` (build item
 * 2) runs across each run BEFORE rendering, so a group never shows two adjacent
 * cards of the same kind.
 *
 * Lane uidetails2 (2026-09-07, 09-operations-profile.png): a "prose" block
 * is not always plain text - GfmSection's own header measured 978 sections
 * carrying a markdown table and 714 a bullet list. `parseFactParagraphs`
 * deliberately leaves those blocks as raw markdown in a `prose` block (its
 * own header: "a caller that wants tables handled specially... should
 * detect those blocks before calling this"); rather than special-casing a
 * table detector here, this now routes every `prose` block through the
 * ALREADY-SHARED GfmSection renderer (remark-gfm) instead of a plain <p>,
 * so a structured concession table (the operations port-dues section) or
 * any other GFM block renders as a real table/list, not a paragraph of
 * pipe characters. Additive fix, one shared renderer, no page-local table
 * component (CLAUDE.md rule 13) - see DEVIATION-LOG.md's operations row.
 */

import type { ReactNode } from "react";
import { FactCard } from "@/components/ui/FactCard";
import { ItemGroup } from "@/components/ui/ItemGroup";
import { GfmSection } from "@/components/shared/GfmSection";
import { parseFactParagraphs, type FactParagraph } from "@/lib/detail/fact-paragraphs";
import { deriveFactCardModels, mergeAdjacentSameKind } from "@/lib/detail/fact-card-model";

export function FactBlocks({ markdown }: { markdown: string | null | undefined }) {
  const blocks = parseFactParagraphs(markdown);
  if (blocks.length === 0) return null;

  const out: ReactNode[] = [];
  let pending: FactParagraph[] = [];
  let groupIndex = 0;

  function flushGroup() {
    if (pending.length === 0) return;
    const models = mergeAdjacentSameKind(pending.flatMap((b) => deriveFactCardModels(b)));
    if (models.length > 0) {
      out.push(
        <ItemGroup key={`group-${groupIndex++}`}>
          {models.map((model, j) => (
            <FactCard key={j} model={model} />
          ))}
        </ItemGroup>
      );
    }
    pending = [];
  }

  blocks.forEach((b, i) => {
    if (b.kind === "prose") {
      flushGroup();
      out.push(<GfmSection key={`prose-${i}`} markdown={b.text} />);
    } else {
      pending.push(b);
    }
  });
  flushGroup();

  return <>{out}</>;
}
