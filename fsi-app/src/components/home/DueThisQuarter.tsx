"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useNavigationStore } from "@/stores/navigationStore";
import type { Resource } from "@/types/resource";
import { ChevronDown } from "lucide-react";

interface DueThisQuarterProps {
  resources: Resource[];
}

export function DueThisQuarter({ resources }: DueThisQuarterProps) {
  const { pushFocusView, navigateToResource } = useNavigationStore();
  const [open, setOpen] = useState(false);

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
    <div className="border rounded-lg border-[var(--color-border)] bg-[var(--color-surface)]">
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
          <h3 className="text-xs font-semibold tracking-wider uppercase text-text-secondary group-hover:text-text-primary transition-colors">
            Due This Quarter ({due.length})
          </h3>
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
        <div className="px-4 pb-2 divide-y divide-border-subtle">
          {due.slice(0, 8).map(({ resource: r, next, days }) => (
            <button
              key={r.id}
              onClick={() => navigateToResource(r.id)}
              className="w-full text-left flex items-center gap-3 px-1 py-2.5 hover:bg-surface-overlay cursor-pointer transition-colors"
            >
              <span
                className="text-xs font-semibold tabular-nums w-10 shrink-0"
                style={{
                  color:
                    days <= 30
                      ? "var(--critical)"
                      : days <= 60
                      ? "#C77700"
                      : "var(--color-text-secondary)",
                }}
              >
                {days}d
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-primary truncate">{r.title}</p>
                <p className="text-xs text-text-secondary truncate">
                  {next.label}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
