"use client";

import { cn } from "@/lib/cn";

interface PillProps {
  label: string;
  active?: boolean;
  count?: number;
  color?: string;
  onClick?: () => void;
  className?: string;
}

export function Pill({
  label,
  active = false,
  count,
  color,
  onClick,
  className,
}: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1",
        "text-xs font-medium rounded-md border",
        "transition-all duration-200 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        active
          ? "font-semibold"
          : "border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]",
        className
      )}
      style={{
        ...(active && color
          ? {
              borderColor: `${color}40`,
              backgroundColor: `${color}12`,
              color: color,
            }
          : active
          ? {
              borderColor: "var(--color-active-border)",
              backgroundColor: "var(--color-active-bg)",
              color: "var(--color-text-primary)",
            }
          : {}),
      }}
    >
      {label}
      {count !== undefined && (
        <span className={cn("text-xs tabular-nums", active ? "opacity-80" : "opacity-50")}>
          {count}
        </span>
      )}
    </button>
  );
}
