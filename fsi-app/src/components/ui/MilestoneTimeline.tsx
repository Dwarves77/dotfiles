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

export interface MilestoneTimelineProps {
  entries?: TimelineEntry[] | null;
  /** The item's urgency band hue, used for the "next" dot + the track up to it. */
  bandHex: string;
  variant?: "row" | "full";
}

function dotState(status: TimelineEntry["status"] | undefined, hasNext: boolean, isFirstFuture: boolean) {
  if (status === "past") return "passed" as const;
  if (status === "current") return "next" as const;
  if (isFirstFuture && !hasNext) return "next" as const;
  return "ahead" as const;
}

export type TimelineDotState = "passed" | "next" | "ahead";

/**
 * classifyTimelineEntries — the one place that turns raw TimelineEntry
 * status into a passed/next/ahead dot state (mobile 390 build, lane
 * mobdetail, 2026-09-07). Factored out of this file's own row/full dot
 * render loop below so DetailTimeline's mobile vertical stack
 * (DetailShell.tsx) can classify the SAME entries the same way rather than
 * re-deriving the hasExplicitCurrent/firstFutureSeen bookkeeping a second
 * time (CLAUDE.md rule 13, no duplication).
 */
export function classifyTimelineEntries(entries: TimelineEntry[]): Array<{ entry: TimelineEntry; state: TimelineDotState }> {
  const hasExplicitCurrent = entries.some((e) => e.status === "current");
  let firstFutureSeen = false;
  return entries.map((e) => {
    const isFirstFuture = !hasExplicitCurrent && e.status !== "past" && !firstFutureSeen;
    if (isFirstFuture) firstFutureSeen = true;
    const state = dotState(e.status, hasExplicitCurrent, isFirstFuture);
    return { entry: e, state };
  });
}

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
