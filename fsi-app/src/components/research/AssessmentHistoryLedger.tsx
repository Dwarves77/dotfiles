"use client";

/**
 * AssessmentHistoryLedger -- Research surface, spec-03 section 7 component 11, lane L5 (2026-10-02).
 *
 * "A horizon assessment must be able to be wrong in public and be seen to have been wrong. A card
 * that silently rewrites its own history is a marketing artifact" (spec-03 section 7 row 11).
 * Migration 344's `supersedes` self-FK plus `is_current` flip is the append-only mechanism this
 * ledger renders: a prior row is never updated in place, only superseded.
 *
 * DEPENDENCY, NAMED HONESTLY (CLAUDE.md rule 2). `read-assessments.mjs`'s only read path is
 * `research_assessments_current` (migration 344's own view, `WHERE is_current`) -- it never returns
 * a row's `supersedes` ancestors. Walking that chain needs a NEW read (a recursive or repeated
 * lookup against the raw `research_assessments` table, which RLS denies to anon/authenticated by
 * design -- only a server-side service-role or a new SECURITY DEFINER view could do it). That read
 * module is outside this lane's exact write set (three components only, see the brief) and is not
 * built here. What this component CAN do with data already in hand at the mount site -- the single
 * `AssessmentView` (the current row) `ResearchFindingDetailSurface.tsx` already receives as a prop
 * -- is render that one row as the ledger's first (current) entry, and say plainly that no prior
 * version has been fetched yet, rather than fabricate a history the page cannot see. The `history`
 * prop below accepts the full chain for the day a future lane wires that read; until then the mount
 * passes only `current`.
 */

import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { formatDate } from "@/lib/format";

/** One entry in the append-only chain -- the current row, or a row it supersedes. */
export interface AssessmentHistoryEntry {
  id: string;
  computedAt: string;
  isCurrent: boolean;
  statusToken: "CONFIRMED" | "HYPOTHESIS";
  technicalMaturityLabel?: string | null;
  commercialMaturityLabel?: string | null;
  horizonBandLabel?: string | null;
  /** Why this entry was superseded, when recorded. Null/absent is an honest "not recorded", never
   *  invented copy. */
  cause?: string | null;
}

export interface AssessmentHistoryLedgerProps {
  /** The full supersedes chain, newest first, when a future lane wires the walk. */
  history?: AssessmentHistoryEntry[] | null;
  /** The one row already available at the mount site (the current assessment) -- used to render a
   *  single live entry when `history` has not been wired yet. */
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
              computedAt: current.computedAt,
              isCurrent: true,
              statusToken: current.statusToken,
              technicalMaturityLabel: current.technicalMaturityLabel,
              commercialMaturityLabel: current.commercialMaturityLabel,
              horizonBandLabel: current.horizonBandLabel,
              cause: null,
            },
          ]
        : [];

  const hasPrior = entries.length > 1;

  return (
    <SectionCard padding="12px 16px 14px">
      <SectionHeading title="Assessment history" />
      {entries.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
          No assessment history yet -- the research-assessment producer has not run over this item.
        </p>
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
