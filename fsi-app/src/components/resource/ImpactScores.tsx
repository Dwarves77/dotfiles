"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { IMPACT_LABELS } from "@/lib/constants";
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold tracking-wide uppercase" style={{ color: "var(--color-text-primary)" }}>
          Impact Assessment
        </span>
        {reasoning && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-medium cursor-pointer transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
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
        const label = IMPACT_LABELS[dim];
        const pct = (value / 3) * 100;
        const gradientClass = value === 0 ? "" : value === 1 ? "gradient-bar-low" : value === 2 ? "gradient-bar-moderate" : "gradient-bar-critical";

        return (
          <div key={dim} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {label}
              </span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                {value}/3 — {LEVEL_LABELS[value]}
              </span>
            </div>
            {/* Chunky bar — color only shows up to the actual severity level */}
            <div
              className="w-full h-3 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--color-surface-raised)" }}
            >
              <div
                className={cn("h-full rounded-full transition-all duration-500", gradientClass)}
                style={{
                  width: `${pct}%`,
                  transitionTimingFunction: "var(--ease-out-expo)",
                  minWidth: value > 0 ? "8%" : "0%",
                }}
              />
            </div>
            {expanded && reasoning?.[dim] && (
              <p className="text-[12px] leading-relaxed pl-1" style={{ color: "var(--color-text-muted)" }}>
                {reasoning[dim]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
