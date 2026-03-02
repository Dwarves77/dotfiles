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
        "text-xs font-medium rounded-[2px] border",
        "transition-all duration-300 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cyan)]/50",
        active
          ? "border-white/20 bg-white/10 text-white"
          : "border-white/6 bg-transparent text-[var(--sage)] hover:border-white/15 hover:text-white",
        className
      )}
      style={{
        ...(active && color
          ? {
              borderColor: `${color}40`,
              backgroundColor: `${color}15`,
              color: color,
            }
          : {}),
        transitionTimingFunction: "var(--ease-out-expo)",
      }}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "text-xs tabular-nums",
            active ? "opacity-80" : "opacity-50"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
