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
  const [open, setOpen] = useState(false);

  if (supersessions.length === 0) return null;

  return (
    <div className="border rounded-lg border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <GitBranch size={14} strokeWidth={2} className="text-text-secondary" />
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-text-secondary group-hover:text-text-primary transition-colors">
              Replaced Regulations ({supersessions.length})
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Regulations that have been replaced by newer versions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            onClick={(e) => {
              e.stopPropagation();
              pushFocusView({
                title: "Superseded Regulations",
                resourceIds: [...new Set(supersessions.flatMap((s) => [s.old, s.new]))],
              });
            }}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            View all &rarr;
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "text-text-secondary transition-transform duration-300",
              open && "rotate-180"
            )}
            style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
          />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {supersessions.map((s, i) => {
            const oldR = resourceMap.get(s.old);
            const newR = resourceMap.get(s.new);
            const sevColor = SEVERITY_COLORS[s.severity] || "var(--color-text-secondary)";
            return (
              <div
                key={i}
                className="border border-border-subtle rounded-lg bg-surface-card hover:border-border-light transition-all duration-200 p-4 space-y-2"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: sevColor,
                  transitionTimingFunction: "var(--ease-out-expo)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded border"
                    style={{ color: sevColor, borderColor: `${sevColor}30` }}
                  >
                    {s.severity}
                  </span>
                  <span className="text-xs text-text-secondary tabular-nums">{s.date}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => navigateToResource(s.old)}
                    className="text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors line-through"
                  >
                    {oldR?.title?.slice(0, 50) || s.old}
                  </button>
                  <span className="text-xs text-text-secondary">&rarr;</span>
                  <button
                    onClick={() => navigateToResource(s.new)}
                    className="text-xs text-text-primary hover:text-text-accent cursor-pointer transition-colors font-medium"
                  >
                    {newR?.title?.slice(0, 50) || s.new}
                  </button>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{s.note}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
