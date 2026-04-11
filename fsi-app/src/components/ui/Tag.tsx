"use client";

import { cn } from "@/lib/cn";

interface TagProps {
  label: string;
  color?: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function Tag({ label, color, onClick, className }: TagProps) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md",
        "border transition-all duration-200",
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      style={{
        color: color || "var(--color-text-secondary)",
        borderColor: color ? `${color}25` : "var(--color-border)",
        backgroundColor: color ? `${color}08` : "var(--color-surface-raised)",
      }}
    >
      {label}
    </span>
  );
}
