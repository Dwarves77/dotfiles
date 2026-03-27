"use client";

import { cn } from "@/lib/cn";
import { Plane, Truck, Ship } from "lucide-react";

const MODE_CONFIG = {
  air: {
    icon: Plane,
    label: "AIR",
    bg: "rgba(100,210,255,0.10)",
    border: "rgba(100,210,255,0.25)",
    color: "#64d2ff",
  },
  road: {
    icon: Truck,
    label: "ROAD",
    bg: "rgba(52,199,89,0.10)",
    border: "rgba(52,199,89,0.25)",
    color: "#34c759",
  },
  ocean: {
    icon: Ship,
    label: "OCEAN",
    bg: "rgba(0,199,190,0.10)",
    border: "rgba(0,199,190,0.25)",
    color: "#00c7be",
  },
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
        "text-[11px] font-semibold tracking-wider uppercase",
        "rounded transition-all duration-300",
        onClick && "cursor-pointer hover:brightness-125",
        className
      )}
      style={{
        backgroundColor: config.bg,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: config.border,
        color: config.color,
        transitionTimingFunction: "var(--ease-out-expo)",
      }}
    >
      <Icon size={10} strokeWidth={2} />
      {config.label}
    </span>
  );
}
