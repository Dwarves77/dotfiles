"use client";

/**
 * ListSurfaceShell — the one list-surface layout (UI system handoff
 * 2026-09-06, artboards 02/04/06/08/11: band tiles -> rows GROUPED BY BAND
 * (each band its own mini-section: header + up to a cap of rows + "All N
 * <band>" link + a one-line transition strip into the next band) -> rail
 * (Filters + Legend, 300px). Assembled ONLY from src/components/ui/ parts:
 * Masthead (carries CommandBar), BandTile, ListRow, StateNote,
 * FilterChipGroup/FilterChip, Skeleton.
 *
 * Extracted once here rather than five times because the five surfaces this
 * lane owns (Regulations/Market/Research/Operations/Watchlist) are
 * byte-identical at this layer per the artboards — CLAUDE.md rule 13
 * forbids the five-way copy that would otherwise result. NOT a
 * src/components/ui/ shared part (only these five surfaces use it), so it
 * lives under its own directory rather than in ui/.
 *
 * Desktop Filters (lane compose-lists, 2026-09-07/08, operator audit "the filters were not above
 * the regulations, they were on the right — same on every page"; artboard 02/id="p2"): the rail's
 * `FiltersRailCard` (ListSurfaceRailCards.tsx) renders the SAME facetGroups/secondaryFacetGroups
 * data as real checkbox rows with live counts, matching the artboards' own checkbox rendering —
 * this superseded an earlier pill-based rail card (see DEVIATION-LOG's prior "checkboxes vs pills"
 * entry, now closed). Rail cards specific to one surface (Obligations calendar, Carbon cost per
 * FEU, Source coverage, Next data drops) are not reproduced here — logged as deferred, out of this
 * lane's list-mechanics budget.
 *
 * Mobile (lane moblist, 2026-09-07, mobile-390 spec "FILTERS"): below 768px the facet UI stays
 * pill-based — ONE horizontally-scrolling strip of `FilterChipGroup` shells (no live counts in the
 * strip itself — compact, label + chips only) plus a "Filters" control opening a SHEET — built
 * from the SAME bottom-anchored/scrim mechanism the nav drawer uses (`Sidebar.tsx`'s
 * `rgba(0,0,0,.3)` scrim, confirmed the app's own value by README line 133 "30%-black scrim"),
 * never a page-local overlay — containing exactly the facet groups the rail shows on desktop (the
 * SAME `facetGroups`/`secondaryFacetGroups` this shell already receives, rendered with their live
 * counts, unchanged chip chrome), plus a close target. The spec names the sheet but the operator's
 * own overlays list says overlay styling is not designed — logged in DEVIATION-LOG.md as "sheet
 * built from the drawer mechanism, styling pending an artboard".
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Masthead } from "@/components/ui/Masthead";
import { SectionRule } from "@/components/ui/SectionRule";
import { BandTile } from "@/components/ui/BandTile";
import { ListRow, type ListRowProps } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { FilterChipGroup, FilterChip } from "@/components/ui/Chips";
import { SkeletonListRow, SkeletonBandTile } from "@/components/ui/Skeleton";
import { FiltersRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { BAND_ORDER, type UrgencyBand, type UrgencyBandKey } from "@/lib/urgency/bands";
import { VirtualizedRowList } from "@/components/ledger/VirtualizedRowList";
import type { FacetOption } from "./list-surface-helpers";
// Lane opsclip (train 61, defect 4): every RENDERED count on this shell goes through the
// locale-pinned helper (F36, src/lib/format.ts). Before this pass the band tiles were separated and
// nothing else was, so one /regulations screen carried "1,317 regulations" and "showing 5 of 1031"
// on the same fold, plus "All 1031 monitor" and "then Monitor · 1031".
import { formatNumber } from "@/lib/format";

// PERF-12: only worth windowing once a band's expanded row count clears the perBandCap-collapsed
// case by a wide margin. 30 rows unwindowed is cheap; a band expanded to hundreds is not.
const VIRTUALIZE_THRESHOLD = 30;

export interface ListSurfaceFacetGroup {
  key: string;
  label: string;
  options: FacetOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}

export interface ListSurfaceShellProps {
  title: string;
  dek?: ReactNode;
  /** The masthead scope line under the title (artboard 02/id="p2": "1,316 active · 32
   *  jurisdictions · last sync Sep 4 · next obligation Sep 25 · EU Net-Zero Industry Act"), live
   *  fields only — a caller with a field it cannot source omits that segment rather than inventing
   *  it. Renders via Masthead's own `dek` slot when `dek` itself is not passed. */
  scopeLine?: ReactNode;
  dateLabel: string;
  /** Server render instant (src/lib/render-now.ts) — threaded to <Masthead/> so the VOL week
   *  number is not recomputed from each host's own clock. See render-now.ts. */
  nowIso?: string;
  itemCount: number;
  scope: string;
  onSearch?: (q: string) => void;
  /** Page-scoped command-bar prompt (each list artboard writes its own, e.g. artboard 08/id="p8":
   *  'Search regions and dimensions ...'). Omitted, CommandBar's generic item-count placeholder
   *  stands. Pass-through only: the ask surface is still the one CommandBar in the Masthead. */
  searchPlaceholder?: string;

  bandCounts: Record<UrgencyBandKey, number> | null;
  selectedBand: UrgencyBandKey | null;
  onSelectBand: (key: UrgencyBandKey) => void;

  /** Mode / Region (+ any surface-specific extra group, e.g. Research's
   *  Themes) filter chip groups, always visible, always carrying live
   *  counts (README §"Facets always visible with live counts"). */
  facetGroups: ListSurfaceFacetGroup[];
  /** A second facet row below the first (README screen 6: "Themes are a
   *  second facet row, not a second tile system") — rendered identically,
   *  just its own group. */
  secondaryFacetGroups?: ListSurfaceFacetGroup[];

  /** Extra content rendered between the facets and the band-grouped rows —
   *  used by Operations for the region x dimension matrix (README artboard
   *  08: "six dimension tiles collapse into the matrix header"), which is
   *  not one of the shared row/tile parts and is reused unchanged. */
  aboveRows?: ReactNode;

  /** Count + sort/window control row (ListSurfaceSortRow), artboards 02/04:
   *  rendered directly above the rows, below aboveRows. Omitted by surfaces
   *  whose artboard does not carry this row (Research/Operations/Watchlist). */
  sortRow?: ReactNode;

  /** When true, rowsByBand's rows are concatenated (in the order each
   *  band's own `rows` array already carries — the caller sorts them) into
   *  ONE unheaded list instead of per-band Card sections — artboard 02's
   *  "Show as one list" state. Each row still carries its own true band
   *  colouring (ListRow's own left-edge bar), only the band SectionHeader
   *  and per-band grouping disappear. */
  flat?: boolean;

  /** Rows already grouped by band, in BAND_ORDER, each with its true
   *  (post-filter) total so the section can say "showing N of M". */
  rowsByBand: Array<{
    band: UrgencyBand;
    rows: Array<ListRowProps & { key: string }>;
    total: number;
  }>;
  /** How many rows to show per band section before "All N <band>". */
  perBandCap: number;
  onExpandBand?: (key: UrgencyBandKey) => void;
  expandedBands?: Set<UrgencyBandKey>;

  loadingFirstPage?: boolean;
  loadingMoreRows?: boolean;

  emptyState?: ReactNode;
  stateNote?: ReactNode;

  /** Extra content rendered INSIDE a band's card, below that card's foot row (artboards 02/06:
   *  the one-line transition strip that explains the next band, e.g. Research's "Awareness · 34
   *  findings sit below the scoring threshold and are kept for context · Why unscored"). Called
   *  once per rendered band section with that band's key and the next rendered section's band key
   *  (null on the last section); return null to render nothing for that band. */
  sectionFoot?: (bandKey: UrgencyBandKey, nextBandKey: UrgencyBandKey | null) => ReactNode;

  /** Extra content rendered at the FOOT of the primary card column, below
   *  stateNote — restored this lane (UILISTS2, 2026-09-07) for Regulations'
   *  DismissedStash disclosure (an app feature not shown in the 17
   *  artboards, restored exactly per operator ruling, not redesigned).
   *  Optional: the other four surfaces this shell serves pass nothing. */
  belowRows?: ReactNode;

  rail: ReactNode;
}

// Mobile-390 spec "FILTERS" (lane moblist, 2026-09-07). Desktop unchanged (this CSS only fires
// below 768px): the facets card hides, a horizontal-scroll strip of compact FilterChipGroup
// shells plus a "Filters" button take its place, and the sheet (built from the nav drawer's own
// scrim mechanism) is available regardless of viewport but only reachable via that button.
const MOBILE_FILTERS_CSS = `
  .cl-facets-mobile, .cl-filters-btn { display: none; }
  @media (max-width: 767px) {
    /* MOBILE-60 (2026-09-08) [CONFIRMED, measured at 390 by the audit's mobile-*
       specs]. Three page-level measures the five list surfaces were missing:

       (a) PAGE PADDING. Both wrappers below carry a hardcoded 40px side padding with
       no mobile escape, so at 390 the content column was 310px wide and the masthead,
       whose own mobile rule already sets 14px 16px 0, sat 56px in from the page edge.
       The mobile 390 spec states 14px 16px 0 for the masthead and 14px 16px 16px for
       the tile/content container; those are now the values that actually apply.

       (b) BAND TILES. The tile row here had no class at all, so the spec's "2x2 grid,
       gap 10px" (which DashboardBrief got via .cl-band-tiles) never reached the five
       list surfaces and they rendered four 67px tiles across. The rule itself lives in
       BandTile.tsx with the rest of the tile's mobile measures — one definition, both
       callers — and this row now carries that class.

       (c) DUPLICATE FILTER SURFACE. Below 768 the rail's own FILTERS card rendered
       UNDER the folded rail at the same time as the mobile chip strip and the Filters
       sheet button: two live filter controls for one set of facets, from the same
       facetGroups. The mobile 390 spec designs exactly one ("chip groups scroll
       sideways as whole units"; "facet counts and the workspace-tag facet open in a
       sheet from Filters"), so the desktop expression of it is not shown at this
       width. The rest of the rail still folds under the content, as the spec says. */
    .cl-list-surface-masthead { padding: 0 !important; }
    .cl-list-surface-grid { padding: 14px 16px 16px !important; gap: 16px !important; }
    .cl-list-surface-grid [data-audit="filters-rail"] { display: none !important; }
    .cl-facets-desktop { display: none !important; }
    .cl-facets-mobile {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding: 2px 2px 4px;
    }
    .cl-facets-mobile .cl-filter-group { flex-shrink: 0; }
    .cl-filters-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 8px;
      border: 1px solid rgba(0,0,0,.25);
      background: #FFFFFF;
      color: var(--ink);
      font-size: 13px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      align-self: flex-start;
    }
  }
`;

/**
 * FilterSheet — the mobile "Filters" sheet (mobile-390 spec: "the sheet from
 * Filters... built from the SAME drawer/scrim mechanism the nav drawer
 * uses"). Bottom-anchored, white, the app's existing 30%-black scrim
 * (Sidebar.tsx), 44px close target; contains exactly the facet groups the
 * rail shows on desktop (facetGroups + secondaryFacetGroups, unchanged
 * FilterChipGroup/FilterChip rendering, live counts) — no invented chrome
 * beyond that mechanism, per this lane's dispatch. Rendered regardless of
 * viewport (React-controlled `open` state, not a CSS breakpoint) since only
 * the mobile-only "Filters" button (above) ever opens it.
 */
function FilterSheet({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: ListSurfaceFacetGroup[];
}) {
  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 60 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "80vh",
          overflowY: "auto",
          background: "#FFFFFF",
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          boxShadow: "var(--shadow-card-hover, 0 -8px 24px rgba(0,0,0,.12))",
          zIndex: 61,
          padding: "12px 16px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: "var(--fs-14)", fontWeight: 800, color: "var(--ink)" }}>Filters</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            style={{
              minWidth: 44,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              fontSize: 20,
              color: "var(--ink-3)",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((group) => (
            <div key={group.key} style={{ minHeight: 44, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <FilterChipGroup label={group.label}>
                <FilterChip active={group.selected === null} onClick={() => group.onSelect(null)}>
                  All
                </FilterChip>
                {group.options.map((opt) => (
                  <FilterChip key={opt.value} active={group.selected === opt.value} onClick={() => group.onSelect(opt.value)}>
                    {opt.label} · {opt.countLabel ?? formatNumber(opt.count)}
                  </FilterChip>
                ))}
              </FilterChipGroup>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Card({ children, noRule }: { children: ReactNode; noRule?: boolean }) {
  // Ruling 5.1 (2026-09-07): every panel/section card gets the dark-grey graduated top rule. The
  // per-band Card (BandSectionHeader inside it) already carries its own top-edge 3px band-colour
  // accent, which is a data-grouping marker (which band this row group is), not a page-level
  // "section title" rule in 5.1's sense — `noRule` lets that one caller skip a doubled-up top edge
  // rather than stacking two 3px rules. The loading/empty-state Cards (no band header) still get it.
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {!noRule && <SectionRule />}
      {children}
    </div>
  );
}

function BandSectionHeader({ band, total, showing }: { band: UrgencyBand; total: number; showing: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderTop: `3px solid ${band.cssVar}`,
        borderBottom: "1px solid var(--line-2)",
        background: "var(--card)",
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: band.cssVar, display: "inline-block" }} />
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: band.cssVar }}>
          {band.label}
        </span>
        <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>{band.window}</span>
      </span>
      <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>
        showing {formatNumber(showing)} of {formatNumber(total)}
      </span>
    </div>
  );
}

/** Band card foot strip, right side (artboards 02/08): the transition into the next populated band,
 *  or "end of list" on the last card. Reads the sections actually rendered, so a band with no rows
 *  is never named as "next". */
function transitionLabel(sections: Array<{ band: UrgencyBand; total: number }>, index: number): string {
  const next = sections[index + 1];
  return next ? `then ${next.band.label} \u00b7 ${formatNumber(next.total)}` : "end of list";
}

export function ListSurfaceShell({
  title,
  dek,
  scopeLine,
  dateLabel,
  nowIso,
  itemCount,
  scope,
  onSearch,
  searchPlaceholder,
  bandCounts,
  selectedBand,
  onSelectBand,
  facetGroups,
  secondaryFacetGroups,
  aboveRows,
  sortRow,
  flat,
  rowsByBand,
  perBandCap,
  onExpandBand,
  expandedBands,
  loadingFirstPage,
  loadingMoreRows,
  emptyState,
  stateNote,
  sectionFoot,
  belowRows,
  rail,
}: ListSurfaceShellProps) {
  const anyRows = rowsByBand.some((b) => b.rows.length > 0);
  const populatedSections = useMemo(() => rowsByBand.filter((section) => section.total > 0), [rowsByBand]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const allFacetGroups = useMemo(
    () => [...facetGroups, ...(secondaryFacetGroups ?? [])],
    [facetGroups, secondaryFacetGroups],
  );

  return (
    <>
      <div className="cl-list-surface-masthead" style={{ padding: "20px 40px 0" }}>
        <style>{MOBILE_FILTERS_CSS}</style>
        <Masthead
          title={title}
          dek={dek ?? scopeLine}
          dateLabel={dateLabel}
          nowIso={nowIso}
          commandBar={{ itemCount, onSearch, scope, placeholder: searchPlaceholder }}
        />
      </div>
      <div
        style={{
          padding: "20px 40px 40px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 300px",
          gap: 28,
          alignItems: "start",
        }}
        className="cl-list-surface-grid"
      >
        <style>{`
          @media (max-width: 1280px) {
            /* minmax(0, ...), not a bare 1fr: a bare 1fr is minmax(auto, 1fr), whose auto
               minimum is the item's min-content width, so the single track could grow past
               the viewport (MOBILE-60, same defect class fixed in DashboardBrief). */
            .cl-list-surface-grid { grid-template-columns: minmax(0, 1fr) !important; }
          }
        `}</style>
        <style>{MOBILE_FILTERS_CSS}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* Band tiles */}
          <div className="cl-band-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {BAND_ORDER.map((band) =>
              loadingFirstPage || !bandCounts ? (
                <SkeletonBandTile key={band.key} />
              ) : (
                <BandTile
                  key={band.key}
                  band={band}
                  count={bandCounts[band.key] ?? 0}
                  selected={selectedBand === band.key}
                  onSelect={() => onSelectBand(band.key)}
                />
              ),
            )}
          </div>

          {/* Facets — desktop: relocated to the rail's FILTERS card (operator audit 2026-09-07:
              "the filters were not above the regulations, they were on the right — same on every
              page"; artboard 02/id="p2"). Mobile (<768px): unchanged — a compact horizontally-
              scrolling strip (no counts) plus a "Filters" button opening the sheet below, still
              built from the SAME facetGroups/secondaryFacetGroups. */}
          {allFacetGroups.length > 0 && (
            <div className="cl-facets-mobile" data-guard-strip="true">
              {allFacetGroups.map((group) => (
                <FilterChipGroup key={group.key} label={group.label}>
                  <FilterChip active={group.selected === null} onClick={() => group.onSelect(null)}>
                    All
                  </FilterChip>
                  {group.options.map((opt) => (
                    <FilterChip key={opt.value} active={group.selected === opt.value} onClick={() => group.onSelect(opt.value)}>
                      {opt.label}
                    </FilterChip>
                  ))}
                </FilterChipGroup>
              ))}
            </div>
          )}

          {allFacetGroups.length > 0 && (
            <button type="button" className="cl-filters-btn" onClick={() => setFilterSheetOpen(true)}>
              Filters
            </button>
          )}

          <FilterSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} groups={allFacetGroups} />

          {aboveRows}

          {sortRow}

          {/* Rows — flat (artboard 02 "Show as one list"): every matching row, in the order
              rowsByBand's own per-band arrays already carry, concatenated into one unheaded list;
              still virtualized past the threshold, still each row's own true band colouring. */}
          {loadingFirstPage ? (
            <Card>{Array.from({ length: 15 }).map((_, i) => <SkeletonListRow key={i} />)}</Card>
          ) : !anyRows ? (
            <Card>
              {/* A caller-supplied empty state carries its own padding (artboard 06/id="p6":
                  28px 20px, centred, Anton title). The default StateNote gets the 16px inset it
                  has always had. */}
              {emptyState ?? <div style={{ padding: 16 }}><StateNote>Nothing matches these filters right now.</StateNote></div>}
            </Card>
          ) : flat ? (
            (() => {
              const flatRows = rowsByBand.flatMap((section) => section.rows);
              return (
                <Card noRule>
                  {flatRows.length > VIRTUALIZE_THRESHOLD ? (
                    <VirtualizedRowList
                      rows={flatRows}
                      rowHeight={56}
                      getRowId={(row) => row.key}
                      renderRow={(row) => {
                        const { key, ...rowProps } = row;
                        return <ListRow {...rowProps} />;
                      }}
                    />
                  ) : (
                    flatRows.map((row) => {
                      const { key, ...rowProps } = row;
                      return <ListRow key={key} {...rowProps} />;
                    })
                  )}
                </Card>
              );
            })()
          ) : (
            populatedSections
              .map((section, sectionIndex, rendered) => {
                const nextSection = rendered[sectionIndex + 1] ?? null;
                const expanded = expandedBands?.has(section.band.key) ?? false;
                const cap = expanded ? section.rows.length : perBandCap;
                const visible = section.rows.slice(0, cap);
                return (
                  <Card key={section.band.key} noRule>
                    <BandSectionHeader band={section.band} total={section.total} showing={visible.length} />
                    {visible.length > VIRTUALIZE_THRESHOLD ? (
                      // PERF-12 (restored UILISTS2 lane, 2026-09-07): a band expanded to its full
                      // count can seat hundreds of rows (regulations' ~1,316-row corpus is not
                      // evenly split across 4 bands) — windowed so an expanded band never mounts
                      // more DOM rows than the viewport needs. Below the threshold, plain rows: the
                      // common case (collapsed, perBandCap-capped) never pays a virtualizer's setup
                      // cost for 5 rows. Row anatomy is identical either way — this only decides
                      // which rows mount, per ListRow.tsx's own contract.
                      <VirtualizedRowList
                        rows={visible}
                        rowHeight={56}
                        getRowId={(row) => row.key}
                        renderRow={(row) => {
                          const { key, ...rowProps } = row;
                          return <ListRow {...rowProps} />;
                        }}
                      />
                    ) : (
                      visible.map((row) => {
                        const { key, ...rowProps } = row;
                        return <ListRow key={key} {...rowProps} />;
                      })
                    )}
                    {loadingMoreRows && <SkeletonListRow />}
                    {/* Band-card foot row (artboards 02/04/06, id="p2"/"p4"/"p6": "All 15
                        immediate →" left, "then Action · 13" right; "end of list" on the last
                        rendered band). Values are the artboard's own: 10px 16px, 1px top rule,
                        #FAFAF8 ground, 12px text, the link at weight 600. Built here once for
                        every list surface this shell serves, the three artboards draw the same
                        row. The link renders only when the band actually has more rows to reveal
                        (a link that expands nothing would be a dead control, operator audit P0
                        1.1); the "then <next band>" side is always stated. */}
                    <div
                      data-audit="band-foot"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 16px",
                        borderTop: "1px solid var(--line-2)",
                        background: "var(--page)",
                        fontSize: "var(--fs-12)",
                      }}
                    >
                      {section.total > visible.length && onExpandBand ? (
                        // law-2 (RD-60/F35): a bare underlined text link with no padding is well
                        // under the 24px small-target floor. min-height + vertical padding lifts
                        // it to a real target without changing its visual (still text + underline,
                        // no chip/pill chrome the artboard doesn't show).
                        <button
                          type="button"
                          onClick={() => onExpandBand(section.band.key)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: 24,
                            fontSize: "var(--fs-12)",
                            fontWeight: 600,
                            color: "var(--ink)",
                            background: "none",
                            border: "none",
                            padding: "4px 0",
                            cursor: "pointer",
                            textDecoration: "underline",
                            textDecorationColor: "rgba(0,0,0,.3)",
                            fontFamily: "inherit",
                          }}
                        >
                          All {formatNumber(section.total)} {section.band.label.toLowerCase()} →
                        </button>
                      ) : (
                        <span style={{ minHeight: 24, display: "inline-flex", alignItems: "center" }} />
                      )}
                      <span style={{ color: "var(--ink-3)" }}>{transitionLabel(populatedSections, sectionIndex)}</span>
                    </div>
                    {(() => {
                      // The transition strip is per-band and often absent; only the band that has
                      // one pays for its wrapper (an empty 14px-margin div under every band card
                      // is dead space the artboard does not draw).
                      const foot = sectionFoot?.(section.band.key, nextSection ? nextSection.band.key : null);
                      return foot ? <div style={{ margin: "0 16px 14px" }}>{foot}</div> : null;
                    })()}
                  </Card>
                );
              })
          )}

          {stateNote && anyRows && <div>{stateNote}</div>}
          {belowRows}
        </div>

        {/* Rail — FILTERS card first (artboard 02/id="p2" rail order: Filters, then the
            surface-specific card, then Legend), built here once from the same facetGroups /
            secondaryFacetGroups data every list surface already computes, so the relocation out
            of the content column applies to all five surfaces without a per-page rail edit. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FiltersRailCard
            groups={allFacetGroups}
            /* Artboard 02/id="p2" Filters card foot, verbatim. The build had dropped the middle
               sentence; lane lists60 restored it (2026-09-08). */
            footnote="Counts are live for the current selection. Filters never hide behind a button; the band tiles above are the fourth facet."
          />
          {rail}
        </div>
      </div>
    </>
  );
}

/** Shared "fetch the remainder after paint" hook (dispatch: "Keep
 *  LIST_FIRST_PAGE_SIZE = 60 server-side rendering and the after-paint
 *  fetch of the rest"). Calls `fetchRest` once on mount and appends its
 *  result to the server-rendered first page; never refetches on
 *  filter/search changes (filtering is client-side over whatever rows are
 *  currently loaded). Returns the merged row set and whether the remainder
 *  fetch is still in flight. */
export function useRemainderFetch<T extends { id: string }>(
  firstPage: T[],
  fetchRest: () => Promise<T[]>,
  enabled: boolean,
): { rows: T[]; loadingMore: boolean } {
  const [rest, setRest] = useState<T[] | null>(null);
  useEffect(() => {
    if (!enabled) {
      setRest([]);
      return;
    }
    let cancelled = false;
    setRest(null);
    fetchRest()
      .then((r) => {
        if (!cancelled) setRest(r);
      })
      .catch(() => {
        if (!cancelled) setRest([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const rows = useMemo(() => {
    if (rest === null) return firstPage;
    const seen = new Set(firstPage.map((r) => r.id));
    return [...firstPage, ...rest.filter((r) => !seen.has(r.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPage, rest]);

  return { rows, loadingMore: enabled && rest === null };
}
