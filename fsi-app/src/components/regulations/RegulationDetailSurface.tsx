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

import { useMemo, useState } from "react";
import { WatchButton } from "@/components/ui/WatchButton";
import { ActionRow, shareResource, downloadMarkdownBrief } from "@/components/ui/ActionRow";
import { FactCard } from "@/components/ui/FactCard";
import { Absence } from "@/components/ui/Absence";
import { StateNote } from "@/components/ui/StateNote";
import {
  DetailHeader,
  DetailTimeline,
  SectionIndex,
  SummaryDepthSwitch,
  type SummaryDepth,
  DetailSection,
  DetailLayout,
  DetailPageWrapper,
  ImpactRailCard,
  InThisListStat,
  type SectionIndexEntry,
} from "@/components/detail/DetailShell";
import { GfmSection } from "@/components/shared/GfmSection";
import { FactBlocks } from "@/components/detail/FactBlocks";
import { AffectedLanesCard } from "@/components/regulations/AffectedLanesCard";
import { OwnerTeamCard } from "@/components/regulations/OwnerTeamCard";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import { RecordGradeBadge } from "@/components/shell/RecordGradeBadge";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { scoreResource } from "@/lib/scoring";
import { extractRegulationSections, type SourceEntry } from "@/lib/agent/extract-regulation-sections";
import {
  parseRecordSections,
  splitKeyDateFacts,
  type RecordFactRow,
  type ClaimTierMap,
} from "@/lib/agent/parse-record-sections";
import { JURISDICTIONS, type PriorityKey } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
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
}

/** Clamp any tier value to the customer-facing 1-7 range (DO-NOT-REVERT). */
function clampTier(n: number): number {
  return Math.min(7, Math.max(1, Math.round(n)));
}

const CANONICAL_HEADINGS: Record<string, string> = {
  "3": "Obligations — issues requiring action",
  "4": "Compliance chain",
  "8": "Substantive requirements",
  "10": "Registration and reporting",
  "11": "Operational requirements",
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
}: Props) {
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdminViewer = userRole === "owner" || userRole === "admin";
  const showIntegrityBanner = isAdminViewer && r.agentIntegrityFlag === true && !!r.agentIntegrityPhrase;

  const band = bandFromPriority(r.priority);
  const impact = r.impactScores ?? scoreResource(r);

  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction]
      : ["Global"];
  const jurisLabel = jurisdictionLabels.join(" · ");
  const meta = [groupLabel || jurisLabel, deck].filter(Boolean).join(" · ");

  const isRecord = r.itemGrade === "record";
  const [depth, setDepth] = useState<SummaryDepth>("summary");

  const dynamicSections = useMemo(
    () => sections.filter((s) => s.section_key in CANONICAL_HEADINGS && (s.content_md || "").trim()),
    [sections]
  );
  const sourceRows = useMemo<SourceEntry[]>(() => sourceEntriesOf(r), [r]);

  const indexEntries: SectionIndexEntry[] = [
    { id: "summary", label: "Summary" },
    ...(isRecord ? [] : dynamicSections.map((s) => ({ id: `sec-${s.section_key}`, label: CANONICAL_HEADINGS[s.section_key] }))),
    ...(hasPenaltyContent(r) ? [{ id: "penalties", label: "Penalties" }] : []),
    { id: "sources", label: "Sources" },
  ];

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--ink)", paddingTop: 16 }}>
      <DetailPageWrapper>
        <DetailHeader
          band={band}
          tier={typeof r.sourceTier === "number" ? r.sourceTier : null}
          title={r.title}
          askPlaceholder="Ask about this regulation"
          askScope="regulation-detail"
          meta={meta}
          actions={
            <>
              <HeroPriorityDropdown currentPriority={r.priority as PriorityKey} itemId={r.id} title={r.title} />
              <ActionRow
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
              />
            </>
          }
        />

        {showIntegrityBanner && <IntegrityBanner phrase={r.agentIntegrityPhrase!} />}

        <DetailTimeline entries={r.timeline} band={band} />

        {upcomingObligations && <div style={{ marginBottom: 16 }}>{upcomingObligations}</div>}

        <SectionIndex sections={indexEntries} trailing={<SummaryDepthSwitch depth={depth} onChange={setDepth} />} />

        <DetailLayout
          rail={
            <>
              <ImpactRailCard scores={impact} />
              <InThisListStat backHref="/regulations" backLabel="Back to list" />
              <RelevanceBadgeClient itemId={r.id} />
              <AffectedLanesCard resource={r} />
              <OwnerTeamCard resource={r} initialOwner={initialOwner} />
              <ItemConnectionsCard connections={connections} supersessions={supersessions} selfId={r.id} resourceLookup={resourceLookup} />
            </>
          }
        >
          <DetailSection id="summary" title="Summary">
            {isRecord ? (
              <RecordGradeSections r={r} sections={sections} claimTiers={claimTiers} />
            ) : (
              <BriefSummary r={r} changelog={changelog} dispute={dispute} />
            )}
            {depth === "full" && r.fullBrief && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-3)" }}>
                <GfmSection markdown={r.fullBrief} />
              </div>
            )}
          </DetailSection>

          {!isRecord &&
            dynamicSections.map((s) => (
              <DetailSection key={s.section_key} id={`sec-${s.section_key}`} title={CANONICAL_HEADINGS[s.section_key]}>
                <FactBlocks markdown={s.content_md} />
              </DetailSection>
            ))}

          {hasPenaltyContent(r) && (
            <DetailSection id="penalties" title="Penalties" aside="From the regulatory brief">
              <PenaltyFacts r={r} />
            </DetailSection>
          )}

          <DetailSection id="sources" title="Sources" aside={sourceRows.length > 0 ? `${sourceRows.length} · tier = provenance, never urgency` : undefined}>
            {sourceRows.length > 0 ? (
              <SourcesGrid rows={sourceRows} />
            ) : (
              <Absence reason="not in primary source" />
            )}
          </DetailSection>
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

function BriefSummary({ r, changelog, dispute }: { r: Resource; changelog: ChangeLogEntry[]; dispute: Dispute | null }) {
  const shortText = r.whatIsIt || r.note || "";
  const hasAny = !!shortText || !!r.fullBrief;
  if (!hasAny) {
    return (
      <StateNote>
        The full analysis for this regulation has not been generated yet. The metadata elsewhere on this page is accurate; the narrative brief is pending generation.
      </StateNote>
    );
  }
  return (
    <>
      {shortText && (
        <p style={{ fontSize: "var(--fs-14)", lineHeight: 1.7, margin: "0 0 14px", maxWidth: "72ch", color: "var(--ink)" }}>{shortText}</p>
      )}
      {changelog.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
            What changed
          </p>
          {changelog.slice(0, 3).map((c, i) => (
            <p key={i} style={{ fontSize: "var(--fs-13)", lineHeight: 1.6, margin: "0 0 6px", color: "var(--ink-2)" }}>
              {c.now || c.prev}
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
          <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
            Key dates
          </p>
          {dateFacts.map((f) => (
            <RecordFactCard key={f.slotKey} fact={f} />
          ))}
        </div>
      )}
      <div style={{ margin: "14px 0" }}>
        <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px", display: "flex", justifyContent: "space-between" }}>
          <span>Verbatim facts</span>
          {parsed && parsed.slotFieldCount > 0 && (
            <span style={{ fontWeight: 700 }}>{parsed.gaps.length} of {parsed.slotFieldCount} record fields not stated by the source</span>
          )}
        </p>
        {otherFacts.length > 0 ? (
          otherFacts.map((f) => <RecordFactCard key={f.slotKey} fact={f} />)
        ) : (
          <Absence reason="not in primary source" />
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

function RecordFactCard({ fact }: { fact: RecordFactRow }) {
  if (fact.kind !== "FACT" || !fact.span) {
    return (
      <p style={{ fontSize: "var(--fs-13)", lineHeight: 1.6, color: "var(--ink-2)", margin: "0 0 8px" }}>
        <strong style={{ color: "var(--ink-3)" }}>{fact.label}:</strong> {fact.text || <Absence reason="not in primary source" />}
      </p>
    );
  }
  return (
    <FactCard
      variant="sourced"
      text={fact.span}
      source={{ title: fact.label, issuer: fact.sourceName ?? null, date: null, url: fact.sourceUrl ?? null, tier: fact.tier ?? null }}
    />
  );
}

// ── Sources ──────────────────────────────────────────────────────────────

function sourceEntriesOf(r: Resource): SourceEntry[] {
  let parsedList: SourceEntry[] = [];
  if (r.fullBrief) {
    const map = extractRegulationSections(r.fullBrief);
    for (const section of Object.values(map)) {
      if (section && section.kind === "sources_list") {
        parsedList = section.entries;
        break;
      }
    }
  }
  return parsedList.length > 0
    ? parsedList
    : r.url
    ? [{ tier: typeof r.sourceTier === "number" ? r.sourceTier : null, name: r.sourceName || r.url, meta: r.enforcementBody || "", url: r.url }]
    : [];
}

function SourcesGrid({ rows }: { rows: SourceEntry[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {rows.map((s, i) => {
        const inner = (
          <>
            {typeof s.tier === "number" ? (
              <span style={{ fontSize: "var(--fs-10)", fontWeight: 800, padding: "3px 7px", borderRadius: 4, border: "1px solid var(--line-1)", color: "var(--ink-2)" }}>
                T{clampTier(s.tier)}
              </span>
            ) : (
              <span aria-hidden style={{ width: 24 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "var(--fs-125)", fontWeight: 700, margin: 0, color: "var(--ink)", overflowWrap: "anywhere" }}>{s.name}</p>
              {s.meta && <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "2px 0 0" }}>{s.meta}</p>}
            </div>
          </>
        );
        const cellStyle: React.CSSProperties = {
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 12,
          alignItems: "baseline",
          padding: "11px 0",
          borderBottom: i < rows.length - 1 ? "1px solid var(--line-3)" : "none",
          textDecoration: "none",
          color: "inherit",
          minHeight: 44,
        };
        return s.url ? (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={cellStyle}>
            {inner}
          </a>
        ) : (
          <div key={i} style={cellStyle}>
            {inner}
          </div>
        );
      })}
    </div>
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
          <code style={{ background: "var(--tag)", border: "1px solid var(--line-1)", borderRadius: 3, padding: "1px 6px" }}>{phrase}</code>. Resolve in{" "}
          <a href="/admin#integrity-flags" style={{ color: "var(--action)", fontWeight: 700, textDecoration: "underline" }}>
            /admin → Integrity flags
          </a>
          .
        </div>
      </div>
    </div>
  );
}

// ── Hero priority dropdown (interactive retag/dismiss) — unchanged behavior ──

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
        variant="hero"
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

