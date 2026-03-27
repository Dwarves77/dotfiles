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
    <div className="border border-white/[0.08] rounded-[10px] bg-surface-card">
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
            {title}
          </span>
          {count !== undefined && (
            <span className="text-xs tabular-nums text-text-secondary/60">({count})</span>
          )}
        </button>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          >
            View all &rarr;
          </button>
        )}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
