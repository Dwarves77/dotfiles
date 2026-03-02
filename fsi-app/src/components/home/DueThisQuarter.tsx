"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import { ResourceCard } from "@/components/resource/ResourceCard";
import type { Resource } from "@/types/resource";
import { ChevronDown } from "lucide-react";

interface DueThisQuarterProps {
  resources: Resource[];
}

export function DueThisQuarter({ resources }: DueThisQuarterProps) {
  const { pushFocusView } = useNavigationStore();
  const [open, setOpen] = useState(true);

  const due = useMemo(() => {
    const now = new Date();
    const q = new Date(now.getTime() + 90 * 864e5);

    return resources
      .map((r) => {
        if (!r.timeline?.length) return null;
        const next = r.timeline
          .map((m) => ({ ...m, dt: new Date(m.date) }))
          .filter((m) => m.dt >= now && m.dt <= q)
          .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];
        if (!next) return null;
        const days = Math.floor((next.dt.getTime() - now.getTime()) / 864e5);
        return { resource: r, next, days };
      })
      .filter(Boolean)
      .sort((a, b) => a!.days - b!.days) as {
      resource: Resource;
      next: { date: string; label: string; dt: Date };
      days: number;
    }[];
  }, [resources]);

  if (due.length === 0) return null;

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
            Due This Quarter ({due.length})
          </span>
        </button>
        <button
          onClick={() =>
            pushFocusView({
              title: "Due This Quarter",
              resourceIds: due.map((d) => d.resource.id),
              why: Object.fromEntries(
                due.map((d) => [d.resource.id, `${d.days}d — ${d.next.label}`])
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
          {due.slice(0, 8).map(({ resource: r, next, days }) => (
            <ResourceCard
              key={r.id}
              resource={r}
              why={`${days}d — ${next.label}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
