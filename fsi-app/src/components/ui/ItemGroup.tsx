"use client";

/**
 * ItemGroup (lane w10-factcard-d, 2026-09-21; artboard 21c, parts-brief-2026-09-18.md section
 * 2.2). Wraps fact cards inside an S-section on all four detail surfaces. Spec (2.2, verbatim):
 *
 *   "Header: item band pill (tinted pill, 6px dot, 9.5px/800 label) - item title 13px/600 -
 *    qualifier 11px muted. Groups separated by 1px rgba(0,0,0,.08). Every group CLOSES with an
 *    ACTION strip = StateNote in the item's band tint (2.7), label 'ACTION' in the band colour,
 *    one sentence."
 *
 * DATA HONESTY (build item 3's own instruction: "if the data source for the strip is not stated
 * there or in the model today, STOP and ask, do not invent a field"). Two pieces of the artboard
 * cannot be wired against a real intelligence_items row today, and are NOT invented here:
 *
 *   1. Per-topic segmentation. Artboard 21c's two groups ("Take-back registration...",
 *      "Recovery and recycling targets...") are per-TOPIC groups inside one S-section. Neither
 *      fact-paragraphs.ts nor fact-card-model.ts carries a topic/heading boundary today
 *      (fact-paragraphs.ts's own header: headings are left as raw markdown in a `prose` block,
 *      never parsed into a title). `title`/`qualifier` below are therefore OPTIONAL, sourced
 *      only from real page-level data a caller already holds (see FactBlocks.tsx, which passes
 *      neither, grouping instead by "one run of consecutive non-prose blocks" - the honest unit
 *      the data supports).
 *   2. The ACTION strip's one-sentence content. The artboard's strip text ("Ask each
 *      Belgium-bound client for its registration number...") is not any existing FactCardModel
 *      field, `content_md` field, or derivable transform of one - it reads as separately
 *      authored copy. Lane PARITY-PARTS (2026-09-24) wires the one REAL field that says what the
 *      reader should do: the item's own top `recommendedActions[].action`, read from the detail
 *      page's BandProvider. An item with no recommended action still renders no strip - integrity
 *      rule ("omit rather than invent") over a StateNote reading an invented sentence.
 *
 * What IS wired honestly: `band`, when a caller has one, comes straight from
 * `src/lib/urgency/bands.ts`'s `UrgencyBand` (the one platform urgency vocabulary; every detail
 * surface already computes this for its own page). The 4-card visible cap + "N more facts"
 * disclosure (build item 3) reuses the ONE existing overflow control, `MoreBelowDisclosure`
 * (src/components/shared/MoreBelowDisclosure.tsx) - closed by default (F43), no second
 * disclosure implementation.
 *
 * BAND TAG, ONCE (lane PARITY-PARTS look-only pass, 2026-09-25, operator note against the new
 * artboards: "band tag on every fact card should appear once, in the masthead, not per-card").
 * Every group on a single-item detail page (Key dates, Verbatim facts, ...) inherited the page's
 * OWN band from BandProvider and repainted it as a second dot+label pill in its own header - the
 * masthead's ActionCard (Masthead.tsx's `actionSlot`) already renders that same band once, at the
 * top of the page. The tint (header background, ACTION-strip colour) still reads from the page's
 * ambient band via BandProvider - that is a grouping/urgency-colour cue, not a text label, and
 * repeating a colour is not what the operator's note names. Only the PILL (the dot+label the note
 * calls a "tag") is now gated on an EXPLICITLY passed `band` prop, never the ambient context: a
 * future caller grouping facts by a DIFFERENT item (e.g. a cross-item cluster/synthesis view) can
 * still pass its own item's band and get the pill, but the common case - a single item's own
 * sections on its own detail page - never repeats the masthead's tag.
 */

import type { ReactNode } from "react";
import type { UrgencyBand } from "@/lib/urgency/bands";
import { StateNote } from "@/components/ui/StateNote";
import { useBandContext } from "@/components/ui/band-context";
import { MoreBelowDisclosure } from "@/components/shared/MoreBelowDisclosure";

export interface ItemGroupActionStrip {
  /** One sentence. See the header note: no real call site supplies this today. */
  text: string;
}

export interface ItemGroupProps {
  /** Item title, 13px/600. Omitted (no header row at all, unless `band` is given) when the
   *  caller has no real per-item title - never a placeholder string. */
  title?: string | null;
  /** 11px muted, right of the title. */
  qualifier?: string | null;
  /**
   * Drives the header's TINT (background, ACTION-strip colour). Real data only - see header note.
   * Does NOT by itself render the dot+label PILL any more (2026-09-25, "band tag once, in the
   * masthead") - the pill renders only when this prop is passed EXPLICITLY, never when it is the
   * page's own ambient band inherited from BandProvider (see `pillBand` below).
   */
  band?: UrgencyBand | null;
  /** Explicit strip. Absent, a detail page's BandProvider supplies the item's top recommended
   *  action (real data) or nothing; see header note. */
  actionStrip?: ItemGroupActionStrip | null;
  /** The fact cards themselves, already merged (fact-card-model.ts's `mergeAdjacentSameKind`)
   *  by the caller - ItemGroup renders whatever it is given, in order, capped at 4 visible. */
  children: ReactNode[];
}

/** 21c: "never renders more than 3 cards in a group" is the artboard's own observed content, not
 *  a hard ceiling; build item 3's stated ceiling is 4, with overflow behind "N more facts". */
const VISIBLE_CARD_CAP = 4;

export function ItemGroup({ title, qualifier, band: bandProp, actionStrip: actionStripProp, children }: ItemGroupProps) {
  // Lane PARITY-PARTS (2026-09-24, operator check 1, README 0.5 item group header): on a detail page
  // the group takes the item's band and its one real action sentence from the page's BandProvider
  // (band-context.tsx) when the caller passes neither, so FactBlocks' groups, which have no
  // per-group data of their own, are tinted and closed by the ACTION strip without any page threading
  // a prop. No provider (the /admin parts gallery) keeps the prior behaviour exactly.
  const ctx = useBandContext();
  const band = bandProp ?? ctx.band;
  // Band tag, once (2026-09-25): the PILL renders only for a band the caller passed explicitly -
  // never for the page's own ambient band, which the masthead's ActionCard already shows once.
  const pillBand = bandProp ?? null;
  const actionStrip = actionStripProp ?? (ctx.action ? { text: ctx.action } : null);
  const cards = Array.isArray(children) ? children : [children];
  const visible = cards.slice(0, VISIBLE_CARD_CAP);
  const overflow = cards.slice(VISIBLE_CARD_CAP);
  // FIX (live-render pass, 2026-09-25, Playwright capture against /regulations/[slug]): gating the
  // header on the raw `band` (tint) rather than `pillBand` left an EMPTY tinted bar rendering above
  // every group on a single-item detail page (no title, no pill, a solid colour strip with nothing
  // in it) once the pill itself stopped inheriting the ambient band - a header with nothing to show
  // must not render at all.
  const hasHeader = Boolean(title || pillBand);

  return (
    <div
      data-part="item-group"
      style={{
        border: "1px solid rgba(0,0,0,.08)",
        borderRadius: "var(--radius-card, 10px)",
        overflow: "hidden",
        margin: "0 0 20px",
        background: "var(--card)",
      }}
    >
      {hasHeader && (
        <div
          data-part-slot="group-header"
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "10px 14px",
            background: band ? band.tintCssVar : "var(--page)",
            borderBottom: "1px solid rgba(0,0,0,.08)",
          }}
        >
          {pillBand && (
            <span data-part-slot="band-pill" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: pillBand.cssVar, display: "inline-block" }} />
              <span
                style={{
                  fontSize: "var(--fs-95, 9.5px)",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: pillBand.cssVar,
                }}
              >
                {pillBand.label}
              </span>
            </span>
          )}
          {title && (
            <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--ink)" }} data-guard-title>
              {title}
            </span>
          )}
          {qualifier && <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", marginLeft: "auto" }}>{qualifier}</span>}
        </div>
      )}
      <div data-part-slot="group-body" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 0 }}>
        {visible}
        {overflow.length > 0 && (
          <MoreBelowDisclosure count={overflow.length} itemNoun="more facts">
            {overflow}
          </MoreBelowDisclosure>
        )}
      </div>
      {actionStrip && (
        <div data-part-slot="action-strip" style={{ padding: "0 14px 14px" }}>
          <StateNote band={band}>
            <strong style={{ fontWeight: 800, color: band ? band.cssVar : "var(--brand)" }}>ACTION</strong>{" "}
            {actionStrip.text}
          </StateNote>
        </div>
      )}
    </div>
  );
}
