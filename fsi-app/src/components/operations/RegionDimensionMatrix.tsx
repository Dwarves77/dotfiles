"use client";

/**
 * RegionDimensionMatrix: the Operations surface's region x dimension scoreboard.
 *
 * WHAT IT IS. Six dimension rows (D1-D6) against the region columns, one compact score per cell,
 * and ONE panel under the table that holds the facts for whichever cell the reader selected.
 * Nothing expands inside the table. On arrival the first sourced cell of the first sourced row is
 * SELECTED and its panel is showing, which is the operator's item 5 of 2026-09-09; see the dated
 * block below, which names both of his messages, because that reverses a site-wide rule on purpose.
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
 * THE DEFAULT SELECTION, AND THE TWO OPERATOR MESSAGES THAT MADE IT WHAT IT IS. Read both dates
 * before changing this, because this one element reverses a site-wide rule ON PURPOSE.
 *
 *   2026-09-08, operator, verbatim: "the ops page opend to a sub category not just the main page,
 *   infastructure capacity and other items should be closed, no items expanded when first
 *   navigtaing to a page". Lane noexpand implemented that here by DELETING the matrix's default
 *   selection outright, and by splitting focus from selection so arrows painted nothing.
 *
 *   2026-09-09, operator, verbatim, item 5 of the /operations STOP SHIP message: "Default state on
 *   load: first sourced cell of the first sourced row open." Item 3 of the same message: "Arrow keys
 *   move the selection; panel follows; Esc closes."
 *
 * THE RECONCILIATION (coordinator note C1, 2026-09-09, binding, and not this file's to revisit).
 * What the 2026-09-08 ruling forbade is the RETIRED row-expansion pattern, the thing he was looking
 * at when he wrote it and the thing the 2026-09-09 message orders deleted. The panel's default
 * selection is explicitly WANTED, in writing, in the newer message. So: this matrix arrives with the
 * first sourced cell of the first sourced row SELECTED and its panel showing, and NOTHING ELSE
 * anywhere on the site opens itself. The site-wide rule stands for every other route and component,
 * including F43 and the rendering guard's `no-default-open` leg; this component is their ONE allowed
 * exception, and it declares itself to the guard rather than hiding from it: while the reader has
 * not acted, the panel and the selected cell carry `data-open-on-mount` naming both dates, which is
 * the escape hatch open-state-sweep.mjs already provides for a ruled-open default.
 *
 * fitness-allow: F43 (R6 2026-09-09 default matrix selection; both messages quoted above)
 *   -- inert today and stated anyway: F43 matches a LEXICAL default-open tell (a useState whose name
 *   carries open/expand starting true, a defaultOpen prop, a <details open>), and the default
 *   selection below is none of those, so F43 finds nothing here to allow. The marker is written at
 *   the site so that a later build which does express this as a boolean has its ruling already
 *   beside it, and so the next reader sees the exception where the exception lives.
 *   -- FOLD 65 (2026-09-09) renumbered this citation. Lane opsmatrix5 was written against the tree
 *   where default-open-disclosure was F42; wave 64 renumbered that function to F43 and gave F42 to
 *   card-shell-outside-section-card, so the lane's original `F42` citation named the wrong function
 *   on this tree. The number here is the one the default-open gate actually carries on THIS tree,
 *   read from .discipline/fitness/functions/, not from either lane's prose.
 *
 * THE THREE PIECES OF STATE, and why the split lane noexpand introduced survives in a changed form:
 *   `selection`  `undefined` means THE READER HAS NOT ACTED and the computed default is in force;
 *                a `Selection` is what the reader chose with a click, an arrow, Enter or Space;
 *                `null` means the reader pressed Esc, which closes the panel and is the only way to
 *                reach an empty panel slot. Three states, not two, because "never touched" and
 *                "deliberately closed" are different facts and only one of them may re-open itself.
 *   `focusPos`   the roving-tabindex position. It STARTS ON THE DEFAULT SELECTION, so Tab lands on
 *                the cell whose facts are on screen. Under the 2026-09-09 message arrows MOVE THE
 *                SELECTION and the panel follows, so `moveFocus` and `selectAt` now travel together;
 *                the split is kept because Home/End and the mount still need to move focus alone.
 *   `moveRef`    gates the `useEffect` that pulls DOM focus to the roving cell, so the initial
 *                render never steals focus from the top of the page even though a cell is selected.
 *
 * THE CARD HEIGHT IS CONSTANT, and that is an acceptance test, not a slogan (operator 2026-09-09:
 * "at 1440 the matrix card height is constant regardless of selection"; coordinator note C3). The
 * panel is therefore a FIXED-HEIGHT SLOT (`PANEL_SLOT_HEIGHT`) that is always in the DOM and scrolls
 * its own content: empty after Esc, one cell's fact cards when a cell is selected, one card per
 * region when a row header is. Nothing the reader selects can change the card's height, because the
 * only box whose content varies has a height that does not.
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

/**
 * THE PANEL SLOT'S HEIGHT, and it is the whole of acceptance criterion A.
 *
 * Operator, 2026-09-09: "at 1440 the matrix card height is constant regardless of selection". A
 * panel that renders only when something is selected, or whose height follows its content, fails
 * that by construction: three fact cards and five stacked compare cards are not the same height, and
 * neither is nothing. So the slot is ALWAYS present and ALWAYS this tall, and its content scrolls
 * inside it. Nothing the reader does can move the card's bottom edge.
 *
 * The number is read off the replacement artboard (docs/design/handoff-2026-09-06/screens/
 * 08-operations-list-redesign-2026-09-08.png): the panel's top rule sits at y=572 and the foot strip
 * begins at y=860 in a 1353px-wide capture of a 1440px design, so 288 x (1440/1353) = 306px. 300 is
 * that measurement rounded to the 4px step the system sheet's spacing scale uses. At 1440 it holds
 * the artboard's own three fact cards without scrolling, which is what the artboard shows.
 */
const PANEL_SLOT_HEIGHT = 300;

/** The first N words of a string, collapsed. The no-figure card's headline is SIX (operator,
 *  2026-09-09: "the card leads with a 6-word headline in 13px/600"). Fewer than six words in means
 *  fewer than six out: nothing is padded and nothing is invented. */
export function sixWordHeadline(text: string, n = 6): string {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ");
}

/** What follows the six-word headline on the no-figure card: "then the claim" (operator). The claim
 *  is the row's prose when it has any; otherwise it is whatever of the label the headline did not
 *  already say, so the card never prints the same six words twice. */
export function claimAfterHeadline(description: string, prose: string | null): string {
  if (prose) return prose;
  const words = String(description ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length > 6 ? words.slice(6).join(" ") : "";
}

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
  /** `undefined` = untouched (the computed default is in force), `null` = the reader pressed Esc,
   *  a Selection = what the reader chose. See the dated block at the head of this file. */
  const [selection, setSelection] = useState<Selection | null | undefined>(undefined);
  /** The roving-tabindex position. Set below to the default selection on mount, so Tab lands on the
   *  cell whose panel is showing rather than on a cell nothing is said about. */
  const [focusPos, setFocusPos] = useState<{ r: number; c: number } | null>(null);
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

  /** THE DEFAULT SELECTION: "first sourced cell of the first sourced row" (operator, 2026-09-09,
   *  item 5, verbatim). Rows outer, regions inner, in the order the props give them, so two empty
   *  dimension rows and two empty region columns are both skipped and the scan lands on the first
   *  cell that actually carries a fact. A grid with no sourced cell anywhere yields null, and the
   *  panel slot renders empty rather than selecting a cell with nothing to say. */
  const defaultSelection: Selection | null = useMemo(() => {
    for (const d of dimensions) {
      for (const r of regions) {
        if ((grid.byCell[`${r.key}|${d.db}`]?.factCount ?? 0) > 0) return { regionKey: r.key, dimDb: d.db };
      }
    }
    return null;
  }, [dimensions, regions, grid]);

  /** True while the reader has not touched the grid: the default is what is on screen. It is what
   *  the `data-open-on-mount` declaration below is gated on, so the guard's exception covers the
   *  ARRIVAL state only and never a state the reader produced. */
  const untouched = selection === undefined;

  // A selection the props no longer contain (the rail scoped its column away, or its dimension away)
  // is DROPPED and re-points at the default, which is the state the operator asked this component to
  // arrive in; a reader whose Esc closed the panel keeps it closed.
  const resolved: Selection | null = useMemo(() => {
    if (selection === undefined) return defaultSelection;
    if (selection === null) return null;
    const dimOk = dimensions.some((d) => d.db === selection.dimDb);
    const regionOk = selection.regionKey === null || regions.some((r) => r.key === selection.regionKey);
    return dimOk && regionOk ? selection : defaultSelection;
  }, [selection, dimensions, regions, defaultSelection]);

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
   *  stop pointing past the end of the grid. Untouched, it IS the default selection's cell, so Tab
   *  lands on the cell whose facts are on screen; with no sourced cell anywhere it is the first. */
  const focusR = clampR(focusPos ? focusPos.r : Math.max(0, rowIndex));
  const focusC = clampC(focusPos ? focusPos.c : Math.max(0, colIndex));

  /** MOVE the tab stop and DOM focus. Home and End use it alone; the arrows pair it with `selectAt`,
   *  because the 2026-09-09 message says "arrow keys move the selection; panel follows". */
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

  // ARROW KEYS MOVE THE SELECTION AND THE PANEL FOLLOWS (operator, 2026-09-09, item 3, verbatim).
  // This reverses the focus-is-not-selection split lane noexpand built on 2026-09-08: the arrows
  // now commit the cell they land on, so a reader crossing the scoreboard by keyboard reads each
  // cell's facts as they arrive at it, which is the same thing a click does. Home and End still MOVE
  // ONLY, because they jump the length of a row and selecting the far end of a row is not what a
  // reader asking for the row's end meant. Enter and Space commit the focused cell (a no-op when the
  // arrows already did). Esc CLOSES the panel and leaves the slot empty until the reader picks again.
  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent, r: number, c: number) => {
      const selects: Record<string, [number, number]> = {
        ArrowRight: [r, c + 1],
        ArrowLeft: [r, c - 1],
        ArrowDown: [r + 1, c],
        ArrowUp: [r - 1, c],
      };
      if (selects[e.key]) {
        e.preventDefault();
        selectAt(selects[e.key][0], selects[e.key][1]);
        return;
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        moveFocus(r, e.key === "Home" ? 0 : regions.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSelection(null);
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

  /** The declaration the site-wide no-default-open sweep reads, naming BOTH operator messages. It is
   *  spread onto every element that reports itself open on ARRIVAL -- the panel and the selected
   *  cell -- because the sweep allows an element only if it, or an ancestor, carries the attribute,
   *  and the tinted cell is not inside the panel. It is `null` the moment the reader acts, so the
   *  exception covers arrival and no state the reader produced. */
  const arrivalDeclaration = untouched
    ? {
        "data-open-on-mount":
          'operator 2026-09-09 item 5 "Default state on load: first sourced cell of the first sourced row open". The one allowed exception to the 2026-09-08 ruling "no items expanded when first navigtaing to a page" (coordinator note C1, 2026-09-09)',
      }
    : null;

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
    // Esc closes the panel from ANYWHERE in the card (operator, 2026-09-09, item 3), not only from
    // a grid cell: a reader who tabbed into the panel to follow its links is exactly the reader
    // most likely to want it shut. FOLD 65: the handler reaches the card element through
    // SectionCard's own `onKeyDown` prop, added for this caller. A wrapper element inside the card
    // was tried first and rejected on measurement: `display: contents` draws no box, but it is
    // still a DOM ancestor, so it makes the head, the table, the panel slot and the foot legend
    // GRANDCHILDREN of the card and turns the design audit's two direct-child rows on
    // `[data-audit="ops-matrix-card"] > [data-audit="ops-matrix-foot"]` NOT BUILT.
    <SectionCard
      as="section"
      dataAudit="ops-matrix-card"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setSelection(null);
        }
      }}
    >
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
          {grid.fillRate.filled} of {grid.fillRate.total} cells sourced · {grid.fillRate.pct}% ·{" "}
          {totalRegions} regions{scrolls ? " · scroll →" : ""}
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
              <th role="columnheader" scope="col" data-guard-sticky-col="true" style={{ ...headCell, ...stickyCell, zIndex: 3, background: "var(--tag)" }}>
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
                    {...(headerSelected ? arrivalDeclaration : null)}
                    aria-controls={panelId}
                    aria-label={`${dimensionLabel(d)}, compare across every region`}
                    onClick={() => selectAt(ri, 0)}
                    onKeyDown={(e) => onCellKeyDown(e, ri, 0)}
                    data-guard-sticky-col="true"
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
                        {...(isSelected ? arrivalDeclaration : null)}
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
                            data-guard-display="matrix-cell-score"
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
      <div
        id={panelId}
        data-audit="ops-matrix-panel"
        role="region"
        aria-live="polite"
        aria-label={
          selectedDimension ? panelHeading(selectedRegion, selectedDimension, grid, regions) : "No cell selected"
        }
        // THE DECLARED EXCEPTION. While the reader has not acted, this panel is showing the default
        // selection, which the 2026-09-09 message asks for and the 2026-09-08 message would
        // otherwise forbid. It declares itself to open-state-sweep.mjs / the rendering guard's
        // no-default-open leg with the ruling, rather than being exempted by path: the attribute is
        // gone the moment the reader touches the grid, so the exception covers arrival and nothing
        // else. Nowhere else in the app carries it.
        {...(selectedDimension ? arrivalDeclaration : null)}
        // FIXED HEIGHT, and it is acceptance criterion A (operator 2026-09-09: "the matrix card
        // height is constant regardless of selection"). The slot is always in the DOM and always
        // this tall; its CONTENT scrolls. Nothing selected, one cell selected and a row header in
        // compare mode therefore produce three identical card heights, measured, not asserted.
        style={{
          background: "var(--page)",
          // "1px rgba(0,0,0,.12) top rule" (operator, 2026-09-09). That value is `--line-1`, the
          // card-border token, NOT `--line-2` (rgba(0,0,0,.08)) which the build before this one
          // used: measured 2026-09-09 and corrected, because .08 is not .12 and the panel's rule is
          // the one edge separating the scoreboard from the reading surface.
          borderTop: "1px solid var(--line-1)",
          padding: "12px 16px 8px",
          height: PANEL_SLOT_HEIGHT,
          boxSizing: "border-box",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {selectedDimension ? (
          <MatrixPanel
            dimension={selectedDimension}
            region={selectedRegion}
            regions={regions}
            cellAt={cellAt}
            profileHref={selectedRegion ? profileHrefByRegion[selectedRegion.key] ?? null : null}
            onCompare={() => selectAt(rowIndex, 0)}
          />
        ) : (
          // The Esc state. The slot keeps its height so the card does not move under the reader,
          // and says what will fill it rather than sitting blank.
          <p data-audit="ops-panel-empty" style={{ fontSize: "var(--fs-125)", color: "var(--ink-3)", margin: 0 }}>
            Panel closed. Click a cell, or arrow to one, to read its facts.
          </p>
        )}
      </div>

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
          {/* THE LEGEND SHOWS THE GLYPH IT EXPLAINS. [CONFIRMED 2026-09-09, from the side-by-side]
              the artboard's foot reads "— not in primary source ..."; the build read only the WORD,
              because the non-narrow Absence renders its reason and no dash. A legend that explains
              what the dash in the table means, without showing the dash, explains nothing. The
              narrow variant IS the dash (its `::after` carries \2014), so the two together render
              the artboard's own pairing, and the uppercase is the app-wide absence treatment rather
              than this surface's choice. */}
          <Absence reason="not in primary source" variant="narrow" />{" "}
          <Absence reason="not in primary source" /> · click a cell to open its facts · arrow keys move the
          selection
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
                data-audit="ops-compare-label"
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
  /** The period the figure is FOR, which is the source line's second element. Taken from the row's
   *  own envelope fields and never derived from the written date: "when the row was typed" and "what
   *  the figure measures" are different facts and the artboard shows the second one. Null on every
   *  live row today (the envelope columns are unpopulated), which is why the fixture's own source
   *  names carry their period the way the artboard's do. */
  const period = (f.referencePeriod as string) || (f.asAtDate ? String(f.asAtDate).slice(0, 7) : null);
  /** What sits on the lead line beside the figure or the headline. With a figure it is the row's
   *  label, which is the operator's "12.5px claim ... on one line". With no figure the label has
   *  already been spent on the six-word headline, so it is whatever of the label the headline did
   *  not say, and usually nothing: the claim is then the detail sentence below. */
  const inlineClaim = figure ? description : claimAfterHeadline(description, null);

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
      {/* LINE 1. EVERY FACT CARD LEADS WITH ITS FIGURE (operator, 2026-09-09, verbatim): the Anton
          18 headline figure INLINE with the 12.5px claim, on one line. `baseline` alignment is what
          makes an 18px display figure and 12.5px body sit on the same line rather than the figure
          floating above it.

          THE NO-FIGURE BRANCH, which is a real branch and not a sentence in a comment. Operator,
          same message: "If the pipeline has no figure for a fact, the card leads with a 6-word
          headline in 13px/600, then the claim." A fact reaches it two ways, both real in the live
          corpus: a row whose `value` is a sentence rather than a quantity, and a row with no value
          at all. `factHeadline` (region-grid.mjs) is the single place that decides, and it returns
          `figure: null` for exactly those two. The headline is the first six words of the row's own
          label (or of its prose when it has no label): the row's words, truncated, never a sentence
          the component wrote. What was here before was `<Absence reason="pending" />`, which put the
          literal word "pending" in a fact card, and the same message's delete list forbids CURRENT
          and PENDING inside cards. It is gone. `ops-matrix-nofigure` mounts the branch and
          spec/operations-matrix-nofigure.json measures it. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        {figure ? (
          <span
            data-audit="ops-fact-figure"
            data-guard-display="matrix-fact-figure"
            style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.1, color: "var(--ink)", flexShrink: 0 }}
          >
            {figure}
          </span>
        ) : (
          <span
            data-audit="ops-fact-headline"
            style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, color: "var(--ink)", flexShrink: 0 }}
          >
            {sixWordHeadline(description || prose || "")}
          </span>
        )}
        {inlineClaim && (
          <span
            data-audit="ops-fact-quote"
            style={{ fontSize: "var(--fs-125)", color: "var(--ink)", lineHeight: 1.45, overflowWrap: "anywhere", minWidth: 0 }}
          >
            {inlineClaim}
          </span>
        )}
        {idx !== null && (
          <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", flexShrink: 0 }}>index {Math.round(idx)} vs base</span>
        )}
      </div>
      {/* LINE 2, THE DETAIL SENTENCE: "12.5px, line-height 1.5" (operator, 2026-09-09). It is the
          row's prose, below the lead line rather than run into it, and it is drawn only when the row
          HAS prose: a row whose whole content is a figure and a label has no detail sentence and
          gets no empty box where one would be. In practice it is the NO-FIGURE card's claim, because
          `factHeadline` yields prose exactly when the row's value is a sentence rather than a
          quantity, which is the same condition that empties the figure slot. That is not an
          accident of the fixture, it is the data model: a row cannot have both a short numeric value
          and a sentence in the same field. It is full card width, which is what acceptance
          criterion B ("no text column inside the card is narrower than 560px") requires; see the
          measured note in DEVIATION-LOG.md on why a `72ch` max-width is NOT applied here. */}
      {prose && (
        <p
          data-audit="ops-fact-detail"
          style={{
            fontSize: "var(--fs-125)",
            lineHeight: 1.5,
            color: "var(--ink)",
            margin: "6px 0 0",
            overflowWrap: "anywhere",
            // "at most 72 characters per line" (operator, 2026-09-09) AND "no text column in the
            // card is narrower than 560px" (his acceptance criterion B) are two constraints on the
            // same box, and they can conflict: 72ch is only above 560px if the body face is wide
            // enough. MEASURED 2026-09-09 in chromium, this face at 12.5px: 72ch = 572.6px, which
            // clears the floor by 12.6px, so both hold and neither is traded away. `max()` states
            // that rather than relying on it: the acceptance floor wins if a future face makes 72ch
            // narrower than 560px, because that is the criterion the lane is judged on. Before this
            // cap the detail sentence set 134 characters on a line at the mount's width.
            maxWidth: "max(560px, 72ch)",
          }}
        >
          {prose}
        </p>
      )}
      {/* SOURCE LINE, 10.5px muted, in the shape the operator states and the artboard draws:
          "Vervo Logistics · 2024-08 · row written 2026-05-28" / "Indeed HK · 2025-09 · row written
          2026-05-28" / "MOM Occupational Wage Survey · 2025 · official". Three elements: the source
          name, the period the figure is FOR, and then the row's provenance word when it carries one
          or the date the row was written when it does not. The build before this one put the written
          date second and the provenance word third, which is neither the operator's shape nor the
          artboard's. */}
      <div data-audit="ops-fact-source" style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", marginTop: 8, overflowWrap: "anywhere" }}>
        {name ? (
          url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                // FOLD 65 (2026-09-09): 28, not the lane's 24, for the same reason `panelLink` is
                // 28. With the panel in the composed page's arrival state the site-wide layout
                // guard measures this source link too, and reported it at 24px against L9's floor
                // on /operations at both 1440 and 1024 (three source links x two widths, the six
                // findings that took the guard total from master's 622 to 628). The value rises to
                // the floor; the floor is not lowered.
                display: "inline-flex",
                alignItems: "center",
                minHeight: 28,
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
        {period ? ` · ${period}` : ""}
        {provenance ? ` · ${provenance}` : written ? ` · row written ${written}` : " · no date on row"}
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
/**
 * "REGIONS BEYOND FIVE SCROLL INSIDE THE CARD" (operator, 2026-09-09, item 4), and this constant is
 * what makes that TRUE rather than merely possible.
 *
 * [CONFIRMED, this lane, 2026-09-09, measured in chromium] With the previous 96px floor a SIXTH
 * region column did not scroll at 1440. Measured scroller widths: 1024px on the real /operations
 * page at 1440 (`compose-08-operations`, card 1032px), 892px in the component mount. Six columns at
 * the old floor summed to 180 + 6 x 96 = 756px, inside both, so they simply stretched and the
 * scroller never engaged.
 *
 * The floor has to sit in the window where FIVE columns still fit and SIX do not, at both widths:
 *   six scroll at 1440    180 + 6F > 1024  ->  F > 140.7
 *   five fit in the mount 180 + 5F <= 892  ->  F <= 142.4
 * 142 is inside it with both ends checked: five columns are 890px against a 1024px and an 892px
 * scroller (fits, no scroll), six are 1032px against both (scrolls). Measured both ways in
 * `.discipline/rendering/smoke/ops-matrix-acceptance-smoke.mjs`, which mounts six regions and fails
 * if the scroller does not engage, and five and fails if it does.
 */
const REGION_COL_MIN = 142;

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

/** The sticky first column, its floor, and its 1px right divider.
 *
 *  DECLARED TO THE LAYOUT GUARD (FOLD 64). Every cell carrying this style also carries
 *  `data-guard-sticky-col`, which is the attribute L5's `table-card-sticky-first-column` allowlist
 *  row matches. The declaration is deliberate rather than a selector the guard guesses at: L5's
 *  allowlist file states that an exception "is a list of components, not a list of selectors a page
 *  can quietly satisfy", so the sticky column announces itself and any OTHER sticky element in this
 *  file is still an L5 finding. */
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

/** FOLD 65 (2026-09-09): the floor is 28, not the 24 lane opsmatrix5 wrote. The lane measured this
 *  panel on a mount, where the site-wide layout guard does not run. On the folded tree the panel is
 *  in the arrival state of the composed /operations page, so the guard now MEASURES these three
 *  controls ("Compare across regions", "Open profile", "N more facts on the profile") and reported
 *  all three at 24px against L9's floor of ">= 44px in one dimension and >= 28px in the other", six
 *  findings across 1440 and 1024. The value RISES to the floor the guard enforces rather than the
 *  guard being relaxed, which is the same resolution fold 63 applied to the calculator foot link. */
const panelLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
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
