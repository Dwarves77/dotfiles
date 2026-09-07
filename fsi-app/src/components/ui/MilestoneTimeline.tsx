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
          height: 1,
          background: "rgba(0,0,0,.12)",
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
