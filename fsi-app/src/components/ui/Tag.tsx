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
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded",
        "border transition-all duration-300",
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      style={{
        color: color || "var(--text-secondary)",
        borderColor: color ? `${color}25` : "rgba(255,255,255,0.12)",
        backgroundColor: color ? `${color}08` : "rgba(255,255,255,0.06)",
        transitionTimingFunction: "var(--ease-out-expo)",
      }}
    >
      {label}
    </span>
  );
}
