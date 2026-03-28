"use client";

import { useResourceStore } from "@/stores/resourceStore";
import { cn } from "@/lib/cn";

const SORT_OPTIONS = [
  { key: "urgency" as const, label: "Urgency" },
  { key: "priority" as const, label: "Priority" },
  { key: "alpha" as const, label: "A-Z" },
  { key: "added" as const, label: "Newest" },
  { key: "modified" as const, label: "Modified" },
] as const;

export function SortSelector() {
  const { sort, setSort } = useResourceStore();

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold tracking-widest uppercase text-text-primary inline-block w-[80px] text-right pr-4 shrink-0 border-r border-border-subtle mr-2">
        Sort
      </span>
      {SORT_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setSort(key)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-[6px] border",
            "transition-all duration-200 cursor-pointer",
            sort === key
              ? "border-border-medium bg-active-bg text-text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
