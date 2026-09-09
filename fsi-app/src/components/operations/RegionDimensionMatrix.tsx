"use client";

/**
 * RegionDimensionMatrix: the Operations surface's region x dimension scoreboard.
 *
 * WHAT IT IS. Six dimension rows (D1-D6) against the region columns, one compact score per cell,
 * and ONE panel under the table that holds the facts for whichever cell the reader selected.
 * Nothing expands inside the table, and NOTHING IS SELECTED until the reader acts.
 *
 * WHY IT LOOKS NOTHING LIKE THE VERSION BEFORE IT. The operator redesigned this artboard on
 * 2026-09-08, in his words: "the expand-a-dimension matrix does not survive real data". The prior
 * build put the facts INSIDE the table: an open dimension inserted a full-width `<td colSpan>`
 * carrying an N-up grid of per-region fact blocks: so the reading width of a fact was one Nth of
 * the card, the table's height jumped by several hundred pixels on a click, and comparing two
 * regions on one dimension meant reading two narrow columns of prose side by side. The replacement
 * separates the two jobs the page was asking one table to do: the TABLE is a scoreboard you scan,
 * and the PANEL below it is where one cell's facts are read at full card width.
 *
 * THE SOURCE FOR THIS BUILD, and an honest caveat about it. The operator's brief names
 * `docs/design/handoff-2026-09-07/screens/08-operations-list.png` and a refreshed `id="p8"` markup
 * section. NEITHER EXISTS in the repo: the only handoff present is 2026-09-06, whose 08 and whose
 * p8 draw the OLD expand-a-dimension design. So dc.html p8 is STALE for this page and no geometry
 * is taken from it. The specification this file is built against is the artboard image, copied into
 * the repo at
 *
 *   docs/design/handoff-2026-09-06/screens/08-operations-list-redesign-2026-09-08.png
 *
 * (the 2026-09-06 08 is left in place unchanged: the record matters), plus the operator's written
 * spec quoted in DEVIATION-LOG.md. Values the image and the spec do not state are taken from the
 * system sheet (screens/00-system-sheet.png, README §0.4) and every one of them is listed in
 * DEVIATION-LOG.md so it can be confirmed when the refreshed markup arrives. Nothing is invented.
 *
 * WHAT WAS DELETED, not left dormant (CLAUDE.md rule 13):
 *   - the expanded-row code path: the `open`/`resolvedOpen`/`defaultOpenDimension` state, the
 *     `<td colSpan={orderedRegions.length + 1}>` cell, its `repeat(N, 1fr)` per-region fact grid,
 *     the row's disclosure glyph and the whole-row click handler that drove it;
 *   - `EnvelopedFactRow` and `LegacyFactRow` as TWO components. `factHeadline` (region-grid.mjs)
 *     already routes both data shapes into the same headline/description/prose slots, and the
 *     redesigned fact card has ONE anatomy, so the split had nothing left to express;
 *   - the "Compare against:" base-region control, `baseRegion` state, `orderRegions` ordering and
 *     `baseFactFor`/`anyEnveloped`. Cross-region comparison is not dropped, it is SUPERSEDED by the
 *     panel's compare mode, which shows every region's headline figure stacked at reading width
 *     instead of asking the reader to pick a base and re-read the columns. `indexAgainstBase` stays
 *     live and moved into compare mode, where a base region is implied rather than chosen;
 *   - the `<=640px` `.cl-ops-matrix-cards` reflow, a SECOND rendering of the same data. The sticky
 *     first column the operator's spec adds is what made the old horizontal pan unreadable-by-
 *     absence: you lost the row label as soon as you panned. With the dimension column pinned, the
 *     one table serves every width, which is also the round-2 table-card pattern.
 *
 * TABLE-CARD PATTERN. This is a table card in the round-2 sense: card `overflow: hidden` at radius
 * 10, an inner horizontal scroller, the first column sticky with a 1px right divider, and the
 * scroll hint in the card header. NO SHARED TABLE-CARD PART EXISTS ON THIS BASE (checked: the ui/
 * set has `RowTable`, which is a CSS-grid admin row anatomy with no sticky column and no card
 * chrome, and `.cl-table-cards` in globals.css, which is the stack-into-cards reflow this design
 * replaces). The scroller here is therefore built so a shared part can absorb it later without
 * touching this file's data code: the whole pattern is the scroller `<div>`'s two classes and one
 * attribute plus the `stickyCell` / `bodyCell` / `headCell` style objects and the two column floors
 * at the foot of this file, and not one of those reads this component's state.
 *
 * NOTHING IS OPEN ON FIRST RENDER, AND FOCUS IS NOT SELECTION (operator ruling 2026-09-08, verbatim:
 * "no items expanded when first navigtaing to a page"; coordinator readings R2 and R5). This
 * component used to compute a DEFAULT SELECTION on mount -- "the first sourced cell in the first
 * sourced row" -- and render the fact panel for it. Under R2 that is the page opening itself: the
 * reader arrived at /operations and a dimension's facts were already on screen. It is gone. On first
 * render there is no selection, no panel, and no tinted cell: the table alone.
 *
 * The grid stays fully keyboard reachable (R5: "keyboard reachability is not an excuse to
 * preselect"), which needs TWO pieces of state where the old build had one:
 *   `focusPos`   the roving-tabindex position. Starts at the first cell (row 0, column 0), so the
 *                grid is ONE tab stop from the first render and Tab lands there. Arrow keys, Home
 *                and End move it. Moving it moves DOM focus and nothing else -- no tint, no panel.
 *   `selection`  what the reader COMMITTED to, with a click, Enter or Space. Starts null. The panel
 *                renders from this and only from this.
 * The `useEffect` that pulls DOM focus to the roving cell is gated on `moveRef`, set only inside
 * `moveFocus`, so the initial render never steals focus from the top of the page.
 *
 * Column 0 (the dimension row header) is part of the same grid, so ArrowLeft off the first region
 * column lands on the row header, and committing there opens compare mode. Every selectable cell is
 * reachable from the first by arrow alone, with no pointer.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { OperationsFact, OperationsCoverageRow } from "@/lib/supabase-server";
import { Absence } from "@/components/ui/Absence";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  buildRegionGrid,
  sourceUrlFromNote,
  sourceNameFromNote,
  indexAgainstBase,
  isEnvelopedFact,
  originClassLabel,
  derivationLabel,
  factHeadline,
} from "@/lib/operations/region-grid.mjs";

export interface MatrixRegion { key: string; label: string }
export interface MatrixDimension {
  key: string;
  db: string;
  name: string;
  /** D-number. The redesigned artboard prefixes EVERY dimension row with it ("D1 Regulatory
   *  feasibility" ... "D6 Operational cost"), matching the rail's own D1-D6 labels, so a reader
   *  moving between the two never has to map a name onto a number. Optional so the prop shape stays
   *  backward-compatible; the prefix is simply not drawn when it is absent, never guessed from the
   *  array index (a filtered `dimensions` prop would make an index-derived number WRONG: the rail
   *  scopes this table to one dimension, and D4 alone must still read "D4"). */
  num?: number;
}

/** The artboard's own threshold: "regions beyond five scroll horizontally inside the card". */
const COLUMNS_BEFORE_SCROLL = 5;
/** "facts as fact cards ... max 3, then 'N more facts on the profile'" (operator spec). */
const PANEL_FACT_CAP = 3;

interface Props {
  /** Column roster, ALREADY SCOPED by the rail's Region facet ("Rail filters scope columns"). */
  regions: MatrixRegion[];
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
  /** Size of the UNSCOPED region roster, so the panel foot can say "5 of 18 regions · filters scope
   *  columns" with both halves real. Omitted or equal to `regions.length` means nothing is scoped
   *  away and the line names one number instead of a fraction: never "5 of 5". */
  totalRegionCount?: number;
  /** `/operations/<slug>` for each region's own profile row, when one exists. The panel's "Open
   *  profile" link and its "N more facts on the profile" line are drawn ONLY for a region that has
   *  one; a region with no profile row gets the honest count with no link, never a dead href. */
  profileHrefByRegion?: Record<string, string>;
}

/** Selected cell. `regionKey: null` is the row header: compare mode across every column. */
interface Selection { regionKey: string | null; dimDb: string }

export function RegionDimensionMatrix({
  regions,
  dimensions,
  facts,
  coverageRows = [],
  crossRefCountsByRegion = {},
  crossRefCountsPending = false,
  totalRegionCount,
  profileHrefByRegion = {},
}: Props) {
  const panelId = useId();
  /** What the reader COMMITTED to. Null on first render, and null is the whole point (ruling R2). */
  const [selection, setSelection] = useState<Selection | null>(null);
  /** The roving-tabindex position. NOT the selection: it decides which single cell is the grid's tab
   *  stop and where an arrow key goes next, and it paints nothing. It starts on the first cell so a
   *  reader who tabs into the table lands somewhere real (ruling R5). */
  const [focusPos, setFocusPos] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  // DOM focus follows the roving position only when the reader MOVED it, never on mount: pulling
  // focus into the table on load would yank a reader who arrived by keyboard past the masthead.
  const moveRef = useRef(false);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement | null>());

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
          // Layer 2 (WO-12 envelope, migration 267): carried through unchanged so isEnvelopedFact
          // / indexAgainstBase / factHeadline below can read them. NULL on every one of the 75 live
          // rows today; the enveloped path is exercised by fixtures in region-grid.test.mjs.
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

  const cellAt = useCallback(
    (regionKey: string, dimDb: string) => grid.byCell[`${regionKey}|${dimDb}`] ?? null,
    [grid]
  );

  // A selection the props no longer contain (the rail scoped its column away, or its dimension
  // away) is DROPPED, and the panel closes with it. The build before this one re-pointed such a
  // selection at a computed default; under ruling R2 that is the page choosing what to open, so the
  // honest answer to "the cell you were reading is no longer on screen" is to show nothing until the
  // reader picks again.
  const resolved: Selection | null = useMemo(() => {
    if (!selection) return null;
    const dimOk = dimensions.some((d) => d.db === selection.dimDb);
    const regionOk = selection.regionKey === null || regions.some((r) => r.key === selection.regionKey);
    return dimOk && regionOk ? selection : null;
  }, [selection, dimensions, regions]);

  const rowIndex = resolved ? dimensions.findIndex((d) => d.db === resolved.dimDb) : -1;
  const colIndex = resolved
    ? resolved.regionKey === null
      ? 0
      : regions.findIndex((r) => r.key === resolved.regionKey) + 1
    : -1;

  const clampR = useCallback(
    (r: number) => Math.max(0, Math.min(dimensions.length - 1, r)),
    [dimensions.length]
  );
  const clampC = useCallback((c: number) => Math.max(0, Math.min(regions.length, c)), [regions.length]);

  /** The roving cell, clamped every render so a rail that scopes columns away cannot leave the tab
   *  stop pointing past the end of the grid. */
  const focusR = clampR(focusPos.r);
  const focusC = clampC(focusPos.c);

  /** MOVE, not select: this is the arrow-key path and it paints nothing. */
  const moveFocus = useCallback(
    (r: number, c: number) => {
      moveRef.current = true;
      setFocusPos({ r: clampR(r), c: clampC(c) });
    },
    [clampR, clampC]
  );

  /** COMMIT: the click / Enter / Space path, and the ONLY thing that opens the panel. */
  const selectAt = useCallback(
    (r: number, c: number) => {
      const row = dimensions[clampR(r)];
      if (!row) return;
      const cc = clampC(c);
      moveFocus(r, c);
      setSelection({ regionKey: cc === 0 ? null : regions[cc - 1].key, dimDb: row.db });
    },
    [dimensions, regions, clampR, clampC, moveFocus]
  );

  // Roving tabindex + arrow movement. Arrows, Home and End move the tab stop and DOM focus and do
  // NOT select: a reader arrowing across the scoreboard to read the scores never makes a panel
  // appear under them (ruling R5). Enter and Space on the focused cell commit it, which is the same
  // act as a click on it.
  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent, r: number, c: number) => {
      const moves: Record<string, [number, number]> = {
        ArrowRight: [r, c + 1],
        ArrowLeft: [r, c - 1],
        ArrowDown: [r + 1, c],
        ArrowUp: [r - 1, c],
        Home: [r, 0],
        End: [r, regions.length],
      };
      if (moves[e.key]) {
        e.preventDefault();
        moveFocus(moves[e.key][0], moves[e.key][1]);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectAt(r, c);
      }
    },
    [moveFocus, selectAt, regions.length]
  );

  useEffect(() => {
    if (!moveRef.current) return;
    moveRef.current = false;
    cellRefs.current.get(`${focusR}:${focusC}`)?.focus();
  }, [focusR, focusC]);

  if (regions.length === 0 || dimensions.length === 0) return null;

  const selectedDimension = rowIndex >= 0 ? dimensions[rowIndex] : null;
  const selectedRegion = resolved?.regionKey ? regions.find((r) => r.key === resolved.regionKey) ?? null : null;
  const scrolls = regions.length > COLUMNS_BEFORE_SCROLL;
  const totalRegions = totalRegionCount ?? regions.length;

  return (
    // Operator items A1 + E4 (2026-09-08): "Regions side by side" is one of the eighteen listed
    // cards, and E4 rules its 3px rule the dark grey gradation like every other card, never red.
    // Both are now structural rather than a caller's choice: `SectionCard` mounts the one rule
    // (SectionRule, ruling 5.2's dark grey), and this file can no longer choose a colour for it.
    <SectionCard as="section" dataAudit="ops-matrix-card">
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
        {/* The artboard's head aside: "18 OF 30 CELLS SOURCED · 60% · 18 REGIONS · SCROLL". The
            scroll hint is drawn only when there is somewhere to scroll TO: with five or fewer
            columns every region already fits, and telling a reader to scroll a table that does not
            move is a false affordance. Both figures are computed, never stated. */}
        <span
          data-audit="ops-matrix-hint"
          style={{
            fontSize: "var(--fs-105)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 600,
            textAlign: "right",
          }}
        >
          {grid.fillRate.filled} of {grid.fillRate.total} cells sourced · {grid.fillRate.pct}%
          {scrolls ? ` · ${regions.length} regions · scroll` : ""}
        </span>
      </header>

      {/* ── The scroller ───────────────────────────────────────────────────────────────────────
          `data-guard-strip` is the DECLARATION, and which declaration this box carries is a real
          decision, not a formality.

          It used to carry `data-guard-container`, which tells the rendering guard's `detectOverflows`
          "this box's content must FIT it". That was true of the old table only by accident: with
          `width: 100%` and no column floors it never overflowed, it CRUSHED, which is why the
          declaration passed while the columns became one character wide at 375. A box whose whole
          purpose is to scroll can never satisfy a must-fit check, so keeping the attribute would
          have meant a permanently red gate or a fudged tolerance.

          `data-guard-strip` is the mechanism the guard provides for exactly this case, and
          `ux-assert.mjs` is deliberate about it: content may pass the viewport edge only inside a
          DECLARED strip, never inside a box that merely sets `overflow-x: auto`. The precedent is
          `ui/RowTable.tsx` (lane admin60, this same train), which reached the identical conclusion
          for the admin tables: every column keeps the width the design gives it and the reader
          scrolls to reach them, which is the mobile 390 spec's own rule: "the frame collapses;
          every part is the desktop part at a smaller measure". This table has one thing RowTable
          does not, and it is what makes the panning readable rather than merely possible: the
          dimension column stays pinned, so a reader who scrolls to the UAE column can still see
          which row they are on.

          `.cl-scroll-shadow` (globals.css) supplies the visible affordance: edge shadows that
          appear exactly when there is more table in that direction, plus a reserved scrollbar
          gutter: shared with the /regulations obligations strip rather than copied. */}
      <div className="cl-ops-matrix-table cl-scroll-shadow" data-guard-strip="true">
        <table
          role="grid"
          aria-label="Regions by dimension, sourced fact counts"
          style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: "var(--fs-125)" }}
        >
          <thead style={{ background: "var(--tag)" }}>
            <tr role="row">
              <th role="columnheader" scope="col" style={{ ...headCell, ...stickyCell, zIndex: 3, background: "var(--tag)" }}>
                Dimension
              </th>
              {regions.map((r) => {
                const cov = grid.regionCoverage.find((c: { regionKey: string }) => c.regionKey === r.key);
                return (
                  <th role="columnheader" scope="col" key={r.key} style={{ ...headCell, textAlign: "center" }}>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.label}</div>
                    {/* The artboard's column sub-line: "2/6 sourced · 778 regs": the coverage
                        fraction and the cross-reference count on ONE line. */}
                    <div
                      style={{
                        fontSize: "var(--fs-10)",
                        fontWeight: 400,
                        color: cov?.filled ? "var(--ink-2)" : "var(--color-error)",
                      }}
                    >
                      {cov?.filled ?? 0}/{cov?.total ?? 0} sourced
                      {crossRefCountsPending
                        ? " · counting regs…"
                        : cov?.crossReferenceCount > 0
                          ? ` · ${cov.crossReferenceCount} regs`
                          : ""}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d, ri) => {
              const headerSelected = ri === rowIndex && colIndex === 0;
              const headerFocused = ri === focusR && focusC === 0;
              return (
                <tr role="row" key={d.db}>
                  {/* Column 0 is a rowheader AND a grid cell: selecting it opens the panel in
                      compare mode, which is the operator's "click a row header, same panel in
                      compare mode". It is part of the roving tabindex, so ArrowLeft from the first
                      region column reaches it without a pointer. */}
                  <th
                    role="rowheader"
                    scope="row"
                    ref={(el) => { cellRefs.current.set(`${ri}:0`, el as unknown as HTMLTableCellElement); }}
                    tabIndex={headerFocused ? 0 : -1}
                    aria-selected={headerSelected}
                    aria-controls={panelId}
                    aria-label={`${dimensionLabel(d)}, compare across every region`}
                    onClick={() => selectAt(ri, 0)}
                    onKeyDown={(e) => onCellKeyDown(e, ri, 0)}
                    style={{
                      ...bodyCell,
                      ...stickyCell,
                      textAlign: "left",
                      cursor: "pointer",
                      background: headerSelected ? "var(--selection)" : "var(--card)",
                      boxShadow: headerSelected ? SELECTED_INSET : undefined,
                    }}
                  >
                    <span style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}>
                      {typeof d.num === "number" && (
                        <span
                          aria-hidden="true"
                          style={{
                            fontSize: "var(--fs-10)",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            color: "var(--ink-3)",
                            flexShrink: 0,
                          }}
                        >
                          D{d.num}
                        </span>
                      )}
                      {/* `data-guard-title` sits on the inner span, not the cell: the squeezed-title
                          detector estimates "one line" as fontSize x 1.3 and has no notion of a
                          cell's own padding, so measuring the padded cell reads a single-line name
                          as two lines and false-positives. */}
                      <span
                        data-guard-title
                        style={{ display: "block", overflowWrap: "anywhere", minWidth: 0, fontWeight: 600, color: "var(--ink)" }}
                      >
                        {d.name}
                      </span>
                    </span>
                  </th>

                  {regions.map((r, i) => {
                    const ci = i + 1;
                    const c = cellAt(r.key, d.db);
                    const n = c?.factCount ?? 0;
                    const isSelected = ri === rowIndex && ci === colIndex;
                    const isFocusCell = ri === focusR && ci === focusC;
                    return (
                      <td
                        role="gridcell"
                        key={r.key}
                        ref={(el) => { cellRefs.current.set(`${ri}:${ci}`, el); }}
                        tabIndex={isFocusCell ? 0 : -1}
                        aria-selected={isSelected}
                        aria-controls={panelId}
                        aria-label={`${r.label}, ${dimensionLabel(d)}, ${n === 0 ? "no sourced fact" : `${n} sourced ${n === 1 ? "fact" : "facts"}`}`}
                        onClick={() => selectAt(ri, ci)}
                        onKeyDown={(e) => onCellKeyDown(e, ri, ci)}
                        style={{
                          ...bodyCell,
                          textAlign: "center",
                          cursor: "pointer",
                          background: isSelected ? "var(--selection)" : undefined,
                          boxShadow: isSelected ? SELECTED_INSET : undefined,
                        }}
                      >
                        {/* The artboard's cell is a bare score or a bare em dash: no state word
                            beside it. `variant="narrow"` IS the bare dash: it carries the
                            closed-vocabulary reason on aria-label/title and declares itself to the
                            guard's placeholder-literal scan with `data-absence`, so the artboard's
                            presentation and ruling 2.1's vocabulary hold at once. An unsourced cell
                            stays SELECTABLE (see the panel: it states the absence plainly): making
                            it a dead cell would put arrow-key holes in the grid and leave a reader
                            asking "why is this empty?" with nowhere to click. */}
                        {n === 0 ? (
                          <Absence reason="not in primary source" variant="narrow" />
                        ) : (
                          <span
                            data-audit="ops-cell-score"
                            style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1, color: "var(--ink)" }}
                          >
                            {n}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── The panel ──────────────────────────────────────────────────────────────────────────
          One cell's facts, at the card's own reading width, under the table. It renders ONLY when
          the reader has committed to a cell (ruling R2): on first navigation there is no panel at
          all, and the card is the table plus its foot legend. `aria-live="polite"` is what makes it
          the selected cell's announced CONTENT: committing on a cell (whose own label names the
          region, the dimension and the count) opens the panel and it announces what it holds,
          rather than the reader having to go looking for it. */}
      {selectedDimension && (
        <div
          id={panelId}
          data-audit="ops-matrix-panel"
          role="region"
          aria-live="polite"
          aria-label={panelHeading(selectedRegion, selectedDimension, grid, regions)}
          style={{ background: "var(--page)", borderTop: "1px solid var(--line-2)", padding: "12px 16px 8px" }}
        >
          <MatrixPanel
            dimension={selectedDimension}
            region={selectedRegion}
            regions={regions}
            cellAt={cellAt}
            profileHref={selectedRegion ? profileHrefByRegion[selectedRegion.key] ?? null : null}
            onCompare={() => selectAt(rowIndex, 0)}
          />
        </div>
      )}

      {/* Foot strip, verbatim from the artboard: the dash convention and the two affordances left,
          the column scoping right. It lives on the CARD, not inside the panel, because with no
          default selection the panel is absent on first render and the legend that explains the
          table's dashes and says how to open a cell is exactly what a reader needs THEN. It was
          inside the panel while a default selection guaranteed the panel existed; that guarantee is
          gone with the default (ruling R2), so the strip moved out with it.

          The arrow-key clause states what arrows now do. They MOVE between cells and select nothing
          (ruling R5); committing is a click, Enter or Space. The old wording, "arrow keys move the
          selection", described the behaviour this lane removed. */}
      <div
        data-audit="ops-matrix-foot"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
          padding: "10px 16px 12px",
          fontSize: "var(--fs-105)",
          color: "var(--ink-3)",
        }}
      >
        <span>
          <Absence reason="not in primary source" /> · click a cell, or press Enter on it, to open its facts ·
          arrow keys move between cells
        </span>
        <span>
          {totalRegions > regions.length ? `${regions.length} of ${totalRegions} regions` : `${regions.length} regions`} ·
          filters scope columns
        </span>
      </div>

      {/* Ruling R7 (an app feature the artboard does not draw sits at the card FOOT, never where an
          artboard region goes): the empty-region and coverage-reconciliation disclosures. Unchanged
          in content by this lane; they follow the panel so the artboard's own foot strip keeps the
          position the artboard gives it. */}
      {(grid.emptyRegions.length > 0 || grid.reconciliation.disagreed.length > 0) && (
        <div style={{ padding: "10px 16px 12px", borderTop: "1px solid var(--line-3)" }}>
          {grid.emptyRegions.length > 0 && (
            <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0, maxWidth: "78ch" }}>
              <strong style={{ color: "var(--color-error)" }}>
                {grid.emptyRegions.join(" and ")} hold no sourced facts on any dimension.
              </strong>{" "}
              There is no live producer writing them. Regulation cross-references for those regions are counted
              separately in the column header and are not part of the coverage figure.
            </p>
          )}
          {grid.reconciliation.disagreed.length > 0 && (
            <p style={{ fontSize: "var(--fs-12)", color: "var(--color-warning)", margin: "8px 0 0", maxWidth: "78ch" }}>
              Coverage-table mismatch on {grid.reconciliation.disagreed.length} of {grid.reconciliation.checked} cells:
              the stored coverage row and the facts present disagree. The counts above are computed from the facts.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────────────────────────

function dimensionLabel(d: MatrixDimension): string {
  return typeof d.num === "number" ? `D${d.num} ${d.name}` : d.name;
}

function panelHeading(
  region: MatrixRegion | null,
  d: MatrixDimension,
  grid: { byCell: Record<string, { factCount: number } | undefined> },
  regions: MatrixRegion[]
): string {
  const count = region
    ? grid.byCell[`${region.key}|${d.db}`]?.factCount ?? 0
    : regions.reduce((sum, r) => sum + (grid.byCell[`${r.key}|${d.db}`]?.factCount ?? 0), 0);
  const facts = count === 0 ? "no sourced fact" : `${count} sourced ${count === 1 ? "fact" : "facts"}`;
  return `${region ? region.label : "Every region"} · ${dimensionLabel(d)} · ${facts}`;
}

/**
 * The panel body. TWO modes, one anatomy:
 *   single: the selected cell's facts as fact cards, capped at three.
 *   compare: one headline card per region, stacked, each labelled with its region (the operator's
 *             "click a row header, same panel in compare mode"). This is what replaced the
 *             base-region control: the reader sees every region's figure at once instead of
 *             choosing a base and re-reading the table.
 */
function MatrixPanel({
  dimension,
  region,
  regions,
  cellAt,
  profileHref,
  onCompare,
}: {
  dimension: MatrixDimension;
  region: MatrixRegion | null;
  regions: MatrixRegion[];
  cellAt: (regionKey: string, dimDb: string) => { factCount: number; facts: unknown[] } | null;
  profileHref: string | null;
  onCompare: () => void;
}) {
  const compare = region === null;
  const cell = region ? cellAt(region.key, dimension.db) : null;
  const shown = compare ? [] : ((cell?.facts ?? []) as Record<string, unknown>[]).slice(0, PANEL_FACT_CAP);
  const remaining = compare ? 0 : Math.max(0, (cell?.factCount ?? 0) - shown.length);

  // Compare mode's implied base: the first region in column order that carries an enveloped fact.
  // `indexAgainstBase` refuses across a unit mismatch and returns null when either side is not
  // enveloped, so an un-enveloped corpus (every live row today) simply shows no index anywhere 
  // never a fabricated ratio.
  const compareRows = compare
    ? regions.map((r) => ({ region: r, fact: ((cellAt(r.key, dimension.db)?.facts ?? []) as Record<string, unknown>[])[0] ?? null }))
    : [];
  const baseFact = compareRows.find((x) => x.fact && isEnvelopedFact(x.fact))?.fact ?? null;

  const count = compare
    ? compareRows.reduce((s, x) => s + (cellAt(x.region.key, dimension.db)?.factCount ?? 0), 0)
    : cell?.factCount ?? 0;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        {/* "Region · Dn Dimension · N sourced facts" (operator spec). The dimension carries the
            weight because it is the thing the panel is about; the region and the count frame it. */}
        <span data-audit="ops-panel-heading" style={{ fontSize: "var(--fs-125)", color: "var(--ink-3)", minWidth: 0 }}>
          {compare ? "Every region" : region!.label}
          {" · "}
          <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{dimensionLabel(dimension)}</strong>
          {" · "}
          {count === 0 ? "no sourced fact" : `${count} sourced ${count === 1 ? "fact" : "facts"}`}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          {!compare && (
            <button type="button" onClick={onCompare} style={panelLink}>
              Compare across regions
            </button>
          )}
          {/* No profile row for this region means no link: an "Open profile" that goes nowhere is
              worse than its absence. */}
          {!compare && profileHref && (
            <a href={profileHref} style={panelLink}>
              Open profile &rarr;
            </a>
          )}
        </span>
      </div>

      {compare ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {compareRows.map(({ region: r, fact }) => (
            <div key={r.key}>
              <div
                style={{
                  fontSize: "var(--fs-10)",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                  margin: "0 0 3px",
                }}
              >
                {r.label}
              </div>
              {fact ? (
                <MatrixFactCard fact={fact} baseFact={fact === baseFact ? null : baseFact} />
              ) : (
                <p style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", margin: "0 0 10px" }}>
                  <Absence reason="not in primary source" />
                </p>
              )}
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        // The unsourced cell, selected. It says so plainly rather than rendering an empty panel:
        // the absence token in the app's one vocabulary, then the sentence that explains it.
        <p data-audit="ops-panel-absent" style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", margin: "0 0 10px", maxWidth: "72ch" }}>
          <Absence reason="not in primary source" />: no producer has written {dimensionLabel(dimension)} for{" "}
          {region!.label}. Nothing is estimated in its place.
        </p>
      ) : (
        <>
          {shown.map((f, i) => (
            <MatrixFactCard key={i} fact={f} baseFact={null} />
          ))}
          {remaining > 0 &&
            (profileHref ? (
              <a href={profileHref} style={{ ...panelLink, display: "inline-flex" }}>
                {remaining} more {remaining === 1 ? "fact" : "facts"} on the profile &rarr;
              </a>
            ) : (
              <span style={{ fontSize: "var(--fs-115)", color: "var(--ink-3)" }}>
                {remaining} more {remaining === 1 ? "fact" : "facts"} not shown here
              </span>
            ))}
        </>
      )}
    </>
  );
}

/**
 * THE FACT CARD. One anatomy for both data shapes, because `factHeadline` (region-grid.mjs) is the
 * one place that decides which slot a fact's data goes into: an enveloped row (migration 267's
 * value_numeric + unit) yields a formatted figure, a free-text row yields its `value` as the figure
 * when it is short and numeric, and a sentence yields no figure at all and is set as prose. Nothing
 * is derived out of the prose and no sentence is ever promoted into the display face.
 *
 * SHAPE. The artboard draws a headline figure in the display face INLINE with its description on
 * one line, then a source line below carrying an underlined link, a date, and a provenance word.
 * The card's box is the system sheet's sourced fact card (README §0.4, and `ui/FactCard.tsx`'s own
 * SOURCED_SHAPE): white, 2px solid ink LEFT edge, 1px `--line-1` the other three sides, radius
 * 0 8px 8px 0.
 *
 * WHY NOT `ui/FactCard` ITSELF. Different anatomy, not different styling. FactCard renders a
 * VERBATIM QUOTE under a "FACT" eyebrow with a tier chip and an "Open source" link: the detail
 * surfaces' claim card. This card leads with a FIGURE inline with its label and has no eyebrow, no
 * quotation marks and no tier. Wrapping a figure in FactCard's quote marks would assert it is a
 * verbatim span from the source, which for a derived or formatted figure is false. The box geometry
 * is shared by reading the same system-sheet values; the anatomy is this page's own, exactly as
 * `RowTable` is the table sibling of `ListRow` rather than a variant of it.
 */
function MatrixFactCard({ fact: f, baseFact }: { fact: Record<string, unknown>; baseFact: Record<string, unknown> | null }) {
  const url = (f.sourceUrl as string) ?? sourceUrlFromNote(f.sourceNote);
  const name = (f.sourceName as string) ?? sourceNameFromNote(f.sourceNote);
  const { figure, description, prose } = factHeadline(f);
  const idx = baseFact ? indexAgainstBase(f, baseFact) : null;
  // The source line's third element: the provenance word the artboard draws ("official"). It is the
  // row's own origin class, and its derivation when one is recorded: surfaced, never suppressed
  // (WO-12 step 4). A row carrying neither falls back to the date the row itself was written, which
  // is what the artboard's other card shows.
  const provenance = [originClassLabel(f.originClass), derivationLabel(f.derivation)].filter(Boolean).join(" · ");
  const written = f.lastUpdated ? String(f.lastUpdated).slice(0, 10) : null;

  return (
    <div
      data-audit="ops-fact-card"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderLeft: "2px solid var(--ink)",
        borderRadius: "0 8px 8px 0",
        padding: "12px 14px",
        margin: "0 0 10px",
        minWidth: 0,
      }}
    >
      {/* Headline figure and description on ONE line. `baseline` alignment is what makes an 18px
          display figure and 12.5px body sit on the same line rather than the figure floating. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        {figure ? (
          <span
            data-audit="ops-fact-figure"
            style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.1, color: "var(--ink)", flexShrink: 0 }}
          >
            {figure}
          </span>
        ) : (
          // The figure slot, empty and saying so. "pending" is the vocabulary word that fits: the
          // figure is in the source and in this row's prose; what has not happened is the envelope
          // extraction that would make it a comparable number.
          <Absence reason="pending" />
        )}
        <span
          data-audit="ops-fact-quote"
          style={{ fontSize: "var(--fs-125)", color: "var(--ink)", lineHeight: 1.45, overflowWrap: "anywhere", minWidth: 0 }}
        >
          {description}
          {prose ? (description ? `: ${prose}` : prose) : ""}
        </span>
        {idx !== null && (
          <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", flexShrink: 0 }}>index {Math.round(idx)} vs base</span>
        )}
      </div>
      {/* Source line: underlined link, then date, then provenance word. */}
      <div data-audit="ops-fact-source" style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", marginTop: 8, overflowWrap: "anywhere" }}>
        {name ? (
          url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 24,
                color: "var(--ink-2)",
                textDecoration: "underline",
                textDecorationColor: "var(--link-line)",
              }}
            >
              {name}
            </a>
          ) : (
            name
          )
        ) : (
          "source not linked"
        )}
        {written ? ` · row written ${written}` : " · no date on row"}
        {provenance ? ` · ${provenance}` : ""}
      </div>
    </div>
  );
}

// ── Shared cell geometry ─────────────────────────────────────────────────────────────────────────
// `borderCollapse: separate` (not `collapse`) is REQUIRED by the sticky first column: a collapsed
// table shares one border between two cells, and a sticky cell painted over its neighbour then
// loses the shared edge as it scrolls. With separate borders + zero spacing the rules are the
// cells' own and the sticky column keeps its divider at every scroll offset.

/**
 * COLUMN FLOORS, and why a table card needs them where the old design did not.
 *
 * [CONFIRMED by the rendering guard, 2026-09-08, this lane's own first run] With `width: 100%` and
 * no floor, a six-column table inside a 343px card at 375px does not scroll: it CRUSHES. The
 * guard measured the dimension column at 21px against a 67px cell, wrapping "Regional resource
 * availability" over TWELVE lines, one character wide, on all three operations fixtures. The old
 * build never saw this because `.cl-ops-matrix-cards` hid the table below 640 entirely; taking that
 * duplicate away exposed the table's real behaviour at phone widths, which is the honest result of
 * the deletion rather than a reason to put the duplicate back.
 *
 * A floor is what turns "crush" into "scroll": every column keeps a width it can actually be read
 * at, the sum exceeds the card at 375, and the inner scroller does its job with the dimension
 * column pinned beside it. This does NOT re-create the 1440 overflow the previous lane fixed: that
 * came from FACTS being rendered into the region columns, so each fact's prose set its column's
 * minimum content width. The facts are in the panel now. The floors below sum to
 * 180 + 5 x 96 = 660px, inside the card's own width at 1440, so the table fills without scrolling
 * there and scrolls only where it must.
 */
const DIMENSION_COL_MIN = 180;
const REGION_COL_MIN = 96;

/** Row height 40px (operator spec). Vertical padding is 0 so the height is the height. */
const bodyCell: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderBottom: "1px solid var(--line-3)",
  verticalAlign: "middle",
  minWidth: REGION_COL_MIN,
  // The safety valve for a dimension name longer than any the corpus holds. With the floor above it
  // never fires on a real name; without the floor it was firing on every one of them.
  overflowWrap: "anywhere",
};

const headCell: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--line-2)",
  verticalAlign: "bottom",
  textAlign: "left",
  fontWeight: 600,
  minWidth: REGION_COL_MIN,
  overflowWrap: "anywhere",
};

/** The sticky first column, its floor, and its 1px right divider. */
const stickyCell: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  minWidth: DIMENSION_COL_MIN,
  background: "var(--card)",
  borderRight: "1px solid var(--line-2)",
};

/** Selection: tint #DCE7FB (`--selection`) with a 2px #2563EB (`--monitor`) INSET: inset rather
 *  than a border so the 40px row height does not change when a cell is selected. */
const SELECTED_INSET = "inset 0 0 0 2px var(--monitor)";

const panelLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  padding: 0,
  border: "none",
  background: "none",
  fontFamily: "inherit",
  fontSize: "var(--fs-115)",
  fontWeight: 600,
  color: "var(--ink)",
  textDecoration: "underline",
  textDecorationColor: "var(--link-line)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
