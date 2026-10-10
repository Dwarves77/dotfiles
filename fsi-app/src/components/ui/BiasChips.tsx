"use client";

/**
 * BiasChips: a source's bias tags, shown to the customer wherever the source's rating is shown
 * (lane P1, 2026-10-05; CLAUDE.md rule 18, "the surface shows the rating"). GOVERNING SKILL(S):
 * source-credibility-model
 *
 * Before this part existed the bias tags were loaded for every list and detail page and rendered
 * to no customer at all: the only data-bearing mount of the old credibility chips was a component
 * no route imports. This is the one place bias is drawn.
 *
 * REUSE. The chip itself is `TagChip` (the neutral tag, no border: chip family rule 2.5 keeps the
 * tier square the only bordered chip, so bias reads as a quieter second signal beside it). The
 * bounded slice, labels and lower-confidence line come from `buildBiasDisplay`
 * (src/lib/credibility/bias-display.mjs), which wraps `selectBiasChipsForDisplay`. The research
 * `CredibilityChip*` parts were read and NOT reused: they are the evidence x agreement and source
 * authority scores (spec 03 section 4), each a 44px button that renders a needs-phrase when it has
 * no data, so they can neither sit in a row's meta line nor honour "render nothing when absent".
 *
 * TWO VARIANTS, one model:
 *  - `row`: for a list row's meta line. Bounded to two chips, then a plain "+N more" count. No
 *    interactive element at all: a row is one click target (the whole row is a link), and a
 *    control inside it could never meet the law-2 clearance. The count is visible text, never
 *    hover-only; the full set is on the item's detail page.
 *  - `detail`: for the Sources grid and the ActionCard. Bounded to three chips, then ONE
 *    disclosure button that reveals the rest in place.
 *
 * LOWER CONFIDENCE, in words: a tag stored below the adopt-as-high line (0.80; lane S1-B stores
 * adopted 0.65 to 0.79 tags with their real confidence) reads "<label> . lower confidence".
 *
 * ABSENCE: no usable tags renders nothing, never a placeholder. Bias applies to external
 * publisher sources only (skill Section 6, ADR-041); callers pass a sources-registry row's tags,
 * never Community content.
 */

import { useId, useState } from "react";
import { TagChip } from "@/components/ui/Chips";
import {
  buildBiasDisplay,
  biasLegendGroups,
  BIAS_DIMENSION_LABELS,
  LOWER_CONFIDENCE_WORDS,
} from "@/lib/credibility/bias-display.mjs";
import { BIAS_TAG_VOCAB } from "@/lib/sources/bias-tag-pipeline.mjs";

export interface BiasTagInput {
  dimension: "funding" | "methodology" | "stakeholder";
  tag: string;
  confidence?: number | null;
}

interface DisplayChip {
  key: string;
  tag: string;
  dimension: "funding" | "methodology" | "stakeholder" | null;
  label: string;
  lowerConfidence: boolean;
  confidencePct: number | null;
}

/** How many chips each variant shows before the remainder. */
const BIAS_ROW_MAX = 2;
const BIAS_DETAIL_MAX = 3;

function chipText(c: DisplayChip): string {
  return c.lowerConfidence ? `${c.label} · ${LOWER_CONFIDENCE_WORDS}` : c.label;
}

function chipTitle(c: DisplayChip): string {
  const dim = c.dimension ? `${BIAS_DIMENSION_LABELS[c.dimension]}: ` : "";
  const conf = c.confidencePct != null ? ` (${c.confidencePct}% confidence)` : "";
  return `${dim}${c.label}${c.lowerConfidence ? `, ${LOWER_CONFIDENCE_WORDS}` : ""}${conf}`;
}

function Chip({ c, variant }: { c: DisplayChip; variant: "row" | "detail" }) {
  return (
    <span
      data-bias-tag={c.tag}
      data-lower-confidence={c.lowerConfidence ? "true" : "false"}
      title={chipTitle(c)}
      style={{ display: "inline-flex", minWidth: 0 }}
    >
      <TagChip variant={variant}>{chipText(c)}</TagChip>
    </span>
  );
}

// Row-variant layout rules, scoped by attribute so nothing else is touched. The row's meta line is a
// single nowrap line that clips at the title column's edge (the title column is the grid's one 1fr
// track, so at tablet widths it is narrow), and a chip cut off mid-word is a defect. So on a single
// line each chip yields width the way the meta text beside it does: it becomes a block box that
// ellipsises. On the phone line (data-wrap) a chip may instead wrap its words inside the line, so a
// long chip can never run past the row into the control gutter. TagChip's own inline styles (nowrap,
// flexShrink 0) are overridden here with !important rather than forked, so the chip family stays the
// one TagChip.
const BIAS_ROW_CSS = `
  [data-part="bias-chips"][data-part-variant="row"] [data-bias-tag] { min-width: 0; flex: 0 1 auto; }
  [data-part="bias-chips"][data-part-variant="row"] [data-part="chip-tag"] {
    display: block !important; min-width: 0; max-width: 100%; overflow: hidden;
    text-overflow: ellipsis; flex-shrink: 1 !important;
  }
  [data-part="bias-chips"][data-part-variant="row"][data-wrap="true"] [data-part="chip-tag"] {
    white-space: normal !important; overflow: visible; text-overflow: clip;
  }
`;

const MORE_TEXT: React.CSSProperties = {
  fontSize: "var(--fs-95)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export function BiasChips({
  tags,
  variant = "row",
  max,
  label,
  wrap = false,
}: {
  tags: BiasTagInput[] | null | undefined;
  variant?: "row" | "detail";
  /** Chips shown before the remainder; defaults per variant (BIAS_ROW_MAX / BIAS_DETAIL_MAX). */
  max?: number;
  /** Optional small-caps lead-in naming whose bias this is (the ActionCard names the primary source). */
  label?: string;
  /** Row variant only: let the group wrap onto a second line (the phone row's line 2 wraps whole chips). */
  wrap?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const bound = max ?? (variant === "row" ? BIAS_ROW_MAX : BIAS_DETAIL_MAX);
  const d = buildBiasDisplay(tags, bound);
  if (d.total === 0) return null;

  const wrapper: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: variant === "row" ? 4 : 8,
    minWidth: 0,
    flexWrap: variant === "row" ? (wrap ? "wrap" : "nowrap") : "wrap",
    // A row group shrinks with its line (its chips ellipsise, see BIAS_ROW_CSS) and a wrapping group
    // breaks between whole chips, so neither keeps its one-line width and runs past the row.
    ...(variant === "row" ? { flexShrink: 1, maxWidth: "100%" } : null),
  };

  return (
    <span
      data-part="bias-chips"
      data-part-variant={variant}
      data-wrap={variant === "row" && wrap ? "true" : undefined}
      role="group"
      aria-label="Source bias tags"
      style={wrapper}
    >
      {variant === "row" && <style>{BIAS_ROW_CSS}</style>}
      {label && (
        <span
          style={{
            fontSize: "var(--fs-95)",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          {label}
        </span>
      )}
      {d.shown.map((c: DisplayChip) => (
        <Chip key={c.key} c={c} variant={variant} />
      ))}
      {d.remaining > 0 && variant === "row" && (
        <span data-bias-more="count" title={d.rest.map((c: DisplayChip) => c.label).join(", ")} style={MORE_TEXT}>
          +{d.remaining} more
        </span>
      )}
      {d.remaining > 0 && variant === "detail" && (
        <>
          <span id={panelId} style={{ display: "contents" }}>
            {open && d.rest.map((c: DisplayChip) => <Chip key={c.key} c={c} variant="detail" />)}
          </span>
          <button
            type="button"
            data-bias-more="disclosure"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            style={{
              ...MORE_TEXT,
              background: "none",
              border: "none",
              padding: "4px 8px",
              minHeight: 28,
              cursor: "pointer",
              fontFamily: "inherit",
              textDecoration: "underline",
              textDecorationColor: "var(--link-line)",
            }}
          >
            {open ? "Show fewer" : `+${d.remaining} more`}
          </button>
        </>
      )}
    </span>
  );
}

/**
 * BiasLegend: the whole bias vocabulary by dimension, built from the stored vocabulary and the
 * label table (never typed per page). Mounted by the Research page, where bias is the headline
 * credibility signal (skill Section 8), so a reader can learn what each chip means.
 */
export function BiasLegend() {
  const groups = biasLegendGroups(BIAS_TAG_VOCAB);
  return (
    <div data-part="bias-legend" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span
        style={{
          fontSize: "var(--fs-10)",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        Source bias tags
      </span>
      {groups.map((g: { dimension: string; label: string; tags: { tag: string; label: string }[] }) => (
        <div key={g.dimension} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "var(--fs-95)",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              minWidth: 64,
            }}
          >
            {g.label}
          </span>
          {g.tags.map((t) => (
            <TagChip key={t.tag} variant="row">
              {t.label}
            </TagChip>
          ))}
        </div>
      ))}
    </div>
  );
}
