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

import { useMemo } from "react";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { GfmSection } from "@/components/shared/GfmSection";
import { WatchButton } from "@/components/ui/WatchButton";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { TagChip } from "@/components/ui/Chips";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import { FactCard } from "@/components/ui/FactCard";
import { DetailTagRow } from "@/components/ui/DetailTagRow";
import {
  DetailHeader,
  DetailExposure,
  DetailTimeline,
  SectionIndex,
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
        <DetailHeader
          band={band}
          tier={typeof r.sourceTier === "number" ? r.sourceTier : null}
          title={r.title}
          meta={meta}
          tagRow={<DetailTagRow itemId={String(r.id)} />}
          extraChips={
            <>
              <TagChip>Finding</TagChip>
              {r.type && <TagChip>{r.type.replace(/_/g, " ")}</TagChip>}
              {themeKey && <TagChip>{THEME_LABELS[themeKey as keyof typeof THEME_LABELS]}</TagChip>}
            </>
          }
          actions={
            <>
              {(r.fullBrief || r.url) && (
                <ActionButton primary onClick={() => exportBriefAsMarkdown(r)}>
                  Export brief
                </ActionButton>
              )}
              <ActionButton onClick={() => shareCurrent(r)}>Share</ActionButton>
              <WatchButton
                itemType="research"
                itemId={String(r.id)}
                initialWatched={initialWatched}
                initialTeamWatched={initialTeamWatched}
                initialTeamAvailable={initialTeamAvailable}
              />
            </>
          }
        />

        <DetailExposure
          items={[
            { label: "Where", value: jurisLabel },
            { label: "Who pays", value: r.costMechanism || <Absence reason="not in primary source" /> },
            { label: "Your lanes", value: <span style={{ color: "var(--ink-3)" }}>Connect shipment data</span> },
            { label: "Trajectory", value: r.conversionTrigger || <Absence reason="pending" /> },
          ]}
        />

        <DetailTimeline entries={r.timeline} band={band} />

        <SectionIndex sections={indexEntries} />

        <DetailLayout
          rail={
            <>
              <AtAGlanceCard
                rows={[
                  { label: "Band", value: `${band.label} · ${band.window}` },
                  { label: "Type", value: r.type },
                  { label: "Theme", value: themeKey ? THEME_LABELS[themeKey as keyof typeof THEME_LABELS] : null },
                  { label: "Jurisdiction", value: jurisLabel },
                  { label: "Source", value: r.sourceName && typeof r.sourceTier === "number" ? `${r.sourceName} · T${r.sourceTier}` : r.sourceName },
                  { label: "Published", value: r.added ? formatDate(r.added) : null },
                ]}
              />
              <ImpactRailCard scores={impact} />
              <RelevanceBadgeClient itemId={r.id} />
              <ItemConnectionsCard connections={connections} supersessions={supersessions} selfId={r.id} resourceLookup={resourceLookup} />
              {themeBrief && <ThemeBriefCard brief={themeBrief} />}
              <InThisListStat backHref="/research" backLabel="Back to list" />
              <RailLegend />
            </>
          }
        >
          {isRecord ? (
            <DetailSection id="summary" title="Summary">
              <ResearchRecordFacts sections={sections} tags={r.tags} claimTiers={claimTiers} />
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
function ThemeBriefCard({ brief }: { brief: ThemeBriefView }) {
  if (!brief) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: 0 }}>Cluster synthesis</p>
        {brief.stale && (
          <span title="This theme's membership has changed since the brief below was generated." style={{ fontSize: "var(--fs-10)", fontWeight: 800, padding: "2px 6px", borderRadius: 4, color: "var(--action)", background: "var(--action-tint)", border: "1px solid var(--line-1)" }}>
            STALE
          </span>
        )}
      </div>
      <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", fontStyle: "italic", margin: "0 0 10px", lineHeight: 1.4 }}>
        Synthesis across {brief.memberCount} items in this finding&apos;s connection-graph cluster.
      </p>
      <p style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>{brief.title}</p>
      <div style={{ fontSize: "var(--fs-125)", lineHeight: 1.55, maxHeight: 220, overflowY: "auto" }}>
        <GfmSection markdown={brief.briefMd} />
      </div>
    </div>
  );
}

// ── Action button / handlers ──────────────────────────────────────────
function ActionButton({ children, primary, onClick }: { children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-sans)", fontSize: "var(--fs-115)", fontWeight: primary ? 800 : 700,
        padding: "8px 16px", minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: "var(--radius-control)", border: primary ? "1px solid var(--brand)" : "1px solid var(--line-1)",
        background: primary ? "var(--brand)" : "var(--card)", color: primary ? "#fff" : "var(--ink)", cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function exportBriefAsMarkdown(r: Resource) {
  if (typeof window === "undefined") return;
  const titleLine = `# ${r.title}\n\n`;
  const meta = [
    r.jurisdiction ? `- Jurisdiction: ${r.jurisdiction}` : null,
    r.type ? `- Type: ${r.type}` : null,
    r.url ? `- Source: ${r.url}` : null,
  ].filter(Boolean).join("\n");
  const body = r.fullBrief || [r.whatIsIt, r.whyMatters].filter(Boolean).join("\n\n") || r.note || "(No briefing body recorded.)";
  const md = `${titleLine}${meta ? meta + "\n\n" : ""}${body}\n`;
  const slug = (r.id || "finding").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `research-${slug || "brief"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function shareCurrent(r: Resource) {
  if (typeof window === "undefined") return;
  const href = typeof window.location !== "undefined" ? window.location.href : "";
  const shareData = { title: r.title, text: r.note || r.whatIsIt || r.title, url: href };
  const nav = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    nav.share(shareData).catch(() => copyToClipboard(href));
    return;
  }
  copyToClipboard(href);
}

function copyToClipboard(text: string) {
  if (typeof window === "undefined" || !text) return;
  const nav = window.navigator as Navigator & { clipboard?: { writeText: (s: string) => Promise<void> } };
  if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
    nav.clipboard.writeText(text).catch(() => {});
  }
}
