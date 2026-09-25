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
 * SPEC-09 SECTIONS (UI fix round 2026-09-08, item D3). The DQI, auxiliary-energy and grid-queue
 * material used to render as three full-width strips below the /operations LIST, under artboard 08's
 * last card. The operator's page-scope ruling moves it here, "as S-sections on the operations PROFILE
 * page, in the same shape, with their existing data paths, so nothing is lost". They arrive as
 * ReactNode props from the server route (the panels are async server components with their own
 * org-scoped reads — see /operations/[slug]/page.tsx) and render through the SAME <DetailSection> every
 * other section on this surface uses, with their own qualifier line in the section's `aside` slot. They
 * sit after the item's own DB-driven sections and before Sources, and they carry index entries, so the
 * sticky section index still names every section on the page.
 *
 * Their subject is the WORKSPACE's own shipment/asset/connection data (org-scoped), not this item —
 * they read the same on every profile. That is what the ruling asks for and is logged in
 * DEVIATION-LOG.md rather than quietly re-scoped.
 *
 * KEPT, RELOCATED: the matrix eligibility gate (S3/S4 honest omit-note),
 * "Comparison coverage" status (folded into the rail's At-a-glance card),
 * related-items-by-region (closing section; the artboard's own "RELATED IN
 * ASIA" rail card — RelatedRegionCard below), ItemConnectionsCard,
 * RelevanceBadgeClient, WatchButton/Export/Share actions.
 */

import { useMemo, useState, type ReactNode } from "react";
import { joinMetaSegments } from "@/lib/detail/meta-line";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import type { MatrixEligibility } from "@/lib/agent/formats/operations-matrix";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { WatchButton } from "@/components/ui/WatchButton";
import { shareResource, downloadMarkdownBrief } from "@/components/ui/ActionRow";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { renderRequirementTrajectory } from "@/components/detail/RequirementTrajectory";
import { TagChip } from "@/components/ui/Chips";
import { ActionCard } from "@/components/ui/ActionCard";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import { DetailTagRow } from "@/components/ui/DetailTagRow";
import { SectionIndex, type SectionIndexEntry, type SectionIndexDepth } from "@/components/ui/SectionIndex";
import {
  DetailMasthead,
  DetailSection,
  DetailLayout,
  DetailPageWrapper,
  ImpactRailCard,
  AtAGlanceCard,
  RailLegend,
  InThisListStat,
  DetailRail,
  topRecommendedAction,
} from "@/components/detail/DetailShell";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FactBlocks } from "@/components/detail/FactBlocks";
import { GfmSection } from "@/components/shared/GfmSection";
import { sourceEntriesOf, SourcesGrid } from "@/components/detail/SourcesGrid";
import { bandFromPriority } from "@/lib/urgency/bands";
import { DQI_SECTION_ASIDE } from "@/components/operations/DqiPanelView";
import { AUXILIARY_ENERGY_SECTION_ASIDE } from "@/components/operations/AuxiliaryEnergyPanelView";
import { GRID_QUEUE_SECTION_ASIDE } from "@/components/operations/GridQueuePanelView";
import { scoreResource } from "@/lib/scoring";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { regionGroupForLabel } from "@/lib/constants";

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
  /** Item D3 (2026-09-08): the three spec-09 panels, rendered by the server route and mounted here as
   *  S-sections. Omitted by any caller that has no server tree to render them in (the audit mount
   *  passes its own fixture-fed views), in which case the section is not drawn at all rather than
   *  drawn empty. */
  dqiSection?: ReactNode;
  auxiliaryEnergySection?: ReactNode;
  gridQueueSection?: ReactNode;
}

/** The three spec-09 sections' index labels and anchors, in the order they render. Declared once so
 *  the sticky index and the sections themselves can never disagree about either. */
const SPEC09_SECTIONS = [
  { id: "sec-dqi", label: "Data quality", shortName: "Data quality", aside: DQI_SECTION_ASIDE, key: "dqiSection" },
  { id: "sec-auxiliary-energy", label: "Auxiliary energy load", shortName: "Aux. energy", aside: AUXILIARY_ENERGY_SECTION_ASIDE, key: "auxiliaryEnergySection" },
  { id: "sec-grid-queue", label: "Grid connection queue", shortName: "Grid queue", aside: GRID_QUEUE_SECTION_ASIDE, key: "gridQueueSection" },
] as const;

const OPERATIONS_SECTION_HEADINGS: Record<string, string> = {
  "1": "Operational cost baseline",
  "2": "Feasibility of operational choices",
  "3": "Cost vs alternatives",
  "4": "Cross-regional",
  "5": "Competitive positioning",
  "6": "Talking points",
  // Operator check 5 (lane PARITY-PARTS, 2026-09-24): no exact-case "PENDING" anywhere rendered.
  // SectionHeader uppercases every S-title, so "Pending changes" drew as literal "PENDING CHANGES".
  // Same meaning, no forbidden substring after the transform.
  "7": "Upcoming changes",
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
  dqiSection,
  auxiliaryEnergySection,
  gridQueueSection,
}: Props) {
  const spec09Nodes: Record<string, ReactNode> = { dqiSection, auxiliaryEnergySection, gridQueueSection };
  const spec09Shown = SPEC09_SECTIONS.filter((s) => spec09Nodes[s.key] != null);
  const band = bandFromPriority(r.priority);
  const impact = r.impactScores ?? scoreResource(r);
  // Artboard 09 (dc.html #p9): "Region" chip + At a glance row read "Asia" / "Asia · Singapore".
  // CORRECTED, lane details60 (2026-09-08): an earlier lane logged the continental grouping as a
  // field this build has no data for. It does — `JURISDICTIONS` carries a `region` per jurisdiction
  // — so `regionGroupForLabel` resolves it (src/lib/constants.ts) and the surface renders the
  // app's own vocabulary ("Asia-Pacific") rather than the artboard's shorter "Asia", which it would
  // have to fabricate. The ISO country code stays humanized ("Singapore"), never the raw code.
  const jurisdictionIsoCode = r.jurisdiction || (r.jurisdictionIso && r.jurisdictionIso[0]) || "";
  const jurisdiction = jurisdictionIsoCode ? isoToDisplayLabel(jurisdictionIsoCode) : "";
  const regionGroup = regionGroupForLabel(jurisdiction);

  // COUNTS-61: the same shared join every detail sub-line now uses, so a segment can never be
  // printed twice when two producers reach for the same field (the /market/[id] defect).
  const meta = joinMetaSegments([
    ["Operations", jurisdiction].filter(Boolean).join(" · "),
    r.sourceName,
    r.added ? `published ${formatDate(r.added)}` : null,
    r.modes && r.modes.length > 0 ? r.modes.map((m) => m.toUpperCase()).join(" · ") : null,
  ]);

  const knownSections = useMemo(
    () => sections.filter((s) => KNOWN_OPERATIONS_KEYS.has(s.section_key)),
    [sections]
  );
  const sourceRows = useMemo(() => sourceEntriesOf(r), [r]);
  const [depth, setDepth] = useState<SectionIndexDepth>("summary");
  const [tagOpen, setTagOpen] = useState(false);
  const trajectoryNode = renderRequirementTrajectory(r.requirementTrajectory) || r.conversionTrigger || null;

  const hasRelated = connections.length > 0 || supersessions.length > 0;
  // Operator ruling 2 (lane PARITY-PARTS, 2026-09-24): fixed S-order S1/S2/S5/S6 (see the masthead
  // ActionCard comment below and the "Substantive findings" section comment for why S3/S4 are a
  // real gap, never renumbered, and why S2 now holds every former top-level content tab).
  const indexEntries: SectionIndexEntry[] = [
    { id: "summary", shortName: "Summary", ord: 1 },
    { id: "findings", shortName: "Findings", ord: 2 },
    { id: "sources", shortName: "Sources", ord: 5 },
    ...(hasRelated ? [{ id: "related", shortName: "Related", ord: 6 }] : []),
  ];

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--ink)", paddingTop: 16 }}>
      <DetailPageWrapper band={band} action={topRecommendedAction(r)}>
        <DetailMasthead
          title={r.title}
          band={band}
          surface="Operations"
          /* Artboard 09 breadcrumb: "Operations / Asia / 2 of 6" — the REGION GROUP, not the
             country. Falls back to the country label where the code resolves to no group. */
          jurisdiction={regionGroup || jurisdiction || undefined}
          dek={meta}
          placeholder="Ask about this profile — e.g. when does the largest deadline hit"
        />
        {/* Lane PARITY-PARTS (2026-09-24), matching the regulation surface's ActionCard port: ONE
            card replaces DetailHeader + DetailExposure + DetailTimeline. Trajectory has no slot in
            the merged card (its fourth exposure cell is NEXT MILESTONE, computed internally from
            timeline); rendered as a plain line under the card instead, same as research/regulations. */}
        <ActionCard
          band={band}
          kindLabel="Regional profile"
          extraChips={
            <>
              {/* Artboard 09 chip row: "Regional profile · Asia · Ocean · Air · Corridors", the
                  region GROUP chip, not the country (which the At a glance card carries in full). */}
              {(regionGroup || jurisdiction) && <TagChip>{regionGroup || jurisdiction}</TagChip>}
              {r.modes && r.modes.slice(0, 2).map((m) => <TagChip key={m}>{m.toUpperCase()}</TagChip>)}
              {/* Artboard 09 (dc.html #p9): trailing "Corridors" topic chip after the mode chips. */}
              {r.topic && <TagChip>{r.topic}</TagChip>}
            </>
          }
          tier={typeof r.sourceTier === "number" ? r.sourceTier : null}
          meta={
            sourceRows.length > 0
              ? `${sourceRows.length} source${sourceRows.length === 1 ? "" : "s"}${
                  connections.length > 0 ? ` · ${connections.length} connections` : ""
                }`
              : null
          }
          tagPopover={<DetailTagRow itemId={String(r.id)} open={tagOpen} onOpenChange={setTagOpen} />}
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
          where={{ value: jurisdiction || null }}
          whoPays={{ value: r.costMechanism || null }}
          yourLanes={{ value: null, absenceReason: "connect data" }}
          timeline={r.timeline}
        />
        {trajectoryNode && (
          <p style={{ fontSize: "var(--fs-105)", lineHeight: 1.6, color: "var(--ink-2)", margin: "10px 0 0", maxWidth: "72ch" }}>{trajectoryNode}</p>
        )}

        <SectionIndex sections={indexEntries} depth={depth} onDepthChange={setDepth} />

        <DetailLayout
          rail={
            <DetailRail
              atAGlance={
                <AtAGlanceCard
                  rows={[
                    { label: "Band", value: `${band.label} · ${band.window}` },
                    { label: "Type", value: "Regional profile" },
                    { label: "Region", value: regionGroup ? `${regionGroup} · ${jurisdiction}` : jurisdiction },
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
              }
              impact={<ImpactRailCard scores={impact} />}
              relevance={<RelevanceBadgeClient itemId={r.id} />}
              /* Artboard 09's only page-specific rail card: RELATED IN ASIA. */
              designed={<RelatedRegionCard related={related} reason={relatedReason} region={regionGroup || jurisdiction} />}
              legend={<RailLegend />}
              /* R7, artboard 09 draws neither. Operator check 8 (lane PARITY-PARTS, 2026-09-24):
                 Connections is not a rail card, moved into the "Related" section in main content. */
              undesigned={<InThisListStat backHref="/operations" backLabel="Back to list" band={band} />}
            />
          }
        >
          {/* Operator ruling 2 (lane PARITY-PARTS, 2026-09-24): market/research/operations S-order
              is fixed at 01 Summary, 02 Substantive/Series/Findings, 03 Exposure, 04 Timeline, 05
              Sources, 06 Related. Exposure/Timeline live in the masthead ActionCard, never a tab.
              This surface previously had NO summary section at all (it jumped straight into 8
              numbered content sections, plus the 3 spec09 panels, as 9-11 separate top-level tabs,
              the worst overflow of the four surfaces in the baseline report). S1 Summary reuses the
              same real-field fallback the other three surfaces already use when they have no
              dedicated summary content; S2 "Substantive findings" now holds every one of those
              former top-level tabs as sub-headings, content and data paths unchanged. */}
          <DetailSection id="summary" title="Summary" index={1}>
            {r.whatIsIt || r.note || r.whyMatters ? (
              <p style={{ fontSize: "var(--fs-14)", lineHeight: 1.7, margin: 0, maxWidth: "72ch", color: "var(--ink)" }}>
                {r.whatIsIt || r.note || r.whyMatters}
              </p>
            ) : (
              <StateNote>Summary pending for this regional profile; brief generation in progress.</StateNote>
            )}
            {depth === "full" && r.fullBrief && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-3)" }}>
                <GfmSection markdown={r.fullBrief} />
              </div>
            )}
          </DetailSection>

          <DetailSection id="findings" title="Substantive findings" index={2}>
            {knownSections.length > 0 &&
              knownSections.map((s, i) => {
                const heading = OPERATIONS_SECTION_HEADINGS[s.section_key] || `Section ${s.section_key}`;
                let body: ReactNode;
                if (MATRIX_GATED_KEYS.has(s.section_key)) {
                  const eligible = s.section_key === "3" ? matrixEligibility?.s3Eligible === true : matrixEligibility?.s4Eligible === true;
                  if (!eligible) body = <StateNote>{deriveOmitNote(s.section_key, matrixEligibility)}</StateNote>;
                }
                if (body === undefined) {
                  if (!s.content_md || !s.content_md.trim()) {
                    if (s.is_conditional) return null;
                    body = <Absence reason="not in primary source" />;
                  } else {
                    body = <FactBlocks markdown={s.content_md} />;
                  }
                }
                return (
                  <div key={s.section_key}>
                    {i > 0 && <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0" }} aria-hidden="true" />}
                    <SectionLabel>{heading}</SectionLabel>
                    <div style={{ marginTop: 12 }}>{body}</div>
                  </div>
                );
              })}
            {spec09Shown.map((s, i) => (
              <div key={s.id}>
                {(knownSections.length > 0 || i > 0) && <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0" }} aria-hidden="true" />}
                <SectionLabel>{s.label}</SectionLabel>
                {s.aside && <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", margin: "4px 0 12px" }}>{s.aside}</p>}
                <div style={{ marginTop: s.aside ? 0 : 12 }}>{spec09Nodes[s.key]}</div>
              </div>
            ))}
            {knownSections.length === 0 && spec09Shown.length === 0 && (
              <StateNote>Detailed sections pending for this regional profile; brief generation in progress.</StateNote>
            )}
          </DetailSection>

          <DetailSection id="sources" title="Sources" index={5} aside={sourceRows.length > 0 ? `${sourceRows.length} · tier = provenance, never urgency` : undefined}>
            {sourceRows.length > 0 ? <SourcesGrid rows={sourceRows} /> : <Absence reason="not in primary source" />}
          </DetailSection>

          {(connections.length > 0 || supersessions.length > 0) && (
            <DetailSection id="related" title="Related" index={6}>
              <ItemConnectionsCard connections={connections} supersessions={supersessions} selfId={r.id} resourceLookup={resourceLookup} />
            </DetailSection>
          )}
        </DetailLayout>
      </DetailPageWrapper>
    </div>
  );
}

// ── Rail: related-in-region (matches the artboard's "RELATED IN ASIA") ───
// RELATED IN ASIA — artboard 09's page-specific rail card (dc.html #p9, char 482235).
//
// Rebuilt to the artboard's own measures, lane details60 (2026-09-08). The
// artboard draws: the 3px dark-grey section rule cap, padding 12px 16px 14px,
// a head row (10.5px/.12em/700/#7A6E6C) and then rows only — a flex column,
// gap 8, 12px text, each row a `3px 1fr` grid whose first cell is a band-
// coloured 3px bar (radius 2) and whose second is the title at 600/1.35.
// Deleted with it: the italic reason sentence under the head, which the
// artboard does not draw. The reason it carried is not lost — it moves into
// the head itself ("Related in <region>" vs "Related by source"), so a
// related-by-source list is never mislabelled as a regional one.
//
// The row is the whole click target and keeps a 24px minimum box with the
// artboard's own 8px gap between rows (ux-laws law 2's small-target branch:
// >= 24px with >= 8px clearance), so the card is ~8px per row taller than the
// artboard's 16px text rows. Logged in DEVIATION-LOG.md.
function RelatedRegionCard({ related, reason, region }: { related: RelatedItem[]; reason: "jurisdiction" | "source" | "none"; region: string }) {
  if (related.length === 0) return null;
  const regionWord = region || "region";
  return (
    <SectionCard>
      <div style={{ padding: "12px 16px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}>
            {reason === "source" ? "Related by source" : `Related in ${regionWord}`}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-12)" }}>
          {related.map((it) => (
            <Link
              key={it.id}
              href={`/operations/${encodeURIComponent(it.id)}`}
              style={{
                display: "grid",
                gridTemplateColumns: "3px 1fr",
                gap: 10,
                alignItems: "stretch",
                minHeight: 24,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span aria-hidden="true" style={{ background: "var(--awareness)", borderRadius: 2 }} />
              <span style={{ fontWeight: 600, lineHeight: 1.35, color: "var(--ink)", overflowWrap: "anywhere" }}>{it.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

