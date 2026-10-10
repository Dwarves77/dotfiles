"use client";

/**
 * SignpostList -- Research surface, spec-03 section 7 component 8, lane L5 (2026-10-02).
 *
 * "Machine-watchable signposts with automatic state transitions... satisfies the no-editorial-queue
 * ruling" (spec-03 section 7 row 8). RD-20 / research-is-horizon-scan: no editorial affordance
 * anywhere -- this component renders machine-recorded fields only, never a human approve/feature/pick
 * action.
 *
 * CORRECTED (lane L5, extended scope, 2026-10-02 -- CLAUDE.md rule 14, correction in place rather than
 * a silent drop). This component's first version invented a five-value `SignpostState` enum
 * ("emerging"/"strengthening"/"stalled"/"resolved"/"falsified") paraphrased from the spec's prose
 * before migration 346 (lane L6, PR #890) had landed and the real `signposts` DDL was readable. The
 * real table (migration 346) carries no per-signpost state column at all -- a signpost is a
 * `{watches, predicate, direction, fired_at}` row; "state" in the sense that enum implied belongs to
 * `research_assessments.lifecycle_state` (an 8-value vocabulary, written by `signpost-watch.ts`'s
 * `fireSignpost()` on firing, never read by this component), not to the signpost row itself. This
 * version renders exactly what the real row carries -- the watched entity, a plain-language account of
 * the predicate (`read-signposts.mjs`'s `summarizePredicate`), the direction, and fired/unfired --
 * rather than a label the schema cannot back.
 *
 * Data: `src/lib/research/read-signposts.mjs`'s `fetchSignpostsForAssessment` (beside
 * read-assessments.mjs), called server-side in `src/app/research/[slug]/page.tsx` with the SAME
 * service-role client that page already holds, keyed by the current assessment's real uuid (not the
 * item id) -- `signposts.assessment_id` is a direct FK to `research_assessments(id)` (migration 346,
 * coordinator's 2026-10-02 schema ruling). Threaded down through `ResearchFindingDetailSurface.tsx`.
 */

import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RailAbsenceNote, RailBadge } from "@/components/research/RailAbsenceNote";
import { formatDate } from "@/lib/format";
import type { selectSignpostView } from "@/lib/research/read-signposts.mjs";

export type SignpostView = NonNullable<ReturnType<typeof selectSignpostView>>;

interface SignpostListProps {
  signposts?: SignpostView[] | null;
}

const DIRECTION_LABELS: Record<string, string> = {
  confirms: "confirms",
  refutes: "refutes",
  delays: "delays",
};

export function SignpostList({ signposts }: SignpostListProps) {
  const hasSignposts = Array.isArray(signposts) && signposts.length > 0;

  return (
    <SectionCard padding="12px 16px 14px">
      <SectionHeading title="Signposts" />
      {hasSignposts ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {signposts!.map((s) => (
            <div key={s.entityId} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 11, color: "var(--ink)" }}>
                  watches {s.watches}, {DIRECTION_LABELS[s.direction] ?? s.direction}
                </span>
                <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{s.predicateSummary}</span>
              </div>
              <RailBadge active={s.isFired}>{s.isFired ? `Fired ${formatDate(s.firedAt)}` : "Watching"}</RailBadge>
            </div>
          ))}
        </div>
      ) : (
        <RailAbsenceNote>
          No signposts watched yet for this finding -- needs a signpost registered against this
          assessment before a machine-watchable trigger can show here.
        </RailAbsenceNote>
      )}
    </SectionCard>
  );
}
