"use client";

/**
 * RegulationDetailSurface — client subcomponent for /regulations/[slug].
 *
 * UI SYSTEM HANDOFF (lane uidetails, 2026-09-06, docs/design/handoff-2026-09-06,
 * README §0.5 + 03-regulation-detail.png): rebuilt onto the ONE detail
 * architecture shared by all four detail surfaces (DetailShell.tsx):
 *   header (band pill + tier + title + meta) -> full timeline with the
 *   next obligation as the callout -> state note -> sticky section index
 *   -> sections of FactCards at <=72ch -> rail.
 *
 * REMOVED this lane (README §0.5, "no tabs, no per-tab ask bar, and no
 * 'Complete brief' toggle — that control is an unwired <span> today and is
 * removed"): the five-tab strip (Summary/Exposure/Penalty schedule/
 * Timeline/Sources), the per-tab AiPromptBar, and the three-state Short/
 * Full/Complete summary selector (train 49's own fix to that control's
 * unreachable-state bug — DEAD-CONTROL fixed a bug in a control this lane
 * now removes entirely, since the architecture it lived in is gone). Their
 * content is redistributed into always-visible sections below, or logged
 * in DEVIATION-LOG.md where the underlying data does not support a
 * section-shaped equivalent (e.g. ExposureTab's lane-level workspace-fit
 * copy — not in the artboard's own section list either).
 *
 * Every "FACT: ... *Source: ...*" / "*Analytical inference:* ..." /
 * "*Legal Confirmation Required:* ..." paragraph the pipeline wrote into
 * this item's intelligence_item_sections rows now renders as a FactCard
 * (src/components/detail/FactBlocks.tsx re-parses content_md at render
 * time — the pipeline's own output is unchanged).
 *
 * DO-NOT-REVERT invariants preserved from the prior architecture: tier
 * CLAMP 1-7, structured sources (never a raw "## Sources" dump — the #172
 * pattern), honest empty states (Absence / StateNote, never a fabricated
 * value), epistemic FACT/ANALYSIS/LEGAL labels bound to real fields,
 * non-verified content never fabricated.
 */

import { useMemo, useState, type ReactNode } from "react";
import { nowFrom } from "@/lib/render-now";
import { recentRegenInfo } from "@/lib/dashboard/row-fields";
import { joinMetaSegments, splitMetaSegments } from "@/lib/detail/meta-line";
import { WatchButton } from "@/components/ui/WatchButton";
import { shareResource, downloadMarkdownBrief } from "@/components/ui/ActionRow";
import { Absence } from "@/components/ui/Absence";
import { StateNote } from "@/components/ui/StateNote";
import { DetailTagRow } from "@/components/ui/DetailTagRow";
import { ActionCard } from "@/components/ui/ActionCard";
import { SectionIndex, REGULATION_SECTION_INDEX, type SectionIndexEntry, type SectionIndexDepth } from "@/components/ui/SectionIndex";
import {
  DetailMasthead,
  DetailSection,
  DetailLayout,
  DetailPageWrapper,
  ImpactRailCard,
  InThisListStat,
  DetailRail,
  AtAGlanceCard,
  RailLegend,
  topRecommendedAction,
} from "@/components/detail/DetailShell";
import { formatDate } from "@/lib/format";
import { GfmSection } from "@/components/shared/GfmSection";
import { FactBlocks } from "@/components/detail/FactBlocks";
import { renderRequirementTrajectory } from "@/components/detail/RequirementTrajectory";
import { AffectedLanesCard } from "@/components/regulations/AffectedLanesCard";
import { OwnerTeamCard } from "@/components/regulations/OwnerTeamCard";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { scoreResource } from "@/lib/scoring";
import type { SourceEntry } from "@/lib/agent/extract-regulation-sections";
import { sourceEntriesOf, SourcesGrid, clampTier } from "@/components/detail/SourcesGrid";
import { jurisLabelOf, RecordFactCard } from "@/components/detail/primitives";
import { ItemGroup } from "@/components/ui/ItemGroup";
import {
  parseRecordSections,
  splitKeyDateFacts,
  type RecordFactRow,
  type ClaimTierMap,
} from "@/lib/agent/parse-record-sections";
import { type PriorityKey } from "@/lib/constants";
import { bandFromPriority } from "@/lib/urgency/bands";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  Resource,
  ChangeLogEntry,
  Dispute,
  Supersession,
  ItemConnection,
} from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { ArchiveDialog } from "@/components/workspace/ArchiveDialog";
import { useResourceStore } from "@/stores/resourceStore";

interface Props {
  resource: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  supersessions: Supersession[];
  connections: ItemConnection[];
  /** Flywheel U9 (D1) — the viewer's relevance-to-your-operation lens. Null when no org / soft-fail. */
  relevance: ItemRelevance | null;
  resourceLookup: Record<string, { id: string; title: string; priority: string }>;
  sections?: IntelligenceItemSectionRow[];
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings, keyed by exact claim line. */
  claimTiers?: ClaimTierMap;
  /** Breadcrumb-style meta, e.g. "Global · IMO". Computed on the server from jurisdiction + publisher. */
  groupLabel?: string;
  /** Hero deck sub-line, e.g. "IMO MEPC · adopted 7 July 2023 · in force". */
  deck?: string;
  initialOwner?: { userId: string; name: string } | null;
  upcomingObligations?: React.ReactNode;
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
  /** Server render instant (src/lib/render-now.ts `renderNowIso()`). Threaded from this surface's
   *  page.tsx so the "Brief regenerated <date>" header line (D23 part (d)) comes from ONE instant
   *  the server chose, never `new Date()` in this "use client" component (the #418 class). */
  nowIso?: string;
}

const CANONICAL_HEADINGS: Record<string, string> = {
  "3": "Obligations — issues requiring action",
  "4": "Compliance chain",
  "8": "Substantive requirements",
  "10": "Registration and reporting",
  "11": "Operational requirements",
};

// Lane W10-ActionCard-b (2026-09-22), review item 5: the section-index short-name id
// (REGULATION_SECTION_INDEX, section-index-data.ts) each existing `section_key` maps to. Order of
// REGULATION_SECTION_INDEX itself is the review's canonical order (Substantive requirements before
// Registration/Operations, Compliance chain last before Penalties/Sources); this map only says
// WHICH index id a given pipeline section_key fills, not the order (the index table owns order).
const SECTION_KEY_TO_INDEX_ID: Record<string, string> = {
  "3": "obligations",
  "8": "requirements",
  "10": "registration",
  "11": "operations",
  "4": "compliance",
};

export function RegulationDetailSurface({
  resource: r,
  changelog,
  dispute,
  supersessions,
  connections,
  relevance,
  resourceLookup,
  sections = [],
  claimTiers,
  groupLabel,
  deck,
  initialOwner = null,
  upcomingObligations = null,
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
  nowIso,
}: Props) {
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdminViewer = userRole === "owner" || userRole === "admin";
  const showIntegrityBanner = isAdminViewer && r.agentIntegrityFlag === true && !!r.agentIntegrityPhrase;

  const band = bandFromPriority(r.priority);
  const impact = r.impactScores ?? scoreResource(r);
  // D23 part (d) (defect-fix-plan-2026-09-12.md): "Brief regenerated <date>" beside the tier chip,
  // within 30 days of render time.
  const regen = useMemo(() => recentRegenInfo(r.lastRegeneratedAt, nowFrom(nowIso)), [r.lastRegeneratedAt, nowIso]);

  const jurisLabel = jurisLabelOf(r);
  // COUNTS-61: same class as the market sub-line — `groupLabel` is "<jurisdiction> · <publisher>"
  // and `deck` repeats both the publisher and the jurisdiction, because regulations/[slug]/page.tsx
  // builds them from the same two fields. joinMetaSegments keeps the first occurrence of each.
  const meta = joinMetaSegments([groupLabel || jurisLabel, ...splitMetaSegments(deck)]);

  const isRecord = r.itemGrade === "record";
  const [depth, setDepth] = useState<SectionIndexDepth>("summary");
  const [tagOpen, setTagOpen] = useState(false);

  const dynamicSections = useMemo(
    () => sections.filter((s) => s.section_key in CANONICAL_HEADINGS && (s.content_md || "").trim()),
    [sections]
  );
  const sourceRows = useMemo<SourceEntry[]>(() => sourceEntriesOf(r), [r]);

  // Lane W10-ActionCard-b, build item 2: section order per REGULATION_SECTION_INDEX
  // (Summary, Obligations, Requirements, Registration, Operations, Compliance, Penalties,
  // Sources) on every regulation, keyed by the index id each pipeline section_key maps to.
  const dynamicSectionsByIndexId = useMemo(() => {
    const map = new Map<string, IntelligenceItemSectionRow>();
    if (!isRecord) {
      for (const s of dynamicSections) {
        const indexId = SECTION_KEY_TO_INDEX_ID[s.section_key];
        if (indexId) map.set(indexId, s);
      }
    }
    return map;
  }, [dynamicSections, isRecord]);

  const orderedDynamicEntries = useMemo(
    () => REGULATION_SECTION_INDEX.filter((e) => dynamicSectionsByIndexId.has(e.id)),
    [dynamicSectionsByIndexId]
  );

  // lane W10-SectionHeader, 2026-09-22: SectionHeader's "S2"-style ordinal, reused from the SAME
  // REGULATION_SECTION_INDEX table (section-index-data.ts) SectionIndex itself already reads,
  // never a second, duplicated name/order table.
  const sectionOrdinal = (indexId: string): number | null => {
    const i = REGULATION_SECTION_INDEX.findIndex((e) => e.id === indexId);
    return i >= 0 ? i + 1 : null;
  };

  const hasPenalties = hasPenaltyContent(r);
  const hasRelated = connections.length > 0 || supersessions.length > 0;
  const indexEntries: SectionIndexEntry[] = useMemo(
    () =>
      REGULATION_SECTION_INDEX.filter((e) => {
        if (e.id === "summary" || e.id === "sources") return true;
        if (e.id === "penalties") return hasPenalties;
        if (e.id === "related") return hasRelated;
        return dynamicSectionsByIndexId.has(e.id);
      }),
    [dynamicSectionsByIndexId, hasPenalties, hasRelated]
  );

  // Trajectory sentence moved to S1 Summary (review item 5 / brief item 5); ActionCard's fourth
  // EXPOSURE cell is NEXT MILESTONE, computed internally from the `timeline` prop.
  const trajectoryNode = renderRequirementTrajectory(r.requirementTrajectory) || r.conversionTrigger || null;

  const actionCardMeta =
    [
      sourceRows.length > 0
        ? `${sourceRows.length} source${sourceRows.length === 1 ? "" : "s"}${
            typeof r.sourceTier === "number" ? ` · T${clampTier(r.sourceTier)} primary` : ""
          }`
        : null,
      regen ? `regenerated ${regen.label}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const actionCard = (
    <ActionCard
      bare
      band={band}
      kindLabel="Regulation"
      tier={typeof r.sourceTier === "number" ? r.sourceTier : null}
      meta={actionCardMeta}
      tagPopover={<DetailTagRow itemId={String(r.id)} open={tagOpen} onOpenChange={setTagOpen} />}
      onExport={() =>
        downloadMarkdownBrief(r, {
          filenamePrefix: "regulation",
          metaRows: [
            r.jurisdiction ? `- Jurisdiction: ${r.jurisdiction}` : null,
            r.priority ? `- Priority: ${r.priority}` : null,
            r.complianceDeadline ? `- Compliance deadline: ${r.complianceDeadline}` : null,
            r.url ? `- Source: ${r.url}` : null,
          ],
        })
      }
      onShare={() => shareResource(r)}
      onTag={() => setTagOpen((v) => !v)}
      exportDisabled={!(r.fullBrief || r.url)}
      watch={
        <WatchButton
          itemType="reg"
          itemId={String(r.id)}
          variant="row"
          initialWatched={initialWatched}
          initialTeamWatched={initialTeamWatched}
          initialTeamAvailable={initialTeamAvailable}
        />
      }
      where={{ value: [r.sub, jurisLabel].filter(Boolean).join(" · ") || null }}
      whoPays={{ value: r.costMechanism || null }}
      yourLanes={{ value: null, absenceReason: "connect data" }}
      timeline={r.timeline}
    />
  );

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--ink)", paddingTop: 16 }}>
      <DetailPageWrapper band={band} action={topRecommendedAction(r)}>
        {/* Lane W10-ActionCard-b (2026-09-22) + operator check 2 (lane PARITY-PARTS, 2026-09-24):
            ActionCard (band pill + action row + exposure + timeline) now renders INSIDE the one
            masthead card via DetailMasthead's `actionSlot` (bare, no second SectionCard shell), not
            as a sibling card below it. The per-item priority menu has no slot in the merged card's
            props, so it renders as a small control immediately above the WHOLE masthead card. */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <HeroPriorityDropdown currentPriority={r.priority as PriorityKey} itemId={r.id} title={r.title} />
        </div>
        <DetailMasthead
          title={r.title}
          band={band}
          surface="Regulations"
          jurisdiction={jurisLabel}
          dek={meta}
          placeholder="Ask about this regulation, e.g. when does the largest deadline hit"
          actionSlot={actionCard}
        />

        {showIntegrityBanner && <IntegrityBanner phrase={r.agentIntegrityPhrase!} />}

        {upcomingObligations && <div style={{ marginTop: 16 }}>{upcomingObligations}</div>}

        <SectionIndex sections={indexEntries} depth={depth} onDepthChange={setDepth} />

        <DetailLayout
          rail={
            <DetailRail
              /* Artboard 03's rail opens with AT A GLANCE, which this surface alone did not build
                 (the other three detail surfaces have had it since lane uidetails2). Same shared
                 card, same Absence-by-omission contract: a row whose value the item does not carry
                 is dropped, never fabricated. */
              atAGlance={
                <AtAGlanceCard
                  rows={[
                    { label: "Band", value: `${band.label} · ${band.window}` },
                    { label: "Type", value: "Regulation" },
                    { label: "Jurisdiction", value: jurisLabel },
                    { label: "Instrument", value: r.legalInstrument },
                    { label: "Topic", value: r.topic },
                    { label: "Source", value: r.sourceName && typeof r.sourceTier === "number" ? `${r.sourceName} · T${clampTier(r.sourceTier)}` : r.sourceName },
                    { label: "Published", value: r.added ? formatDate(r.added) : null },
                    { label: "Deadline", value: r.complianceDeadline ? formatDate(r.complianceDeadline) : null },
                  ]}
                />
              }
              impact={<ImpactRailCard scores={impact} />}
              relevance={<RelevanceBadgeClient itemId={r.id} />}
              /* Artboard 03's page-specific cards, in its own order: OWNER & TEAM, IN THIS LIST.
                 Operator check 8 (lane PARITY-PARTS, 2026-09-24): Connections is not a rail card,
                 moved into the trailing "Related" section in main content below (matching the
                 market/research/operations port). */
              designed={
                <>
                  <OwnerTeamCard resource={r} initialOwner={initialOwner} />
                  <InThisListStat backHref="/regulations" backLabel="Back to list" band={band} />
                </>
              }
              legend={<RailLegend />}
              /* R7 — artboard 03 does not draw it. */
              undesigned={<AffectedLanesCard resource={r} />}
            />
          }
        >
          {/* Artboard 03 (dc.html #p3, S1 "Summary"): aside reads "Generated · 30-second read" for a
              synthesized brief. A record-grade item is captured verbatim, not generated, so it keeps
              no aside here (RecordGradeSections already states that distinction as its own StateNote). */}
          <DetailSection id="summary" title="Summary" aside={isRecord ? undefined : "Generated · 30-second read"} index={sectionOrdinal("summary")}>
            {isRecord ? (
              <RecordGradeSections r={r} sections={sections} claimTiers={claimTiers} />
            ) : (
              <BriefSummary r={r} changelog={changelog} dispute={dispute} trajectory={trajectoryNode} />
            )}
            {depth === "full" && r.fullBrief && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-3)" }}>
                <GfmSection markdown={r.fullBrief} />
              </div>
            )}
          </DetailSection>

          {/* Section order (review item 5, build item 2): REGULATION_SECTION_INDEX's own order.
              Summary depth (build item 3): S1 above is always in full; ONLY the Obligations section
              renders (its first ItemGroup only, via FactBlocks' maxGroups). Every other dynamic
              section, Penalties, and Sources are hidden until Full brief depth. */}
          {!isRecord &&
            orderedDynamicEntries
              .filter((e) => depth === "full" || e.id === "obligations")
              .map((e) => {
                const s = dynamicSectionsByIndexId.get(e.id)!;
                return (
                  <DetailSection key={s.section_key} id={e.id} title={CANONICAL_HEADINGS[s.section_key]} index={sectionOrdinal(e.id)}>
                    <FactBlocks markdown={s.content_md} maxGroups={depth === "summary" ? 1 : undefined} />
                  </DetailSection>
                );
              })}

          {depth === "full" && hasPenaltyContent(r) && (
            <DetailSection id="penalties" title="Penalties" aside="From the regulatory brief" index={sectionOrdinal("penalties")}>
              <PenaltyFacts r={r} />
            </DetailSection>
          )}

          {depth === "full" && (
            <DetailSection id="sources" title="Sources" aside={sourceRows.length > 0 ? `${sourceRows.length} · tier = provenance, never urgency` : undefined} index={sectionOrdinal("sources")}>
              {sourceRows.length > 0 ? (
                <SourcesGrid rows={sourceRows} />
              ) : (
                <Absence reason="not in primary source" />
              )}
            </DetailSection>
          )}

          {depth === "full" && hasRelated && (
            <DetailSection id="related" title="Related" index={sectionOrdinal("related")}>
              <ItemConnectionsCard connections={connections} supersessions={supersessions} selfId={r.id} resourceLookup={resourceLookup} />
            </DetailSection>
          )}
        </DetailLayout>
      </DetailPageWrapper>
    </div>
  );
}

function hasPenaltyContent(r: Resource): boolean {
  return !!(r.penaltyRange || r.costMechanism || r.enforcementBody);
}

function PenaltyFacts({ r }: { r: Resource }) {
  const rows: Array<[string, string]> = [
    r.penaltyRange ? ["Penalty amount", r.penaltyRange] : null,
    r.costMechanism ? ["Cost mechanism", r.costMechanism] : null,
    r.enforcementBody ? ["Enforcement body", r.enforcementBody] : null,
    r.complianceDeadline ? ["Compliance deadline", r.complianceDeadline] : null,
  ].filter(Boolean) as Array<[string, string]>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "var(--fs-13)" }}>
          <span style={{ color: "var(--ink-3)", fontWeight: 700 }}>{label}</span>
          <span style={{ color: "var(--ink)", textAlign: "right" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function BriefSummary({
  r,
  changelog,
  dispute,
  trajectory,
}: {
  r: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  trajectory?: ReactNode;
}) {
  const shortText = r.whatIsIt || r.note || "";
  const hasAny = !!shortText || !!r.fullBrief;
  if (!hasAny) {
    return (
      <StateNote>
        The full analysis for this regulation has not been generated yet. The metadata elsewhere on this page is accurate; the narrative brief is pending generation.
      </StateNote>
    );
  }
  // Lane W10-ActionCard-b (2026-09-22), review item 7: `item_changelog.new_value` is repurposed by
  // scripts/lib/changelog.mjs (recordItemChange) to carry the BATCH IDENTIFIER for a full_brief/
  // timeline change ("record-briefs-007"), never reader content. The change sentence lives in
  // `impact`. Rendering `c.now || c.prev` (the prior code, RegulationDetailSurface.tsx pre-lane)
  // showed that internal batch id as if it were the change description. Fixed at the source: only
  // `impact` renders, and an entry with no `impact` is dropped, never the id.
  const changeSentences = changelog.map((c) => c.impact).filter((s): s is string => !!s);
  return (
    <>
      {shortText && (
        <p style={{ fontSize: "var(--fs-14)", lineHeight: 1.7, margin: "0 0 14px", maxWidth: "72ch", color: "var(--ink)" }}>{shortText}</p>
      )}
      {trajectory && (
        <div style={{ margin: "0 0 14px" }}>
          <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
            Trajectory
          </p>
          <div style={{ fontSize: "var(--fs-13)", lineHeight: 1.6, color: "var(--ink-2)" }}>{trajectory}</div>
        </div>
      )}
      {changeSentences.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
            What changed
          </p>
          {changeSentences.slice(0, 3).map((s, i) => (
            <p key={i} style={{ fontSize: "var(--fs-13)", lineHeight: 1.6, margin: "0 0 6px", color: "var(--ink-2)" }}>
              {s}
            </p>
          ))}
        </div>
      )}
      {dispute?.note && (
        <div style={{ marginTop: 12 }}>
          <StateNote>{dispute.note}</StateNote>
        </div>
      )}
    </>
  );
}

// ── RECORD-GRADE sections ───────────────────────────────────────────────

function RecordGradeSections({
  r,
  sections,
  claimTiers,
}: {
  r: Resource;
  sections: IntelligenceItemSectionRow[];
  claimTiers?: ClaimTierMap;
}) {
  const parsed = useMemo(() => parseRecordSections(sections, claimTiers), [sections, claimTiers]);
  const { dateFacts, otherFacts } = useMemo(
    () => (parsed ? splitKeyDateFacts(parsed.facts) : { dateFacts: [] as RecordFactRow[], otherFacts: [] as RecordFactRow[] }),
    [parsed]
  );
  return (
    <>
      <StateNote>
        This item was captured directly from its source document rather than synthesized into a brief. Every fact below is quoted verbatim from that source.
      </StateNote>
      {dateFacts.length > 0 && (
        <div style={{ margin: "14px 0" }}>
          <ItemGroup title="Key dates">
            {dateFacts.map((f) => (
              <RecordFactCard key={f.slotKey} fact={f} />
            ))}
          </ItemGroup>
        </div>
      )}
      <div style={{ margin: "14px 0" }}>
        {otherFacts.length > 0 ? (
          <>
            {/* The gaps-count line renders as its own row, not ItemGroup's `qualifier` slot: at
                375px the two together squeezed "Verbatim facts" into a 2-line wrap inside its
                header row (F35, ux-smoke-specs.mjs "record-grade" @375). A short metadata count
                (not analysis text, the no-truncation ruling doesn't bind here) reads fine as its
                own line above the group. */}
            {parsed && parsed.slotFieldCount > 0 && (
              <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "0 0 6px", fontWeight: 700 }}>
                {parsed.gaps.length} of {parsed.slotFieldCount} record fields not stated by the source
              </p>
            )}
            <ItemGroup title="Verbatim facts">
              {otherFacts.map((f) => (
                <RecordFactCard key={f.slotKey} fact={f} />
              ))}
            </ItemGroup>
          </>
        ) : (
          <>
            <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
              Verbatim facts
            </p>
            <Absence reason="not in primary source" />
          </>
        )}
      </div>
      {r.tags && r.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {r.tags.map((t) => (
            <span key={t} style={{ fontSize: "var(--fs-11)", fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "var(--tag)", color: "var(--ink-2)" }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

// ── Header primitives ────────────────────────────────────────────────────

function IntegrityBanner({ phrase }: { phrase: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        background: "var(--action-tint)",
        border: "1px solid var(--line-1)",
        borderLeft: "4px solid var(--action)",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: "var(--fs-13)",
        lineHeight: 1.5,
        marginBottom: 16,
      }}
    >
      <div>
        <div style={{ fontSize: "var(--fs-11)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--action)", marginBottom: 4 }}>
          Agent flagged integrity concern
        </div>
        <div style={{ color: "var(--ink)" }}>
          The agent self-flagged this brief with the phrase{" "}
          <code style={{ background: "var(--tag)", border: "1px solid var(--line-1)", borderRadius: 3, padding: "1px 6px" }}>{phrase}</code>. This
          concern is queued for review.
        </div>
      </div>
    </div>
  );
}

// ── Priority kebab (interactive retag/dismiss/archive) ──────────────────
//
// DEFECT-FIX (item 3.1, 2026-09-07): this used to render PriorityDropdown's
// "hero" pill ("● Immediate ▾") as a sibling of ActionRow inside the same
// actions flex row — literally "the Immediate ▾ band dropdown in the
// regulation detail action row" the audit named. The band is stated by the
// header's own BandChip; changing it is not a reader action, and the action
// row is exactly Export brief · Share · Watch · + Tag, no fifth control.
// Dismiss/Archive still need a home (R5: reachable only through a ⋯ menu,
// never the action row), so this now mounts PriorityDropdown's existing
// "card" kebab variant (the same 44px "..." control every regulations-list
// row already uses for the identical menu — never a forked one) in the
// header's chip row via `extraChips`, not in `actions`.
function HeroPriorityDropdown({ currentPriority, itemId, title }: { currentPriority: PriorityKey; itemId: string; title: string }) {
  const updatePriority = useResourceStore((s) => s.updatePriority);
  const dismissResource = useResourceStore((s) => s.dismissResource);
  const override = useResourceStore((s) => s.overrides.get(itemId));
  const isDismissed = !!override?.dismissedAt;
  const effectivePriority = (override?.priorityOverride as PriorityKey | undefined) ?? currentPriority;
  const [archiveOpen, setArchiveOpen] = useState(false);
  return (
    <>
      <PriorityDropdown
        variant="card"
        ariaLabel="Regulation actions"
        currentPriority={effectivePriority}
        isDismissed={isDismissed}
        onSetPriority={(p) => updatePriority(itemId, p)}
        onDismiss={() => dismissResource(itemId)}
        onArchive={() => setArchiveOpen(true)}
      />
      {archiveOpen && <ArchiveDialog itemId={itemId} title={title} onClose={() => setArchiveOpen(false)} />}
    </>
  );
}

