"use client";

/**
 * MarketSignalDetailSurface — client subcomponent for `/market/[slug]`.
 *
 * UI SYSTEM HANDOFF (lane uidetails2, 2026-09-07, docs/design/handoff-2026-09-06,
 * README §0.5 + 05-market-detail.png): rebuilt onto the ONE detail
 * architecture shared by all four detail surfaces (DetailShell.tsx) —
 * "identical architecture to the regulation detail" (the artboard's own
 * subtitle): header (band pill + tier + title + meta) -> exposure grid ->
 * full timeline -> sticky section index -> sections of FactCards at <=72ch
 * -> rail.
 *
 * REMOVED this lane (README §0.5): the six-tab strip (What's moving /
 * Drivers & trajectory / Cost impact / Client talking points / Do now /
 * Sources) and the per-tab AiPromptBar. Their content is redistributed
 * into six always-visible, index-anchored sections (S1-S6, matching the
 * artboard) below, in the SAME order the tab strip used.
 *
 * KEPT, RELOCATED (never deleted — dispatch instruction): PriceBoard (into
 * S1 Summary), TrajectoryBars + the WO-24 carbon-cost overlay + the DP-SURF
 * per-unit carbon-intensity figure (into S2 Drivers & trajectory), the
 * recommended-actions "Do now" list (S4), the record-grade facts card
 * (S1, when itemGrade==='record'), the persistent workspace Notes field
 * (rail, matching the artboard's "YOUR NOTES" rail card), AffectedLanesCard
 * and ItemConnectionsCard + RelevanceBadgeClient (rail — not drawn on this
 * artboard specifically but part of the one shared rail set every detail
 * surface carries; logged in DEVIATION-LOG.md), and related-signals (kept
 * as a closing section rather than dropped).
 *
 * Every "FACT: ... *Source: ...*" / "*Analytical inference:* ..." /
 * "*Legal Confirmation Required:* ..." paragraph this item's
 * intelligence_item_sections rows carry now renders as a FactCard
 * (src/components/detail/FactBlocks.tsx re-parses content_md at render
 * time — the pipeline's own output is unchanged).
 *
 * DO-NOT-REVERT invariants preserved: tier CLAMP 1-7, structured sources
 * (never a raw dump, the #172 pattern — via the shared SourcesGrid), honest
 * empty states (Absence / StateNote, never a fabricated value), epistemic
 * chips bind REAL fields only, the live price feed is never faked, and
 * corroboration counts come exclusively from sources.independent_citers.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import Link from "next/link";
import { formatMonthDay, formatShortDate } from "@/components/regulations/format-fixed-date";
import { WatchButton } from "@/components/ui/WatchButton";
import { ActionRow, shareResource, downloadMarkdownBrief } from "@/components/ui/ActionRow";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { TagChip } from "@/components/ui/Chips";
import { FactCard } from "@/components/ui/FactCard";
import { useResourceStore } from "@/stores/resourceStore";
import { TrajectoryBars } from "@/components/market/TrajectoryBars";
import { buildCarbonOverlayView } from "@/lib/market/carbon-overlay-view.mjs";
import { derivePromotionState } from "@/lib/market/signal-promotion.mjs";
import { selectModalFactor } from "@/lib/market/select-modal-factor.mjs";
import { carbonIntensity } from "@/lib/market/carbon-intensity.mjs";
import { lifecycleFromFactorOriginClass, confidenceFromPedigree } from "@/lib/propagation/methods/carbon-intensity.ts";
import { DerivedFigure } from "@/components/figures/EstimatedFigure";
import type { Value } from "@/lib/propagation/types.ts";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { AffectedLanesCard } from "@/components/regulations/AffectedLanesCard";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
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
import { GfmSection } from "@/components/shared/GfmSection";
import { FactBlocks } from "@/components/detail/FactBlocks";
import { sourceEntriesOf, SourcesGrid } from "@/components/detail/SourcesGrid";
import {
  parseRecordSections,
  splitKeyDateFacts,
  type RecordFactRow,
  type ClaimTierMap,
} from "@/lib/agent/parse-record-sections";
import { bandFromPriority } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { ItemRelevance } from "@/lib/workspace/profile";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";

// ── Carbon overlay (WO-24) — emission_factors modal_default rows ─────────
export interface EmissionFactorRow {
  factor_id: string;
  mode: string;
  vehicle_class: string | null;
  jurisdiction: string | null;
  quantity_basis: string;
  ttw_co2e: number | null;
  wtt_co2e: number | null;
  wtw_co2e: number | null;
  source_key: string;
  tier: string;
  scope_kind: string;
}

// ── Price-board record (migration 151 backing store) ─────────────────────
export interface PriceStat {
  label: string;
  valueDisplay: string;
  unit?: string | null;
  contextLine?: string | null;
  severityTone?: string | null;
  sourceTier?: number | null;
  releasedAt?: string | null;
  nextReleaseAt?: string | null;
  nextReleaseLabel?: string | null;
}

interface Props {
  resource: Resource;
  relatedPool: Resource[];
  sections?: IntelligenceItemSectionRow[];
  claimTiers?: ClaimTierMap;
  convergence?: { independent_citers: number; confirmation_count: number } | null;
  priceBoard?: PriceStat[];
  carbonFactors?: EmissionFactorRow[];
  groupLabel?: string;
  deck?: string;
  initialNote?: string;
  supersessions?: Supersession[];
  connections?: ItemConnection[];
  relevance?: ItemRelevance | null;
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}

// ── Severity vocabulary (5-label, mirrors MarketPage) ─────────────────────
type Severity = "action" | "cost" | "window" | "edge" | "monitor";

const SEVERITY_LABEL: Record<Severity, string> = {
  action: "Action required",
  cost: "Cost alert",
  window: "Window closing",
  edge: "Competitive edge",
  monitor: "Monitoring",
};

const SEVERITY_COLUMN_TO_KEY: Record<string, Severity> = {
  action_required: "action",
  cost_alert: "cost",
  window_closing: "window",
  competitive_edge: "edge",
  monitoring: "monitor",
};

const SEVERITY_KEYWORDS: Record<Severity, RegExp[]> = {
  action: [/\baction required\b/i, /\bimmediate\b/i, /\bdeadline\b/i, /\bmust file\b/i],
  cost: [/\b(cost|surcharge|pass[- ]?through|margin|price.*(rise|up|breach))\b/i, /\bcost alert\b/i],
  window: [/\b(window|deadline|by 20|q\d \d{4}|enforcement|consultation)\b/i],
  edge: [/\b(competitive|edge|advantage|lock(ed)?|offtake|partnership)\b/i],
  monitor: [/\b(monitor|tracking|watch|observe)\b/i],
};

function deriveSeverity(r: Resource): Severity {
  if (r.severity && SEVERITY_COLUMN_TO_KEY[r.severity]) return SEVERITY_COLUMN_TO_KEY[r.severity];
  const text = `${r.title} ${r.note || ""}`;
  const order: Severity[] = ["action", "cost", "window", "edge", "monitor"];
  for (const sev of order) for (const re of SEVERITY_KEYWORDS[sev]) if (re.test(text)) return sev;
  if (r.priority === "CRITICAL") return "action";
  if (r.priority === "HIGH") return "cost";
  if (r.priority === "MODERATE") return "window";
  return "monitor";
}

type BandKey = "price" | "corporate" | "corridor";
const BAND_LABEL: Record<BandKey, string> = {
  price: "Price signals",
  corporate: "Corporate & capital",
  corridor: "Corridors & routes",
};
const BAND_NUM: Record<BandKey, number> = { price: 1, corporate: 2, corridor: 3 };
const BAND_KEYWORDS: Record<BandKey, RegExp[]> = {
  price: [
    /\b(price|spot|futures|tariff|surcharge|fuel|saf|eua|carbon|crude|jet a-?1|diesel)\b/i,
    /eur ?\d|usd ?\d|gbp ?\d|aed ?\d/i,
    /\/t\b|\/kwh|\/teu|\/l\b/i,
  ],
  corporate: [/\b(announces|raises|acquires|merger|partner|deploy|capacity|fleet|order|supplier|offtake|m&a)\b/i],
  corridor: [
    /\b(corridor|route|chokepoint|port|hormuz|suez|canal|cape|drayage|lane)\b/i,
    /\b(eu ?[→\-→]? ?(us|asia)|us ?[→\-→]? ?(eu|asia))\b/i,
  ],
};

function assignBand(r: Resource): BandKey {
  if (r.signalBand === "price" || r.signalBand === "corporate" || r.signalBand === "corridor") return r.signalBand;
  const text = `${r.title} ${r.note || ""}`;
  const order: BandKey[] = ["price", "corporate", "corridor"];
  for (const band of order) for (const re of BAND_KEYWORDS[band]) if (re.test(text)) return band;
  return "corporate";
}

// ── Component ──────────────────────────────────────────────────────────
export function MarketSignalDetailSurface({
  resource: r,
  relatedPool,
  sections = [],
  claimTiers,
  convergence = null,
  priceBoard = [],
  carbonFactors = [],
  groupLabel,
  deck,
  initialNote = "",
  supersessions = [],
  connections = [],
  resourceLookup = {},
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: Props) {
  const band = bandFromPriority(r.priority);
  const impact = r.impactScores ?? scoreResource(r);
  const severity = useMemo(() => deriveSeverity(r), [r]);
  const signalBand = useMemo(() => assignBand(r), [r]);

  const sectionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of sections) {
      const md = (row.content_md || "").trim();
      if (md) map[row.section_key] = md;
    }
    return map;
  }, [sections]);

  const independentCiters =
    convergence && convergence.independent_citers > 0 ? convergence.independent_citers : null;

  const originClass = r.originClass ?? null;
  const promotion = useMemo(
    () => derivePromotionState({ originClass, independentCiters }),
    [originClass, independentCiters]
  );

  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction]
      : ["Global"];
  const jurisLabel = jurisdictionLabels.join(" · ");
  const crumbGroup = groupLabel || `B${BAND_NUM[signalBand]} · ${BAND_LABEL[signalBand]} · ${jurisLabel}`;
  const meta = [crumbGroup, deck, independentCiters !== null ? `${independentCiters} independent source${independentCiters === 1 ? "" : "s"} corroborate` : null]
    .filter(Boolean)
    .join(" · ");

  const isRecord = r.itemGrade === "record";

  const related = useMemo(
    () =>
      relatedPool
        .filter((x) => x.id !== r.id)
        .map((x) => ({ item: x, band: assignBand(x), severity: deriveSeverity(x) }))
        .filter((x) => x.band === signalBand)
        .slice(0, 4),
    [relatedPool, r.id, signalBand]
  );

  const sourceRows = useMemo(() => sourceEntriesOf(r), [r]);

  const hasTrajectory = signalBand === "price" && (r.trajectoryPoints?.points?.length ?? 0) > 0;
  const hasCarbonOverlay = signalBand === "corridor";
  const carbonOverlay = hasCarbonOverlay
    ? buildCarbonOverlayView({ jurisdictionIso: r.jurisdictionIso ?? [], factors: carbonFactors })
    : null;
  const modalFactor = hasCarbonOverlay ? selectModalFactor({ jurisdictionIso: r.jurisdictionIso ?? [], factors: carbonFactors }) : null;
  const intensity = modalFactor && modalFactor.state === "resolved" ? carbonIntensity(modalFactor.factor) : null;
  const intensityFigure: Value | null =
    intensity && intensity.ok
      ? {
          valueId: `preview:${intensity.factorId ?? "unknown"}`,
          entityId: null,
          methodId: "carbon_intensity_tkm",
          methodVersion: "1.0.0",
          value: intensity.valueGPerUnit,
          valueLow: null,
          valueHigh: null,
          unit: intensity.unit,
          currency: null,
          derivation: "calculated",
          originClass: "derived",
          lifecycle: lifecycleFromFactorOriginClass(undefined),
          admissibility: "calculation_ok",
          baseConfidence: confidenceFromPedigree(undefined),
          // clock-ok: envelope METADATA on a client-preview figure object, never rendered as
          // text — `assertedAt`/`computedAt` have no render site in this file or in the figure
          // components it feeds (grep, 2026-09-07), so neither value can produce mismatched DOM.
          assertedAt: new Date().toISOString(),
          halfLifeDays: null,
          inputs: [{ table: "emission_factors", pk: intensity.factorId ?? "" }],
          supersedes: null,
          // clock-ok: same as assertedAt above — metadata, not rendered text.
          computedAt: new Date().toISOString(),
          computedBy: "client-preview",
        }
      : null;

  const hasDrivers = !!(sectionMap["2"] || sectionMap["3"] || sectionMap["5"] || hasTrajectory || hasCarbonOverlay || r.conversionTrigger);
  const actions = [...(r.recommendedActions || [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const [depth, setDepth] = useState<SummaryDepth>("summary");
  const [tagOpen, setTagOpen] = useState(false);

  const indexEntries: SectionIndexEntry[] = [
    { id: "summary", label: "Summary" },
    { id: "drivers", label: "Drivers & trajectory" },
    { id: "cost", label: "Cost impact" },
    { id: "donow", label: "Do now" },
    { id: "talking", label: "Talking points" },
    { id: "sources", label: "Sources" },
  ];

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--ink)", paddingTop: 16 }}>
      <DetailPageWrapper>
        <DetailMasthead
          title={r.title}
          band={band}
          surface="Market"
          jurisdiction={jurisLabel}
          dek={meta}
          placeholder="Ask about this signal — e.g. when does the largest deadline hit"
        />
        <DetailHeader
          band={band}
          tier={typeof r.sourceTier === "number" ? r.sourceTier : null}
          title={r.title}
          tagRow={<DetailTagRow itemId={String(r.id)} open={tagOpen} onOpenChange={setTagOpen} />}
          extraChips={
            <>
              <TagChip>Signal</TagChip>
              <TagChip>{SEVERITY_LABEL[severity]}</TagChip>
              {r.topic && <TagChip>{r.topic}</TagChip>}
              <TagChip>B{BAND_NUM[signalBand]} · {BAND_LABEL[signalBand]}</TagChip>
            </>
          }
          headerStat={
            sourceRows.length > 0
              ? `${sourceRows.length} source${sourceRows.length === 1 ? "" : "s"}${
                  independentCiters !== null ? ` · ${independentCiters} corroborating` : ""
                }`
              : null
          }
          actions={
            <ActionRow
              onExport={() =>
                downloadMarkdownBrief(r, {
                  filenamePrefix: "signal",
                  metaRows: [
                    r.jurisdiction ? `- Jurisdiction: ${r.jurisdiction}` : null,
                    r.severity ? `- Severity: ${r.severity}` : null,
                    r.signalBand ? `- Signal band: ${r.signalBand}` : null,
                    r.url ? `- Source: ${r.url}` : null,
                  ],
                })
              }
              onShare={() => shareResource(r)}
              onTag={() => setTagOpen((v) => !v)}
              exportDisabled={!(r.fullBrief || r.url)}
              watch={
                <WatchButton
                  itemType="signal"
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
            {
              label: "Your lanes",
              value: <span style={{ color: "var(--ink-3)" }}>Connect shipment data</span>,
            },
            {
              label: "Trajectory",
              value: r.conversionTrigger || (priceBoard[0]?.contextLine ?? <Absence reason="pending" />),
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
                    { label: "Kind", value: SEVERITY_LABEL[severity] },
                    { label: "Corporate band", value: `B${BAND_NUM[signalBand]} · ${BAND_LABEL[signalBand]}` },
                    { label: "Jurisdiction", value: jurisLabel },
                    { label: "Topic", value: r.topic },
                    { label: "Status", value: promotion.label },
                    { label: "Published", value: r.added ? fullDate(r.added) : null },
                    { label: "Next release", value: priceBoard.find((p) => p.nextReleaseAt)?.nextReleaseAt ? shortDate(priceBoard.find((p) => p.nextReleaseAt)!.nextReleaseAt!) : null },
                  ]}
                />
              }
              impact={<ImpactRailCard scores={impact} />}
              relevance={<RelevanceBadgeClient itemId={r.id} />}
              /* Artboard 05's page-specific cards, in its own order:
                 YOUR NOTES, then IN THIS LIST. */
              designed={
                <>
                  <NotesField itemId={r.id} initialNote={initialNote} />
                  <InThisListStat backHref="/market" backLabel="Back to list" band={band} />
                </>
              }
              legend={<RailLegend />}
              /* R7 — artboard 05 draws neither. */
              undesigned={
                <>
                  <AffectedLanesCard resource={r} />
                  <ItemConnectionsCard connections={connections} supersessions={supersessions} selfId={r.id} resourceLookup={resourceLookup} />
                </>
              }
            />
          }
        >
          <DetailSection id="summary" title="Summary" aside="Generated · 30-second read">
            {isRecord ? (
              <RecordGradeSections r={r} sections={sections} claimTiers={claimTiers} />
            ) : (
              <>
                <PriceBoard stats={priceBoard} />
                {sectionMap["1"] ? (
                  <FactBlocks markdown={sectionMap["1"]} />
                ) : (
                  <StateNote>Movement analysis pending — the signal brief for {r.title} has not been generated yet.</StateNote>
                )}
              </>
            )}
            {depth === "full" && r.fullBrief && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-3)" }}>
                <GfmSection markdown={r.fullBrief} />
              </div>
            )}
          </DetailSection>

          {!isRecord && (
            <DetailSection id="drivers" title="Drivers & trajectory" aside="4 forces · compounding">
              {sectionMap["2"] && <FactBlocks markdown={sectionMap["2"]} />}
              {sectionMap["3"] && <FactBlocks markdown={sectionMap["3"]} />}
              {r.conversionTrigger && (
                <div style={{ marginBottom: 14, padding: "12px 14px", background: "var(--card)", border: "1px solid var(--line-1)", borderLeft: "3px solid var(--action)", borderRadius: "var(--radius-control)" }}>
                  <p style={{ fontSize: "var(--fs-10)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--action)", margin: "0 0 4px" }}>
                    Conversion trigger
                  </p>
                  <p style={{ fontSize: "var(--fs-13)", lineHeight: 1.6, color: "var(--ink)", margin: 0 }}>{r.conversionTrigger}</p>
                </div>
              )}
              {hasTrajectory && r.trajectoryPoints && <TrajectoryBars trajectoryPoints={r.trajectoryPoints} />}
              {hasCarbonOverlay && carbonOverlay && (
                <div style={{ marginTop: 8 }}>
                  {carbonOverlay.state === "resolved" && carbonOverlay.figure ? (
                    <>
                      <p style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, color: "var(--ink)", margin: "0 0 4px" }}>
                        {carbonOverlay.figure.value}
                        <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--ink-2)" }}> {carbonOverlay.figure.unit}</span>
                      </p>
                      <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "0 0 6px" }}>National modal default · not corridor-specific</p>
                      <p style={{ fontSize: "var(--fs-12)", lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>{carbonOverlay.body}</p>
                    </>
                  ) : (
                    <StateNote>{carbonOverlay.body}</StateNote>
                  )}
                </div>
              )}
              {hasCarbonOverlay && intensityFigure && (
                <div style={{ marginTop: 12 }}>
                  <DerivedFigure figure={intensityFigure} label="Carbon intensity" sourceNote="Same factor row as the carbon cost overlay above, converted per unit rather than per shipment." use="display" />
                </div>
              )}
              {sectionMap["5"] && <FactBlocks markdown={sectionMap["5"]} />}
              {!hasDrivers && <StateNote>Drivers and trajectory pending — appears once the signal brief is generated.</StateNote>}
            </DetailSection>
          )}

          {!isRecord && (
            <DetailSection id="cost" title="Cost impact by mode" aside="Air · Ocean · Road">
              {sectionMap["4"] ? (
                <FactBlocks markdown={sectionMap["4"]} />
              ) : (
                <StateNote>Operational and cost implications by mode appear here once the signal brief is generated.</StateNote>
              )}
            </DetailSection>
          )}

          {!isRecord && (
            <DetailSection id="donow" title="Do now" aside={actions.length > 0 ? `${actions.length} steps` : undefined}>
              {actions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {actions.map((a, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, padding: "10px 0", borderBottom: i === actions.length - 1 ? "none" : "1px solid var(--line-3)" }}>
                      <span style={{ fontSize: "var(--fs-10)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                        {a.timeframe || `Step ${i + 1}`}
                      </span>
                      <div>
                        <p style={{ fontSize: "var(--fs-13)", fontWeight: 700, margin: 0, color: "var(--ink)" }}>{a.action}</p>
                        {a.owner && <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "2px 0 0" }}>{a.owner}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : sectionMap["7"] ? (
                <FactBlocks markdown={sectionMap["7"]} />
              ) : (
                <StateNote>The actions the workspace should take appear here once the signal brief is generated.</StateNote>
              )}
            </DetailSection>
          )}

          {!isRecord && (
            <DetailSection id="talking" title="Client talking points">
              {sectionMap["6"] ? (
                <FactBlocks markdown={sectionMap["6"]} />
              ) : (
                <StateNote>What the workspace can credibly say appears here once the signal brief is generated.</StateNote>
              )}
            </DetailSection>
          )}

          <DetailSection id="sources" title="Sources" aside={sourceRows.length > 0 ? `${sourceRows.length} · tier = provenance, never urgency` : undefined}>
            {sourceRows.length > 0 ? <SourcesGrid rows={sourceRows} /> : <Absence reason="not in primary source" />}
          </DetailSection>

          {related.length > 0 && (
            <DetailSection id="related" title={`Connected · related ${BAND_LABEL[signalBand].toLowerCase()}`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {related.map((rel) => (
                  <Link
                    key={rel.item.id}
                    href={`/market/${encodeURIComponent(rel.item.id)}`}
                    prefetch={false}
                    style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line-3)", textDecoration: "none", color: "inherit", minHeight: 44, alignItems: "center" }}
                  >
                    <span style={{ fontSize: "var(--fs-125)", fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rel.item.title}</span>
                    <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{SEVERITY_LABEL[rel.severity]}</span>
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

// ── Price board ─────────────────────────────────────────────────────────
function PriceBoard({ stats }: { stats: PriceStat[] }) {
  if (stats.length === 0) {
    return (
      <div style={{ marginBottom: 14 }}>
        <StateNote>
          The price board shows published government statistics, not live ticks. These slots populate
          when the commodity-price feed is connected — until then no figure is shown rather than an
          unsourced one.
        </StateNote>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ border: "1px solid var(--line-1)", borderRadius: "var(--radius-control)", padding: "10px 14px", background: "var(--page)" }}>
          <p style={{ fontSize: "var(--fs-95)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 4px" }}>{s.label}</p>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1, color: "var(--ink)", margin: 0 }}>
            {s.valueDisplay}
            {s.unit && <span style={{ fontSize: "var(--fs-13)" }}> {s.unit}</span>}
          </p>
          {s.contextLine && <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-2)", margin: "4px 0 0" }}>{s.contextLine}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Record-grade sections (mirrors RegulationDetailSurface's) ────────────
function RecordGradeSections({ r, sections, claimTiers }: { r: Resource; sections: IntelligenceItemSectionRow[]; claimTiers?: ClaimTierMap }) {
  const parsed = useMemo(() => parseRecordSections(sections, claimTiers), [sections, claimTiers]);
  const { dateFacts, otherFacts } = useMemo(
    () => (parsed ? splitKeyDateFacts(parsed.facts) : { dateFacts: [] as RecordFactRow[], otherFacts: [] as RecordFactRow[] }),
    [parsed]
  );
  return (
    <>
      <StateNote>This item was captured directly from its source document rather than synthesized into a signal brief. Every fact below is quoted verbatim.</StateNote>
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
      {r.tags && r.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {r.tags.map((t) => <TagChip key={t}>{t}</TagChip>)}
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

// ── Persistent notes field (rail — matches artboard "YOUR NOTES") ────────
function NotesField({ itemId, initialNote = "" }: { itemId: string; initialNote?: string }) {
  const override = useResourceStore((s) => s.overrides.get(itemId));
  const [note, setNote] = useState<string>(initialNote);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    initialNote.trim().length > 0 ? "saved" : "idle"
  );
  const appliedOverrideRef = useRef(false);
  useEffect(() => {
    if (appliedOverrideRef.current || !override) return;
    appliedOverrideRef.current = true;
    if (status !== "idle") return;
    const overrideNote = override.notes ?? "";
    if (overrideNote.trim().length > 0) {
      setNote(overrideNote);
      setStatus("saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(note);
  latest.current = note;

  async function save(value: string) {
    setStatus("saving");
    try {
      const resp = await authedFetch("/api/workspace/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ itemId, notes: value }),
      });
      if (!resp.ok) throw new Error(`save failed (${resp.status})`);
      setStatus(latest.current === value ? "saved" : "dirty");
    } catch {
      setStatus("error");
    }
  }
  function queueSave(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), 800);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const statusLabel =
    status === "saving" ? "Saving…" :
    status === "saved" ? "Saved" :
    status === "error" ? "Save failed — edit to retry" :
    status === "dirty" ? "Unsaved…" : "Not saved";

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: 0 }}>
          Your notes <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>· visible to workspace</span>
        </p>
      </div>
      <textarea
        value={note}
        onChange={(e) => { const v = e.target.value; setNote(v); setStatus("dirty"); queueSave(v); }}
        onBlur={() => { if (timer.current) clearTimeout(timer.current); if (status === "dirty" || status === "error") save(latest.current); }}
        placeholder="Which lanes or clients this touches, who's on it, what was decided…"
        style={{
          width: "100%", boxSizing: "border-box", fontFamily: "var(--font-sans)", fontSize: "var(--fs-12)",
          lineHeight: 1.6, padding: "8px 10px", border: "1px solid var(--line-1)", borderRadius: "var(--radius-control)",
          outline: "none", background: "var(--page)", resize: "vertical", minHeight: 60, color: "var(--ink)",
        }}
        suppressHydrationWarning
      />
      <p style={{ fontSize: "var(--fs-10)", color: status === "error" ? "var(--immediate)" : "var(--ink-3)", margin: "6px 0 0" }}>{statusLabel}</p>
    </div>
  );
}

function shortDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return formatMonthDay(dt);
}
function fullDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return formatShortDate(dt);
}
