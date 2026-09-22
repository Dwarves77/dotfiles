"use client";

/**
 * SectionIndex (`data-part="section-index"`), lane W10-ActionCard-a, 2026-09-21, operator review
 * item 4 (labels truncating mid-word, e.g. "S2 Obligations - issue") and item 6 (the standalone
 * Summary | Full brief row costs 60px). NOT an edit to `DetailShell.tsx`'s existing `SectionIndex`
 * (a forbidden-adjacent shared file this lane does not wire into the live regulation surface, Part
 * B's job), a new, corrected part.
 *
 * Review item 4, exactly: "The index shows Sn + SHORT NAME only (<= 14 chars): Summary . Obligations
 * . Compliance . Requirements . Registration . Operations . Penalties . Sources. Full name is the
 * section header, not the tab." `REGULATION_SECTION_INDEX` below carries those exact short names,
 * in review item 5's canonical SECTION ORDER (build step 5's own resolution of the two review items:
 * "in the review's item 5 ORDER", Requirements before Compliance, not item 4's listed order).
 * `SECTION_INDEX_SHORT_NAME_MAX` is enforced by section-index.test.mjs: a short name over 14
 * characters fails the test, not just a visual truncation.
 *
 * Review item 6: the Summary | Full brief switch moves into the right end of this index bar as a
 * two-state segmented control (`depth`/`onDepthChange`), replacing the standalone row.
 *
 * Never truncates (review acceptance: "index labels never truncate"): no `max-width` + ellipsis on
 * an individual tab (the prior defect's own mechanism). At any width the bar itself scrolls
 * horizontally inside its own pill-group container; the PAGE never gets a horizontal scrollbar,
 * because that container is the only scrolling element (`overflow-x: auto` on the strip, not on
 * this component's own root).
 */

import {
  SECTION_INDEX_SHORT_NAME_MAX,
  REGULATION_SECTION_INDEX,
  type SectionIndexEntry,
} from "@/lib/detail/section-index-data";
import { useSectionScrollSpy } from "@/lib/detail/use-section-scroll-spy";
import { sectionIndexNavStyle, sectionIndexStripStyle } from "@/components/ui/section-index-styles";
import { SectionIndexLink } from "@/components/ui/SectionIndexLink";
// Reuse-before-construction (F45 duplicate-code, lane W10-ActionCard-a, 2026-09-21):
// DetailShell.tsx's `SummaryDepthSwitch` is already the exact two-state "Summary | Full brief"
// segmented control (`SummaryDepth = "summary" | "full"`, the same shape review item 6 asks for);
// this part reuses it rather than typing a second, near-identical control. Review item 6 asks only
// that the control MOVE into the index bar's right end, not that it be a different widget.
import { SummaryDepthSwitch, type SummaryDepth } from "@/components/detail/DetailShell";

export { SECTION_INDEX_SHORT_NAME_MAX, REGULATION_SECTION_INDEX };
export type { SectionIndexEntry };

export type SectionIndexDepth = SummaryDepth;

export interface SectionIndexProps {
  sections: SectionIndexEntry[];
  depth?: SectionIndexDepth;
  onDepthChange?: (d: SectionIndexDepth) => void;
}

export function SectionIndex({ sections, depth, onDepthChange }: SectionIndexProps) {
  const active = useSectionScrollSpy(sections.map((s) => s.id));

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Section index"
      data-part="section-index"
      className="cl-section-index"
      style={{ ...sectionIndexNavStyle(), minWidth: 0 }}
    >
      <div
        data-guard-strip
        style={sectionIndexStripStyle({
          // THE fix (review acceptance "index labels never truncate; at 375 the bar scrolls
          // horizontally inside itself, the page never does"): this strip is the one scrolling
          // element, and it holds every tab at its natural width, never an ellipsised max-width.
          overflowX: "auto",
          whiteSpace: "nowrap",
          flex: "1 1 auto",
        })}
      >
        {sections.map((s, i) => {
          const isActive = i === active;
          return (
            <SectionIndexLink key={s.id} id={s.id} isActive={isActive} sizing={{}}>
              S{i + 1} {s.shortName}
            </SectionIndexLink>
          );
        })}
      </div>
      {depth && onDepthChange && <SummaryDepthSwitch depth={depth} onChange={onDepthChange} />}
    </nav>
  );
}
