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
    <div className="cl-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold tracking-wide uppercase text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
            {title}
          </h3>
          {count !== undefined && (
            <span className="text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
              ({count})
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onViewAll && (
            <span
              onClick={(e) => { e.stopPropagation(); onViewAll(); }}
              className="text-[13px] font-medium transition-colors hover:underline"
              style={{ color: "var(--color-primary)" }}
            >
              View all &rarr;
            </span>
          )}
          <ChevronDown
            size={16}
            strokeWidth={2.5}
            className={cn(
              "transition-transform duration-200",
              open && "rotate-180"
            )}
            style={{ color: "var(--color-text-secondary)" }}
          />
        </div>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
