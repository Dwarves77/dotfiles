import type { ReactNode } from "react";
import { FactCard } from "@/components/ui/FactCard";
import { ItemGroup } from "@/components/ui/ItemGroup";
import { GfmSection } from "@/components/shared/GfmSection";
import { parseFactParagraphs, type FactParagraph } from "@/lib/detail/fact-paragraphs";
import { deriveFactCardModels, mergeAdjacentSameKind } from "@/lib/detail/fact-card-model";

/**
 * `maxGroups` (lane W10-ActionCard-b, 2026-09-22, build item 3): Summary depth shows S1 plus the
 * FIRST ItemGroup of S2 (Obligations) only. Optional so every other caller (Full brief depth, the
 * other three sections' full render) is byte-identical to before. Stops emitting once `maxGroups`
 * ItemGroups have been produced; a prose block after that point is dropped too (the operator ruling
 * against truncation binds ANALYSIS text within a rendered section, not how many sections a summary
 * view chooses to show. The dropped content is still reachable at Full brief depth).
 */
export function FactBlocks({ markdown, maxGroups }: { markdown: string | null | undefined; maxGroups?: number }) {
  const blocks = parseFactParagraphs(markdown);
  if (blocks.length === 0) return null;

  const out: ReactNode[] = [];
  let pending: FactParagraph[] = [];
  let groupIndex = 0;
  let groupsEmitted = 0;
  let stop = false;

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
      groupsEmitted += 1;
      if (maxGroups && groupsEmitted >= maxGroups) stop = true;
    }
    pending = [];
  }

  for (let i = 0; i < blocks.length && !stop; i++) {
    const b = blocks[i];
    if (b.kind === "prose") {
      flushGroup();
      if (stop) break;
      out.push(<GfmSection key={`prose-${i}`} markdown={b.text} />);
    } else {
      pending.push(b);
    }
  }
  if (!stop) flushGroup();

  return <>{out}</>;
}
