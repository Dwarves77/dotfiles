"use client";

import { cn } from "@/lib/cn";

interface BadgeProps {
  label: string;
  color?: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function Badge({ label, color, onClick, className }: BadgeProps) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded",
        "border transition-all duration-300",
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      style={{
        color: color || "var(--sage)",
        borderColor: color ? `${color}66` : "var(--border-light)",
        backgroundColor: color ? `${color}26` : "var(--surface-input)",
        transitionTimingFunction: "var(--ease-out-expo)",
      }}
    >
      {label}
    </span>
  );
}
