"use client";

/**
 * DetailShell — the ONE detail architecture (UI system handoff 2026-09-06,
 * README §0.5), shared by all four detail surfaces this lane owns
 * (regulations, market, research, operations). Nothing here is a shared
 * `ui/` part (those stay list/dashboard-scoped per the lane contract) —
 * this is scoped to the four detail routes this lane writes, so it lives
 * under components/detail/ rather than duplicating the shell four times
 * (CLAUDE.md rule 13).
 *
 * Shape (README §0.5, exact order):
 *   DetailMasthead (VOL/breadcrumb + title + dek + ONE scoped CommandBar)
 *   -> DetailHeader (band pill + tier + workspace tags + action row) -> full
 *   MilestoneTimeline with the next obligation as the callout -> StateNote
 *   -> sticky section index (S1 . S2 . S3 ...) -> sections of FactCards at
 *   <=72ch -> rail. Section names vary by surface; the shape, rail and
 *   index never do. No tabs, no per-tab ask bar, no "Complete brief" toggle.
 *
 * DEFECT-FIX (item 2.3, 2026-09-07): DetailHeader no longer mounts a second
 * `CommandBar` scoped to the item (the old `askPlaceholder`/`askScope`
 * props). "The CommandBar in the Masthead is the only search/ask surface" —
 * a per-item ask box living inside this header was a second ask surface on
 * every detail page, which the audit named directly.
 *
 * GAP G2 (2026-09-07, artboard 03, ruling R4): the above left detail pages
 * with NO command bar at all — this shell now mounts the shared `ui/Masthead`
 * (`DetailMasthead` below) at the top of every detail page, carrying the
 * item title (moved out of DetailHeader, which would otherwise duplicate
 * it — artboard 03 shows the title exactly once), the R4 breadcrumb format
 * in the VOL line, and the ONE scoped CommandBar ("Ask about this
 * regulation" / "this signal" / "this finding" / "this profile").
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { withListPosition } from "@/components/list-surface/list-surface-helpers";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { Absence } from "@/components/ui/Absence";
import { SectionCard } from "@/components/ui/SectionCard";
import { RailCard } from "@/components/ui/RailCard";
import { Masthead } from "@/components/ui/Masthead";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { BandProvider } from "@/components/ui/band-context";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { buildAllConnectionRows } from "@/lib/connections/connection-view-model.mjs";
import { classifyMilestones } from "@/lib/detail/timeline-math";
import type { UrgencyBand } from "@/lib/urgency/bands";
import type { ImpactScores, TimelineEntry, ItemConnection, Supersession, Resource } from "@/types/resource";

// ── Masthead: page-level VOL/breadcrumb/title/dek/CommandBar for detail
// routes ─────────────────────────────────────────────────────────────────
//
// GAP G2 (2026-09-07 operator audit item 2.3, artboard 03, ruling R4): the
// audit's own text ("moves to the page's Masthead CommandBar") is now built
// literally — the shared `ui/Masthead` (previously list/dashboard-only) is
// mounted once at the top of every detail page, carrying the item title
// (size="detail", 28px), the breadcrumb in the VOL line itself
// ("VOL IV . NO. 36 . <Surface> / <Jurisdiction> / N of M in <Band>", R4's
// exact format — `dateLabel` doubles as the breadcrumb slot Masthead
// already renders, no second line invented), the optional dek, and ONE
// scoped CommandBar ("Ask about this regulation" / "this signal" / "this
// finding" / "this profile"). `DetailHeader` below it no longer renders a
// title or a meta line — see that component's own doc comment.

function DetailMastheadBreadcrumb({
  surface,
  jurisdiction,
  band,
  onLabel,
}: {
  surface: string;
  jurisdiction?: string;
  band: UrgencyBand;
  onLabel: (label: string) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const pos = searchParams.get("pos");
    const of = searchParams.get("of");
    const known = pos != null && of != null && Number.isFinite(Number(pos)) && Number.isFinite(Number(of));
    const base = [surface, jurisdiction].filter(Boolean).join(" / ");
    onLabel(known ? `${base} / ${pos} of ${of} in ${band.label}` : base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, surface, jurisdiction, band.label]);
  return null;
}

export interface DetailMastheadProps {
  title: string;
  band: UrgencyBand;
  /** Breadcrumb surface name, e.g. "Regulations". */
  surface: string;
  /** Breadcrumb jurisdiction segment, e.g. "European Union". Omitted renders no second segment (Absence-by-omission). */
  jurisdiction?: string;
  dek?: React.ReactNode;
  /** Scoped ask placeholder, e.g. "Ask about this regulation — e.g. when does the l...". */
  placeholder: string;
  /**
   * Operator check 2 (lane PARITY-PARTS, 2026-09-24): the detail page's ActionCard (band pill +
   * action row + exposure + timeline), passed through to Masthead's own additive `actionSlot`
   * (Masthead.tsx) so it renders INSIDE the one masthead card, not as a sibling card below it.
   * Undefined renders nothing extra here, same as every other additive DetailMasthead prop.
   */
  actionSlot?: React.ReactNode;
}

export function DetailMasthead({ title, band, surface, jurisdiction, dek, placeholder, actionSlot }: DetailMastheadProps) {
  const [breadcrumb, setBreadcrumb] = useState(() => [surface, jurisdiction].filter(Boolean).join(" / "));
  return (
    <>
      <Suspense fallback={null}>
        <DetailMastheadBreadcrumb surface={surface} jurisdiction={jurisdiction} band={band} onLabel={setBreadcrumb} />
      </Suspense>
      <div style={{ marginBottom: 16 }}>
        <Masthead title={title} size="detail" dateLabel={breadcrumb} dek={dek} commandBar={{ itemCount: 0, placeholder, scope: surface.toLowerCase() }} actionSlot={actionSlot} />
      </div>
    </>
  );
}

// ── Summary depth switch: "Summary | Full brief" ────────────────────────
//
// Lane uiactions (2026-09-07, README §0.5 + design ruling R3): the ONLY
// summary depth control in this architecture — two states, not the old
// three-state summary-depth toggle README §0.5 names as removed pre-existing
// (confirmed by this file's own npmtest.mjs asserting that dead control's
// exact former label is gone from the code). Wired, not decorative: a
// detail surface passes `depth` +
// `onChange` from its own useState and reads `depth` when deciding whether
// to also render the item's full brief markdown in the Summary section.
export type SummaryDepth = "summary" | "full";

export function SummaryDepthSwitch({ depth, onChange }: { depth: SummaryDepth; onChange: (d: SummaryDepth) => void }) {
  const opt = (value: SummaryDepth, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={depth === value}
      onClick={() => onChange(value)}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-105)",
        fontWeight: 700,
        padding: "6px 14px",
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        border: "none",
        borderRadius: 5,
        background: depth === value ? "var(--brand)" : "transparent",
        color: depth === value ? "#fff" : "var(--ink-2)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Summary depth"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-control)",
        background: "var(--card)",
      }}
    >
      {opt("summary", "Summary")}
      {opt("full", "Full brief")}
    </div>
  );
}

// ── Sections of fact cards, <=72ch ──────────────────────────────────────

export function DetailSection({
  id,
  title,
  aside,
  index,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  /** "S2"-style ordinal, e.g. 2 -> "S2". Optional, never invented: a caller passes it only when it
   *  has a real ordinal source (parts-brief-2026-09-18.md section 2.3, SectionHeader.tsx's own
   *  header note). */
  index?: number | null;
  children: React.ReactNode;
}) {
  return (
    <SectionCard as="section" id={id} padding="0" style={{ marginBottom: 16, scrollMarginTop: 56, overflow: "hidden" }}>
      {/* lane W10-SectionHeader, 2026-09-22: every S-section on every detail surface renders through
          the one shared SectionHeader part (parts-brief-2026-09-18.md section 2.3) instead of a
          hand-typed h2+aside (F49). data-guard-title/data-guard-display live on SectionHeader's own
          h2 now, unchanged markers, same guard coverage (item D3 / FOLD 63, 2026-09-08). */}
      <SectionHeader index={index != null ? `S${index}` : null} title={title} meta={aside} />
      <div style={{ padding: "16px 20px", maxWidth: "72ch" }}>{children}</div>
    </SectionCard>
  );
}

// ── Page wrapper: the ONE outer frame (max-width + responsive side padding)
// shared by header/timeline/index/layout, so a detail surface never re-declares its own copy of the
// --cl-detail-pad-x breakpoint (globals.css, lane MOBILE-2 precedent). One instance per page.
//
// Lane PARITY-PARTS (2026-09-24, operator check 1): the wrapper is also the ONE place a detail page
// declares its item's band and its one real action sentence (`topRecommendedAction`), provided to
// every ItemGroup and StateNote below it (band-context.tsx), so no section, group or note on the page
// can render untinted because a caller forgot to thread the band.

export function DetailPageWrapper({
  children,
  band = null,
  action = null,
}: {
  children: React.ReactNode;
  band?: UrgencyBand | null;
  action?: string | null;
}) {
  return (
    <BandProvider band={band} action={action}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 var(--cl-detail-pad-x) 40px" }}>{children}</div>
    </BandProvider>
  );
}

/** The item's single highest-priority recommended action (the pipeline's `recommendedActions`
 *  field), or null. Real data only: this is what closes an item group's ACTION strip. */
export function topRecommendedAction(r: Pick<Resource, "recommendedActions">): string | null {
  const sorted = [...(r.recommendedActions || [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const text = sorted.find((a) => a.action && a.action.trim())?.action ?? null;
  return text ? text.trim() : null;
}

// ── Layout: content column + rail (no padding/max-width of its own — lives inside DetailPageWrapper) ──

export function DetailLayout({ children, rail }: { children: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div
      className="cl-detail-layout"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 300px",
        // README 0.3 frame: `gap: 28px` (the list frame's own value, ListSurfaceShell.tsx). With the
        // 40px --cl-detail-pad-x this yields the 780px content column of ruling 1 (2026-09-24).
        gap: 28,
        alignItems: "start",
      }}
    >
      <style>{`
        @media (max-width: 1280px) {
          .cl-detail-layout { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div data-audit="detail-rail" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        {rail}
      </div>
    </div>
  );
}

// ── Rail order: the ONE slot contract ───────────────────────────────────
//
// Lane details60 (2026-09-08, fold report Addendum 86 postscript 14: "the rail
// puts IN THIS LIST FIRST where the artboard puts AT A GLANCE first",
// consistently across all four detail artboards). Measured from the artboard
// markup rather than from that prose — the rail card heads in document order
// are:
//
//   03  At a glance · Impact assessment · Relevance · Owner & team ·
//       In this list · Connections · Legend
//   05  At a glance · Impact assessment · Relevance · Your notes ·
//       In this list · Legend
//   07  At a glance · Impact assessment · Relevance · Connections ·
//       Cluster synthesis · Legend
//   09  At a glance · Impact assessment · Relevance · Related in Asia · Legend
//
// So the invariant shared by all four is: AT A GLANCE, IMPACT ASSESSMENT,
// RELEVANCE, then the page's own designed cards in artboard order, then
// LEGEND last. This component is that order, expressed once; a detail surface
// names its cards by slot and cannot reorder them. Cards the artboard does not
// draw at all (ruling R7 features: the place-keeping card on 07/09, the
// connections card on 05/09, affected lanes) go in `undesigned`, after the
// last designed region of the column, exactly where R7 puts them.
export interface DetailRailProps {
  /** Artboard slot 1 on every detail artboard. */
  atAGlance?: React.ReactNode;
  /** Artboard slot 2. */
  impact?: React.ReactNode;
  /** Artboard slot 3 (ruling 3.4: the live HIGH RELEVANCE chip, unstyled, as is). */
  relevance?: React.ReactNode;
  /** The page's own cards between RELEVANCE and LEGEND, in artboard order. */
  designed?: React.ReactNode;
  /** Artboard slot last. */
  legend?: React.ReactNode;
  /** R7: features the artboard does not draw, after the last designed region. */
  undesigned?: React.ReactNode;
}

export function DetailRail({ atAGlance, impact, relevance, designed, legend, undesigned }: DetailRailProps) {
  return (
    <>
      {atAGlance}
      {impact}
      {relevance}
      {designed}
      {legend}
      {undesigned}
    </>
  );
}

// ── Rail: "At a glance" key/value card ──────────────────────────────────
//
// Extension (lane uidetails2, 2026-09-07): the first rail card on every
// 05/07/09 artboard — band/type/jurisdiction/topic/source/published/
// re-check date as plain label:value rows. Generic so each surface
// supplies its own real rows (never a fabricated field — a row a surface
// has no data for is simply omitted by its caller, matching the rest of
// this architecture's Absence convention).

export interface AtAGlanceRow {
  label: string;
  value: React.ReactNode;
}

// Lane W10-RailCard, 2026-09-22: this card's shell (SectionCard + 14px/16px padding + 10.5px/800/
// .12em uppercase muted header "At a glance") was a hand-retyped copy of the same shell the list
// surfaces' rail cards, the dashboard rail, and the admin "Issues queue" rail each retyped
// separately, now the one shared `RailCard` part. Content (the label/value grid, the Absence
// convention on an empty set) is unchanged; only the shell moved.
/**
 * Operator check 8 (lane PARITY-PARTS, 2026-09-24): "The right rail does not repeat masthead fields
 * (band, type, jurisdiction, source, published)". The masthead (breadcrumb + dek) and the action
 * card's pill row already carry these, so the rail card refuses them structurally: a caller passing
 * one gets nothing rendered for it, and no future caller can reintroduce the repeat. "Kind" is the
 * market surface's name for the item type; "Region" is the operations surface's jurisdiction.
 */
export const MASTHEAD_FIELD_LABELS: ReadonlySet<string> = new Set(["band", "type", "kind", "jurisdiction", "region", "source", "published"]);

export function AtAGlanceCard({ rows }: { rows: AtAGlanceRow[] }) {
  const present = rows.filter(
    (r) => r.value !== null && r.value !== undefined && r.value !== "" && !MASTHEAD_FIELD_LABELS.has(r.label.trim().toLowerCase())
  );
  if (present.length === 0) return null;
  return (
    <RailCard title="At a glance" dataAudit="at-a-glance-rail">
      {/* dc.html #p3 "At a glance" card: grid-template-columns:96px 1fr;gap:7px 12px (row-gap 7,
          column-gap 12) — a fixed label column, not `auto`. */}
      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "7px 12px", fontSize: "var(--fs-12)" }}>
        {present.map((r, i) => (
          <>
            <span key={`${i}-k`} style={{ color: "var(--ink-3)", fontWeight: 600 }}>
              {r.label}
            </span>
            <span key={`${i}-v`} style={{ color: "var(--ink)", fontWeight: 600, overflowWrap: "anywhere" }}>
              {r.value}
            </span>
          </>
        ))}
      </div>
    </RailCard>
  );
}

// ── Rail: impact card, ONE stepped meter out of 12 ──────────────────────
//
// Operator check 3 (lane PARITY-PARTS, 2026-09-24): "Impact is ONE stepped meter out of 12; the
// four-bar Cost/Compliance/Client-facing/Operational block and the legend text 'four scored
// dimensions' must appear nowhere." The card mounts the SAME row meter every list row draws (README
// 0.4 row variant, revised 2026-09-18: four rising bars as a stepped fill of the total, N/12 beside
// it), never the per-dimension full variant. The detail rail's former RailLegend (which described
// the retired per-dimension model in prose) is deleted; the four detail surfaces mount the list
// surfaces' own `LegendRailCard`, which carries ruling 5's live meter frozen at 8/12.

export function ImpactRailCard({ scores }: { scores?: ImpactScores | null }) {
  return (
    <RailCard title="Impact assessment" dataAudit="impact-assessment-rail">
      <ImpactMeter scores={scores} />
    </RailCard>
  );
}

// ── Rail: legend card (Impact / Timeline / Source tier) ─────────────────
//
// Operator check 3 (lane PARITY-PARTS, 2026-09-24): the prior copy here described the retired
// four-dimension impact model ("four scored dimensions, sorted low to high..."), the literal
// phrase the harness forbids verbatim, and a description of a variant `ImpactRailCard` (above) no
// longer renders (it now mounts the SAME stepped row meter every list row draws, frozen at its
// item's own score out of 12, never the four-bar per-dimension block). Reworded to describe what is
// actually on the page; no other legend row changes.

export function RailLegend() {
  return (
    <RailCard title="Legend" dataAudit="detail-legend-rail">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--fs-11)", color: "var(--ink-2)", lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Impact</strong>, one stepped meter, filled left to
          right; the number beside it is the score, out of 12.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Timeline</strong>, passed · next · ahead.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Source tier</strong>, T1 binding law through T6
          commentary.
        </p>
      </div>
    </RailCard>
  );
}

// ── Rail: "In this list · N of M" ────────────────────────────────────────
//
// AlphaSense behaviour (README §0.5): opening an item from a list keeps
// the reader's place. The list-position contract IS now documented — the
// lists lane's `withListPosition` (src/components/list-surface/
// list-surface-helpers.ts, lane uilists-2026-09-06, logged in that lane's
// own DEVIATION-LOG.md entry) appends `?list=<surface>&pos=<n>&of=<m>` to
// every row href. Lane uidetails2 (2026-09-07) reads all three params —
// `pos`/`of` for the "N of M" line (this shell already read those as a
// provisional contract; now confirmed against the shipped one) and `list`
// so a caller can label which filtered set the position was computed
// against (see DEVIATION-LOG.md's list-position row for this lane's own
// entry recording the regulation detail's adoption of the same contract).
// Reading searchParams is a Dynamic API under classical rendering
// (PERF-10, this repo's own precedent — see RegulationsLedger.tsx's
// SearchParamsFilterBridge), so this is resolved CLIENT-SIDE inside a
// small Suspense-wrapped bridge, never on the server page, so the four
// detail routes' static generation (generateStaticParams) is unaffected.

function InThisListBridge({
  onParams,
}: {
  onParams: (pos: string | null, of: string | null, list: string | null) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onParams(searchParams.get("pos"), searchParams.get("of"), searchParams.get("list"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

// FOLD-56 (F7): reads the same `prev`/`next` slugs `withListPosition`'s row href now carries
// (list-surface-helpers.ts), alongside pos/of/list. A second bridge rather than widening
// InThisListBridge above — InThisListBridge's existing callers (BreadcrumbListPosition) have no
// use for neighbour slugs, so this keeps that read minimal and additive.
function InThisListNeighborsBridge({
  onParams,
}: {
  onParams: (prev: string | null, next: string | null) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onParams(searchParams.get("prev"), searchParams.get("next"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

// ── Header: breadcrumb's last segment ("1 of 9 in Action") ──────────────
//
// GAP G2 (2026-09-07): this segment now renders inside `DetailMastheadBreadcrumb`
// above (the Masthead's own VOL/breadcrumb line, ruling R4) rather than inside
// DetailHeader's meta line — DetailHeader no longer has a meta line at all
// (see its own doc comment). The prior `BreadcrumbListPosition` component
// that rendered it there was removed as dead code once its only caller was
// removed (CLAUDE.md rule 13); `InThisListBridge` (the shared pos/of/list
// reader) is unchanged and still feeds `InThisListStat` below.

export function InThisListStat({
  backHref,
  backLabel,
  band,
}: {
  backHref: string;
  backLabel: string;
  /**
   * Mobile 390 build, lane mobdetail (2026-09-07, spec "RAIL": place-keeping
   * card reads "In this list, 4 of 13 in Action"). Optional so a caller
   * that has not passed a band keeps this card's pre-existing wording
   * (Absence-by-omission, same convention the rest of this file uses).
   */
  band?: UrgencyBand;
}) {
  const [params, setParams] = useState<{ pos: string | null; of: string | null; list: string | null } | null>(null);
  const [neighbors, setNeighbors] = useState<{ prev: string | null; next: string | null } | null>(null);
  const pathname = usePathname();

  const pos = params?.pos ? Number(params.pos) : null;
  const of = params?.of ? Number(params.of) : null;
  const known = pos != null && of != null && Number.isFinite(pos) && Number.isFinite(of);

  // FOLD-56 (F7): reconstruct each neighbour's own detail href from what this page already knows
  // (its own `list`/`of`, pos-1/pos+1) plus the neighbour's slug — the row href only ever carried
  // the bare slug (bounded, no second list/pos/of per neighbour; see list-surface-helpers.ts). The
  // neighbour's own path is this page's own pathname with its last segment (the current slug)
  // swapped for the neighbour's.
  const basePath = pathname ? pathname.replace(/\/[^/]*$/, "") : null;
  const prevHref =
    known && basePath && neighbors?.prev
      ? withListPosition(`${basePath}/${encodeURIComponent(neighbors.prev)}`, params?.list ?? "", (pos as number) - 1, of as number)
      : null;
  const nextHref =
    known && basePath && neighbors?.next
      ? withListPosition(`${basePath}/${encodeURIComponent(neighbors.next)}`, params?.list ?? "", (pos as number) + 1, of as number)
      : null;

  return (
    <RailCard title={`In this list${params?.list ? ` · ${params.list}` : ""}`} dataAudit="in-this-list-rail">
      <Suspense fallback={null}>
        <InThisListBridge onParams={(p, o, l) => setParams({ pos: p, of: o, list: l })} />
      </Suspense>
      <Suspense fallback={null}>
        <InThisListNeighborsBridge onParams={(p, n) => setNeighbors({ prev: p, next: n })} />
      </Suspense>
      <p style={{ fontSize: "var(--fs-13)", color: "var(--ink)", margin: "0 0 8px" }}>
        {known ? `${pos} of ${of}${band ? ` in ${band.label}` : ""}` : <Absence reason="not in primary source" />}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link
          href={backHref}
          prefetch={false}
          style={{
            fontSize: "var(--fs-11)",
            fontWeight: 700,
            color: "var(--ink)",
            textDecoration: "underline",
            textDecorationColor: "var(--link-line)",
            minHeight: 24,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {backLabel}
        </Link>
        {/* Mobile 390 spec "SECTION INDEX AND RAIL": prev/next links, 12px/600. Omitted (not
            rendered) when there is no such neighbour — first row has no prev, last has no next. */}
        {(prevHref || nextHref) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            {prevHref && (
              <Link href={prevHref} prefetch={false} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", minHeight: 24, display: "inline-flex", alignItems: "center" }}>
                {"‹ prev"}
              </Link>
            )}
            {nextHref && (
              <Link href={nextHref} prefetch={false} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", minHeight: 24, display: "inline-flex", alignItems: "center" }}>
                {"next ›"}
              </Link>
            )}
          </span>
        )}
      </div>
    </RailCard>
  );
}
