"use client";

import { useMemo } from "react";
import type { Resource } from "@/types/resource";
import { useNavigationStore } from "@/stores/navigationStore";
import { PRIORITY_COLORS } from "@/lib/constants";

interface TimelineViewProps {
  resources: Resource[];
}

interface TimelineEvent {
  date: Date;
  dateStr: string;
  label: string;
  resource: Resource;
  isPast: boolean;
  daysAway: number;
}

export function TimelineView({ resources }: TimelineViewProps) {
  const { navigateToResource } = useNavigationStore();
  const now = new Date();

  const events = useMemo(() => {
    const all: TimelineEvent[] = [];
    for (const r of resources) {
      if (!r.timeline?.length) continue;
      for (const m of r.timeline) {
        let dateStr = m.date;
        if (/^\d{4}-\d{2}$/.test(dateStr)) dateStr += "-01";
        else if (/^\d{4}$/.test(dateStr)) dateStr += "-01-01";
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) continue;
        const daysAway = Math.floor((date.getTime() - now.getTime()) / 864e5);
        all.push({
          date,
          dateStr: m.date,
          label: m.label,
          resource: r,
          isPast: date < now,
          daysAway,
        });
      }
    }
    return all.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [resources, now]);

  // Group by quarter
  const quarters = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {};
    for (const e of events) {
      const y = e.date.getFullYear();
      const q = Math.ceil((e.date.getMonth() + 1) / 3);
      const key = `${y} Q${q}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    return Object.entries(groups);
  }, [events]);

  // Find the first future quarter
  const currentQuarterKey = `${now.getFullYear()} Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
          Regulation Timeline
        </h3>
        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {events.filter((e) => !e.isPast).length} upcoming milestones across {resources.filter((r) => r.timeline?.length).length} regulations
        </p>
      </div>

      {quarters.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>No timeline data available</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
            Regulations without milestone dates won't appear here.
          </p>
        </div>
      )}

      {quarters.map(([quarter, qEvents]) => {
        const isCurrent = quarter === currentQuarterKey;
        const allPast = qEvents.every((e) => e.isPast);

        return (
          <div key={quarter}>
            {/* Quarter header */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                style={{
                  color: isCurrent ? "var(--color-primary)" : allPast ? "var(--color-text-muted)" : "var(--color-text-secondary)",
                  backgroundColor: isCurrent ? "var(--color-active-bg)" : "transparent",
                  border: isCurrent ? "1px solid var(--color-active-border)" : "none",
                }}
              >
                {quarter}
              </span>
              {isCurrent && (
                <span className="text-[10px] font-medium" style={{ color: "var(--color-primary)" }}>
                  Current Quarter
                </span>
              )}
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />
            </div>

            {/* Events */}
            <div className="space-y-1 ml-2 border-l-2 pl-4" style={{ borderColor: allPast ? "var(--color-border-subtle)" : "var(--color-primary)" }}>
              {qEvents.map((event, i) => (
                <button
                  key={`${event.resource.id}-${i}`}
                  onClick={() => navigateToResource(event.resource.id)}
                  className="w-full flex items-center gap-3 py-2 px-2 rounded-md text-left cursor-pointer transition-colors hover:bg-[var(--color-surface-raised)]"
                >
                  {/* Date dot */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0 -ml-[21px]"
                    style={{
                      backgroundColor: event.isPast ? "var(--color-text-muted)" :
                        event.daysAway <= 30 ? "var(--color-error)" :
                        event.daysAway <= 90 ? "var(--color-warning)" :
                        "var(--color-primary)",
                    }}
                  />

                  {/* Date */}
                  <span className="text-[11px] tabular-nums w-20 shrink-0" style={{
                    color: event.isPast ? "var(--color-text-muted)" : "var(--color-text-secondary)",
                    textDecoration: event.isPast ? "line-through" : "none",
                  }}>
                    {event.dateStr}
                  </span>

                  {/* Countdown */}
                  {!event.isPast && (
                    <span
                      className="text-[10px] font-semibold tabular-nums w-10 shrink-0"
                      style={{
                        color: event.daysAway <= 30 ? "var(--color-error)" :
                          event.daysAway <= 90 ? "var(--color-warning)" :
                          "var(--color-text-muted)",
                      }}
                    >
                      {event.daysAway}d
                    </span>
                  )}
                  {event.isPast && <span className="w-10 shrink-0" />}

                  {/* Priority badge */}
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      color: PRIORITY_COLORS[event.resource.priority],
                      backgroundColor: `${PRIORITY_COLORS[event.resource.priority]}12`,
                    }}
                  >
                    {event.resource.priority}
                  </span>

                  {/* Label + regulation */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium block truncate" style={{ color: "var(--color-text-primary)" }}>
                      {event.label}
                    </span>
                    <span className="text-[11px] block truncate" style={{ color: "var(--color-text-muted)" }}>
                      {event.resource.title}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
