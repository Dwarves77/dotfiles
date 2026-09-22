"use client";

/**
 * useSectionScrollSpy: the one IntersectionObserver scroll-spy hook behind a sticky S1 . S2 . S3
 * section index. F45 duplicate-code (lane W10-ActionCard-a, 2026-09-21): before this extraction,
 * DetailShell.tsx's `SectionIndex` and the new `src/components/ui/SectionIndex.tsx` each typed the
 * identical observer setup independently (the new part is deliberately NOT an edit to DetailShell's
 * component, per this lane's brief; the shared LOGIC still has exactly one home). Returns the index
 * of the section id currently nearest the top of the viewport, tracking real scroll position rather
 * than a static "first item always active" fake.
 */
import { useEffect, useState } from "react";

export function useSectionScrollSpy(ids: string[]): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (ids.length === 0) return;
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const idx = els.indexOf(visible[0].target as HTMLElement);
          if (idx >= 0) setActive(idx);
        }
      },
      { rootMargin: "-64px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);
  return active;
}
