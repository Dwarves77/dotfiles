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
 * DEVIATION (logged in docs/design/handoff-2026-09-06/DEVIATION-LOG.md):
 * the artboards' Filters rail card uses checkboxes; this renders the same
 * groups as FilterChipGroup/FilterChip pills, the actual shared component
 * README §0.4 defines for "filter chips grouped in labelled sets", per this
 * lane's dispatch. Rail cards specific to one surface (Obligations
 * calendar, Carbon cost per FEU, Source coverage, Next data drops) are not
 * reproduced here — logged as deferred, out of this lane's list-mechanics
 * budget.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Masthead } from "@/components/ui/Masthead";
import { BandTile } from "@/components/ui/BandTile";
import { ListRow, type ListRowProps } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { FilterChipGroup, FilterChip } from "@/components/ui/Chips";
import { SkeletonListRow, SkeletonBandTile } from "@/components/ui/Skeleton";
import { BAND_ORDER, type UrgencyBand, type UrgencyBandKey } from "@/lib/urgency/bands";
import { VirtualizedRowList } from "@/components/ledger/VirtualizedRowList";
import type { FacetOption } from "./list-surface-helpers";

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
  dateLabel: string;
  itemCount: number;
  scope: string;
  onSearch?: (q: string) => void;

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

  /** Extra content rendered at the FOOT of the primary card column, below
   *  stateNote — restored this lane (UILISTS2, 2026-09-07) for Regulations'
   *  DismissedStash disclosure (an app feature not shown in the 17
   *  artboards, restored exactly per operator ruling, not redesigned).
   *  Optional: the other four surfaces this shell serves pass nothing. */
  belowRows?: ReactNode;

  rail: ReactNode;
}

function Card({ children }: { children: ReactNode }) {
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
        showing {showing} of {total}
      </span>
    </div>
  );
}

export function ListSurfaceShell({
  title,
  dek,
  dateLabel,
  itemCount,
  scope,
  onSearch,
  bandCounts,
  selectedBand,
  onSelectBand,
  facetGroups,
  secondaryFacetGroups,
  aboveRows,
  rowsByBand,
  perBandCap,
  onExpandBand,
  expandedBands,
  loadingFirstPage,
  loadingMoreRows,
  emptyState,
  stateNote,
  belowRows,
  rail,
}: ListSurfaceShellProps) {
  const anyRows = rowsByBand.some((b) => b.rows.length > 0);

  return (
    <>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead title={title} dek={dek} dateLabel={dateLabel} commandBar={{ itemCount, onSearch, scope }} />
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
            .cl-list-surface-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* Band tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
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

          {/* Facets — always visible, live counts */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "var(--card)",
              border: "1px solid var(--line-1)",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow-card)",
              padding: "12px 16px",
            }}
          >
            {facetGroups.map((group) => (
              <FilterChipGroup key={group.key} label={group.label}>
                <FilterChip active={group.selected === null} onClick={() => group.onSelect(null)}>
                  All
                </FilterChip>
                {group.options.map((opt) => (
                  <FilterChip key={opt.value} active={group.selected === opt.value} onClick={() => group.onSelect(opt.value)}>
                    {opt.label} · {opt.count}
                  </FilterChip>
                ))}
              </FilterChipGroup>
            ))}
          </div>

          {secondaryFacetGroups && secondaryFacetGroups.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                background: "var(--card)",
                border: "1px solid var(--line-1)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--shadow-card)",
                padding: "12px 16px",
              }}
            >
              {secondaryFacetGroups.map((group) => (
                <FilterChipGroup key={group.key} label={group.label}>
                  <FilterChip active={group.selected === null} onClick={() => group.onSelect(null)}>
                    All
                  </FilterChip>
                  {group.options.map((opt) => (
                    <FilterChip key={opt.value} active={group.selected === opt.value} onClick={() => group.onSelect(opt.value)}>
                      {opt.label} · {opt.count}
                    </FilterChip>
                  ))}
                </FilterChipGroup>
              ))}
            </div>
          )}

          {aboveRows}

          {/* Rows, grouped by band */}
          {loadingFirstPage ? (
            <Card>{Array.from({ length: 15 }).map((_, i) => <SkeletonListRow key={i} />)}</Card>
          ) : !anyRows ? (
            <Card>
              <div style={{ padding: 16 }}>{emptyState ?? <StateNote>Nothing matches these filters right now.</StateNote>}</div>
            </Card>
          ) : (
            rowsByBand
              .filter((section) => section.total > 0)
              .map((section) => {
                const expanded = expandedBands?.has(section.band.key) ?? false;
                const cap = expanded ? section.rows.length : perBandCap;
                const visible = section.rows.slice(0, cap);
                return (
                  <Card key={section.band.key}>
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
                    {section.total > visible.length && onExpandBand && (
                      <div style={{ padding: "10px 16px" }}>
                        {/* law-2 (RD-60/F35): a bare underlined text link with no padding is well
                            under the 24px small-target floor. min-height + vertical padding lifts
                            it to a real target without changing its visual (still text + underline,
                            no chip/pill chrome the artboard doesn't show). */}
                        <button
                          type="button"
                          onClick={() => onExpandBand(section.band.key)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: 24,
                            fontSize: "var(--fs-11)",
                            fontWeight: 700,
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
                          All {section.total} {section.band.label.toLowerCase()}
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })
          )}

          {stateNote && anyRows && <div>{stateNote}</div>}
          {belowRows}
        </div>

        {/* Rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{rail}</div>
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
