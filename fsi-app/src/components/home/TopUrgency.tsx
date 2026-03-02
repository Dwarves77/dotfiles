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
  const [open, setOpen] = useState(true);

  const top5 = useMemo(() => {
    return [...resources]
      .sort((a, b) => urgencyScore(b) - urgencyScore(a))
      .slice(0, 5);
  }, [resources]);

  if (top5.length === 0) return null;

  return (
    <div className="border border-border-subtle rounded-[2px] bg-surface-subtle">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "text-text-secondary transition-transform duration-300",
              !open && "-rotate-90"
            )}
            style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
          />
          <span className="text-xs font-semibold tracking-wider uppercase text-text-secondary group-hover:text-text-primary transition-colors">
            Top Urgency
          </span>
        </button>
        <button
          onClick={() =>
            pushFocusView({
              title: "Top Urgency",
              resourceIds: top5.map((r) => r.id),
              why: Object.fromEntries(
                top5.map((r) => [r.id, `Urgency score: ${urgencyScore(r)}`])
              ),
            })
          }
          className="text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
        >
          View all &rarr;
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {top5.map((r) => {
            const modes = r.modes || [r.cat];
            return (
              <button
                key={r.id}
                onClick={() => navigateToResource(r.id)}
                className="w-full text-left flex items-start gap-3 p-3 border border-border-subtle rounded-[2px] bg-surface-subtle hover:border-border-light cursor-pointer transition-all duration-200"
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
                <span className="text-xs font-semibold tabular-nums text-[var(--critical)]">
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
