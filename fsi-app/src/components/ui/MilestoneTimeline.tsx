"use client";

/**
 * MilestoneTimeline — the one timeline component (UI system handoff
 * 2026-09-06, README §0.4). Passed = filled green dot; next = larger dot
 * in the item's band colour with a ring; ahead = hollow dot; track green
 * to today, rgba(0,0,0,.12) beyond.
 *
 * Row variant is 76px wide; the full variant (detail header) carries date
 * labels and the callout is always the next obligation — full variant is
 * later-lane (detail-architecture) scope; this lane ships the row variant
 * the dashboard's lists use.
 *
 * Track (design audit B-row "the track green-to-next-dot finding",
 * docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md milestonetimeline.json,
 * dc.html #sys list-row example, line-anchored `height:2px;background:
 * linear-gradient(90deg,#16A34A 0,#16A34A 58%,rgba(0,0,0,.12) 58%)`): 2px
 * tall, green from the left edge up to the "next" dot's own position,
 * rgba(0,0,0,.12) beyond it — an all-passed row (no "next") is green its
 * full width, an all-ahead row (no "passed" or "next" reached yet — not
 * reachable from the real classifier, kept as a safe fallback) stays
 * fully rgba(0,0,0,.12). Position is computed against the SAME
 * `justify-content: space-between` spacing the dots themselves use (this
 * component's own layout choice, not the artboard's fixed pixel offsets —
 * the audit's own notes log that as a legitimate, non-numeric divergence).
 */

import type { TimelineEntry } from "@/types/resource";
import { classifyTimelineEntries } from "./milestone-timeline-classify";
import type { TimelineDotState } from "./milestone-timeline-classify";

export interface MilestoneTimelineProps {
  entries?: TimelineEntry[] | null;
  /** The item's urgency band hue, used for the "next" dot + the track up to it. */
  bandHex: string;
  variant?: "row" | "full";
}

// Re-exported so existing callers (DetailShell.tsx) keep importing the
// classifier from "@/components/ui/MilestoneTimeline" — the pure logic
// itself lives in milestone-timeline-classify.ts (no JSX, so its own
// npmtest.mjs can import it directly via jiti; see that file's header).
export { classifyTimelineEntries };
export type { TimelineDotState };

export function MilestoneTimeline({ entries, bandHex, variant = "row" }: MilestoneTimelineProps) {
  const list = (entries ?? []).slice(0, 5);
  if (list.length === 0) {
    return (
      <span aria-hidden="true" style={{ display: "block", width: 76, height: 1, background: "rgba(0,0,0,.12)" }} />
    );
  }

  const classified = classifyTimelineEntries(list);
  const nextIndex = classified.findIndex((c) => c.state === "next");
  const allPassed = classified.every((c) => c.state === "passed");
  const greenPercent =
    nextIndex >= 0 ? (list.length > 1 ? (nextIndex / (list.length - 1)) * 100 : 0) : allPassed ? 100 : 0;

  return (
    <span
      role="img"
      aria-label="Milestone timeline"
      style={{
        display: "flex",
        alignItems: "center",
        width: variant === "row" ? 76 : "100%",
        position: "relative",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          top: "50%",
          height: 2,
          background: `linear-gradient(90deg, var(--awareness) 0%, var(--awareness) ${greenPercent}%, rgba(0,0,0,.12) ${greenPercent}%)`,
          transform: "translateY(-50%)",
        }}
      />
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", position: "relative" }}>
        {classified.map(({ state }, i) => {
          if (state === "passed") {
            return (
              <span
                key={i}
                aria-hidden="true"
                style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--awareness)" }}
              />
            );
          }
          if (state === "next") {
            return (
              <span
                key={i}
                aria-hidden="true"
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: bandHex,
                  boxShadow: `0 0 0 2px ${bandHex}33`,
                }}
              />
            );
          }
          return (
            <span
              key={i}
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--card)",
                border: "1px solid rgba(0,0,0,.28)",
              }}
            />
          );
        })}
      </span>
    </span>
  );
}
