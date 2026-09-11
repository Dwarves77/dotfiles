"use client";

/**
 * ResearchFindingDetailSurface — client subcomponent for `/research/[slug]`.
 *
 * UI SYSTEM HANDOFF (lane uidetails2, 2026-09-07, docs/design/handoff-2026-09-06,
 * README §0.5 + 07-research-detail.png "the eleven-frame document becomes
 * six anchored sections behind one index; every FACT paragraph a card"):
 * rebuilt onto the ONE detail architecture (DetailShell.tsx). The prior
 * six numbered ResearchSectionCards (each a GfmSection-rendered raw-markdown
 * block) map exactly onto the artboard's S1-S6 without renumbering — this
 * surface already had six sections, not eleven; the "eleven frames" in the
 * artboard subtitle describes the pre-Sprint-4 raw-brief layout this repo
 * had already replaced. Every FACT/ANALYSIS/LEGAL paragraph inside each
 * section's content_md now renders as a FactCard via FactBlocks.tsx
 * (already extended, see that file's own header, to route non-claim prose
 * — including a GFM table or list — through GfmSection rather than a
 * plain <p>, so nothing this surface used to render is lost).
 *
 * REMOVED this lane: the per-page AiPromptBar, the raw full_brief short/full
 * toggle (superseded by section-aware rendering — record-grade items still
 * use the legacy verbatim-facts view since their sections carry different
 * keys, same as before).
 *
 * KEPT, RELOCATED: the theme-brief "Cluster synthesis" card and
 * ItemConnectionsCard (rail, matching the artboard's CONNECTIONS + CLUSTER
 * SYNTHESIS cards), related-findings (closing section), RecordGradeBadge,
 * WatchButton/Export/Share actions, source-tier legend (folded into the
 * shared RailLegend + the Sources section's own tier chips).
 */

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { GfmSection } from "@/components/shared/GfmSection";
import { SectionCard } from "@/components/ui/SectionCard";
import { WatchButton } from "@/components/ui/WatchButton";
import { ActionRow, shareResource, downloadMarkdownBrief } from "@/components/ui/ActionRow";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { renderRequirementTrajectory } from "@/components/detail/RequirementTrajectory";
import { TagChip } from "@/components/ui/Chips";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import { FactCard } from "@/components/ui/FactCard";
import { DetailTagRow } from "@/components/ui/DetailTagRow";
import {
  DetailHeader,
  DetailMasthead,
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
  DetailRail,
  type SectionIndexEntry,
} from "@/components/detail/DetailShell";
import { FactBlocks } from "@/components/detail/FactBlocks";
import { sourceEntriesOf, SourcesGrid } from "@/components/detail/SourcesGrid";
import {
  parseRecordSections,
  splitKeyDateFacts,
  type RecordFactRow,
  type ClaimTierMap,
} from "@/lib/agent/parse-record-sections";
import type { selectThemeBriefForItem } from "@/lib/research/theme-brief.mjs";
import {
  THEME_LABELS,
  SEVERITY_LABELS,
  assignTheme as classifyTheme,
  deriveSeverity as classifySeverity,
} from "@/lib/research/taxonomy.mjs";
import { bandFromPriority } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";

interface RelatedFinding {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  addedDate: string | null;
}

type ThemeBriefView = ReturnType<typeof selectThemeBriefForItem>;

interface Props {
  resource: Resource;
  related: RelatedFinding[];
  relatedReason: "theme" | "source" | "none";
  sections?: IntelligenceItemSectionRow[];
  claimTiers?: ClaimTierMap;
  supersessions?: Supersession[];
  connections?: ItemConnection[];
  relevance?: ItemRelevance | null;
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  themeBrief?: ThemeBriefView;
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}

const RESEARCH_SECTION_HEADINGS: Record<string, string> = {
  "1": "What the research found",
  "2": "Why it matters operationally",
  "3": "Strategy & claims",
  "4": "Talking points",
  "5": "What does not resolve",
  "6": "Sources",
};
const KNOWN_RESEARCH_KEYS = new Set(["1", "2", "3", "4", "5", "6"]);

/** "research_finding" -> "Research finding" — the At a glance "Type" row (artboard 07 shows
 *  "Initiative", never a raw snake_case enum) needs the same humanization the header chip
 *  already applies (r.type.replace(/_/g, " ")), just capitalized for a standalone label. */
function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function assignTheme(r: Resource) {
  const text = `${r.title} ${r.note || ""} ${r.whyMatters || ""}`;
  return classifyTheme(text, r.theme);
}
function deriveSeverity(r: Resource) {
  const text = `${r.title} ${r.note || ""}`;
  return classifySeverity(text, r.added, r.severity);
}

export function ResearchFindingDetailSurface({
  resource: r,
  related,
  relatedReason,
  sections = [],
  claimTiers,
  supersessions = [],
  connections = [],
  resourceLookup = {},
  themeBrief = null,
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: Props) {
  const band = bandFromPriority(r.priority);
  const impact = r.impactScores ?? scoreResource(r);
  const severity = useMemo(() => deriveSeverity(r), [r]);
  const themeKey = useMemo(() => assignTheme(r), [r]);
  const isRecord = r.itemGrade === "record";

  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction]
      : ["Global"];
  const jurisLabel = jurisdictionLabels.join(" · ");

  const meta = [
    ["Research", themeKey ? THEME_LABELS[themeKey as keyof typeof THEME_LABELS] : null].filter(Boolean).join(" · "),
    r.added ? `published ${formatDate(r.added)}` : null,
    themeKey ? `theme: ${THEME_LABELS[themeKey as keyof typeof THEME_LABELS]}` : null,
  ].filter(Boolean).join(" · ");

  const knownSections = useMemo(
    () => sections.filter((s) => KNOWN_RESEARCH_KEYS.has(s.section_key) && (s.content_md || "").trim()),
    [sections]
  );
  const sourceRows = useMemo(() => sourceEntriesOf(r), [r]);
  const [depth, setDepth] = useState<SummaryDepth>("summary");
  const [tagOpen, setTagOpen] = useState(false);

  const indexEntries: SectionIndexEntry[] = isRecord
    ? [{ id: "summary", label: "Summary" }, { id: "sources", label: "Sources" }]
    : [
        ...knownSections.map((s) => ({ id: `sec-${s.section_key}`, label: RESEARCH_SECTION_HEADINGS[s.section_key] })),
        ...(knownSections.length === 0 ? [{ id: "summary", label: "Summary" }] : []),
        { id: "sources", label: "Sources" },
      ];

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--ink)", paddingTop: 16 }}>
      <DetailPageWrapper>
        <DetailMasthead
          title={r.title}
          band={band}
          surface="Research"
          jurisdiction={jurisLabel}
          dek={meta}
          placeholder="Ask about this finding — e.g. when does the largest deadline hit"
        />
        <DetailHeader
          band={band}
          tier={typeof r.sourceTier === "number" ? r.sourceTier : null}
          title={r.title}
          tagRow={<DetailTagRow itemId={String(r.id)} open={tagOpen} onOpenChange={setTagOpen} />}
          extraChips={
            <>
              <TagChip>Finding</TagChip>
              {r.type && <TagChip>{r.type.replace(/_/g, " ")}</TagChip>}
              {themeKey && <TagChip>{THEME_LABELS[themeKey as keyof typeof THEME_LABELS]}</TagChip>}
              {/* Artboard 07 (dc.html #p7): "All modes" chip when a finding is not mode-scoped —
                  matches the operations detail's own modes chip (OperationsDetailSurface.tsx) for
                  the case where modes IS restricted; a finding with no modes on record applies
                  broadly, so "All modes" is the honest label rather than omitting the chip. */}
              {r.modes && r.modes.length > 0 ? (
                r.modes.slice(0, 2).map((m) => <TagChip key={m}>{m.toUpperCase()}</TagChip>)
              ) : (
                <TagChip>All modes</TagChip>
              )}
            </>
          }
          headerStat={
            sourceRows.length > 0
              ? `${sourceRows.length} source${sourceRows.length === 1 ? "" : "s"}${
                  connections.length > 0 ? ` · ${connections.length} connections` : ""
                }`
              : null
          }
          actions={
            <ActionRow
              onExport={() =>
                downloadMarkdownBrief(r, {
                  filenamePrefix: "research",
                  metaRows: [
                    r.jurisdiction ? `- Jurisdiction: ${r.jurisdiction}` : null,
                    r.type ? `- Type: ${r.type}` : null,
                    r.url ? `- Source: ${r.url}` : null,
                  ],
                })
              }
              onShare={() => shareResource(r)}
              onTag={() => setTagOpen((v) => !v)}
              exportDisabled={!(r.fullBrief || r.url)}
              watch={
                <WatchButton
                  itemType="research"
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
            { label: "Where", value: jurisLabel },
            { label: "Who pays", value: r.costMechanism || <Absence reason="not in primary source" /> },
            { label: "Your lanes", value: <span style={{ color: "var(--ink-3)" }}>Connect shipment data</span> },
            {
              label: "Trajectory",
              value: renderRequirementTrajectory(r.requirementTrajectory) || r.conversionTrigger || <Absence reason="pending" />,
            },
          ]}
        />

        <DetailTimeline entries={r.timeline} band={band} />

        <SectionIndex sections={indexEntries} trailing={<SummaryDepthSwitch depth={depth} onChange={setDepth} />} />

        <DetailLayout
          rail={
            <DetailRail
              atAGlance={
                <AtAGlanceCard
                  rows={[
                    { label: "Band", value: `${band.label} · ${band.window}` },
                    { label: "Type", value: r.type ? capitalize(r.type.replace(/_/g, " ")) : null },
                    { label: "Theme", value: themeKey ? THEME_LABELS[themeKey as keyof typeof THEME_LABELS] : null },
                    { label: "Jurisdiction", value: jurisLabel },
                    { label: "Source", value: r.sourceName && typeof r.sourceTier === "number" ? `${r.sourceName} · T${r.sourceTier}` : r.sourceName },
                    { label: "Published", value: r.added ? formatDate(r.added) : null },
                  ]}
                />
              }
              impact={<ImpactRailCard scores={impact} />}
              relevance={<RelevanceBadgeClient itemId={r.id} />}
              /* Artboard 07's page-specific cards, in its own order:
                 CONNECTIONS · 24, then CLUSTER SYNTHESIS. */
              designed={
                <>
                  <ItemConnectionsCard connections={connections} supersessions={supersessions} selfId={r.id} resourceLookup={resourceLookup} />
                  {themeBrief && <ThemeBriefCard brief={themeBrief} />}
                </>
              }
              legend={<RailLegend />}
              /* R7 — artboard 07 draws no place-keeping card. */
              undesigned={<InThisListStat backHref="/research" backLabel="Back to list" band={band} />}
            />
          }
        >
          {isRecord ? (
            <DetailSection id="summary" title="Summary">
              <ResearchRecordFacts sections={sections} tags={r.tags} claimTiers={claimTiers} />
              {depth === "full" && r.fullBrief && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-3)" }}>
                  <GfmSection markdown={r.fullBrief} />
                </div>
              )}
            </DetailSection>
          ) : knownSections.length > 0 ? (
            knownSections.map((s) => (
              <DetailSection key={s.section_key} id={`sec-${s.section_key}`} title={RESEARCH_SECTION_HEADINGS[s.section_key]}>
                <FactBlocks markdown={s.content_md} />
              </DetailSection>
            ))
          ) : (
            <DetailSection id="summary" title="Summary">
              {r.whatIsIt || r.note || r.whyMatters ? (
                <p style={{ fontSize: "var(--fs-14)", lineHeight: 1.7, margin: 0, maxWidth: "72ch", color: "var(--ink)" }}>
                  {r.whatIsIt || r.note || r.whyMatters}
                </p>
              ) : (
                <StateNote>Detailed sections pending for this finding; brief generation in progress.</StateNote>
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

          {related.length > 0 && (
            <DetailSection id="related" title="Related findings" aside={relatedReason === "theme" ? "same theme" : relatedReason === "source" ? "same source" : undefined}>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {related.map((it) => (
                  <Link
                    key={it.id}
                    href={`/research/${encodeURIComponent(it.id)}`}
                    style={{ display: "block", padding: "10px 0", borderBottom: "1px solid var(--line-3)", textDecoration: "none", color: "inherit", minHeight: 44 }}
                  >
                    <p style={{ fontSize: "var(--fs-125)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>{it.title}</p>
                    {it.summary && (
                      <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "3px 0 0", lineHeight: 1.5 }}>
                        {it.summary.length > 180 ? `${it.summary.slice(0, 177)}…` : it.summary}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </DetailSection>
          )}
        </DetailLayout>
      </DetailPageWrapper>
    </div>
  );
}

// ── Record-grade facts (mirrors RegulationDetailSurface's) ───────────────
function ResearchRecordFacts({ sections, tags, claimTiers }: { sections: IntelligenceItemSectionRow[]; tags: string[]; claimTiers?: ClaimTierMap }) {
  const parsed = useMemo(() => parseRecordSections(sections, claimTiers), [sections, claimTiers]);
  const { dateFacts, otherFacts } = useMemo(
    () => (parsed ? splitKeyDateFacts(parsed.facts) : { dateFacts: [] as RecordFactRow[], otherFacts: [] as RecordFactRow[] }),
    [parsed]
  );
  return (
    <>
      <StateNote>This finding was captured directly from its source document rather than synthesized into a research summary. Every fact below is quoted verbatim.</StateNote>
      {dateFacts.length > 0 && (
        <div style={{ margin: "14px 0" }}>
          <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>Key dates</p>
          {dateFacts.map((f) => <RecordFactCard key={f.slotKey} fact={f} />)}
        </div>
      )}
      <div style={{ margin: "14px 0" }}>
        <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>Verbatim facts</p>
        {otherFacts.length > 0 ? otherFacts.map((f) => <RecordFactCard key={f.slotKey} fact={f} />) : <Absence reason="not in primary source" />}
      </div>
      {tags && tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {tags.map((t) => <TagChip key={t}>{t}</TagChip>)}
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

// ── Rail: Cluster synthesis (WO-25, flywheel U6 surfacing) ───────────────
// Kept verbatim in behavior from the prior architecture (see this file's
// header): renders a pre-generated theme_briefs row for the graph-derived
// cluster this item belongs to. No LLM call, no generation, ever, from
// this component.
// CLUSTER SYNTHESIS — artboard 07's page-specific rail card (dc.html #p7, char 402759).
//
// Rebuilt to the artboard's own measures, lane details60 (2026-09-08). The
// artboard draws exactly three things: the 3px dark-grey section rule cap over
// padding 12px 16px 14px; a head row ("Cluster synthesis", 10.5px/.12em/700/
// #7A6E6C); the theme title at 12.5px/600/1.4; and one 11px #7A6E6C meta line
// 6px below it reading "85 items · density 0.180 · STALE · MEMBERSHIP CHANGED",
// whose staleness clause is small-caps (10.5px/.08em/uppercase/700) INLINE in
// that line, not a badge in the head.
//
// Deleted with the rewrite: the STALE pill in the head, the italic "Synthesis
// across N items" sentence, and the scrolling `brief_md` body — none is drawn
// on artboard 07, and the rail is 300px wide, so the full brief was a
// 220px-tall scroller in a card the design gives three lines. The brief text
// itself is not lost to the reader: it is the theme's own content, reachable
// from the theme, and this card is the rail's pointer to it.
//
// `density` is the cluster's intra-theme edge density (src/lib/connections/
// cluster.mjs F3, stored on connection_themes.density). Absent (an older theme
// row, or a read that did not select it) the segment is omitted rather than
// rendered as 0 — Absence-by-omission, the same convention AtAGlanceCard uses.
function ThemeBriefCard({ brief }: { brief: ThemeBriefView }) {
  if (!brief) return null;
  return (
    <SectionCard>
      <div style={{ padding: "12px 16px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}>
            Cluster synthesis
          </span>
        </div>
        <div style={{ fontSize: "var(--fs-125)", fontWeight: 600, lineHeight: 1.4, color: "var(--ink)" }}>{brief.title}</div>
        <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", marginTop: 6 }}>
          {brief.memberCount} item{brief.memberCount === 1 ? "" : "s"}
          {typeof brief.density === "number" ? ` · density ${brief.density.toFixed(3)}` : ""}
          {brief.stale && (
            <>
              {" · "}
              <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}>
                stale · membership changed
              </span>
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

