"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps {
  children: ReactNode;
  padding?: CardPadding;
  className?: string;
  as?: "div" | "section" | "article";
  onClick?: (e: React.MouseEvent) => void;
}

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  children,
  padding = "md",
  className,
  as: Tag = "div",
  onClick,
}: CardProps) {
  return (
    <Tag className={cn("cl-card", PADDING[padding], className)} onClick={onClick}>
      {children}
    </Tag>
  );
}

export default Card;
