"use client";

/**
 * Rail cards shared by the five list surfaces (Legend is identical text on
 * every artboard 02/04/06/08/11; a plain summary card is the generic
 * fallback for a surface-specific rail card this lane did not build —
 * logged per-page in DEVIATION-LOG.md). Not a src/components/ui/ part
 * (only the five list surfaces use these); kept here to avoid a five-way
 * copy of the same JSX.
 */

import type { ReactNode } from "react";
import { SectionRule } from "@/components/ui/SectionRule";

// Ruling 5.1 (2026-09-07, CLOSED): every panel/section card carries the dark-grey graduated 3px
// rule above its title, full card width, top edge, no radius on the rule. Design audit B163/B165/
// B170 (2026-09-07, docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md, list-surface.json /
// section-card-lists.json) found this rail card and the facets card (ListSurfaceShell.tsx)
// rendered NO rule at all — the base lane's own DEVIATION-LOG entry named rolling SectionRule onto
// this file as later-lane scope; this is that lane.
export function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
        <p
          style={{
            fontSize: "var(--fs-105)",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            margin: "0 0 10px",
          }}
        >
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

export function LegendRailCard() {
  return (
    <RailCard title="Legend">
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Impact</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
            Four scored dimensions, sorted low to high: green left, red right. Height is the sum, score 1–3.
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Timeline</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>Passed · next · ahead.</dd>
        </div>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Source tier</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
            T1 binding law → T6 commentary.
          </dd>
        </div>
      </dl>
    </RailCard>
  );
}
