"use client";

/**
 * ActionCard (`data-part="action-card"`), lane W10-ActionCard-a, 2026-09-21, operator review item
 * 1 (panel 21b, artboard 3): the three separate cards a live regulation page renders today (band
 * pill strip / EXPOSURE / TIMELINE) collapse into ONE card here: pill row, action row, a 1px rule,
 * EXPOSURE, a 1px rule, TIMELINE (which carries its own callout). Props are plain data; this part
 * makes no database read and no fetch (brief step 2).
 *
 * Review item 1, exactly:
 *   a. No "workspace tags" label when there are no tags. Applied tags render as a row under the
 *      pill row when present; the `tags` prop being empty/undefined renders nothing at all.
 *   b. No overflow "..." after the band pill: this card never truncates its own pill row (list
 *      rows own the "..." overflow control, not the detail action card).
 *   c. The pill row is ONE row: pill (band, with window per BandChip's `withWindow`), kind tag,
 *      tier square, all left; `meta` (e.g. "4 sources . T1 primary . regenerated Sep 18")
 *      right-aligned in the SAME row, so a 100%-width card never shows dead space on the right.
 *
 * Review item 2 (EXPOSURE): four cells, WHERE / WHO PAYS / YOUR LANES / NEXT MILESTONE, each
 * clamped at 3 lines (no cell can grow past its neighbours the way an 8-line trajectory sentence
 * did in the artboard's own "before" capture). NEXT MILESTONE is computed here, from the same
 * `timeline` prop the TIMELINE block below renders, via `nextMilestoneClause` (timeline-math.ts),
 * so the two can never disagree about which milestone is "next". An absent WHERE/WHO PAYS/YOUR
 * LANES value renders the Absence convention (the caller decides the reason; this part never
 * invents one), never caps body text.
 */

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import type { TimelineEntry } from "@/types/resource";
import type { UrgencyBand } from "@/lib/urgency/bands";
import type { AbsenceReason } from "@/components/ui/Absence";
import { BandChip, TierChip, TagChip, WorkspaceTagPill } from "@/components/ui/Chips";
import { Absence } from "@/components/ui/Absence";
import { ActionRow } from "@/components/ui/ActionRow";
import { Timeline } from "@/components/ui/Timeline";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { classifyMilestones, nextMilestoneClause } from "@/lib/detail/timeline-math";

export interface ActionCardExposureValue {
  value: ReactNode;
  absenceReason?: AbsenceReason;
}

export interface ActionCardProps {
  band: UrgencyBand;
  /** Kind tag text, e.g. "REGULATION". */
  kindLabel: string;
  /**
   * Additive extension (lane PARITY-PARTS, 2026-09-24): market/research/operations each carry more
   * pill-row chips than regulation's band+kind+tier alone (topic/theme/mode chips, the same role
   * `DetailHeader`'s retired `extraChips` prop played). Rendered between the kind chip and the tier
   * square, matching that prop's documented order (band, then the item's own type/mode/topic chips,
   * then tier last). Undefined renders nothing extra, so regulation's own call site is unaffected.
   */
  extraChips?: ReactNode;
  tier?: number | null;
  /** "4 sources . T1 primary . regenerated Sep 18". Right-aligned in the pill row. */
  meta?: string | null;
  /** Applied workspace tags. Empty/undefined renders no tags row and no label at all (review 1a). */
  tags?: string[] | null;
  /** Lane W10-ActionCard-b (2026-09-22): the interactive tag popover (add/remove), a page-level
   *  concern (it fetches and mutates) that does not belong in this no-fetch part. Rendered inline
   *  so the trigger and panel stay inside the one card; omitted renders nothing. */
  tagPopover?: ReactNode;

  onExport: () => void;
  onShare: () => void;
  /** An instantiated `<WatchButton variant="row" .../>`, see ActionRow's own contract. */
  watch: ReactNode;
  onTag?: () => void;
  exportDisabled?: boolean;

  where: ActionCardExposureValue;
  whoPays: ActionCardExposureValue;
  yourLanes: ActionCardExposureValue;

  timeline?: TimelineEntry[] | null;
  onFullSchedule?: () => void;
  fullScheduleHref?: string;
  /**
   * Operator check 2 (lane PARITY-PARTS, 2026-09-24): when ActionCard is embedded inside
   * `Masthead`'s own `actionSlot` (`.cl-masthead`'s SectionCard), it renders its content in a
   * plain div instead of mounting a SECOND `SectionCard` shell, so the result is one bordered box,
   * not two nested ones. F42/SectionCard.tsx's own rule ("a card shell assembled by hand outside
   * this file is a fitness violation") still holds: this is not a hand-rolled card, it is NO card
   * (no border/radius/shadow of its own), letting the masthead's card be the only one. Default
   * false: the existing standalone caller (regulations, mounted as its own sibling card today,
   * check 2 not yet wired) is unaffected.
   */
  bare?: boolean;
}

const CLAMP_3: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

// Operator ruling (lane W10-ActionCard-b, 2026-09-22, verbatim): "You don't limit the number of
// characters in an analysis of something just because it doesn't flow you adjust how the pages set
// up. We need all of the text and all of the information from the analysis." The 3-line clamp is a
// CLOSED default, never a truncation: a cell whose content overflows 3 lines gets a "Show more"
// affordance that lifts the clamp in place (no content is ever dropped from the DOM).
function ExposureCell({ label, cell }: { label: string; cell: ActionCardExposureValue }) {
  const hasValue = cell.value !== null && cell.value !== undefined && cell.value !== "";
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const valueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) return;
    const el = valueRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [cell.value, expanded]);

  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: "var(--fs-10)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          margin: "0 0 6px",
        }}
      >
        {label}
      </p>
      <div
        ref={valueRef}
        data-audit="exposure-value"
        style={{
          fontSize: "var(--fs-125)",
          lineHeight: 1.5,
          color: "var(--ink)",
          overflowWrap: "anywhere",
          ...(expanded ? {} : CLAMP_3),
        }}
      >
        {hasValue ? cell.value : <Absence reason={cell.absenceReason ?? "not in primary source"} />}
      </div>
      {hasValue && overflowing && (
        // Law 2 hit-target floor (44px, or 24px with 8px clearance): the text itself is ~16px
        // tall, so vertical padding gets the box to 24px with margin providing the clearance
        // (layout guard L9, 2026-09-22, never previously run against the live route).
        <button
          type="button"
          data-audit="exposure-expand"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 8,
            marginBottom: 8,
            fontSize: "var(--fs-105)",
            fontWeight: 700,
            color: "var(--ink-3)",
            background: "none",
            border: "none",
            padding: "4px 0",
            minHeight: 28,
            display: "inline-flex",
            alignItems: "center",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function ActionCard({
  band,
  kindLabel,
  extraChips,
  tier,
  meta,
  tags,
  tagPopover,
  onExport,
  onShare,
  watch,
  onTag,
  exportDisabled,
  where,
  whoPays,
  yourLanes,
  timeline,
  onFullSchedule,
  fullScheduleHref,
  bare = false,
}: ActionCardProps) {
  const classified = classifyMilestones(timeline ?? []);
  const nextClause = nextMilestoneClause(classified);
  const hasTags = Boolean(tags && tags.length > 0);

  const content = (
    <>
      {/* Pill row: band + kind + tier left, meta right, one row (review item 1c). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <BandChip band={band} withWindow />
          <TagChip>{kindLabel}</TagChip>
          {extraChips}
          {typeof tier === "number" && <TierChip tier={tier} />}
        </div>
        {meta && (
          <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", whiteSpace: "nowrap", flexShrink: 0 }}>{meta}</span>
        )}
      </div>

      {/* Applied tags row: no trigger, no "workspace tags" label; hidden entirely when empty
          (review item 1a). */}
      {hasTags && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {(tags ?? []).map((t) => (
            <WorkspaceTagPill key={t} name={t} />
          ))}
        </div>
      )}

      {tagPopover && <div style={{ marginTop: hasTags ? 8 : 10 }}>{tagPopover}</div>}

      {/* Action row (reused, byte-identical chrome across all four detail surfaces). */}
      <div style={{ marginTop: 14 }}>
        <ActionRow onExport={onExport} onShare={onShare} watch={watch} onTag={onTag} exportDisabled={exportDisabled} />
      </div>

      <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "16px 0" }} aria-hidden="true" />

      {/* EXPOSURE: four cells, each clamped at 3 lines (review item 2). */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Exposure</SectionLabel>
        </div>
        <div
          className="cl-exposure-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 18 }}
        >
          <style>{`
            @media (max-width: 900px) { .cl-exposure-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }
            @media (max-width: 520px) { .cl-exposure-grid { grid-template-columns: 1fr !important; } }
          `}</style>
          <ExposureCell label="Where" cell={where} />
          <ExposureCell label="Who pays" cell={whoPays} />
          <ExposureCell label="Your lanes" cell={yourLanes} />
          <ExposureCell
            label="Next milestone"
            cell={nextClause ? { value: nextClause } : { value: null, absenceReason: "pending" }}
          />
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "16px 0" }} aria-hidden="true" />

      <Timeline entries={timeline} band={band} onFullSchedule={onFullSchedule} fullScheduleHref={fullScheduleHref} />
    </>
  );

  if (bare) {
    return (
      <div data-part="action-card" style={{ padding: "16px 20px 18px" }}>
        {content}
      </div>
    );
  }

  return (
    <SectionCard as="section" dataAttributes={{ "data-part": "action-card" }} padding="16px 20px 18px">
      {content}
    </SectionCard>
  );
}
