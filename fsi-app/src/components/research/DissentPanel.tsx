"use client";

/**
 * DissentPanel -- Research surface, spec-03 section 7 component 6, lane L5 (2026-10-02).
 *
 * "Dissent panel, first-class, never collapsed... surfacing only consensus manufactures false
 * confidence" (spec-03 section 7 row 6). This panel renders UNCOLLAPSED BY CONSTRUCTION: there is
 * no toggle, no `useState` controlling visibility, nothing a later change could flip to
 * default-hidden. It always mounts in the open state.
 *
 * DATA GAP, NAMED HONESTLY (CLAUDE.md rule 2, never fabricate). No lane has yet built a per-source
 * "this source concludes X, this one concludes Y" read -- migration 344's `credibility_authority_
 * score` jsonb (lane L3's `aggregateAuthorityDistribution`, scripts/research/authority-score.mjs)
 * carries per-source AUTHORITY STANDING (role class, bucket: highAuthorityIndependent / medium /
 * vendorFlagged / unknown, integrity flags) -- never a per-source CONCLUSION or stance. Dissent in
 * the sense the spec means ("credible sources disagree") is therefore not modeled anywhere in this
 * codebase yet; this panel does not invent it. Two real things it CAN render honestly today:
 *   1. An explicit `dissentingSources` list, for the day a future lane (a dissent-classification
 *      read, however it ends up shaped) hands this panel real per-source disagreement data. The
 *      panel renders that list uncollapsed the moment it exists.
 *   2. Until then, the authority-DISTRIBUTION composition itself: when more than one source backs
 *      an assessment and their standings are not uniform, that heterogeneity is itself informative
 *      ("this assessment leans on a mix of independent and vendor-flagged sources") -- rendered as
 *      a plainly labeled composition note, never dressed up as resolved content-level dissent.
 *   3. The honest absence state when neither exists.
 *
 * Mounted into ResearchFindingDetailSurface.tsx's rail `designed` slot, beside ResearchAssessmentCard
 * (lane W2-R / PR #887's own scope, not rebuilt here).
 */

import type { CSSProperties } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RailAbsenceNote } from "@/components/research/RailAbsenceNote";
import { TagChip } from "@/components/ui/Chips";

/** A real, content-level dissenting account -- one source's differing conclusion. No reader produces
 *  this yet (see module header); the shape exists so a future lane has a typed target to fill. */
export interface DissentingSource {
  sourceName: string;
  /** One-sentence account of what this source concludes differently from the assessment's main read. */
  position: string;
  tier?: number | null;
}

/** The shape of migration 344's `credibility_authority_score` jsonb column, as `aggregateAuthorityDistribution`
 *  (scripts/research/authority-score.mjs) produces it. Optional/partial because a degenerate
 *  one-source fallback (assess.mjs, pre-L3-wiring) may carry only a subset of these buckets. */
export interface AuthorityDistributionLike {
  highAuthorityIndependent?: number;
  medium?: number;
  vendorFlagged?: number;
  unknown?: number;
  integrityFlagged?: number;
  sources?: Array<{ sourceId?: string; roleClass?: string; bucket?: string }>;
}

export interface DissentPanelProps {
  /** Real, content-level dissent -- absent today for every item (no classifier exists). */
  dissentingSources?: DissentingSource[] | null;
  /** The authority-score distribution for this assessment, for the composition fallback. */
  authorityDistribution?: AuthorityDistributionLike | null;
}

const ROW_STYLE: CSSProperties = { fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 };

function bucketCount(dist: AuthorityDistributionLike, key: keyof AuthorityDistributionLike): number {
  const v = dist[key];
  return typeof v === "number" ? v : 0;
}

function distinctBucketCount(dist: AuthorityDistributionLike): number {
  return (["highAuthorityIndependent", "medium", "vendorFlagged", "unknown"] as const).filter(
    (k) => bucketCount(dist, k) > 0,
  ).length;
}

export function DissentPanel({ dissentingSources, authorityDistribution }: DissentPanelProps) {
  const hasDissent = Array.isArray(dissentingSources) && dissentingSources.length > 0;
  const hasMixedComposition = !!authorityDistribution && distinctBucketCount(authorityDistribution) > 1;
  const totalSources = authorityDistribution?.sources?.length ?? 0;

  return (
    <SectionCard padding="12px 16px 14px">
      <SectionHeading title="Dissent" />
      {hasDissent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dissentingSources!.map((d, i) => (
            <div key={`${d.sourceName}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>{d.sourceName}</span>
                {typeof d.tier === "number" && <TagChip>T{d.tier}</TagChip>}
              </div>
              <p style={ROW_STYLE}>{d.position}</p>
            </div>
          ))}
        </div>
      ) : hasMixedComposition ? (
        <>
          <p style={ROW_STYLE}>
            No per-source dissenting conclusion is recorded yet (no lane has built a content-level
            dissent read). The {totalSources} source{totalSources === 1 ? "" : "s"} backing this
            assessment vary in standing, shown here rather than averaged away:
          </p>
          <ul style={{ ...ROW_STYLE, margin: "6px 0 0", paddingLeft: 16 }}>
            {bucketCount(authorityDistribution!, "highAuthorityIndependent") > 0 && (
              <li>{bucketCount(authorityDistribution!, "highAuthorityIndependent")} high-authority independent</li>
            )}
            {bucketCount(authorityDistribution!, "medium") > 0 && <li>{bucketCount(authorityDistribution!, "medium")} medium</li>}
            {bucketCount(authorityDistribution!, "vendorFlagged") > 0 && (
              <li>{bucketCount(authorityDistribution!, "vendorFlagged")} vendor-flagged</li>
            )}
            {bucketCount(authorityDistribution!, "unknown") > 0 && <li>{bucketCount(authorityDistribution!, "unknown")} unknown standing</li>}
          </ul>
        </>
      ) : (
        <RailAbsenceNote>
          No dissent recorded for this finding -- either no source disagreement has been classified
          yet, or only one source&apos;s standing is resolved for this assessment.
        </RailAbsenceNote>
      )}
    </SectionCard>
  );
}
