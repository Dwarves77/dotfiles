"use client";

import { cn } from "@/lib/cn";

const BADGE_CLASSES: Record<string, string> = {
  CRITICAL: "cl-badge cl-badge-critical",
  HIGH: "cl-badge cl-badge-high",
  MODERATE: "cl-badge cl-badge-moderate",
  LOW: "cl-badge cl-badge-low",
};

interface PriorityBadgeProps {
  level: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function PriorityBadge({ level, onClick, className }: PriorityBadgeProps) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        BADGE_CLASSES[level] || "cl-badge",
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
    >
      {level}
    </span>
  );
}
