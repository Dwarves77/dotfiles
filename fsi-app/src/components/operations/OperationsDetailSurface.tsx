"use client";

/**
 * OperationsDetailSurface — client subcomponent for `/operations/[slug]`.
 *
 * UI SYSTEM HANDOFF (lane uidetails2, 2026-09-07, docs/design/handoff-2026-09-06,
 * README §0.5 + 09-operations-profile.png "same architecture; the ten-line
 * port-dues paragraph becomes a concession table"): rebuilt onto the ONE
 * detail architecture (DetailShell.tsx). The 8 Operations sections
 * (S1-S8, section-aware, matrix-gated S3/S4) map onto DetailSection/
 * SectionIndex unchanged in count and gating.
 *
 * THE CONCESSION TABLE. FactBlocks.tsx (this lane, see its own header) now
 * routes every non-claim ("prose") block of a section's content_md through
 * GfmSection (remark-gfm) instead of a plain <p> — a GFM markdown table
 * embedded in the port-dues section (S1, "Operational cost baseline")
 * therefore renders as a real table automatically, with no page-local
 * table component. Where a section's port-dues paragraph is NOT already
 * structured as a GFM table in the stored content_md, it renders as
 * FactCards/prose exactly as before — logged in DEVIATION-LOG.md rather
 * than fabricating table structure the source data doesn't carry.
 *
 * REMOVED this lane: the per-page AiPromptBar, the raw full_brief short/
 * full toggle (section-aware rendering supersedes it; record-grade items
 * — none live on this surface today — would still need it, matching the
 * regulations/market/research precedent of an honest record-grade path).
 *
 * KEPT, RELOCATED: the matrix eligibility gate (S3/S4 honest omit-note),
 * "Comparison coverage" status (folded into the rail's At-a-glance card),
 * related-items-by-region (closing section; the artboard's own "RELATED IN
 * ASIA" rail card — RelatedRegionCard below), ItemConnectionsCard,
 * RelevanceBadgeClient, WatchButton/Export/Share actions.
 */

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import type { MatrixEligibility } from "@/lib/agent/formats/operations-matrix";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { WatchButton } from "@/components/ui/WatchButton";
import { ActionRow, shareResource, downloadMarkdownBrief } from "@/components/ui/ActionRow";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { TagChip } from "@/components/ui/Chips";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import { DetailTagRow } from "@/components/ui/DetailTagRow";
import {
  DetailHeader,
  DetailExposure,
  DetailTimeline,
  SectionIndex,
  SummaryDepthSwitch,
  type SummaryDepth,
  DetailSection,
  DetailLayout,
  DetailPageWrapper,
  ImpactRailCard,
  AtAGlanceCard,
  RailLegend,
  InThisListStat,
  type SectionIndexEntry,
} from "@/components/detail/DetailShell";
import { FactBlocks } from "@/components/detail/FactBlocks";
import { GfmSection } from "@/components/shared/GfmSection";
import { sourceEntriesOf, SourcesGrid } from "@/components/detail/SourcesGrid";
import { bandFromPriority } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";

interface RelatedItem {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  addedDate: string | null;
}

interface Props {
  resource: Resource;
  related: RelatedItem[];
  relatedReason: "jurisdiction" | "source" | "none";
  sections?: IntelligenceItemSectionRow[];
  matrixEligibility?: MatrixEligibility;
  sourceFetchStatus?: string | null;
  supersessions?: Supersession[];
  connections?: ItemConnection[];
  relevance?: ItemRelevance | null;
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}

const OPERATIONS_SECTION_HEADINGS: Record<string, string> = {
  "1": "Operational cost baseline",
  "2": "Feasibility of operational choices",
  "3": "Cost vs alternatives",
  "4": "Cross-regional",
  "5": "Competitive positioning",
  "6": "Talking points",
  "7": "Pending changes",
  "8": "Sources",
};
const MATRIX_GATED_KEYS = new Set(["3", "4"]);
const KNOWN_OPERATIONS_KEYS = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);

function deriveOmitNote(sectionKey: string, matrixEligibility: MatrixEligibility | undefined): string {
  if (!matrixEligibility) {
    return sectionKey === "3"
      ? "Cost comparison requires data for this region across at least 2 sourced regions. Coverage is still building."
      : "Cross-regional implications require cost and feasibility data across at least 2 sourced regions. Coverage is still building.";
  }
  const ineligibleDims = matrixEligibility.dimensions.filter((d) => !d.eligible);
  if (ineligibleDims.length === 0) return "Section not yet generated.";
  const allUnsourced = ineligibleDims.every((d) => d.sourcedRegionCount === 0);
  if (allUnsourced) {
    return sectionKey === "3"
      ? "Cost comparison not yet available — no dimensions have been sourced across multiple regions."
      : "Cross-regional comparison not yet available — no dimensions have been sourced across multiple regions.";
  }
  const jurisdictionMissing = ineligibleDims.some((d) => d.sourcedRegionCount >= 2 && !d.itemJurisdictionPresent);
  const regions = matrixEligibility.resolvedRegionCodes.join(", ") || "this item's jurisdiction";
  if (jurisdictionMissing) {
    return sectionKey === "3"
      ? `Cost comparison requires ${regions} to have sourced coverage. Coverage for this region is still pending.`
      : `Cross-regional comparison requires ${regions} to have sourced coverage. Coverage for this region is still pending.`;
  }
  return sectionKey === "3"
    ? "Cost comparison requires at least 2 sourced regions per dimension — coverage is still building."
    : "Cross-regional implications require at least 2 sourced regions per dimension — coverage is still building.";
}

export function OperationsDetailSurface({
  resource: r,
  related,
  relatedReason,
  sections = [],
  matrixEligibility,
  supersessions = [],
  connections = [],
  resourceLookup = {},
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: Props) {
  const band = bandFromPriority(r.priority);
  const impact = r.impactScores ?? scoreResource(r);
  const jurisdiction = r.jurisdiction || (r.jurisdictionIso && r.jurisdictionIso[0]) || "";

  const meta = [
    ["Operations", jurisdiction].filter(Boolean).join(" · "),
    r.sourceName,
    r.added ? `published ${formatDate(r.added)}` : null,
    r.modes && r.modes.length > 0 ? r.modes.map((m) => m.toUpperCase()).join(" · ") : null,
  ].filter(Boolean).join(" · ");

  const knownSections = useMemo(
    () => sections.filter((s) => KNOWN_OPERATIONS_KEYS.has(s.section_key)),
    [sections]
  );
  const sourceRows = useMemo(() => sourceEntriesOf(r), [r]);
  const [depth, setDepth] = useState<SummaryDepth>("summary");
  const [tagOpen, setTagOpen] = useState(false);

  const indexEntries: SectionIndexEntry[] = knownSections.length > 0
    ? [
        ...knownSections
          .filter((s) => !MATRIX_GATED_KEYS.has(s.section_key) || (s.section_key === "3" ? matrixEligibility?.s3Eligible : matrixEligibility?.s4Eligible))
          .map((s) => ({ id: `sec-${s.section_key}`, label: OPERATIONS_SECTION_HEADINGS[s.section_key] })),
        { id: "sources", label: "Sources" },
      ]
    : [{ id: "summary", label: "Summary" }, { id: "sources", label: "Sources" }];

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--ink)", paddingTop: 16 }}>
      <DetailPageWrapper>
        <DetailHeader
          band={band}
          tier={typeof r.sourceTier === "number" ? r.sourceTier : null}
          title={r.title}
          meta={meta}
          tagRow={<DetailTagRow itemId={String(r.id)} open={tagOpen} onOpenChange={setTagOpen} />}
          askPlaceholder="Ask about this profile"
          askScope="operations-profile-detail"
          extraChips={
            <>
              <TagChip>Regional profile</TagChip>
              {jurisdiction && <TagChip>{jurisdiction}</TagChip>}
              {r.modes && r.modes.slice(0, 2).map((m) => <TagChip key={m}>{m.toUpperCase()}</TagChip>)}
            </>
          }
          actions={
            <ActionRow
              onExport={() =>
                downloadMarkdownBrief(r, {
                  filenamePrefix: "operations",
                  metaRows: [
                    r.jurisdiction ? `- Region: ${r.jurisdiction}` : null,
                    r.modes && r.modes.length > 0 ? `- Modes: ${r.modes.join(", ")}` : null,
                    r.url ? `- Source: ${r.url}` : null,
                  ],
                })
              }
              onShare={() => shareResource(r)}
              onTag={() => setTagOpen((v) => !v)}
              exportDisabled={!(r.fullBrief || r.url)}
              watch={
                <WatchButton
                  itemType="operations"
                  itemId={String(r.id)}
                  variant="row"
                  initialWatched={initialWatched}
                  initialTeamWatched={initialTeamWatched}
                  initialTeamAvailable={initialTeamAvailable}
                />
              }
            />
          }
        />

        <DetailExposure
          items={[
            { label: "Where", value: jurisdiction || <Absence reason="not in primary source" /> },
            { label: "Who pays", value: r.costMechanism || <Absence reason="not in primary source" /> },
            { label: "Your lanes", value: <span style={{ color: "var(--ink-3)" }}>Connect shipment data</span> },
            { label: "Trajectory", value: r.conversionTrigger || <Absence reason="pending" /> },
          ]}
        />

        <DetailTimeline entries={r.timeline} band={band} />

        <SectionIndex sections={indexEntries} trailing={<SummaryDepthSwitch depth={depth} onChange={setDepth} />} />

        <DetailLayout
          rail={
            <>
              <AtAGlanceCard
                rows={[
                  { label: "Band", value: `${band.label} · ${band.window}` },
                  { label: "Type", value: "Regional profile" },
                  { label: "Region", value: jurisdiction },
                  { label: "Modes", value: r.modes && r.modes.length > 0 ? r.modes.map((m) => m.toUpperCase()).join(" · ") : null },
                  { label: "Topic", value: r.topic },
                  { label: "Source", value: r.sourceName && typeof r.sourceTier === "number" ? `${r.sourceName} · T${r.sourceTier}` : r.sourceName },
                  { label: "Published", value: r.added ? formatDate(r.added) : null },
                  {
                    label: "Comparison",
                    value: matrixEligibility
                      ? matrixEligibility.s3Eligible
                        ? "Available"
                        : `Building${matrixEligibility.resolvedRegionCodes.length > 0 ? ` (${matrixEligibility.resolvedRegionCodes.join(", ")})` : ""}`
                      : null,
                  },
                ]}
              />
              <ImpactRailCard scores={impact} />
              <RelevanceBadgeClient itemId={r.id} />
              <RelatedRegionCard related={related} reason={relatedReason} jurisdiction={jurisdiction} />
              <InThisListStat backHref="/operations" backLabel="Back to list" />
              <RailLegend />
              <ItemConnectionsCard connections={connections} supersessions={supersessions} selfId={r.id} resourceLookup={resourceLookup} />
            </>
          }
        >
          {knownSections.length > 0
            ? knownSections.map((s) => {
                const heading = OPERATIONS_SECTION_HEADINGS[s.section_key] || `Section ${s.section_key}`;
                if (MATRIX_GATED_KEYS.has(s.section_key)) {
                  const eligible = s.section_key === "3" ? matrixEligibility?.s3Eligible === true : matrixEligibility?.s4Eligible === true;
                  if (!eligible) {
                    return (
                      <DetailSection key={s.section_key} id={`sec-${s.section_key}`} title={heading}>
                        <StateNote>{deriveOmitNote(s.section_key, matrixEligibility)}</StateNote>
                      </DetailSection>
                    );
                  }
                }
                if (!s.content_md || !s.content_md.trim()) {
                  if (s.is_conditional) return null;
                  return (
                    <DetailSection key={s.section_key} id={`sec-${s.section_key}`} title={heading}>
                      <Absence reason="not in primary source" />
                    </DetailSection>
                  );
                }
                return (
                  <DetailSection key={s.section_key} id={`sec-${s.section_key}`} title={heading}>
                    <FactBlocks markdown={s.content_md} />
                  </DetailSection>
                );
              })
            : (
              <DetailSection id="summary" title="Summary">
                {r.whatIsIt || r.note || r.whyMatters ? (
                  <p style={{ fontSize: "var(--fs-14)", lineHeight: 1.7, margin: 0, maxWidth: "72ch", color: "var(--ink)" }}>
                    {r.whatIsIt || r.note || r.whyMatters}
                  </p>
                ) : (
                  <StateNote>Detailed sections pending for this regional profile; brief generation in progress.</StateNote>
                )}
                {depth === "full" && r.fullBrief && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-3)" }}>
                    <GfmSection markdown={r.fullBrief} />
                  </div>
                )}
              </DetailSection>
            )}

          <DetailSection id="sources" title="Sources" aside={sourceRows.length > 0 ? `${sourceRows.length} · tier = provenance, never urgency` : undefined}>
            {sourceRows.length > 0 ? <SourcesGrid rows={sourceRows} /> : <Absence reason="not in primary source" />}
          </DetailSection>
        </DetailLayout>
      </DetailPageWrapper>
    </div>
  );
}

// ── Rail: related-in-region (matches the artboard's "RELATED IN ASIA") ───
function RelatedRegionCard({ related, reason, jurisdiction }: { related: RelatedItem[]; reason: "jurisdiction" | "source" | "none"; jurisdiction: string }) {
  if (related.length === 0) return null;
  const regionWord = jurisdiction || "region";
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: "14px 16px" }}>
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 4px" }}>
        Related in {regionWord}
      </p>
      <p style={{ fontSize: "var(--fs-10)", color: "var(--ink-3)", fontStyle: "italic", margin: "0 0 10px" }}>
        {reason === "jurisdiction" ? `Other Operations profiles covering ${regionWord}.` : "Other items from the same source."}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {related.map((it) => (
          <Link
            key={it.id}
            href={`/operations/${encodeURIComponent(it.id)}`}
            style={{ display: "block", padding: "8px 0", borderBottom: "1px solid var(--line-3)", textDecoration: "none", color: "inherit", minHeight: 44 }}
          >
            <p style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

