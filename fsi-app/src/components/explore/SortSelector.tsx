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
          {/* Label — same micro-label style as FilterRow */}
              <div className="shrink-0 w-[72px] mr-3">
                      <span className="text-[9px] font-black tracking-[0.18em] uppercase text-text-muted/70">
                                Sort
                      </span>
              </div>
        
          {/* Segmented-style sort buttons */}
              <div className="flex items-center gap-1">
                {SORT_OPTIONS.map(({ key, label }) => (
                    <button
                                  key={key}
                                  onClick={() => setSort(key)}
                                  className={cn(
                                                  "px-2.5 py-1 text-[11px] font-semibold rounded-[6px] border",
                                                  "transition-all duration-200 cursor-pointer tracking-wide",
                                                  sort === key
                                                    ? "border-white/25 bg-white/10 text-text-primary shadow-sm"
                                                    : "border-white/[0.08] bg-white/[0.03] text-text-secondary hover:border-white/15 hover:text-text-primary hover:bg-white/[0.06]"
                                                )}
                                >
                      {label}
                    </button>
                  ))}
              </div>
        </div>
      );
}
