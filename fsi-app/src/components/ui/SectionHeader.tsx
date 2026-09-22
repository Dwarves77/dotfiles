"use client";

/**
 * SectionHeader (`data-part="section-header"`), lane W10-SectionHeader, 2026-09-22, artboard 3 /
 * 21c, parts-brief-2026-09-18.md section 2.3, verbatim:
 *
 *   "Every S-section on every detail, every card title on lists/dashboard/admin. 'S2' 10.5px/800
 *    .1em #7A6E6C + Anton 20 uppercase .04em title + right meta 10.5px uppercase .12em muted
 *    ('2 items · newest first'). Padding 14px 20px 10px, 1px .08 rule below."
 *
 * Ruling 1, 2026-09-20 (docs/design/handoff-2026-09-07/README.md "Undrawn cases", binding, this
 * lane's own brief cites it verbatim): "no rule under the section TITLE ... §2.3's '1px rule below' // glyph:verbatim
 * is the rule under the WHOLE header block (index + title + right meta), i.e. the card header
 * divider. Panel 21c shows exactly that. Never a rule directly under the Anton title." This is a
 * DIFFERENT component from `SectionHeading.tsx` (the dashboard/watchlist card head, ruling 4.1/5.1,
 * 2026-09-07 CLOSED: NO rule at all under that head), the two artboards draw two different heads
 * for two different roles; this file owns the S-section head only, `SectionHeading.tsx` is
 * untouched.
 *
 * `index` ("S2") is the section's ordinal label. It is NEVER invented text: a caller that has a
 * real ordinal (today, only the regulation surface's `REGULATION_SECTION_INDEX`,
 * `src/lib/detail/section-index-data.ts`, the ONE table SectionIndex itself already reads, part A
 * of ActionCard built it, reused here rather than duplicated) passes it; a caller with no ordinal
 * source omits the prop and the index cell does not render, same "omit rather than invent"
 * discipline `ItemGroup.tsx`'s own header documents for its band/action-strip props.
 *
 * `title` is always the section's FULL name (never the short SectionIndex tab label, the brief's
 * own instruction: "SectionIndex shows the short name... the FULL name is the header text").
 *
 * Reused, not retyped: `DetailSection` (`src/components/detail/DetailShell.tsx`), the one render
 * path every S-section on all four detail surfaces already goes through, now renders THIS
 * component internally instead of its own inline `<h2>` + aside markup (F49: no page/component
 * retypes a part's literal styles once the part exists).
 */

import type { ReactNode } from "react";
import { SECTION_TITLE_STYLE } from "@/components/ui/section-title-style";

export interface SectionHeaderProps {
  /** "S2"-style ordinal label, left of the title. Omitted (never invented) when the caller has no
   *  real ordinal source for this section. */
  index?: string | null;
  /** The section's full name. Always required, this IS the section's title, never a short label. */
  title: ReactNode;
  /** Right-aligned muted meta, e.g. "2 items · newest first". */
  meta?: ReactNode;
}

export function SectionHeader({ index, title, meta }: SectionHeaderProps) {
  return (
    <div data-part="section-header" className="cl-section-header">
      <style>{`
        .cl-section-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 20px 10px;
          border-bottom: 1px solid rgba(0,0,0,.08);
        }
        .cl-section-header-titlewrap {
          display: flex;
          align-items: baseline;
          gap: 10px;
          min-width: 0;
        }
        .cl-section-header-meta { white-space: nowrap; }
        @media (max-width: 1279px) {
          .cl-section-header .cl-section-header-meta { white-space: normal; min-width: 0; text-align: right; }
        }
        @media (max-width: 767px) {
          .cl-section-header { flex-direction: column; align-items: flex-start; gap: 3px; }
          .cl-section-header .cl-section-header-meta { white-space: normal; text-align: left; }
        }
      `}</style>
      <div className="cl-section-header-titlewrap">
        {index && (
          <span
            data-part-slot="section-index"
            style={{
              fontSize: "var(--fs-105, 10.5px)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-3, #7A6E6C)",
              flexShrink: 0,
            }}
          >
            {index}
          </span>
        )}
        <h2
          data-guard-title
          data-guard-display="card-title"
          style={{ ...SECTION_TITLE_STYLE, minWidth: 0 }}
        >
          {title}
        </h2>
      </div>
      {meta ? (
        <span
          data-part-slot="section-meta"
          className="cl-section-header-meta"
          style={{
            fontSize: "var(--fs-105, 10.5px)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3, #7A6E6C)",
          }}
        >
          {meta}
        </span>
      ) : null}
    </div>
  );
}
