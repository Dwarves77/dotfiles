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
      <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] mr-1">
        Sort
      </span>
      {SORT_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setSort(key)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-[2px] border",
            "transition-all duration-200 cursor-pointer",
            sort === key
              ? "border-white/15 bg-white/8 text-white"
              : "border-transparent text-[var(--sage)] hover:text-white"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
