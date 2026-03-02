"use client";

import { cn } from "@/lib/cn";
import { Plane, Truck, Ship } from "lucide-react";

const MODE_CONFIG = {
  air: { icon: Plane, label: "AIR" },
  road: { icon: Truck, label: "ROAD" },
  ocean: { icon: Ship, label: "OCEAN" },
} as const;

interface ModeBadgeProps {
  mode: keyof typeof MODE_CONFIG;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function ModeBadge({ mode, onClick, className }: ModeBadgeProps) {
  const config = MODE_CONFIG[mode];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5",
        "text-xs font-semibold tracking-wider uppercase",
        "rounded-[2px] border border-border-light bg-surface-overlay text-text-secondary",
        "transition-all duration-300",
        onClick && "cursor-pointer hover:border-border-strong hover:text-text-primary",
        className
      )}
      style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
    >
      <Icon size={10} strokeWidth={2} />
      {config.label}
    </span>
  );
}
