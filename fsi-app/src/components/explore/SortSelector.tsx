"use client";

import { useResourceStore } from "@/stores/resourceStore";
import { cn } from "@/lib/cn";

const SORT_OPTIONS = [
  { key: "urgency" as const, label: "Urgency" },
  { key: "alpha" as const, label: "A–Z" },
  { key: "added" as const, label: "Newest" },
  { key: "modified" as const, label: "Modified" },
] as const;

export function SortSelector() {
  const { sort, setSort } = useResourceStore();

  return (
    <div className="flex items-center gap-0">
      <div className="shrink-0 w-[72px] mr-3">
        <span
          className="text-[9px] font-bold tracking-[0.15em] uppercase"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sort
        </span>
      </div>

      <div className="flex items-center gap-1">
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-semibold rounded-md border",
              "transition-all duration-200 cursor-pointer tracking-wide",
            )}
            style={{
              borderColor: sort === key ? "var(--color-active-border)" : "var(--color-border)",
              backgroundColor: sort === key ? "var(--color-active-bg)" : "transparent",
              color: sort === key ? "var(--color-primary)" : "var(--color-text-secondary)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
