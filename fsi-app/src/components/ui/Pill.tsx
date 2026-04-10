"use client";

import { cn } from "@/lib/cn";

interface PillProps {
  label: string;
  active?: boolean;
  count?: number;
  color?: string;        // Priority/topic color — always visible, not just when active
  accentBorder?: boolean; // Use color as left-border accent (for topics)
  onClick?: () => void;
  className?: string;
}

export function Pill({
  label,
  active = false,
  count,
  color,
  accentBorder = false,
  onClick,
  className,
}: PillProps) {
  // Build inline styles based on color mode
  const style: React.CSSProperties = {};

  if (color) {
    if (accentBorder) {
      // Topic pills: left-border accent in topic color, always visible
      style.borderLeft = `3px solid ${color}`;
      if (active) {
        style.backgroundColor = `${color}12`;
        style.borderColor = `${color}40`;
        style.color = color;
      } else {
        style.borderColor = "var(--color-border)";
        style.borderLeftColor = color;
        style.color = "var(--color-text-secondary)";
      }
    } else {
      // Priority pills: color always visible on text + border
      style.borderColor = active ? `${color}60` : `${color}35`;
      style.color = color;
      if (active) {
        style.backgroundColor = `${color}12`;
        style.fontWeight = 600;
      }
    }
  } else if (active) {
    style.borderColor = "var(--color-active-border)";
    style.backgroundColor = "var(--color-active-bg)";
    style.color = "var(--color-text-primary)";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1",
        "text-xs font-medium rounded-md border",
        "transition-all duration-200 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        !color && !active && "border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]",
        className
      )}
      style={style}
    >
      {label}
      {count !== undefined && (
        <span className={cn("text-xs tabular-nums", active ? "opacity-80" : "opacity-50")}>
          {count}
        </span>
      )}
    </button>
  );
}
