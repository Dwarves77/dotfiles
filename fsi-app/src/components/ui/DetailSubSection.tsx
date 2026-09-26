/**
 * DetailSubSection (lane PARITY-PARTS, 2026-09-24, operator ruling 2): the sub-heading shape market/
 * research/operations each retyped independently while collapsing their former per-content-section
 * top-level tabs into ONE S2 "Substantive findings" section (docs/ops/session-log.md, 2026-09-24
 * "operator rulings", item 2). F45 (duplicate-code) caught the class after three separate builds:
 * a `SectionLabel` heading, an optional muted subtitle line, and a 1px divider separating one
 * sub-section from the next (never before the first). One home now, three callers.
 */
import type { ReactNode } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";

export function DetailSubSection({
  title,
  subtitle,
  first = false,
  children,
}: {
  title: string;
  /** e.g. "4 forces · compounding". Omitted renders no subtitle line at all. */
  subtitle?: string | null;
  /** The first sub-section in its parent never draws the leading divider. */
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      {!first && <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0" }} aria-hidden="true" />}
      <SectionLabel>{title}</SectionLabel>
      {subtitle && <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", margin: "4px 0 12px" }}>{subtitle}</p>}
      <div style={{ marginTop: subtitle ? 0 : 12 }}>{children}</div>
    </div>
  );
}
