"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";

interface SectionProps {
  title: string;
  count?: number;
  onViewAll?: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Section({ title, count, onViewAll, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-white/6 rounded-[2px] bg-white/[0.01]">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "text-[var(--sage)] transition-transform duration-300",
              !open && "-rotate-90"
            )}
            style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
          />
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--sage)] group-hover:text-white transition-colors">
            {title}
          </span>
          {count !== undefined && (
            <span className="text-xs tabular-nums text-[var(--sage)]/60">({count})</span>
          )}
        </button>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-[var(--sage)] hover:text-white cursor-pointer transition-colors"
          >
            View all &rarr;
          </button>
        )}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
