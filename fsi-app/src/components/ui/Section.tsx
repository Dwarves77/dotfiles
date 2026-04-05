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
    <div
      className="border rounded-lg"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "transition-transform duration-200",
              !open && "-rotate-90"
            )}
            style={{ color: "var(--color-text-secondary)" }}
          />
          <h3 className="text-xs font-semibold tracking-wide uppercase text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">
            {title}
          </h3>
          {count !== undefined && (
            <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
              ({count})
            </span>
          )}
        </button>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs cursor-pointer transition-colors hover:underline"
            style={{ color: "var(--color-primary)" }}
          >
            View all &rarr;
          </button>
        )}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
