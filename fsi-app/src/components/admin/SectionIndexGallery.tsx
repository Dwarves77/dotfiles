"use client";

/**
 * SectionIndexGallery: the client half of `/admin/parts/section-index` (lane W10-ActionCard-a,
 * 2026-09-21). Holds the Summary | Full brief depth state (the part's own segmented control,
 * review item 6) and mounts every `REGULATION_SECTION_INDEX` body so the scroll-spy
 * IntersectionObserver has real DOM anchors to track.
 */

import { useState } from "react";
import { SectionIndex, REGULATION_SECTION_INDEX, type SectionIndexDepth } from "@/components/ui/SectionIndex";
import { SECTION_INDEX_BODY_FIXTURES } from "@/lib/detail/section-index-fixtures";

export function SectionIndexGallery() {
  const [depth, setDepth] = useState<SectionIndexDepth>("summary");

  return (
    <div>
      <p style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>
        With the Summary | Full brief segmented control (review item 6: no standalone switch row)
      </p>
      <SectionIndex sections={REGULATION_SECTION_INDEX} depth={depth} onDepthChange={setDepth} />
      <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", margin: "0 0 20px" }}>
        Current depth: <strong>{depth}</strong>
      </p>

      {SECTION_INDEX_BODY_FIXTURES.map((s) => (
        <div key={s.id} id={s.id} style={{ padding: "16px 20px", marginBottom: 12, border: "1px solid var(--line-1)", borderRadius: 8, scrollMarginTop: 56 }}>
          <p style={{ fontSize: "var(--fs-16)", fontWeight: 700, color: "var(--ink)", margin: "0 0 6px" }}>{s.fullTitle}</p>
          <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-2)", margin: 0 }}>{s.body}</p>
        </div>
      ))}

      <p style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--ink)", margin: "32px 0 4px" }}>
        Without the depth switch (a section-list caller that has none)
      </p>
      <SectionIndex sections={REGULATION_SECTION_INDEX} />
    </div>
  );
}
