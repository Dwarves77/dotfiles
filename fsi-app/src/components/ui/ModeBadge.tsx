"use client";

import { cn } from "@/lib/cn";
import { Plane, Truck, Ship } from "lucide-react";

const MODE_CONFIG = {
  air: {
    icon: Plane,
    label: "AIR",
    color: "#2563EB",
    bg: "rgba(37,99,235,0.08)",
    border: "rgba(37,99,235,0.20)",
  },
  road: {
    icon: Truck,
    label: "ROAD",
    color: "#16A34A",
    bg: "rgba(22,163,74,0.08)",
    border: "rgba(22,163,74,0.20)",
  },
  ocean: {
    icon: Ship,
    label: "OCEAN",
    color: "#0D9488",
    bg: "rgba(13,148,136,0.08)",
    border: "rgba(13,148,136,0.20)",
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
        "rounded-md transition-all duration-200",
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      style={{
        backgroundColor: config.bg,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: config.border,
        color: config.color,
      }}
    >
      <Icon size={10} strokeWidth={2} />
      {config.label}
    </span>
  );
}
