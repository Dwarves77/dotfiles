"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import type { Resource, Supersession } from "@/types/resource";

interface SupersessionHistoryProps {
  supersessions: Supersession[];
  resourceMap: Map<string, Resource>;
}

const SEVERITY_COLORS: Record<string, string> = {
  major: "#FF3B30",
  minor: "#FF9500",
  replacement: "#5856D6",
};

export function SupersessionHistory({ supersessions, resourceMap }: SupersessionHistoryProps) {
  const { navigateToResource } = useNavigationStore();

  if (supersessions.length === 0) {
    return (
      <div className="text-xs text-[var(--sage)] py-4">
        No supersessions recorded.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold tracking-wider uppercase text-white">
        Supersession History ({supersessions.length})
      </h3>
      <div className="space-y-2">
        {supersessions.map((s, i) => {
          const oldR = resourceMap.get(s.old);
          const newR = resourceMap.get(s.new);
          const sevColor = SEVERITY_COLORS[s.severity] || "var(--sage)";
          return (
            <div
              key={i}
              className="border border-white/6 rounded-[2px] p-3 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded-[2px] border"
                  style={{ color: sevColor, borderColor: `${sevColor}30` }}
                >
                  {s.severity}
                </span>
                <span className="text-xs text-[var(--sage)] tabular-nums">{s.date}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--sage)] w-12 shrink-0">Old:</span>
                  <button
                    onClick={() => navigateToResource(s.old)}
                    className="text-xs text-[var(--sage)] hover:text-white cursor-pointer transition-colors truncate"
                  >
                    {oldR?.title || s.old}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--sage)] w-12 shrink-0">New:</span>
                  <button
                    onClick={() => navigateToResource(s.new)}
                    className="text-xs text-white hover:text-[var(--cyan)] cursor-pointer transition-colors font-medium truncate"
                  >
                    {newR?.title || s.new}
                  </button>
                </div>
              </div>
              <p className="text-xs text-[var(--sage)] mt-1.5 leading-relaxed">{s.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
