"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import { Badge } from "@/components/ui/Badge";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { urgencyScore } from "@/lib/scoring";
import { PRIORITY_COLORS } from "@/lib/constants";
import type { Resource } from "@/types/resource";
import { ChevronDown } from "lucide-react";

interface TopUrgencyProps {
  resources: Resource[];
}

export function TopUrgency({ resources }: TopUrgencyProps) {
  const { pushFocusView, navigateToResource } = useNavigationStore();
  const [open, setOpen] = useState(false);

  const top5 = useMemo(() => {
    return [...resources]
      .sort((a, b) => urgencyScore(b) - urgencyScore(a))
      .slice(0, 5);
  }, [resources]);

  if (top5.length === 0) return null;

  return (
    <div className="cl-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer group"
      >
        <h3 className="text-sm font-bold tracking-wide uppercase" style={{ color: "var(--color-text-primary)" }}>
          Top Urgency
        </h3>
        <div className="flex items-center gap-3">
          <span
            onClick={(e) => {
              e.stopPropagation();
              pushFocusView({
                title: "Top Urgency",
                resourceIds: top5.map((r) => r.id),
                why: Object.fromEntries(
                  top5.map((r) => [r.id, `Urgency score: ${urgencyScore(r)}`])
                ),
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
        <div className="px-4 pb-2 divide-y divide-border-subtle">
          {top5.map((r) => {
            const modes = r.modes || [r.cat];
            return (
              <button
                key={r.id}
                onClick={() => navigateToResource(r.id)}
                className="w-full text-left flex items-start gap-3 py-2.5 px-1 hover:bg-surface-overlay cursor-pointer transition-all duration-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {modes.map((m) =>
                      m === "air" || m === "road" || m === "ocean" ? (
                        <ModeBadge key={m} mode={m as "air" | "road" | "ocean"} />
                      ) : null
                    )}
                    <Badge label={r.priority} color={PRIORITY_COLORS[r.priority]} />
                  </div>
                  <p className="text-xs font-medium text-text-primary truncate">{r.title}</p>
                  <p className="text-xs text-text-secondary line-clamp-1 mt-0.5">
                    {r.whyMatters || r.note}
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-[var(--critical)] cursor-help" title="Urgency Score = enforcement proximity × priority weight × jurisdiction impact × compliance breadth. Higher = more urgent action needed.">
                  {urgencyScore(r)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
