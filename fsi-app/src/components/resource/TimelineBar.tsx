"use client";

import { cn } from "@/lib/cn";
import type { TimelineEntry } from "@/types/resource";

interface TimelineBarProps {
  items: TimelineEntry[];
  color?: string;
}

export function TimelineBar({ items, color = "#34C759" }: TimelineBarProps) {
  if (!items?.length) return null;

  const now = new Date();
  const entries = items.slice(0, 6).map((m) => {
    const dt = new Date(m.date);
    const isPast = dt <= now;
    const isActive = !isPast;
    return { ...m, dt, isPast, isActive };
  });

  // Find the first future entry
  const firstFutureIdx = entries.findIndex((e) => !e.isPast);

  return (
    <div className="relative py-4">
      {/* Track */}
      <div className="absolute top-[22px] left-5 right-5 h-0.5 bg-active-bg" />

      {/* Milestones */}
      <div className="flex justify-between relative">
        {entries.map((m, i) => {
          const isNextUp = i === firstFutureIdx;
          const days = m.isPast
            ? null
            : Math.max(0, Math.floor((m.dt.getTime() - now.getTime()) / 864e5));

          return (
            <div
              key={i}
              className="flex flex-col items-center flex-1 min-w-0"
            >
              {/* Dot */}
              <div
                className={cn(
                  "rounded-full z-10 border-2",
                  isNextUp ? "w-3.5 h-3.5" : "w-2.5 h-2.5"
                )}
                style={{
                  background: m.isPast ? color : isNextUp ? `${color}88` : "var(--color-text-secondary)",
                  borderColor: isNextUp ? "var(--color-text-primary)" : "var(--color-background)",
                  boxShadow: isNextUp ? `0 0 8px ${color}66` : "none",
                }}
              />

              {/* Label */}
              <span
                className={cn(
                  "mt-2 text-center leading-tight",
                  isNextUp ? "text-xs font-semibold" : "text-xs"
                )}
                style={{ color: m.isPast ? color : "var(--color-text-secondary)" }}
              >
                {m.date}
              </span>
              <span className="text-xs text-text-secondary text-center leading-tight px-1 truncate max-w-full">
                {m.label}
              </span>

              {/* Countdown */}
              {days !== null && (
                <span
                  className="text-xs font-semibold mt-0.5"
                  style={{
                    color: days <= 30 ? "#FF3B30" : days <= 90 ? "#FF9500" : "var(--color-text-secondary)",
                  }}
                >
                  {days}d
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
