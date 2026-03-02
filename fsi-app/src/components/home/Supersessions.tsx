"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { Resource, Supersession } from "@/types/resource";
import { ChevronDown, GitBranch } from "lucide-react";

interface SupersessionsProps {
  supersessions: Supersession[];
  resourceMap: Map<string, Resource>;
}

const SEVERITY_COLORS: Record<string, string> = {
  major: "#FF3B30",
  minor: "#FF9500",
  replacement: "#5856D6",
};

export function Supersessions({ supersessions, resourceMap }: SupersessionsProps) {
  const { navigateToResource, pushFocusView } = useNavigationStore();
  const [open, setOpen] = useState(true);

  if (supersessions.length === 0) return null;

  return (
    <div className="border border-white/6 rounded-[2px] bg-white/[0.01]">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "text-[var(--sage)] transition-transform duration-300",
              !open && "-rotate-90"
            )}
            style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
          />
          <GitBranch size={14} strokeWidth={2} className="text-[var(--sage)]" />
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] group-hover:text-white transition-colors">
            Supersessions ({supersessions.length})
          </span>
        </button>
        <button
          onClick={() =>
            pushFocusView({
              title: "Superseded Regulations",
              resourceIds: [...new Set(supersessions.flatMap((s) => [s.old, s.new]))],
            })
          }
          className="text-xs text-[var(--sage)] hover:text-white cursor-pointer transition-colors"
        >
          View all &rarr;
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {supersessions.map((s, i) => {
            const oldR = resourceMap.get(s.old);
            const newR = resourceMap.get(s.new);
            const sevColor = SEVERITY_COLORS[s.severity] || "var(--sage)";
            return (
              <div
                key={i}
                className="border border-white/6 rounded-[2px] p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded-[2px] border"
                    style={{ color: sevColor, borderColor: `${sevColor}30` }}
                  >
                    {s.severity}
                  </span>
                  <span className="text-xs text-[var(--sage)] tabular-nums">{s.date}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => navigateToResource(s.old)}
                    className="text-xs text-[var(--sage)] hover:text-white cursor-pointer transition-colors line-through"
                  >
                    {oldR?.title?.slice(0, 50) || s.old}
                  </button>
                  <span className="text-xs text-[var(--sage)]">&rarr;</span>
                  <button
                    onClick={() => navigateToResource(s.new)}
                    className="text-xs text-white hover:text-[var(--cyan)] cursor-pointer transition-colors font-medium"
                  >
                    {newR?.title?.slice(0, 50) || s.new}
                  </button>
                </div>
                <p className="text-xs text-[var(--sage)] leading-relaxed">{s.note}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
