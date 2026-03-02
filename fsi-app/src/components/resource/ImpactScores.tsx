"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { IMPACT_COLORS, IMPACT_LABELS } from "@/lib/constants";
import type { ImpactScores as ImpactScoresType, ImpactReasoning } from "@/types/resource";
import { ChevronDown } from "lucide-react";

interface ImpactScoresProps {
  scores: ImpactScoresType;
  reasoning?: ImpactReasoning;
}

const DIMS = ["cost", "compliance", "client", "operational"] as const;
const LEVEL_LABELS = ["None", "Low", "Moderate", "High"];

export function ImpactScores({ scores, reasoning }: ImpactScoresProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary">
          Impact Assessment
        </span>
        {reasoning && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          >
            {expanded ? "Hide" : "Show"} reasoning
            <ChevronDown
              size={10}
              className={cn("transition-transform duration-200", expanded && "rotate-180")}
            />
          </button>
        )}
      </div>

      {DIMS.map((dim) => {
        const value = scores[dim] || 0;
        const color = IMPACT_COLORS[dim];
        const label = IMPACT_LABELS[dim];

        return (
          <div key={dim}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary w-28 shrink-0">
                {label}
              </span>
              <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(value / 3) * 100}%`,
                    backgroundColor: color,
                    transitionTimingFunction: "var(--ease-out-expo)",
                  }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums w-6 text-right" style={{ color }}>
                {value}/3
              </span>
              <span className="text-xs text-text-secondary w-16">
                {LEVEL_LABELS[value]}
              </span>
            </div>
            {expanded && reasoning?.[dim] && (
              <p className="text-xs text-text-secondary ml-28 mt-0.5 pl-2 border-l border-border-subtle">
                {reasoning[dim]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
