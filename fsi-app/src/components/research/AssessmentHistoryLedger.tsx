"use client";

/**
 * AssessmentHistoryLedger -- Research surface, spec-03 section 7 component 11, lane L5 (2026-10-02).
 *
 * "A horizon assessment must be able to be wrong in public and be seen to have been wrong. A card
 * that silently rewrites its own history is a marketing artifact" (spec-03 section 7 row 11).
 * Migration 344's `supersedes` self-FK plus `is_current` flip is the append-only mechanism this
 * ledger renders: a prior row is never updated in place, only superseded.
 *
 * WALKS THE REAL CHAIN (lane L5, extended scope, 2026-10-02, after lane L6/PR #890 merged before this
 * lane branched). `src/lib/research/read-signposts.mjs`'s `fetchAssessmentHistoryChain` (beside
 * read-assessments.mjs) walks `research_assessments.supersedes` backward from the current row, using
 * the SAME service-role client `src/app/research/[slug]/page.tsx` already holds. NAMED LIMIT (CLAUDE.md
 * rule 14, stated plainly, not hidden): that client is service-role and bypasses RLS (see
 * read-signposts.mjs's own header), so the walk genuinely reaches prior rows in production; a client
 * without that privilege would see the chain stop at the current row (migration 344's raw-table RLS is
 * deliberately closed to anon/authenticated) -- the walk function soft-fails to a shorter-than-real
 * chain in that case, never a thrown error.
 *
 * `history` is the real (possibly single-entry) chain fetched server-side. `current` remains as a
 * fallback for a caller that has not wired the chain fetch at all (never both at once in practice).
 */

import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RailAbsenceNote } from "@/components/research/RailAbsenceNote";
import { formatDate } from "@/lib/format";
import type { selectAssessmentHistoryEntry } from "@/lib/research/read-signposts.mjs";

export type AssessmentHistoryEntry = NonNullable<ReturnType<typeof selectAssessmentHistoryEntry>>;

interface AssessmentHistoryLedgerProps {
  /** The real supersedes chain, newest first (`fetchAssessmentHistoryChain`'s own return shape). */
  history?: AssessmentHistoryEntry[] | null;
  /** Fallback: the one row already available at a mount site that has not wired the chain fetch. */
  current?: {
    computedAt: string;
    statusToken: "CONFIRMED" | "HYPOTHESIS";
    technicalMaturityLabel?: string | null;
    commercialMaturityLabel?: string | null;
    horizonBandLabel?: string | null;
  } | null;
}

function entryLine(e: { technicalMaturityLabel?: string | null; commercialMaturityLabel?: string | null; horizonBandLabel?: string | null }): string {
  return [e.technicalMaturityLabel, e.commercialMaturityLabel, e.horizonBandLabel].filter(Boolean).join(" · ") || "no corridor or horizon read";
}

export function AssessmentHistoryLedger({ history, current }: AssessmentHistoryLedgerProps) {
  const entries: AssessmentHistoryEntry[] =
    Array.isArray(history) && history.length > 0
      ? history
      : current
        ? [
            {
              id: "current",
              supersedes: null,
              isCurrent: true,
              statusToken: current.statusToken,
              lifecycleState: null,
              computedAt: current.computedAt,
              technicalMaturityLabel: current.technicalMaturityLabel ?? null,
              commercialMaturityLabel: current.commercialMaturityLabel ?? null,
              horizonBandLabel: current.horizonBandLabel ?? null,
              cause: null,
            },
          ]
        : [];

  const hasPrior = entries.length > 1;

  return (
    <SectionCard padding="12px 16px 14px">
      <SectionHeading title="Assessment history" />
      {entries.length === 0 ? (
        <RailAbsenceNote>
          No assessment history yet -- the research-assessment producer has not run over this item.
        </RailAbsenceNote>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2, borderLeft: "2px solid var(--color-border-subtle)", paddingLeft: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: e.isCurrent ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                    {e.isCurrent ? "Current" : "Superseded"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{formatDate(e.computedAt)}</span>
                  {e.lifecycleState && <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>· {e.lifecycleState}</span>}
                </div>
                <span style={{ fontSize: 11, color: "var(--ink)" }}>{entryLine(e)}</span>
                {e.cause && <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>cause: {e.cause}</span>}
              </div>
            ))}
          </div>
          {!hasPrior && (
            <p style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5, margin: "8px 0 0" }}>
              No prior version recorded yet -- this is the first scored assessment for this finding.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}
