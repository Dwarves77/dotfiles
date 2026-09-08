"use client";

/**
 * RegionDimensionMatrix — regions on one axis, dimensions on the other, for the Operations surface.
 *
 * WHAT IT REPLACES, AND WHY. Spec 04 acceptance criterion 1 asks for "a cross-region view in which two
 * regions appear on one axis for one dimension, WITHOUT expanding accordions". The surface rendered
 * per-region accordions, all closed by default, so comparing EU against US meant opening two panels and
 * holding the numbers in your head. The register calls this the cheapest change with the largest
 * contract movement, because the data is already keyed (region, dimension) — the shape was the problem,
 * not the storage.
 *
 * IT IS ALSO A COVERAGE INSTRUMENT. EU and US hold ZERO sourced facts across all five dimensions
 * (measured live 2026-08-18: 75 rows, all ASIA/UAE/UK). In a grid that hole is two empty columns you
 * see at a glance, which is the point — the register's ordering argument is that making the gap visible
 * correctly PRICES the producer work rather than hiding it behind closed panels.
 *
 * LAYER 2 (WO-9's deferred half, landed 2026-08-30 on WO-12's migration 267): a fact row that carries
 * the full number envelope (value_numeric + unit at minimum — see `isEnvelopedFact`) now renders as an
 * indexed number, with unit/derivation/origin_class shown, and indexes against the chosen base region
 * when that region ALSO carries an enveloped fact in the same unit for the same cell. A row that does
 * NOT carry the envelope — which is 100% of the 75 live rows as of this write, both WO-17 producers
 * being kill-switched off — renders EXACTLY as before: the free-text `value` column, unchanged. A
 * malformed envelope (value_numeric with a NULL unit) is NOT enveloped per `isEnvelopedFact` and also
 * falls back to the legacy path, never a bare number with no unit. The base-region control's own label
 * says which case applies to the data actually loaded, rather than a single static disclaimer.
 *
 * All computation lives in `@/lib/operations/region-grid.mjs`, which OperationsLedger's coverage rail
 * also consumes, so this surface cannot show two different coverage numbers for one page.
 *
 * DEFECT-FIX (item 3.3, 2026-09-07): every empty cell (`factCount === 0`, `grid` state 'absent') now
 * renders the shared `Absence` component (`ui/Absence.tsx`, reason "not in primary source") instead of
 * a bare "— no data" text span, in both the desktop table cell and the mobile card summary badge. This
 * is what lets `regulatory_feasibility` (D1 — see OperationsLedger.tsx's own MATRIX_DIMENSIONS comment)
 * render as a real row: it structurally has zero rows in `regional_data_facts`, so every one of its
 * cells hits this same empty-cell branch and shows the one honest absence convention, never a blank and
 * never an invented count.
 *
 * COMPOSED TO ARTBOARD 08 (lane comp-08, 2026-09-08). This was a bare <section> with a 15px h2, a
 * sentence-form dek, and the base-region control above the table; artboard 08/id="p8" draws it as a
 * card: ruling 5.1's graduated top rule, an Anton "REGIONS SIDE BY SIDE" head with the coverage and
 * affordance meta on the right, the table, then a foot strip carrying "Compare against:" (moved, not
 * copied) and the dash convention. Cells are the artboard's Anton count over a 9.5px uppercase state
 * word; an empty cell keeps the shared Absence part's fixed-vocabulary word, not the artboard's bare dash
 * (a bare dash is a placeholder literal by the app's own source-entry-filter SoT and the rendering
 * guard fails on it) — logged in DEVIATION-LOG.md. The dimension row carries the
 * artboard's disclosure glyph, and the first fact-holding dimension opens by default per the
 * artboard's own note ("the expanded Facts row is the whole point of this page").
 */

import { Fragment, useMemo, useState } from "react";
import type { OperationsFact, OperationsCoverageRow } from "@/lib/supabase-server";
import { Absence } from "@/components/ui/Absence";
import { SectionRule } from "@/components/ui/SectionRule";
import {
  buildRegionGrid,
  orderRegions,
  sourceUrlFromNote,
  sourceNameFromNote,
  isEnvelopedFact,
  indexAgainstBase,
  formatEnvelopedValue,
  originClassLabel,
  originClassStrength,
  derivationLabel,
} from "@/lib/operations/region-grid.mjs";

export interface MatrixRegion { key: string; label: string }
export interface MatrixDimension { key: string; db: string; name: string }

interface Props {
  regions: MatrixRegion[];
  /** SOURCED dimensions only — the ones with rows in regional_data_facts. */
  dimensions: MatrixDimension[];
  facts: OperationsFact[];
  coverageRows?: OperationsCoverageRow[];
  /** Regulation cross-reference counts per region. Reported, never folded into coverage. */
  crossRefCountsByRegion?: Record<string, number>;
  /** True while the row set those counts are derived from is still loading (OperationsLedger's
   *  after-paint remainder fetch). Defect D4 (2026-09-07): a count over a partially-loaded row set
   *  is a WRONG count, and publishing it produced the "27 -> 777" jump the clickthrough audit saw.
   *  While pending, the line says it is counting rather than naming a number (README §0.6: a count
   *  still loading shows a loading affordance, never a figure that will change under the reader). */
  crossRefCountsPending?: boolean;
}

const FRESHNESS_LABEL: Record<string, string> = {
  current: "current",
  ageing: "ageing",
  stale: "stale",
  frozen: "not updating",
  unknown: "date unknown",
};

// Artboard 08/id="p8" cell state word: "CURRENT" in ink (#1A1A1A), "AGEING" in muted (#7A6E6C).
// The two states the artboard does NOT draw keep their warning/error hue — a feed that has STOPPED
// updating ("frozen") is a signal the artboard had no example of, never quietened to grey here.
const FRESHNESS_COLOR: Record<string, string> = {
  current: "var(--ink)",
  ageing: "var(--ink-3)",
  stale: "var(--color-warning)",
  frozen: "var(--color-error)",
  unknown: "var(--color-text-muted)",
};

export function RegionDimensionMatrix({
  regions,
  dimensions,
  facts,
  coverageRows = [],
  crossRefCountsByRegion = {},
  crossRefCountsPending = false,
}: Props) {
  const [baseRegion, setBaseRegion] = useState<string | null>(null);
  // Artboard 08/id="p8"'s own note: "the expanded Facts row is the whole point of this page and is
  // open by default" (and its own markup draws Labor markets open). The default is the first
  // dimension that actually HOLDS facts, so the page never opens onto an empty Facts row; null
  // (nothing open) only when no dimension holds any. `undefined` means "not chosen yet", so a
  // reader who closes the opened row gets `null` and it stays closed.
  const [openDimension, setOpenDimension] = useState<string | null | undefined>(undefined);

  const dbByKey = useMemo(() => Object.fromEntries(dimensions.map((d) => [d.db, d.key])), [dimensions]);

  const grid = useMemo(
    () =>
      buildRegionGrid({
        regionKeys: regions.map((r) => r.key),
        sourcedDimensions: dimensions.map((d) => d.db),
        facts: facts.map((f) => ({
          regionKey: f.region_code,
          dimension: f.dimension,
          factLabel: f.fact_label,
          value: f.value,
          status: f.status,
          sourceNote: f.source_note,
          sourceName: f.source_name,
          sourceUrl: f.source_url,
          lastUpdated: f.last_updated,
          freshness: f.freshness,
          // Layer 2 (WO-12 envelope, migration 267) — carried through unchanged so isEnvelopedFact /
          // indexAgainstBase / formatEnvelopedValue below can read them. NULL on every one of the 75
          // live rows today (rule 0.15 re-read 2026-08-30); the dual-layer render below is exercised
          // by fixtures in region-grid.test.mjs, not yet by live data.
          valueNumeric: f.value_numeric,
          unit: f.unit,
          currency: f.currency,
          derivation: f.derivation,
          originClass: f.origin_class,
          sourceKey: f.source_key,
          sourceRef: f.source_ref,
          nObservations: f.n_observations,
          methodVersion: f.method_version,
          asAtDate: f.as_at_date,
          referencePeriod: f.reference_period,
        })),
        coverageRows: coverageRows.map((c) => ({
          regionKey: c.region_code,
          dimension: c.dimension,
          state: c.state,
          factCount: c.fact_count,
        })),
        crossRefCountsByRegion,
      }),
    [regions, dimensions, facts, coverageRows, crossRefCountsByRegion]
  );

  const defaultOpenDimension = useMemo(
    () => dimensions.find((d) => facts.some((f) => f.dimension === d.db))?.db ?? null,
    [dimensions, facts],
  );
  const resolvedOpen = openDimension === undefined ? defaultOpenDimension : openDimension;

  const orderedKeys: string[] = useMemo(
    () => orderRegions(regions.map((r) => r.key), baseRegion),
    [regions, baseRegion]
  );
  const orderedRegions = orderedKeys.map((k) => regions.find((r) => r.key === k)!).filter(Boolean);
  const coverageByRegion = Object.fromEntries(grid.regionCoverage.map((r: any) => [r.regionKey, r]));

  // Layer 2: whether ANY loaded fact carries a valid envelope. Governs the base-region control's own
  // disclaimer (honest per the data actually on screen, never a static claim) — true today only in
  // tests, since 0 of 75 live rows are enveloped.
  const anyEnveloped = useMemo(
    () => grid.cells.some((c: any) => c.facts.some(isEnvelopedFact)),
    [grid]
  );

  // For an enveloped fact in a non-base region's cell, find the base region's matching fact in the
  // SAME cell to index against: same fact_label preferred (the same series), else the first enveloped
  // fact the base region's cell carries for this dimension. Returns null (no index) rather than
  // guessing across an unrelated series.
  const baseFactFor = (dimDb: string, fact: any): any => {
    if (!baseRegion) return null;
    const baseCell = grid.byCell[`${baseRegion}|${dimDb}`];
    const baseFacts: any[] = baseCell?.facts ?? [];
    return (
      baseFacts.find((bf) => bf.factLabel === fact.factLabel && isEnvelopedFact(bf)) ??
      baseFacts.find(isEnvelopedFact) ??
      null
    );
  };

  if (regions.length === 0 || dimensions.length === 0) return null;

  return (
    <section
      data-audit="ops-matrix-card"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      {/* Artboard 08/id="p8" head strip: Anton section title left, the coverage/affordance meta
          right, one hairline below. The prose paragraph that used to sit under the title carried
          the same three facts in sentence form; it is gone, not duplicated. */}
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--line-2)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 20,
            lineHeight: 1,
            margin: 0,
            color: "var(--ink)",
          }}
        >
          Regions side by side
        </h2>
        <span
          style={{
            fontSize: "var(--fs-105)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 600,
            textAlign: "right",
          }}
        >
          {grid.fillRate.filled} of {grid.fillRate.total} cells sourced · {grid.fillRate.pct}% · click a
          dimension to open its facts
        </span>
      </header>

      {/* Lane MOBILE-2, 2026-09-03 (coordinator's round-2 probe, /operations, "United States 1/5
          dimensions sourced" clipped at the right edge on a growing live region roster): the wide
          table already scrolled inside this div's own overflowX:auto (pre-existing), but requiring
          horizontal panning for the PAGE'S PRIMARY comparison view on a phone is poor UX regardless
          of whether the guard's clipped-overflow detector technically passes. `.cl-ops-matrix-table`
          hides this table at <=640px (globals.css); `.cl-ops-matrix-cards` below replaces it with one
          card per region at that width. Desktop is unchanged — same table, same class list plus the
          new one. */}
      {/* Defect D4 (2026-09-07): a scroll CONTAINER was already here (overflowX:auto) — the audit's
          finding was that at 1440 the rightmost region column is cut off with NO VISIBLE
          AFFORDANCE, so the table reads as clipped rather than scrollable. Two additions, both
          CSS-only (no JS width measurement, so they hold at every viewport and in the design-audit
          harness): an always-rendered horizontal scrollbar gutter (`scrollbar-gutter`/`::-webkit-
          scrollbar`, so the bar is visible before the pointer enters the region — overlay
          scrollbars are why there was nothing to see), and the standard CSS scroll-shadow: two
          `local` background layers that sit flush against the content edges and two `scroll` layers
          that stay pinned to the box, so a right-edge shade appears exactly when there is more
          table to the right and disappears at the end of the scroll. */}
      <style>{`
        .cl-ops-matrix-scroll {
          overflow-x: auto;
          scrollbar-gutter: stable;
          background:
            linear-gradient(to right, var(--card, #fff) 30%, rgba(255,255,255,0)) left center local,
            linear-gradient(to left, var(--card, #fff) 30%, rgba(255,255,255,0)) right center local,
            linear-gradient(to right, rgba(0,0,0,0.16), rgba(0,0,0,0)) left center scroll,
            linear-gradient(to left, rgba(0,0,0,0.16), rgba(0,0,0,0)) right center scroll;
          background-repeat: no-repeat;
          background-size: 28px 100%, 28px 100%, 14px 100%, 14px 100%;
          background-attachment: local, local, scroll, scroll;
        }
        .cl-ops-matrix-scroll::-webkit-scrollbar { height: 10px; }
        .cl-ops-matrix-scroll::-webkit-scrollbar-thumb {
          background: var(--line-1, rgba(0,0,0,.25)); border-radius: 5px;
        }
        .cl-ops-matrix-scroll::-webkit-scrollbar-track { background: var(--tag, rgba(0,0,0,.05)); border-radius: 5px; }
      `}</style>
      <div className="cl-ops-matrix-table cl-ops-matrix-scroll">
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead style={{ backgroundColor: "var(--color-surface-raised)" }}>
            <tr>
              <th style={{ ...cell, textAlign: "left", minWidth: 190 }}>Dimension</th>
              {orderedRegions.map((r) => {
                const cov = coverageByRegion[r.key];
                return (
                  <th key={r.key} style={{ ...cell, minWidth: 130, verticalAlign: "top" }}>
                    <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{r.label}</div>
                    {/* Artboard 08/id="p8" column subhead: ONE 10px line, "2/5 sourced · 778 regs" —
                        the coverage fraction and the cross-reference count on the same line, not two
                        stacked lines with the word "dimensions"/"linked regulations" spelled out. */}
                    <div style={{ fontSize: 10, fontWeight: 400, color: cov?.filled ? "var(--color-text-secondary)" : "var(--color-error)" }}>
                      {cov?.filled ?? 0}/{cov?.total ?? 0} sourced
                      {/* FOLD-59: the cross-reference count arrives with the deferred rest-load
                          (HYDRATION-59 defect D4). While it is pending the subhead says so rather
                          than rendering a 0 that later jumps to its real value. */}
                      {crossRefCountsPending ? " · counting regs…" : cov?.crossReferenceCount > 0 ? ` · ${cov.crossReferenceCount} regs` : ""}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d) => {
              const open = resolvedOpen === d.db;
              return (
                <Fragment key={d.db}>
                  <tr
                    onClick={() => setOpenDimension(open ? null : d.db)}
                    style={{ cursor: "pointer", backgroundColor: open ? "var(--color-surface-raised)" : undefined }}
                  >
                    {/* `data-guard-title` sits on the inner span, not the `<td>`: the squeezed-title
                        detector (ux-assert.mjs, read-only to this lane) estimates "one line" as
                        fontSize x 1.3 and has no notion of a title element's own padding — measured
                        against the padded `<td>` (the shared `cell` style's 6px vertical padding,
                        `line-height: normal`), a single-line dimension name reads as height >= 2
                        estimated lines and false-positives as "squeezed", confirmed by a raw
                        Range.getClientRects() count of 1 on the same markup. The inner span carries
                        no padding, so its measured height matches its actual (single) line. */}
                    <td style={{ ...cell, textAlign: "left", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {/* Artboard 08: the dimension name carries its own disclosure glyph, closed
                          "▸" / open "▾" — the row is the click target (the whole <tr> already is). */}
                      <span style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                        <span aria-hidden="true" style={{ color: "var(--ink-3)", flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
                        <span data-guard-title style={{ display: "block", overflowWrap: "anywhere", minWidth: 0 }}>{d.name}</span>
                      </span>
                    </td>
                    {orderedRegions.map((r) => {
                      const c = grid.byCell[`${r.key}|${d.db}`];
                      if (!c || c.factCount === 0) {
                        return (
                          <td key={r.key} style={{ ...cell, color: "var(--color-text-muted)" }} title="No producer has written this cell">
                            {/* DEFECT 3 (lane opsclip, train 61) resolves the deviation the
                                comment here used to record. Artboard 08 draws a bare em dash and
                                explains it in the foot strip; the earlier reading was that the app
                                cannot render one because a bare dash is a placeholder literal by
                                the source-entry-filter SoT. `variant="narrow"` is neither a bare
                                dash nor a shouted phrase: it is the dash CARRYING its
                                closed-vocabulary reason on `aria-label`/`title`, which is the
                                artboard's presentation and ruling 2.1's vocabulary at the same
                                time. Production shouted the phrase over three lines in every empty
                                cell of a five-column matrix. */}
                            <Absence reason="not in primary source" variant="narrow" />
                          </td>
                        );
                      }
                      const fresh = c.facts[0]?.freshness ?? "unknown";
                      return (
                        <td key={r.key} style={{ ...cell, color: "var(--color-text-secondary)" }}>
                          {/* Artboard 08 cell: Anton 16px count over a 9.5px uppercase state word. */}
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1, color: "var(--ink)" }}>{c.factCount}</div>
                          <div
                            style={{
                              fontSize: 9.5,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              fontWeight: 700,
                              marginTop: 2,
                              color: FRESHNESS_COLOR[fresh],
                            }}
                          >
                            {FRESHNESS_LABEL[fresh]}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {open && (
                    <tr>
                      {/* Artboard 08/id="p8" leaves this leading cell of the expanded facts row
                          EMPTY: the dimension is already named by the "▾ Labor markets" row directly
                          above it, and no "Facts" label is drawn under it (lane lists60,
                          2026-09-08). The cell itself stays, so the facts columns keep the header
                          row's column alignment. */}
                      <td style={{ ...cell, verticalAlign: "top", textAlign: "left" }} />
                      {orderedRegions.map((r) => {
                        const c = grid.byCell[`${r.key}|${d.db}`];
                        return (
                          <td key={r.key} style={{ ...cell, verticalAlign: "top", textAlign: "left" }}>
                            {!c || c.factCount === 0 ? (
                              <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                                No sourced fact for {r.key} on this dimension.
                              </span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {c.facts.map((f: any, i: number) =>
                                  isEnvelopedFact(f) ? (
                                    <EnvelopedFactRow key={i} fact={f} baseFact={baseFactFor(d.db, f)} isBaseColumn={r.key === baseRegion} />
                                  ) : (
                                    <LegacyFactRow key={i} fact={f} />
                                  )
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card reflow (<=640px, see the table's own comment above): one card per region —
          region name, "n/total dimensions" chip, the sourced dimensions stacked, each with a
          real >=44px expand/collapse control and wrapping facts. Shares `openDimension` /
          `baseRegion` state with the table so the two never disagree when a viewport crosses the
          breakpoint mid-session. */}
      <div className="cl-ops-matrix-cards" data-guard-container="ops-region-card">
        {orderedRegions.map((r) => {
          const cov = coverageByRegion[r.key];
          return (
            <div
              key={r.key}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "14px 16px",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: crossRefCountsPending || cov?.crossReferenceCount > 0 ? 4 : 8 }}>
                <span data-guard-title style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", overflowWrap: "anywhere", minWidth: 0 }}>
                  {r.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: 12,
                    whiteSpace: "nowrap",
                    background: "var(--color-surface-raised)",
                    color: cov?.filled ? "var(--color-text-secondary)" : "var(--color-error)",
                  }}
                >
                  {cov?.filled ?? 0}/{cov?.total ?? 0} dimensions
                </span>
              </div>
              {crossRefCountsPending ? (
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
                  counting linked regulations…
                </div>
              ) : (
                cov?.crossReferenceCount > 0 && (
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
                    {cov.crossReferenceCount} linked regulations
                  </div>
                )
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {dimensions.map((d) => {
                  const c = grid.byCell[`${r.key}|${d.db}`];
                  const open = resolvedOpen === d.db;
                  const hasData = !!c && c.factCount > 0;
                  const fresh = c?.facts[0]?.freshness ?? "unknown";
                  return (
                    <div key={d.db} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                      <button
                        type="button"
                        onClick={() => setOpenDimension(open ? null : d.db)}
                        aria-expanded={open}
                        style={{
                          width: "100%",
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          background: "none",
                          border: "none",
                          padding: "6px 0",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", overflowWrap: "anywhere", minWidth: 0 }}>
                          {d.name}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {hasData ? (
                            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                              {c!.factCount} · <span style={{ color: FRESHNESS_COLOR[fresh] }}>{FRESHNESS_LABEL[fresh]}</span>
                            </span>
                          ) : (
                            <Absence reason="not in primary source" />
                          )}
                          <span aria-hidden style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: "var(--color-primary)" }}>
                            {open ? "−" : "+"}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 0 12px" }}>
                          {!hasData ? (
                            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                              No sourced fact for {r.key} on this dimension.
                            </span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {c!.facts.map((f: any, i: number) =>
                                isEnvelopedFact(f) ? (
                                  <EnvelopedFactRow key={i} fact={f} baseFact={baseFactFor(d.db, f)} isBaseColumn={r.key === baseRegion} />
                                ) : (
                                  <LegacyFactRow key={i} fact={f} />
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ruling R7 (an app feature the artboard does not draw sits at the card FOOT, never where an
          artboard region goes): the empty-region and coverage-reconciliation disclosures used to
          hang below the card in the page's own column, between this card and the band cards, which
          is where artboard 08 puts the first band card. They are unchanged in content — only their
          mount point moved inside this card, above the foot strip. */}
      {(grid.emptyRegions.length > 0 || grid.reconciliation.disagreed.length > 0) && (
        <div style={{ padding: "10px 16px 0" }}>
          {grid.emptyRegions.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, maxWidth: "78ch" }}>
              <strong style={{ color: "var(--color-error)" }}>
                {grid.emptyRegions.join(" and ")} hold no sourced facts on any dimension.
              </strong>{" "}
              There is no live producer writing them. Regulation cross-references for those regions are counted
              separately in the column header and are not part of the coverage figure.
            </p>
          )}

          {grid.reconciliation.disagreed.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--color-warning)", margin: "8px 0 0", maxWidth: "78ch" }}>
              Coverage-table mismatch on {grid.reconciliation.disagreed.length} of {grid.reconciliation.checked} cells:
              the stored coverage row and the facts present disagree. The counts above are computed from the facts.
            </p>
          )}
        </div>
      )}

      {/* Foot strip (artboard 08/id="p8"): "Compare against: EU · US · ASIA · UK · UAE" left, the
          dash convention stated right. The base-region control is the SAME control that used to sit
          above the table — moved, not copied; its "moves that column first" explanation is now the
          control's own title, since the artboard's strip carries the dash note in that position. */}
      <div
        data-audit="ops-matrix-foot"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          padding: "8px 16px",
          borderTop: "1px solid var(--line-2)",
          background: "var(--bg)",
          fontSize: 12,
        }}
      >
        <span
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          title={
            anyEnveloped
              ? "Moves that column first; sourced numeric facts index against it — legacy free-text facts are still not indexed."
              : "Moves that column first; values are not indexed — the stored figures are free text, not numbers."
          }
        >
          <span style={{ color: "var(--ink-3)" }}>Compare against:</span>
          {regions.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setBaseRegion(baseRegion === r.key ? null : r.key)}
              aria-pressed={baseRegion === r.key}
              style={{
                // Law-2 floor (docs/design/ux-laws.md #2): 24px minimum with the strip's own 6px
                // gap supplying the clearance.
                display: "inline-flex",
                alignItems: "center",
                minHeight: 24,
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid",
                borderColor: baseRegion === r.key ? "var(--ink)" : "var(--line-1)",
                background: baseRegion === r.key ? "var(--tag)" : "var(--card)",
                color: "var(--ink)",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: baseRegion === r.key ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {r.key}
            </button>
          ))}
        </span>
        <span style={{ color: "var(--ink-3)" }}>An empty cell = no sourced fact yet, never an estimate</span>
      </div>
    </section>
  );
}

// ── Fact row rendering, split by envelope state ──────────────────────────────────────────────────
// TWO components, not one branching component: the render-rule (WO-12 step 4) is "a mixed table
// renders enveloped rows indexed and legacy rows as labelled prose" — two genuinely different
// treatments of two genuinely different data shapes, not one component with an `if` inside that a
// later edit could accidentally let leak across.

/** UNCHANGED from the pre-envelope render (verbatim markup) — the legacy free-text path this surface
 *  has always used, and the one 100% of live rows exercise today. */
function LegacyFactRow({ fact: f }: { fact: any }) {
  const url = f.sourceUrl ?? sourceUrlFromNote(f.sourceNote);
  const name = f.sourceName ?? sourceNameFromNote(f.sourceNote);
  // Artboard 08/id="p8" Facts-row block: 2px ink-muted left edge, the VALUE first in Anton 18px,
  // then the fact label as the description line, then the source and date muted below.
  return (
    <div style={{ borderLeft: "2px solid var(--ink-2)", paddingLeft: 10 }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.1, color: "var(--ink)", margin: "2px 0" }}>{f.value}</div>
      <div style={{ fontSize: "var(--fs-115)", color: "var(--ink)", lineHeight: 1.45 }}>{f.factLabel}</div>
      {/* law-2 (RD-60/F35): the source link is a real target — 24px tall with 8px clearance from
          the description line above, which the 8px marginTop supplies. */}
      <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", marginTop: 8 }}>
        {name ? (url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", minHeight: 24, color: "var(--color-primary)", textDecoration: "underline" }}>{name}</a> : name) : "source not linked"}
        {f.lastUpdated ? ` · row written ${String(f.lastUpdated).slice(0, 10)}` : " · no date on row"}
      </div>
    </div>
  );
}

// Origin-class accent, banded by strength (vocabularies.mjs ORIGIN_CLASS: 1 weakest .. 7 strongest) —
// same three-tier idiom as this file's own FRESHNESS_COLOR above, so a reader who has already learned
// "green/amber/muted = good/caution/unknown" on this page does not have to learn a second code.
function originClassColor(strength: number | null): string {
  if (strength === null) return "var(--color-text-muted)";
  if (strength >= 6) return "var(--color-success)"; // verified, official
  if (strength >= 3) return "var(--color-warning)"; // modelled, derived, partner
  return "var(--color-error)"; // community, community-corroborated — never citable as fact
}

/** THE dual-layer render: an indexed number, in its unit, with unit/derivation/origin_class shown
 *  rather than hidden (task requirement — provenance surfaced, not suppressed), plus an index against
 *  the chosen base region when one is selected and comparable (`indexAgainstBase` — same unit, both
 *  sides enveloped, never fabricated across a unit mismatch). */
function EnvelopedFactRow({ fact: f, baseFact, isBaseColumn }: { fact: any; baseFact: any; isBaseColumn: boolean }) {
  const display = formatEnvelopedValue(f);
  const originLabel = originClassLabel(f.originClass);
  const strength = originClassStrength(f.originClass);
  const derivLabel = derivationLabel(f.derivation);
  const idx = !isBaseColumn ? indexAgainstBase(f, baseFact) : null;
  const period = f.referencePeriod ? `for ${f.referencePeriod}` : f.asAtDate ? `as at ${String(f.asAtDate).slice(0, 10)}` : null;

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{f.factLabel}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5, fontWeight: 600 }}>
        {display ?? f.value}
        {idx !== null && (
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 6 }}>
            (index {Math.round(idx)} vs base)
          </span>
        )}
      </div>
      {/* Provenance chips — surfaced, never suppressed. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "3px 0 2px" }}>
        {originLabel && (
          <span
            title={`origin_class: ${f.originClass}`}
            style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
              padding: "1px 6px", borderRadius: 4, border: "1px solid",
              borderColor: originClassColor(strength), color: originClassColor(strength),
              backgroundColor: `${originClassColor(strength)}14`,
            }}
          >
            {originLabel}
          </span>
        )}
        {derivLabel && (
          <span style={{ fontSize: 10, color: "var(--color-text-muted)", alignSelf: "center" }}>{derivLabel}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
        {f.sourceKey ? `${f.sourceKey}${f.sourceRef ? ` · ${f.sourceRef}` : ""}` : "source not linked"}
        {period ? ` · ${period}` : ""}
      </div>
    </div>
  );
}

const cell: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  padding: "6px 10px",
  textAlign: "center",
  verticalAlign: "top",
};
