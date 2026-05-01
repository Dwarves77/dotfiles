"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatCardPriority = "critical" | "high" | "moderate" | "low" | "none";

interface StatCardProps {
  label: string;
  count: ReactNode;
  sublabel?: string;
  icon?: ReactNode;
  priority?: StatCardPriority;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}

const PRIORITY_COLOR: Record<Exclude<StatCardPriority, "none">, string> = {
  critical: "var(--color-critical)",
  high: "var(--color-high)",
  moderate: "var(--color-moderate)",
  low: "var(--color-low)",
};

export function StatCard({
  label,
  count,
  sublabel,
  icon,
  priority = "none",
  onClick,
  ariaLabel,
  className,
}: StatCardProps) {
  const tone = priority !== "none" ? PRIORITY_COLOR[priority] : undefined;
  const interactive = typeof onClick === "function";

  const inner = (
    <>
      {icon && (
        <div
          className="mb-2 inline-flex items-center justify-center"
          style={{ color: tone ?? "var(--color-text-secondary)" }}
        >
          {icon}
        </div>
      )}
      <div
        className="cl-stat-number"
        style={tone ? { color: tone } : undefined}
      >
        {count}
      </div>
      <div
        className="cl-section-label mt-2"
        style={tone ? { color: tone } : undefined}
      >
        {label}
      </div>
      {sublabel && (
        <div className="cl-card-meta mt-1">{sublabel}</div>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `${label}: ${count}`}
        className={cn(
          "cl-stat-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          className
        )}
      >
        {inner}
      </button>
    );
  }

  return <div className={cn("cl-stat-card", className)}>{inner}</div>;
}

export default StatCard;
