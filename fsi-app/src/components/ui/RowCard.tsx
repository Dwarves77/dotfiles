"use client";

/**
 * RowCard — list item primitive for regulations, operations, research, etc.
 *
 * Wraps the `.cl-row-card` CSS class defined in fsi-app/src/app/globals.css.
 * Adds an optional `cl-priority-{level}` modifier when priority !== 'none',
 * which paints a 3px topic-colored left accent (critical/high/moderate/low).
 *
 * Matches design_handoff_2026-04/preview cl-row-card section:
 *   - background: var(--color-bg-surface)
 *   - 1px var(--color-border) border, radius var(--radius-md)
 *   - padding 16px 20px (default 'md'); 'sm' = 10px 14px; 'lg' = 22px 26px
 *   - box-shadow var(--shadow-card), hover var(--shadow-card-hover)
 *
 * Mirrors the conventions from Card.tsx (same UI primitives folder):
 *   - "use client" so it can accept onClick handlers
 *   - polymorphic `as` prop for semantic correctness in lists/articles
 *   - merges incoming className via cn()
 */

import type { ElementType, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Priority = "critical" | "high" | "moderate" | "low" | "none";
type Padding = "sm" | "md" | "lg";

interface RowCardProps {
  priority?: Priority;
  padding?: Padding;
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section";
  onClick?: (e: MouseEvent<HTMLElement>) => void;
}

const PADDING_CLASSES: Record<Padding, string> = {
  sm: "px-[14px] py-[10px]",
  md: "", // default — CSS rule already applies 16px 20px
  lg: "px-[26px] py-[22px]",
};

export function RowCard({
  priority = "none",
  padding = "md",
  children,
  className,
  as = "div",
  onClick,
}: RowCardProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "cl-row-card",
        priority !== "none" && `cl-priority-${priority}`,
        PADDING_CLASSES[padding],
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </Tag>
  );
}
