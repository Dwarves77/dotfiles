"use client";

/**
 * MarketSignalDetailSurface — client subcomponent for `/market/[slug]`.
 *
 * REDESIGN T05 (feat/redesign-t05-signal-detail): rebuilt to the approved mock
 * "Pages - 05 Signal Detail.dc.html" (HANDOFF §6.5), reusing the detail-page
 * archetype the T03 branch established (breadcrumb hero, action row, 3px orange
 * tab underline, meta rail, honest-state pending frames, structured Sources).
 * Exact hex/px are lifted from the mock inline styles into the `C` palette
 * (same values the additive `--cl-*` tokens carry; see DESIGN-DEVIATIONS D1/T05).
 *
 * Structure:
 *   Hero — breadcrumb → title + deck (with real corroboration count) + chips
 *     (severity + dashed Unverified + band) + actions (Export brief / Share /
 *     Watch) → PRICE BOARD (published statistics; honest §4 frame until the live
 *     feed lands, per HANDOFF §7 — NEVER faked) → six-tab strip.
 *   Tabs — What's moving (S1) / Drivers & trajectory (S2·S3·S5 + trajectory) /
 *     Cost impact (S4) / Client talking points (S6) / Do now (recommended
 *     actions | S7) / Sources (structured rows + S8).
 *   Persistent notes field + Connected intelligence (honest pending) on every tab.
 *   Rail — Signal / Next data drops / Owner & team (honest pending).
 *
 * DO-NOT-REVERT invariants preserved: tier CLAMP 1-7; structured Sources (the
 * #172 stripSources pattern, never a raw dump); honest empty states; epistemic
 * chips bind REAL fields only (severity derived; dashed "Unverified" bound to
 * the signal item_type by design; band derived; tier chips clamped); corroboration
 * count comes exclusively from sources.independent_citers — never a proxy;
 * no chip is rendered without its backing field; the live price feed is never faked.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { formatMonthDay, formatShortDate } from "@/components/regulations/format-fixed-date";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { WatchButton } from "@/components/ui/WatchButton";
import { useResourceStore } from "@/stores/resourceStore";
import { GfmSection } from "@/components/shared/GfmSection";
import { TrajectoryBars } from "@/components/market/TrajectoryBars";
import { buildCarbonOverlayView } from "@/lib/market/carbon-overlay-view.mjs";
import { derivePromotionState } from "@/lib/market/signal-promotion.mjs";
import { stalenessOf } from "@/lib/contracts/envelope.mjs";
import { FRESHNESS } from "@/lib/contracts/vocabularies.mjs";
// Lane DP-SURF, system-completion train, 2026-09-02: a SEPARATE, plain derived-value carbon-intensity
// figure (gCO2e/tonne-km), distinct from the "Carbon cost overlay" block above (WO-24, another lane's
// existing work — untouched). Reuses selectModalFactor (the SAME resolution rule the overlay already
// applies) so both blocks agree on WHICH factor row is in scope, but each renders it through its own pure
// conversion — carbonIntensity() here, buildCarbonOverlayView() there — never sharing one computed value.
import { selectModalFactor } from "@/lib/market/select-modal-factor.mjs";
import { carbonIntensity } from "@/lib/market/carbon-intensity.mjs";
import { lifecycleFromFactorOriginClass, confidenceFromPedigree } from "@/lib/propagation/methods/carbon-intensity.ts";
import { DerivedFigure } from "@/components/figures/EstimatedFigure";
import type { Value } from "@/lib/propagation/types.ts";
import {
  extractRegulationSections,
  type SourceEntry,
} from "@/lib/agent/extract-regulation-sections";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import { RecordGradeBadge } from "@/components/shell/RecordGradeBadge";
import {
  parseRecordSections,
  splitKeyDateFacts,
  type RecordFactRow,
  type ClaimTierMap,
} from "@/lib/agent/parse-record-sections";
import type { ItemRelevance } from "@/lib/workspace/profile";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";

// ── Palette — lifted verbatim from the approved mock inline styles ──────
// Same values as the additive --cl-* token block in theme.css (DESIGN-DEVIATIONS
// D1). The T03 archetype consumes the mock hex through this local constant; T05
// mirrors it for cross-detail-surface consistency (no neighbor refactor).
const C = {
  page: "#FAFAF8",
  card: "#FFFFFF",
  plate: "#F5F2EE",
  tint: "#FFF7F0",
  ink: "#1A1A1A",
  ink2: "#5A6B67",
  muted: "#7A6E6C",
  accent: "#E8610A",
  accentHover: "#D05509",
  blue: "#2563EB",
  sevCritical: "#DC2626",
  sevHigh: "#D97706",
  sevMod: "#CA8A04",
  sevLow: "#16A34A",
  signal: "#B45309",
  quiet: "#9A3412",
  brass: "#8A6A2A",
  hair: "rgba(0,0,0,0.12)",
  hairSoft: "rgba(0,0,0,0.06)",
  hairStrong: "rgba(0,0,0,0.18)",
} as const;

// ── Carbon overlay (WO-24, re-scoped 2026-08-30) — emission_factors modal_default rows ──────────────
// See docs/plans/unblocking-the-five-2026-08-30.md §2 and src/lib/market/select-modal-factor.mjs's own
// header for the ruling. No corridor identity exists (Gate 2 deferred to a future WO), so this is the
// jurisdiction+mode-keyed modal_default row shape, fetched whole (2 rows today) and selected client-side
// by the pure selectModalFactor/buildCarbonOverlayView pair — never pre-picked in the fetch layer.
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

// ── Price-board record (migration 151 backing store) ────────────────────
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
  /** Workspace-wide Market Intel pool for same-band related signals. */
  relatedPool: Resource[];
  /** Parsed Market Signal Brief sections (intelligence_item_sections rows). */
  sections?: IntelligenceItemSectionRow[];
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings, keyed by exact claim line
   *  — see parse-record-sections.ts's TIER-CHIP header for the match rule. Read server-side, one query
   *  (the page's loadItemScoped); consumed only by RecordFactsCard (record-grade items). */
  claimTiers?: ClaimTierMap;
  /** Real source-growth convergence (sources.independent_citers /
   *  confirmation_count). independent_citers > 0 → corroboration line. */
  convergence?: { independent_citers: number; confirmation_count: number } | null;
  /** Published price statistics for the hero board (migration 151). Empty →
   *  honest §4 published-statistics pending frame. NEVER faked. */
  priceBoard?: PriceStat[];
  /** WO-24 (re-scoped 2026-08-30): the whole modal_default emission_factors table (2 rows today, no
   *  per-item filter is possible — no corridor join exists). Selected per-signal, client-side, by
   *  DriversTab's carbon-overlay slot via selectModalFactor/buildCarbonOverlayView. Empty → every
   *  corridor-band signal renders the honest no_factor pending frame. NEVER faked. */
  carbonFactors?: EmissionFactorRow[];
  /** Breadcrumb middle segment, e.g. "B1 · Price signals · United States". */
  groupLabel?: string;
  /** Hero deck sub-line, e.g. "U.S. EIA · published May 9, 2026". */
  deck?: string;
  /** Workspace note for this item (workspace_item_overrides.notes), read
   *  server-side. Empty string when none. Item d: notes are workspace-shared,
   *  not localStorage. */
  initialNote?: string;
  /** Flywheel U9 (D1) — item_cross_references connections + any supersessions involving this item, the
   *  viewer's relevance-to-your-operation lens, and the gated title lookup for both. Defaulted (not
   *  required) so this component still type-checks against any pre-U9 test fixture that omits them. */
  supersessions?: Supersession[];
  connections?: ItemConnection[];
  relevance?: ItemRelevance | null;
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  /**
   * PERF-4 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (2)): the viewer's
   * server-resolved watch state for THIS item (src/lib/watchlist/membership.ts's
   * fetchWatchMembership, read in parallel with loadDetail by the page). Threaded straight to
   * <WatchButton> below — passing `initialWatched` means it renders its real state on first paint
   * and fires zero client fetch on mount.
   */
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}

// ── Severity vocabulary (5-label, mirrors MarketPage / MarketSignalDetail) ─
type Severity = "action" | "cost" | "window" | "edge" | "monitor";

const SEVERITY_LABEL: Record<Severity, string> = {
  action: "Action required",
  cost: "Cost alert",
  window: "Window closing",
  edge: "Competitive edge",
  monitor: "Monitoring",
};

const SEVERITY_TONE: Record<Severity, { fg: string; bg: string; bd: string }> = {
  action: { fg: C.sevCritical, bg: "#FEF2F2", bd: "#FECACA" },
  cost: { fg: C.sevHigh, bg: "#FFF7ED", bd: "rgba(217,119,6,0.4)" },
  window: { fg: C.sevMod, bg: "#FEFCE8", bd: "#FEF08A" },
  edge: { fg: C.blue, bg: "rgba(37,99,235,0.08)", bd: "rgba(37,99,235,0.4)" },
  monitor: { fg: C.ink2, bg: C.page, bd: C.hairStrong },
};

// ── Promotion state chip (Lane SURF, spec 02 §2/§9) ──────────────────────
// Replaces the prior always-true `isSignalType` check. Tone: unclassified/unconfirmed read as the same
// dashed amber the old unconditional chip used (this surface's own signals ARE early by default); a
// corroborated signal reads slightly warmer; a promoted FACT is solid, never dashed, and never says
// "Unverified" — the exact inversion spec 02 §9 names.
const PROMOTION_TONE: Record<string, string> = {
  unclassified: C.muted,
  signal_unconfirmed: C.signal,
  signal_corroborated: C.quiet,
  fact: "#15803D",
};

function PromotionChip({ state }: { state: { code: string; chip: string } }) {
  const dashed = state.code !== "fact";
  const tone = PROMOTION_TONE[state.code] ?? C.signal;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: dashed ? tone : "#FFFFFF",
        background: dashed ? "transparent" : tone,
        border: dashed ? `1px dashed ${tone}` : `1px solid ${tone}`,
        borderRadius: 4,
        padding: "5px 11px",
      }}
      title={
        state.code === "fact"
          ? "Confirmed by a primary-source origin_class — citable as fact"
          : "Not yet confirmed by a primary source — dashed, not yet load-bearing"
      }
    >
      {state.chip}
    </span>
  );
}

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

// ── Signal-band vocabulary ──────────────────────────────────────────────
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

/** Clamp any tier value to the customer-facing 1-7 range (DO-NOT-REVERT). */
function clampTier(n: number): number {
  return Math.min(7, Math.max(1, Math.round(n)));
}

// ── Tabs ────────────────────────────────────────────────────────────────
type TabKey = "moving" | "drivers" | "cost" | "talking" | "donow" | "sources";
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "moving", label: "What's moving" },
  { key: "drivers", label: "Drivers & trajectory" },
  { key: "cost", label: "Cost impact" },
  { key: "talking", label: "Client talking points" },
  { key: "donow", label: "Do now" },
  { key: "sources", label: "Sources" },
];

// ── Component ─────────────────────────────────────────────────────────────
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
  relevance = null,
  resourceLookup = {},
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: Props) {
  const [tab, setTab] = useState<TabKey>("moving");

  const severity = useMemo(() => deriveSeverity(r), [r]);
  const band = useMemo(() => assignBand(r), [r]);

  // section_key → trimmed content_md (only rows with content).
  const sectionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of sections) {
      const md = (row.content_md || "").trim();
      if (md) map[row.section_key] = md;
    }
    return map;
  }, [sections]);

  // Corroboration: real non-zero independent_citers only. Never a proxy.
  const independentCiters =
    convergence && convergence.independent_citers > 0 ? convergence.independent_citers : null;

  // DEFECT FIXED (Lane SURF, spec 02 §9): the prior check was `isSignalType = !!r.type`, which is
  // ALWAYS true — the mapper defaults an absent item_type to the string "uncertain" (still truthy), so
  // every item rendered here got the same "Unverified" chip regardless of what it actually was. Replaced
  // with a real promotion state (src/lib/market/signal-promotion.mjs): origin_class, now a real mapped
  // field (Resource.originClass, src/types/resource.ts; live on this page's fetchIntelligenceItemUncached
  // mapper, Lane SURF 2026-09-02) plus the REAL, non-fabricated corroboration count already computed
  // above. Never promotes to "fact" from corroboration alone (spec 02 §2).
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
  const crumbGroup = groupLabel || `B${BAND_NUM[band]} · ${BAND_LABEL[band]} · ${jurisLabel}`;

  const related = useMemo(
    () =>
      relatedPool
        .filter((x) => x.id !== r.id)
        .map((x) => ({ item: x, band: assignBand(x), severity: deriveSeverity(x) }))
        .filter((x) => x.band === band)
        .slice(0, 4),
    [relatedPool, r.id, band]
  );

  // Next data drops rail — from the price board's next-release fields.
  const nextDrops = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ label: string; date: string }> = [];
    for (const p of priceBoard) {
      if (!p.nextReleaseAt) continue;
      const key = `${p.nextReleaseLabel || p.label}·${p.nextReleaseAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label: p.nextReleaseLabel || p.label, date: shortDate(p.nextReleaseAt) });
    }
    return out;
  }, [priceBoard]);

  return (
    <div style={{ padding: "0 0 90px", fontFamily: "var(--font-sans)", color: C.ink }}>
      {/* ── Hero header ── */}
      <header style={{ background: C.card, borderBottom: `1px solid ${C.hair}` }}>
        <div data-guard-container="market-detail-header" style={{ paddingTop: 18, paddingLeft: "var(--cl-detail-pad-x)", paddingRight: "var(--cl-detail-pad-x)" }}>
          {/* Breadcrumb. Coordinator, 2026-09-03 (round 2, mirrors RegulationDetailSurface's MOBILE-2 fix):
              no nowrap on any crumb; the last crumb (the title, redundant with the H1 one line below)
              is omitted at <=640px. Side padding follows the --cl-detail-pad-x token (36px -> 16px). */}
          <nav
            aria-label="Breadcrumb"
            style={{ fontSize: 12, margin: "0 0 12px", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", minWidth: 0 }}
          >
            <Link href="/market" prefetch={false} style={{ color: C.ink2, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 24 }}>
              Market Intel
            </Link>
            <span style={{ color: C.muted }}>/</span>
            <span style={{ color: C.ink2, fontWeight: 600, overflowWrap: "anywhere", minWidth: 0 }}>{crumbGroup}</span>
            <span style={{ color: C.muted }} className="cl-sig-crumb-last-sep">/</span>
            <span
              className="cl-sig-crumb-last"
              style={{ color: C.ink, fontWeight: 800, maxWidth: "44ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={r.title}
            >
              {r.title}
            </span>
          </nav>
          <style>{`
            @media (max-width: 640px) {
              .cl-sig-crumb-last, .cl-sig-crumb-last-sep { display: none !important; }
            }
          `}</style>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ maxWidth: "86ch", minWidth: 0 }}>
              <h1
                data-guard-title
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: 32,
                  lineHeight: 1.08,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  margin: 0,
                  color: C.ink,
                }}
              >
                {r.title}
              </h1>
              {(deck || independentCiters !== null) && (
                <p style={{ fontSize: 13, color: C.ink2, margin: "10px 0 0", lineHeight: 1.6 }}>
                  {deck}
                  {deck && independentCiters !== null ? " · " : ""}
                  {independentCiters !== null && (
                    <b style={{ color: C.ink }}>
                      {independentCiters} independent source{independentCiters === 1 ? "" : "s"} corroborate this signal
                    </b>
                  )}
                </p>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <SeverityChip severity={severity} />
                <PromotionChip state={promotion} />
                <RecordGradeBadge itemGrade={r.itemGrade} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.09em",
                    textTransform: "uppercase",
                    color: C.ink2,
                    border: `1px solid ${C.hairStrong}`,
                    borderRadius: 4,
                    padding: "5px 11px",
                  }}
                >
                  B{BAND_NUM[band]} · {BAND_LABEL[band].split(" ")[0]}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {(r.fullBrief || r.url) && (
                  <ActionButton primary onClick={() => exportBriefAsMarkdown(r)}>
                    Export brief
                  </ActionButton>
                )}
                <ActionButton onClick={() => shareCurrent(r)}>Share</ActionButton>
                <WatchButton
                  itemType="signal"
                  itemId={String(r.id)}
                  palette={{ accent: C.accent, hairStrong: C.hairStrong, tint: C.tint, card: C.card, ink: C.ink }}
                  initialWatched={initialWatched}
                  initialTeamWatched={initialTeamWatched}
                  initialTeamAvailable={initialTeamAvailable}
                />
              </div>
            </div>
          </div>

          {/* Price board */}
          <PriceBoard stats={priceBoard} />

          {/* Tab strip */}
          <div data-guard-strip style={{ display: "flex", gap: 2, margin: "14px 0 0", overflowX: "auto" }} role="tablist" aria-label="Signal views">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12.5,
                    fontWeight: active ? 800 : 600,
                    padding: "10px 16px",
                    minHeight: 44, // law-2 floor (coordinator, round 2)
                    whiteSpace: "nowrap",
                    border: 0,
                    borderBottom: `3px solid ${active ? C.accent : "transparent"}`,
                    background: "transparent",
                    color: active ? C.ink : C.ink2,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Ask bar — page-scoped */}
      <div style={{ paddingTop: 22, paddingLeft: "var(--cl-detail-pad-x)", paddingRight: "var(--cl-detail-pad-x)" }}>
        <AiPromptBar
          placeholder={`Ask anything about ${r.title} — e.g. how does this hit my Q3 lane costs?`}
          chips={["What does this mean for me?", "How does this affect my margins?", "Which lanes are most exposed?"]}
        />
      </div>

      {/* ── Body: main + meta rail ── */}
      <div
        id="cl-sig-grid"
        style={{ paddingTop: 22, paddingLeft: "var(--cl-detail-pad-x)", paddingRight: "var(--cl-detail-pad-x)", display: "grid", gridTemplateColumns: "minmax(0,1fr) 264px", gap: 24, alignItems: "start" }}
      >
        <style>{`
          @media (max-width: 1100px) {
            #cl-sig-grid { grid-template-columns: minmax(0,1fr) !important; }
            #cl-sig-rail { flex-direction: row !important; flex-wrap: wrap !important; }
            #cl-sig-rail > div { flex: 1 1 240px; }
          }
        `}</style>

        <main style={{ minWidth: 0 }}>
          {tab === "moving" && r.itemGrade === "record" && (
            // RECORD-GRADE (RECORD-SURFACE lane, 2026-09-04): a record-grade market_signal/initiative
            // item's `sections` carry section_key "identity"/"record_facts"/"sources_and_citations"
            // (record-facts.mjs), never the numbered "1".."6" keys `sectionMap` above indexes — so
            // `sectionMap["1"]` is always undefined for a record item and this tab would otherwise
            // always fall to the brief-grade "Movement analysis pending" frame even though the item DOES
            // carry extracted facts (action_now/conversion_trigger/driving_parties/signal_event/
            // corridor_identity, item-type-required-slots.json). See parse-record-sections.ts's own
            // header for why a record item's sections are unreachable from the brief-grade heading
            // parser. No live market_signal/initiative item routes to /market today (all 1,273 live
            // record-grade rows carry domain=1 -> /regulations, RECORD-SURFACE lane report) — this is
            // forward cover for when domain classification sends one here.
            <RecordFactsCard sections={sections} tags={r.tags} claimTiers={claimTiers} />
          )}
          {tab === "moving" && r.itemGrade !== "record" && (
            <SectionCard title="What's moving and what triggered it">
              {sectionMap["1"] ? (
                <GfmSection markdown={sectionMap["1"]} />
              ) : (
                <PendingFrame header="Movement analysis pending">
                  What moved and what triggered it appears here once the signal brief is generated for
                  {" "}{r.title}.
                </PendingFrame>
              )}
            </SectionCard>
          )}

          {tab === "drivers" && (
            <DriversTab r={r} sectionMap={sectionMap} band={band} carbonFactors={carbonFactors} />
          )}

          {tab === "cost" && (
            <SectionCard title="Operational and cost implications by mode">
              {sectionMap["4"] ? (
                <>
                  <GfmSection markdown={sectionMap["4"]} />
                  <p style={{ fontSize: 11.5, lineHeight: 1.5, color: C.muted, margin: "14px 0 0" }}>
                    Per-mode cost facts (Air / Road / Ocean) as first-class sourced records land with the
                    state-level cost-fact backend. Where a mode lacks a sourced figure it reads as an em-dash,
                    never an inferred number.
                  </p>
                </>
              ) : (
                <PendingFrame header="Cost impact pending">
                  Operational and cost implications by mode appear here once the signal brief is generated.
                  Where a mode lacks a sourced figure it renders as an em-dash <b>—</b>, never an inferred number.
                </PendingFrame>
              )}
            </SectionCard>
          )}

          {tab === "talking" && (
            <SectionCard title="Client conversation talking points">
              {sectionMap["6"] ? (
                <GfmSection markdown={sectionMap["6"]} />
              ) : (
                <PendingFrame header="Talking points pending">
                  What the workspace can credibly say, the pitfalls to avoid, and the questions to pose to
                  clients appear here once the signal brief is generated.
                </PendingFrame>
              )}
            </SectionCard>
          )}

          {tab === "donow" && <DoNowTab r={r} sectionMap={sectionMap} />}

          {tab === "sources" && <SourcesTab r={r} sectionMap={sectionMap} band={band} />}

          {/* Persistent notes — every tab (workspace-shared via overrides) */}
          <NotesField itemId={r.id} initialNote={initialNote} />

          {/* Related signals + connected intelligence — every tab */}
          {related.length > 0 && (
            <SectionCard title={`Connected intelligence · related ${BAND_LABEL[band].toLowerCase()}`} rightMeta="related signals">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                {related.map((rel) => (
                  <Link
                    key={rel.item.id}
                    href={`/market/${encodeURIComponent(rel.item.id)}`}
                    prefetch={false}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr",
                      gap: 10,
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: `1px solid ${C.hairSoft}`,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <SeverityChip severity={rel.severity} small />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rel.item.title}
                      </p>
                      <p style={{ fontSize: 11, color: C.muted, margin: "1px 0 0" }}>
                        {SEVERITY_LABEL[rel.severity]} · B{BAND_NUM[rel.band]}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}
        </main>

        {/* Meta rail */}
        <div id="cl-sig-rail" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <RelevanceBadgeClient itemId={r.id} />
          <SideCard label="Signal">
            <KV k="Band" v={`B${BAND_NUM[band]} · ${BAND_LABEL[band]}`} />
            <KV k="Severity" v={<span style={{ fontWeight: 800, color: SEVERITY_TONE[severity].fg }}>{SEVERITY_LABEL[severity]}</span>} />
            <KV k="Status" v={<span style={{ fontWeight: 700, color: PROMOTION_TONE[promotion.code] }}>{promotion.label}</span>} />
            {independentCiters !== null && <KV k="Corroboration" v={`${independentCiters} source${independentCiters === 1 ? "" : "s"}`} />}
            <KV k="Jurisdiction" v={jurisLabel || "Global"} />
            {r.topic && <KV k="Topic" v={r.topic} />}
            {r.added && <KV k="Published" v={fullDate(r.added)} />}
          </SideCard>

          <SideCard label="Next data drops">
            {nextDrops.length > 0 ? (
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Lane SURF (spec 02 §9): the dates below are a cadence estimate stored on the row,
                    not a scheduler confirmation — no scheduler runs published_price_statistics (see
                    PriceBoard's own note). Stated plainly rather than presented as confirmed. */}
                <p style={{ fontSize: 9.5, color: C.muted, margin: "0 0 2px", lineHeight: 1.4 }}>
                  Cadence estimates, not scheduler-confirmed dates.
                </p>
                {nextDrops.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{d.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.sevHigh, whiteSpace: "nowrap" }}>{d.date}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ gridColumn: "1 / -1" }}>
                <PendingFrame header="Release calendar pending">
                  Next release dates for this signal&apos;s data series appear here once the price feed is connected.
                </PendingFrame>
              </div>
            )}
          </SideCard>

          <SideCard label="Owner & team">
            <div style={{ gridColumn: "1 / -1" }}>
              <PendingFrame header="Unassigned">
                No owner is tracking this signal yet. Owner assignment lands when the workspace-membership
                backend ships.
              </PendingFrame>
            </div>
          </SideCard>

          <ItemConnectionsCard
            connections={connections}
            supersessions={supersessions}
            selfId={r.id}
            resourceLookup={resourceLookup}
          />
        </div>
      </div>
    </div>
  );
}

// ── Price board ─────────────────────────────────────────────────────────
function PriceBoard({ stats }: { stats: PriceStat[] }) {
  const toneHue = (t?: string | null): string => {
    switch (t) {
      case "critical": return C.sevCritical;
      case "high": return C.sevHigh;
      case "moderate": return C.sevMod;
      case "low": return C.sevLow;
      default: return C.ink;
    }
  };

  // Honest §4 published-statistics frame while the live feed is pending (HANDOFF §7).
  // The board never fakes ticks — with no rows it states what's absent and what lands it.
  if (stats.length === 0) {
    return (
      <div style={{ margin: "18px 0 0" }}>
        <div style={{ border: "1px dashed rgba(0,0,0,0.25)", background: C.page, borderRadius: 8, padding: "14px 16px" }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.brass, display: "block", margin: "0 0 4px" }}>
            Price board · published statistics pending
          </span>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: C.ink2, margin: 0 }}>
            The hero price board shows published government statistics (release-cadence anchored), not live
            ticks. These slots populate when the commodity-price feed is connected — until then no figure is
            shown rather than an unsourced one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ margin: "18px 0 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {stats.map((s, i) => {
          const hue = toneHue(s.severityTone);
          return (
            <div key={i} style={{ border: `1px solid ${C.hair}`, borderRadius: 8, padding: "12px 16px 10px", background: C.page }}>
              <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, margin: "0 0 4px" }}>
                {s.label}
              </p>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: hue, margin: 0 }}>
                {s.valueDisplay}
                {s.unit && <span style={{ fontSize: 14 }}> {s.unit}</span>}
              </p>
              {s.contextLine && (
                <p style={{ fontSize: 10.5, color: C.ink2, margin: "5px 0 0" }}>{s.contextLine}</p>
              )}
            </div>
          );
        })}
      </div>
      {/* DEFECT FIXED (Lane SURF, spec 02 §9): this line used to print "Next release: <date>" — a
          claim spec 02 §9 calls dishonest because no scheduler runs published_price_statistics (it is
          populated by a hand-run script; see that table's own producer). A predicted date is a promise
          this product cannot keep. Replaced with the SHIPPED freshness-derived function
          (src/lib/contracts/envelope.mjs stalenessOf) — with no registered cadence for this table, it
          honestly resolves to "unknown" rather than asserting a next-release date this surface has no
          scheduler to back. */}
      <p style={{ fontSize: 10.5, color: C.muted, margin: "8px 0 0" }}>
        Figures are published statistics{stats.some((s) => s.releasedAt) ? ` (release ${shortDate(stats.find((s) => s.releasedAt)!.releasedAt!)})` : ""} — not live ticks.
        {" "}
        {FRESHNESS[priceBoardFreshness(stats)]?.label ?? "Refresh cadence unknown"} — no scheduler runs this
        feed, so no next-release date is asserted.
      </p>
    </div>
  );
}

/**
 * Freshness across a PriceBoard's stats, via the shipped freshness-derived function. No registry entry
 * backs published_price_statistics (a hand-maintained table, distinct from market_series's registry
 * producers — series-freshness.mjs's own header), so `expected_refresh` is always absent here and this
 * always resolves to "unknown" today; written as a real call (not a hard-coded string) so the day this
 * table gains a registered cadence, this line starts telling the truth about degradation automatically.
 */
function priceBoardFreshness(stats: PriceStat[]): keyof typeof FRESHNESS {
  const withRelease = stats.find((s) => s.releasedAt);
  if (!withRelease?.releasedAt) return "unknown";
  return stalenessOf(
    { expected_refresh: null, as_of: { event_date: withRelease.releasedAt, source_published_at: withRelease.releasedAt } },
    new Date().toISOString().slice(0, 10)
  ) as keyof typeof FRESHNESS;
}

// ── Drivers & trajectory tab ────────────────────────────────────────────
function DriversTab({
  r,
  sectionMap,
  band,
  carbonFactors = [],
}: {
  r: Resource;
  sectionMap: Record<string, string>;
  band: BandKey;
  carbonFactors?: EmissionFactorRow[];
}) {
  const hasTrajectory = band === "price" && (r.trajectoryPoints?.points?.length ?? 0) > 0;
  // WO-24 (re-scoped 2026-08-30): corridors & routes signals (B3) are exactly where a carbon-cost
  // overlay attaches conceptually (spec 07's mock draws it on the same corridor as a rate board). No
  // corridor identity exists yet (Gate 2, deferred), so this keys off jurisdiction_iso + emission_factors
  // instead — see select-modal-factor.mjs's header for the three-state ruling this renders honestly.
  const hasCarbonOverlay = band === "corridor";
  const carbonOverlay = hasCarbonOverlay
    ? buildCarbonOverlayView({ jurisdictionIso: r.jurisdictionIso ?? [], factors: carbonFactors })
    : null;

  // Lane DP-SURF, 2026-09-02: the SAME resolution rule (selectModalFactor) the overlay above already
  // applies, so this block only ever shows for the identical factor row the overlay names — no second,
  // disagreeing selection. carbonIntensity() refuses honestly (no card at all, not a blank one) for any
  // quantity_basis it has no confirmed per-unit convention for (today: everything but tonne_km).
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
          // This surface's EmissionFactorRow (WO-24) carries no origin_class/pedigree column — a real
          // seeded derived_values row (scripts/propagation/seed-derived-values.mjs) carries both and
          // renders a sharper lifecycle/confidence; this live client-side read of the SAME factor row
          // degrades honestly to the documented defaults rather than guessing a stronger provenance.
          lifecycle: lifecycleFromFactorOriginClass(undefined),
          admissibility: "calculation_ok",
          baseConfidence: confidenceFromPedigree(undefined),
          assertedAt: new Date().toISOString(),
          halfLifeDays: null,
          inputs: [{ table: "emission_factors", pk: intensity.factorId ?? "" }],
          supersedes: null,
          computedAt: new Date().toISOString(),
          computedBy: "client-preview",
        }
      : null;

  const anySection = sectionMap["2"] || sectionMap["3"] || sectionMap["5"];

  return (
    <>
      {sectionMap["2"] && (
        <SectionCard title="Who's driving it and what they want">
          <GfmSection markdown={sectionMap["2"]} />
        </SectionCard>
      )}
      {sectionMap["3"] && (
        <SectionCard title="Expected trajectory and conversion triggers">
          <GfmSection markdown={sectionMap["3"]} />
        </SectionCard>
      )}
      {r.conversionTrigger && (
        <div
          style={{
            marginBottom: 14,
            padding: "14px 18px",
            background: C.card,
            border: `1px solid ${C.hair}`,
            borderLeft: `3px solid ${C.accent}`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.accent, margin: "0 0 4px" }}>
            Conversion trigger · what would shift this path
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: C.ink, margin: 0 }}>{r.conversionTrigger}</p>
        </div>
      )}
      {hasTrajectory && r.trajectoryPoints && (
        <SectionCard title="Price trajectory">
          <TrajectoryBars trajectoryPoints={r.trajectoryPoints} />
        </SectionCard>
      )}
      {hasCarbonOverlay && carbonOverlay && (
        <SectionCard title="Carbon cost overlay">
          {carbonOverlay.state === "resolved" && carbonOverlay.figure ? (
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: C.ink, margin: "0 0 4px" }}>
                {carbonOverlay.figure.value}
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink2 }}> {carbonOverlay.figure.unit}</span>
              </p>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.11em",
                  textTransform: "uppercase",
                  color: C.brass,
                  display: "block",
                  margin: "0 0 8px",
                }}
              >
                National modal default · not corridor-specific
              </span>
              <p style={{ fontSize: 12, lineHeight: 1.6, color: C.ink2, margin: 0 }}>{carbonOverlay.body}</p>
            </div>
          ) : (
            <PendingFrame header={carbonOverlay.header}>{carbonOverlay.body}</PendingFrame>
          )}
        </SectionCard>
      )}
      {hasCarbonOverlay && intensityFigure && (
        <SectionCard title="Per-unit carbon intensity" rightMeta="calculated · gCO2e/tonne-km">
          <DerivedFigure figure={intensityFigure} label="Carbon intensity" sourceNote="Same factor row as the carbon cost overlay above, converted per unit rather than per shipment." use="display" />
        </SectionCard>
      )}
      {sectionMap["5"] && (
        <SectionCard title="Competitive implications">
          <GfmSection markdown={sectionMap["5"]} />
        </SectionCard>
      )}
      {!anySection && !hasTrajectory && !hasCarbonOverlay && !r.conversionTrigger && (
        <SectionCard title="Drivers & trajectory">
          <PendingFrame header="Drivers and trajectory pending">
            Who is driving this signal, the expected price path, and the conversion triggers appear here once
            the signal brief is generated.
          </PendingFrame>
        </SectionCard>
      )}
    </>
  );
}

// ── Do now tab ──────────────────────────────────────────────────────────
function DoNowTab({ r, sectionMap }: { r: Resource; sectionMap: Record<string, string> }) {
  // Sorted by priority (1 = highest) — the structured deadline proxy on
  // RecommendedAction; the timeframe renders as the deadline chip per row.
  const actions = [...(r.recommendedActions || [])].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99)
  );

  if (actions.length > 0) {
    return (
      <SectionCard title="What the workspace should do now" rightMeta={`${actions.length} action${actions.length === 1 ? "" : "s"} · sorted by priority`}>
        <div>
          {actions.map((a, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "26px minmax(0,1fr) auto",
                gap: 12,
                alignItems: "start",
                padding: "13px 0",
                borderBottom: i === actions.length - 1 ? "none" : `1px solid ${C.hairSoft}`,
              }}
            >
              <span style={{ fontFamily: "var(--font-display)", fontSize: 17, color: C.accent, lineHeight: 1.3 }}>{i + 1}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, margin: "0 0 3px", color: C.ink }}>{a.action}</p>
                {a.owner && <p style={{ fontSize: 12, lineHeight: 1.6, color: C.ink2, margin: 0 }}>{a.owner}</p>}
              </div>
              {a.timeframe ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: C.sevHigh,
                    border: `1px solid rgba(217,119,6,0.4)`,
                    borderRadius: 4,
                    padding: "3px 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.timeframe}
                </span>
              ) : (
                <span aria-hidden style={{ fontSize: 12, color: C.muted }}>—</span>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="What the workspace should do now">
      {sectionMap["7"] ? (
        <GfmSection markdown={sectionMap["7"]} />
      ) : (
        <PendingFrame header="Recommended actions pending">
          The actions the workspace should take — with owners and deadlines — appear here once the signal brief
          is generated.
        </PendingFrame>
      )}
    </SectionCard>
  );
}

// ── Sources tab — structured rows, never a raw dump (#172) ──────────────
function SourcesTab({ r, sectionMap, band }: { r: Resource; sectionMap: Record<string, string>; band: BandKey }) {
  const parsed = useMemo<SourceEntry[]>(() => {
    if (!r.fullBrief) return [];
    const map = extractRegulationSections(r.fullBrief);
    for (const section of Object.values(map)) {
      if (section && section.kind === "sources_list") return section.entries;
    }
    return [];
  }, [r.fullBrief]);

  const rows: SourceEntry[] =
    parsed.length > 0
      ? parsed
      : r.url
      ? [{ tier: typeof r.sourceTier === "number" ? r.sourceTier : null, name: r.sourceName || r.url, meta: r.enforcementBody || "", url: r.url }]
      : [];

  return (
    <>
      <SectionCard title="Sources" rightMeta={rows.length > 0 ? `${rows.length} ${rows.length === 1 ? "source" : "sources"} · tier = provenance` : undefined} noPad>
        {rows.length > 0 ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px", padding: "4px 20px" }}>
              {rows.map((s, i) => {
                const inner = (
                  <>
                    {typeof s.tier === "number" ? (
                      <TierBadge tier={s.tier} />
                    ) : (
                      <span aria-hidden style={{ fontSize: 10, fontWeight: 800, padding: "5px 10px", borderRadius: 4, border: `1px dashed rgba(0,0,0,0.3)`, color: C.muted }}>—</span>
                    )}
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, lineHeight: 1.45, color: C.ink }}>{s.name}</p>
                      {s.meta && <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>{s.meta}</p>}
                    </div>
                  </>
                );
                const cellStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "baseline", padding: "11px 0", borderBottom: `1px solid ${C.hairSoft}`, textDecoration: "none", color: "inherit" };
                return s.url ? (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={cellStyle}>{inner}</a>
                ) : (
                  <div key={i} style={cellStyle}>{inner}</div>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, margin: 0, padding: "10px 20px", borderTop: `1px solid ${C.hairSoft}`, background: C.page }}>
              Newly identified sources are pending tier review in the Admin queue before they join the registry.
            </p>
          </>
        ) : (
          <div style={{ padding: "16px 20px" }}>
            <PendingFrame header="Primary source not yet linked">
              The primary source document will be linked here once verified against the registry.
            </PendingFrame>
          </div>
        )}
      </SectionCard>

      {sectionMap["8"] && (
        <SectionCard title="Source notes">
          <GfmSection markdown={sectionMap["8"]} />
        </SectionCard>
      )}

      <SectionCard title="Trajectory">
        {band === "price" && (r.trajectoryPoints?.points?.length ?? 0) > 0 && r.trajectoryPoints ? (
          <TrajectoryBars trajectoryPoints={r.trajectoryPoints} />
        ) : (
          <PendingFrame header="Price history · not yet captured">
            Per-signal price history populates once the commodity-price feed is connected. The published
            figures above remain current until then.
          </PendingFrame>
        )}
      </SectionCard>
    </>
  );
}

// ── Persistent notes field ──────────────────────────────────────────────
// Item d (DEEP-AUDIT S1 "notes aren't shared"): the note persists to
// workspace_item_overrides.notes via POST /api/workspace/overrides (the
// backend that already existed), debounced 800ms after typing stops + on
// blur. The prior implementation stored notes in localStorage while the
// label claimed "visible to your workspace" — a false customer claim. Save
// state is surfaced honestly (Saving… / Saved / Save failed — retry); a
// failed save never silently drops the text.
//
// PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): the initial value used to arrive
// server-side (initialNote), sourced from an uncached, cookie-scoped org read inside
// market/[slug]/page.tsx — one of that route's Dynamic-API dependencies. That server read is gone;
// initialNote now defaults to "" (never wrong, just not-yet-known). Once the global bootstrap fetch
// resolves (useWorkspaceOverridesHydration, see its own header), this field reads the SAME
// workspace_item_overrides.notes value from useResourceStore's client-hydrated cache — same source
// of truth as before, same "shared across the org" contract — and applies it here exactly once, ONLY
// while the field is still untouched (status === "idle"), so a viewer who starts typing before the
// bootstrap payload lands is never overwritten mid-edit.
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
    if (status !== "idle") return; // already dirty/saved/saving from a real user edit — never clobber
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
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/workspace/overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ itemId, notes: value }),
      });
      if (!resp.ok) throw new Error(`save failed (${resp.status})`);
      // Only report Saved if the text hasn't changed since this save fired.
      setStatus(latest.current === value ? "saved" : "dirty");
    } catch {
      setStatus("error");
    }
  }

  function queueSave(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), 800);
  }

  // Flush any pending debounce on unmount (best-effort fire-and-forget).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const statusLabel =
    status === "saving" ? "Saving…" :
    status === "saved" ? "Saved to workspace" :
    status === "error" ? "Save failed — edit to retry" :
    status === "dirty" ? "Unsaved changes…" : "Not saved";

  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 8, padding: "14px 18px", margin: "14px 0 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.blue }}>
          Your notes · visible to your workspace
        </span>
        <span style={{ fontSize: 10.5, color: status === "error" ? C.sevCritical : C.muted }}>{statusLabel}</span>
      </div>
      <textarea
        value={note}
        onChange={(e) => {
          const v = e.target.value;
          setNote(v);
          setStatus("dirty");
          queueSave(v);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          if (status === "dirty" || status === "error") save(latest.current);
        }}
        placeholder="Add analyst context — which lanes or clients this touches, who's on it, what was decided…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontFamily: "var(--font-sans)",
          fontSize: 12.5,
          lineHeight: 1.6,
          padding: "10px 13px",
          border: `1px solid rgba(0,0,0,0.16)`,
          borderRadius: 6,
          outline: "none",
          background: C.page,
          resize: "vertical",
          minHeight: 52,
          margin: "8px 0 0",
          color: C.ink,
        }}
        suppressHydrationWarning
      />
    </div>
  );
}

// ── Reusable primitives (archetype, mirrors T03) ────────────────────────
function SectionCard({
  title,
  rightMeta,
  children,
  noPad,
}: {
  title: string;
  rightMeta?: string;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div
        style={{
          padding: "12px 20px",
          background: C.plate,
          borderBottom: `1px solid ${C.hairSoft}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.ink }}>{title}</span>
        {/* RECORD-SURFACE lane, 2026-09-04: dropped the fixed nowrap-only header row's implicit
            "rightMeta always fits on one line" assumption — the record-grade honesty line ("N of M
            record fields not stated by the source") is longer than every prior rightMeta usage in this
            file and clipped past the viewport at 375px (caught by detail-surfaces-smoke.mjs's
            record-grade fixture). flexWrap above lets a long rightMeta drop to its own line instead of
            overflowing; the span itself stays nowrap so it doesn't break mid-word once wrapped. */}
        {rightMeta && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, whiteSpace: "nowrap" }}>{rightMeta}</span>}
      </div>
      <div style={noPad ? undefined : { padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function SideCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 8, padding: "14px 16px" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: C.muted, margin: "0 0 10px" }}>{label}</p>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 12 }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <>
      <span style={{ color: C.muted, fontWeight: 600 }}>{k}</span>
      <span style={{ color: C.ink, fontWeight: 700 }}>{v}</span>
    </>
  );
}

function PendingFrame({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px dashed rgba(0,0,0,0.25)", background: C.page, borderRadius: 8, padding: "12px 14px" }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.brass, display: "block", margin: "0 0 4px" }}>{header}</span>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: C.ink2, margin: 0 }}>{children}</p>
    </div>
  );
}

// ── RECORD-GRADE facts card (RECORD-SURFACE lane, 2026-09-04) ───────────
// Same parser + rendering shape as RegulationDetailSurface.tsx's RecordGradeSummary (see that file's
// own header for the full rationale); Connected items are already rendered unconditionally below every
// tab on this page (<ItemConnectionsCard> at this file's own "every tab" block) so this card does not
// duplicate them — only the facts/dates/tags a record-grade item's `sections` actually carry, which
// nothing on this page could reach before this lane (sectionMap only recognises numbered "1".."6" keys).
// TIER-CHIP lane (2026-09-04): fact.tier is this FACT claim's own rating (see parse-record-sections.ts's
// TIER-CHIP header) rendered with the SAME <TierBadge> below the Sources tab already uses (same
// component, same T1-T7 vocabulary/clamp — never a second one) plus, when the map resolved one, a
// linked source name. `fact.tier === null` shows the same honest dashed "—" other unrated rows on this
// page render — never omitted silently, never guessed.
function RecordFactLine({ fact }: { fact: RecordFactRow }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
          {fact.label}
        </span>
        {fact.kind === "FACT" &&
          (typeof fact.tier === "number" ? (
            <TierBadge tier={fact.tier} />
          ) : (
            <span
              aria-hidden
              title="No source rating on file for this claim"
              style={{ fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 4, border: "1px dashed rgba(0,0,0,0.3)", color: C.muted }}
            >
              —
            </span>
          ))}
      </div>
      {fact.span ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: C.ink, borderLeft: `2px solid ${C.hairStrong}`, paddingLeft: 10, overflowWrap: "anywhere" }}>
          “{fact.span}”
        </p>
      ) : (
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: C.ink2, overflowWrap: "anywhere" }}>{fact.text}</p>
      )}
      {fact.kind === "FACT" && fact.sourceName && (
        <p style={{ fontSize: 11, margin: "4px 0 0", color: C.muted }}>
          {fact.sourceUrl ? (
            // Law-2 floor (24px + 8px-clearance alternative): minHeight + inline-flex/center reaches the
            // floor without changing the visible link's font size or padding.
            <a
              href={fact.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: C.blue, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 24 }}
            >
              {fact.sourceName}
            </a>
          ) : (
            fact.sourceName
          )}
        </p>
      )}
    </div>
  );
}

function RecordFactsCard({ sections, tags, claimTiers }: { sections: IntelligenceItemSectionRow[]; tags: string[]; claimTiers?: ClaimTierMap }) {
  const parsed = useMemo(() => parseRecordSections(sections, claimTiers), [sections, claimTiers]);
  const { dateFacts, otherFacts } = useMemo(
    () => (parsed ? splitKeyDateFacts(parsed.facts) : { dateFacts: [] as RecordFactRow[], otherFacts: [] as RecordFactRow[] }),
    [parsed]
  );

  return (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 8, borderLeft: `3px solid ${C.brass}`, padding: "16px 20px", marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: C.brass }}>
          Catalogue record
        </span>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: "8px 0 0", maxWidth: "86ch", color: C.ink2 }}>
          This item was captured directly from its source document rather than synthesized into a signal
          brief. Every fact below is quoted verbatim from that source — a full brief is a separate, later
          upgrade for this item.
        </p>
      </div>

      {dateFacts.length > 0 && (
        <SectionCard title="Key dates">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {dateFacts.map((f) => <RecordFactLine key={f.slotKey} fact={f} />)}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Verbatim facts"
        rightMeta={parsed && parsed.slotFieldCount > 0 ? `${parsed.gaps.length} of ${parsed.slotFieldCount} record fields not stated by the source` : undefined}
      >
        {otherFacts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {otherFacts.map((f) => <RecordFactLine key={f.slotKey} fact={f} />)}
          </div>
        ) : (
          <PendingFrame header="No verbatim facts located yet">
            {parsed
              ? "The captured source did not state any of this item's required record fields in a form this extractor could quote verbatim."
              : "No extracted-facts sections are on file for this catalogue record yet."}
          </PendingFrame>
        )}
      </SectionCard>

      <SectionCard title="Tags">
        {tags && tags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tags.map((t) => (
              <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: C.plate, border: `1px solid ${C.hairSoft}`, color: C.ink2 }}>
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, lineHeight: 1.6, color: C.muted, margin: 0, fontStyle: "italic" }}>No tags on file for this item yet.</p>
        )}
      </SectionCard>
    </>
  );
}

function SeverityChip({ severity, small }: { severity: Severity; small?: boolean }) {
  const tone = SEVERITY_TONE[severity];
  return (
    <span
      style={{
        fontSize: small ? 9 : 10,
        fontWeight: 800,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        borderRadius: 4,
        padding: small ? "3px 8px" : "5px 11px",
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {severity === "monitor" ? "" : "● "}
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function TierBadge({ tier }: { tier: number }) {
  const t = clampTier(tier);
  let style: React.CSSProperties;
  if (t <= 2) style = { background: C.blue, color: "#fff" };
  else if (t <= 5) style = { background: C.ink, color: "#fff" };
  else style = { border: `1px dashed rgba(0,0,0,0.3)`, color: C.muted };
  return (
    <span title={`Tier ${t} — provenance, never urgency`} style={{ fontSize: 10, fontWeight: 800, padding: "5px 10px", borderRadius: 4, textAlign: "center", ...style }}>
      T{t}
    </span>
  );
}

function ActionButton({ children, primary, onClick }: { children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
        fontWeight: primary ? 800 : 700,
        padding: "8px 16px",
        borderRadius: 6,
        border: `1px solid ${primary ? (hover ? C.accentHover : C.accent) : hover ? C.accent : C.hairStrong}`,
        background: primary ? (hover ? C.accentHover : C.accent) : C.card,
        color: primary ? "#fff" : hover ? C.accent : C.ink,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ── Action handlers ─────────────────────────────────────────────────────
function exportBriefAsMarkdown(r: Resource) {
  if (typeof window === "undefined") return;
  const titleLine = `# ${r.title}\n\n`;
  const meta = [
    r.jurisdiction ? `- Jurisdiction: ${r.jurisdiction}` : null,
    r.severity ? `- Severity: ${r.severity}` : null,
    r.signalBand ? `- Signal band: ${r.signalBand}` : null,
    r.url ? `- Source: ${r.url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const body = r.fullBrief || [r.whatIsIt, r.whyMatters].filter(Boolean).join("\n\n") || r.note || "(No briefing body recorded.)";
  const md = `${titleLine}${meta ? meta + "\n\n" : ""}${body}\n`;
  const slug = (r.id || "signal").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `signal-${slug || "brief"}.md`;
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

// ── Date helpers ────────────────────────────────────────────────────────
// RECONCILE (2026-09-04, item 4b-ii): both previously called `.toLocaleDateString("en-US", {...})`
// directly with NO `timeZone` pin — a live, undiagnosed HYDRATION-418-class defect (this "use client"
// component renders once on the UTC server and once more on the viewer's own local zone during
// hydration; see format-fixed-date.ts's own header for the reproduced mismatch and RegulationDetail-
// Surface.tsx's identical fix). Delegated to format-fixed-date.ts's shared, UTC-pinned presets — found
// and fixed by this reconciliation's repo-wide sweep onto ONE shared formatter module.
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
