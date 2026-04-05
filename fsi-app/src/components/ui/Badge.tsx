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
        "inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded-md",
        "border transition-all duration-200",
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      style={{
        color: color || "var(--color-text-secondary)",
        borderColor: color ? `${color}30` : "var(--color-border)",
        backgroundColor: color ? `${color}12` : "var(--color-surface-raised)",
      }}
    >
      {label}
    </span>
  );
}
