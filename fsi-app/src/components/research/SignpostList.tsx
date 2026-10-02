"use client";

/**
 * SignpostList -- Research surface, spec-03 section 7 component 8, lane L5 (2026-10-02).
 *
 * "Machine-watchable signposts with automatic state transitions emerging -> strengthening ->
 * stalled -> resolved -> falsified... satisfies the no-editorial-queue ruling" (spec-03 section 7
 * row 8). RD-20 / research-is-horizon-scan: no editorial affordance anywhere -- this component
 * renders machine-computed state only, never a human approve/feature/pick action.
 *
 * DEPENDENCY (named, not worked around). The `signposts` table and its reader do not exist in this
 * worktree -- lane L6 (spec 08 S1.2 DDL, migration 346, `signpost-watch.ts`) owns that build and had
 * not merged at the time this lane ran. Per this lane's own brief: "your SignpostList renders an
 * honest 'no signposts watched yet' absence state until L6 lands, never a fabricated list." This
 * component therefore accepts an OPTIONAL `signposts` prop typed to the shape L6's eventual reader
 * will produce, so the one-line mount site does not change again when that reader lands -- only the
 * prop's value does.
 */

import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";

/** spec-03 section 7 row 8's fixed state vocabulary -- the only five values a signpost may carry. */
export type SignpostState = "emerging" | "strengthening" | "stalled" | "resolved" | "falsified";

/** The render-ready shape a future L6 reader (beside read-assessments.mjs) will hand this component.
 *  Not read from anywhere yet -- see module header. */
export interface SignpostView {
  id: string;
  label: string;
  state: SignpostState;
  /** What entity this signpost watches (a corridor, instrument, technology -- the entity spine). */
  watchedEntityLabel?: string | null;
  lastEvaluatedAt?: string | null;
}

export interface SignpostListProps {
  signposts?: SignpostView[] | null;
}

const STATE_LABELS: Record<SignpostState, string> = {
  emerging: "Emerging",
  strengthening: "Strengthening",
  stalled: "Stalled",
  resolved: "Resolved",
  falsified: "Falsified",
};

export function SignpostList({ signposts }: SignpostListProps) {
  const hasSignposts = Array.isArray(signposts) && signposts.length > 0;

  return (
    <SectionCard padding="12px 16px 14px">
      <SectionHeading title="Signposts" />
      {hasSignposts ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {signposts!.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 11, color: "var(--ink)" }}>{s.label}</span>
                {s.watchedEntityLabel && (
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>watches {s.watchedEntityLabel}</span>
                )}
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  padding: "1px 6px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border-medium)",
                  color: "var(--color-text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                {STATE_LABELS[s.state]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
          No signposts watched yet for this finding -- needs a signpost registered against this
          assessment before a machine-watchable trigger can show here.
        </p>
      )}
    </SectionCard>
  );
}
