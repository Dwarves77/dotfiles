import type { TimelineEntry } from "@/types/resource";

export type TimelineDotState = "passed" | "next" | "ahead";

function dotState(status: TimelineEntry["status"] | undefined, hasNext: boolean, isFirstFuture: boolean): TimelineDotState {
  if (status === "past") return "passed";
  if (status === "current") return "next";
  if (isFirstFuture && !hasNext) return "next";
  return "ahead";
}

/**
 * classifyTimelineEntries — turns raw TimelineEntry status into a
 * passed/next/ahead dot state per entry. "current" wins if any entry
 * declares it explicitly; otherwise the first non-past entry becomes
 * "next". Entries after "next" are "ahead"; entries before it (or marked
 * "past") are "passed".
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
