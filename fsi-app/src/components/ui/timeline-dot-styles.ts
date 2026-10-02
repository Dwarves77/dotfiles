/**
 * timeline-dot-styles: the one home for a timeline dot's passed/next/ahead geometry (F45
 * duplicate-code, lane W10-ActionCard-a, 2026-09-21). MilestoneTimeline.tsx's row-strip dots and
 * Timeline.tsx's full-card dots draw the SAME three visual states at different sizes; before this
 * extraction each file re-typed the three style objects independently, which is exactly the
 * reinventing-the-wheel signal remediation-discipline's Section 5 names for extraction. Plain
 * function, no JSX, so both callers stay pure-style consumers.
 */
import type { CSSProperties } from "react";

/** Filled solid circle: a passed milestone. */
export function passedDotStyle(size: number): CSSProperties {
  return { width: size, height: size, borderRadius: "50%", background: "var(--awareness)" };
}

/** Hollow circle with a light border: a milestone still ahead. */
export function aheadDotStyle(size: number): CSSProperties {
  return { width: size, height: size, borderRadius: "50%", background: "var(--card)", border: "1px solid rgba(0,0,0,.28)" };
}

/** Larger dot in the item's band colour with a ring: the next milestone.
 *  `bandHex` MUST be a raw hex literal (`UrgencyBand.hex`, e.g. "#DC2626"), never a `var(--token)`
 *  reference (`UrgencyBand.cssVar`): the ring appends a two-digit alpha suffix directly onto this
 *  string, which only produces a valid 8-digit hex color when the base is a hex literal. A
 *  CSS custom-property reference followed by a bare digit run is not a color in any CSS grammar;
 *  this was CF-BROKEN-2 / A2bc, fixed at both call sites in lane R12-13, 2026-10-01. */
export function nextDotStyle(bandHex: string, size: number, ringWidthPx: number): CSSProperties {
  return { width: size, height: size, borderRadius: "50%", background: bandHex, boxShadow: `0 0 0 ${ringWidthPx}px ${bandHex}33` };
}

/** The horizontal track behind the dots: green from the left edge to `greenPercent`, grey beyond
 *  (review item 3: "Track green to today ... grey beyond"). Absolutely positioned inside a
 *  `position: relative` wrapper; the caller supplies `inset` (4px for the row strip's own inset). */
export function timelineTrackStyle(greenPercent: number): CSSProperties {
  return {
    position: "absolute",
    left: 4,
    right: 4,
    top: "50%",
    height: 2,
    background: `linear-gradient(90deg, var(--awareness) 0%, var(--awareness) ${greenPercent}%, rgba(0,0,0,.12) ${greenPercent}%)`,
    transform: "translateY(-50%)",
  };
}
