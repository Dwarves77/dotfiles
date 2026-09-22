"use client";

/**
 * SectionIndexLink: the one `<a>` a section-index tab renders. F45 duplicate-code (lane
 * W10-ActionCard-a, 2026-09-21): after `section-index-styles.ts` extracted the shared STYLE
 * objects, `DetailShell.tsx`'s `SectionIndex` and `src/components/ui/SectionIndex.tsx` still typed
 * an near-identical JSX `<a>` around them (key, href, className, aria-current, optional title,
 * children). This is that one JSX shell; `sizing` and `title` are the two points where the two
 * callers still differ (the old component's fixed-width ellipsis truncation vs this lane's
 * untruncated tab).
 */
import type { ReactNode, CSSProperties } from "react";
import { sectionIndexLinkStyle } from "@/components/ui/section-index-styles";

export function SectionIndexLink({
  id,
  isActive,
  title,
  sizing,
  children,
}: {
  id: string;
  isActive: boolean;
  title?: string;
  sizing: CSSProperties;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${id}`}
      className="cl-section-index-link"
      aria-current={isActive ? "true" : undefined}
      title={title}
      style={sectionIndexLinkStyle(isActive, sizing)}
    >
      {children}
    </a>
  );
}
