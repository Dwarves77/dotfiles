"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import { ResourceCard } from "@/components/resource/ResourceCard";
import { urgencyScore } from "@/lib/scoring";
import type { Resource } from "@/types/resource";
import { ChevronDown } from "lucide-react";

interface TopUrgencyProps {
  resources: Resource[];
}

export function TopUrgency({ resources }: TopUrgencyProps) {
  const { pushFocusView } = useNavigationStore();
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
          {top5.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              why={`Urgency score: ${urgencyScore(r)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
