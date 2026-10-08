/**
 * MarketComparativeRibbon, the HEADLINE SERIES card of artboard 04 / dc.html `id="p4"`.
 *
 * FILE IDENTITY vs RENDERED COPY. The export keeps its original name (spec 02 §6 item 1's
 * "comparative ribbon"); the card's rendered title is the artboard's own, "HEADLINE SERIES".
 *
 * WHICH SERIES THIS ROW CONTAINS IS NOT DECIDED HERE (operator ruling, 2026-09-08). It is decided by
 * selectHeadlineSeries (src/lib/market/headline-series-select.mjs) over the families declared in
 * src/lib/market/series-family.mjs: one card per distinct price signal, fuels then carbon then FX then
 * other indices, five visible, and no series that has no delta yet. This component renders the
 * selection it is handed, in the order it is handed, and counts nothing itself.
 *
 * HONEST TODAY: of the 16 live series keys, the 4 ECB FX reference rates each hold one observation and
 * therefore carry no delta, so the ruling's own rule 4 keeps them off this row and on the series board.
 * The rest carry a real delta, so the cards below are comparative rather than the placeholder state
 * this file was originally written against.
 * FOLD 63 (2026-09-08), THE ONE COLLISION IN THIS TRAIN AND HOW IT IS RESOLVED. Lanes market63 and
 * seriesfamily both rewrote this row, from different sources. market63 built it from artboard 04's
 * markup, measured in chromium. seriesfamily implements the operator's LATER ruling, which says
 * WHICH series the row contains. The later ruling supersedes the earlier lane wherever the two
 * disagree, so the split is exact and there is one implementation of each half, never two:
 *
 *   SELECTION and the HEADER COUNT are seriesfamily's. `selectHeadlineSeries` decides which
 *   families appear and in what order; the head reads "N of M" where N is DISTINCT FAMILIES SHOWN
 *   and M is every observed series. Nothing in this file chooses or counts a series.
 *
 *   GEOMETRY and TYPE are market63's. One row of compact cards on `grid-auto-flow: column` at
 *   `calc((100% - 40px) / 5)`, Anton 17px value with the 1w delta inline beside it. (Lane MKT-1,
 *   2026-10-08: the card no longer stops at the artboard's 86.844px; see the MKT-1 block below.)
 *
 *   THE OVERFLOW takes market63's mechanism, because that is geometry: the families past the
 *   ruling's cap of five continue the SAME row into the horizontal scroller, they are not stacked
 *   into a second grid under a "N more headline series" disclosure. seriesfamily's disclosure and
 *   market63's `MAX_METRICS = 10` are both gone; the cap is `HEADLINE_VISIBLE_CAP` in
 *   headline-series-select.mjs, the ruling's own five, and it governs the HEAD COUNT while the
 *   scroller carries the remainder. One cap, one row, one mechanism.
 *
 * LANE MARKET63 (2026-09-08), EVERY NUMBER BELOW IS READ OFF `id="p4"`, MEASURED IN CHROMIUM,
 * not taken from prose. The operator's instruction for this lane was "match the artboard, not the
 * prose", so the artboard markup is the authority and each divergence from the brief's words is
 * named here rather than silently resolved:
 *
 *   - ONE ROW OF FIVE compact cards. p4's grid is `repeat(5,1fr)` with `gap:10px` inside a card
 *     whose content box is 744px at 1440, so each card measures 140.8px, NOT the "~105px" the
 *     brief's prose estimates. The artboard value wins and 140.8px is what this renders.
 *   - The cards past the fifth SCROLL HORIZONTALLY. p4 draws exactly five, so the image itself
 *     carries no scroller; the horizontal scroll is the operator's own instruction for the
 *     remainder, and it is built so the FIRST FIVE land on p4's exact 140.8px track at 1440 and
 *     the rest are reachable without a second row. (FOLD 63 rewrote this bullet: market63 read
 *     p4's head caption as "10 of 16" and made ten the cap. The later ruling caps the row at FIVE
 *     and redefines the caption's N as distinct families shown, so the geometry below is unchanged
 *     and only the number of cards on the visible track has moved from ten to five.)
 *   - Card: 10px 12px padding, 10px radius, the standard card border/shadow.
 *   - Label: 9.5px / 700 / 0.1em, uppercase, ONE LINE, ellipsised.
 *   - Value + delta share ONE baseline row: Anton 17px (p4's value, not the brief's "18px") beside
 *     an 11px/700 ink delta in p4's own `▼1.7% 1w` form.
 *   - "as of <date>": 10px muted, 4px above.
 *   - NO "N more headline series below" disclosure. (p4 also draws no sparkline, no 1m row and no
 *     YoY row, measured as zero `<svg>` in the card; lane MKT-1 adds those, see the block below.)
 *
 * THE ONE PLACE THIS DOES NOT FOLLOW p4, and why. p4's card head carries
 * `border-bottom:1px solid rgba(0,0,0,.08)` under the title. Operator ruling 5.1 (2026-09-07,
 * CLOSED) says the opposite in as many words, "there is NO divider below the title", and a
 * standing ruling outranks the image it was written against. No divider is rendered; the artboard
 * value is recorded in compose-04-market-list.json's notes so the divergence stays visible.
 *
 * SERVER COMPONENT, NO NEW FETCH: reads the SAME `MarketSeriesBoardVM` the page already fetches for
 * <MarketSeriesBoard> (fetchMarketSeriesBoard → buildSeriesBoard). `deltas` is attached upstream by
 * src/lib/market/series-board-view-model.mjs from the FULL row history per series_key.
 *
 * LANE MKT-1 (2026-10-08), WHAT THE CARD NOW RENDERS. Spec 02 section 6 row 1 says each headline metric is
 * `level, change over 1w, change over 1m, change year on year, sparkline, as-of`. series-deltas.mjs has
 * computed all of them since lane SURF and series-board-view-model.mjs attaches them to every row, but
 * the card drew only the 1w change (VERIFY-1 register row 02S6 r1, [CONFIRMED]). It now draws all six:
 * the 1w change inline with the level (unchanged), the 1m and YoY changes on a row of their own, a
 * sparkline, the as-of date, and the freshness state of the series against its own registry cadence.
 * Under the track sit the board's freshness panel summary (spec 02 section 6 row 11) and one
 * methodology and provenance disclosure (row 10) whose blocks are the series board's own fields grid,
 * both imported from the series board's extracted parts, not retyped.
 *
 * DESIGN CHANGE OWED (rule 20, artboards govern look and the system governs function): artboard 04 / p4
 * draws none of the sparkline, the 1m and YoY changes, the freshness state or the disclosure. The system
 * needs them (spec 02 row 1, 10, 11), so the build follows the spec and the divergence is recorded in the
 * lane's session log for Claude Design to draw. The p4-derived rows in
 * `.discipline/rendering/audit/spec/compose-04-market-list.json` that forbid a sparkline and a 1m or YoY
 * row in this card are now contradicted by the spec; updating them is the coordinator's (not in this
 * lane's write set).
 *
 * A DELTA THAT DOES NOT EXIST IS NAMED, NEVER A GREY DASH (spec 00 section 4, six states). Each window
 * that cannot show a number renders the state it falls in, in words, with the reason on hover:
 *   - no data yet  : the series is covered and the window has too little history (names the days needed);
 *   - not covered  : no comparison is computed for the series at all (`deltas` absent; the headline
 *                    selection, rule 4, keeps such a series off this row, so this is the safe default);
 *   - suppressed   : the number exists and is withheld, because the unit or currency changed across the
 *                    compared pair (the reason class is stated);
 *   - not applicable: a percent change is undefined because the prior value was zero.
 * The mapping and the words live in `deltaCellModel` below, exported so a test can attack each branch.
 * The old "pending" word (which the absence vocabulary retired on 2026-09-25) no longer renders here.
 * "Not filtered in" and "Error" are not states of a delta and do not occur on this card.
 */

import Link from "next/link";
import type { MarketSeriesBoardVM, MarketSeriesDisplayRow } from "@/lib/supabase-server";
import { formatDelta } from "@/lib/contracts/envelope.mjs";
import { selectHeadlineSeries } from "@/lib/market/headline-series-select.mjs";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatNumber } from "@/lib/format";
import { ABSENCE_TEXT_STYLE } from "@/components/ui/Absence";
import { DELTA_WINDOWS } from "@/lib/market/series-deltas.mjs";
import { producerFor } from "@/lib/market/series-registry.mjs";
import { deriveSeriesFreshness } from "@/lib/market/series-freshness.mjs";
import {
  SeriesFreshnessBadge,
  SeriesFreshnessPanel,
  boardFreshnessSummary,
  type SeriesFreshnessState,
} from "@/components/market/SeriesFreshness";
import { SeriesProvenanceFields, type SeriesProducerRef } from "@/components/market/SeriesProvenance";

interface MarketComparativeRibbonProps {
  board: MarketSeriesBoardVM;
  /** True when mounted inside ListSurfaceShell's `aboveRows` slot (artboard 04/id="p4": the
   *  "Headline series" card nests BETWEEN the band tiles and the sort row, inside the content
   *  column, not as its own full-bleed page section) — lane compose-lists, 2026-09-08, relocating
   *  the placement this file's own header comment (and DEVIATION-LOG.md) already logged as
   *  deferred. Drops the standalone page-section's own maxWidth/margin/padding so the card fills
   *  the content column instead. The card's own border/radius/shadow/section-rule chrome (ruling
   *  5.1) is added by MarketIntelLedger where this mounts, not here, so a future non-embedded
   *  caller is unaffected. */
  embedded?: boolean;
  /** Server render instant (src/lib/render-now.ts), the "now" every freshness state below is judged
   *  against. Injected, never read from the clock (envelope.mjs's own discipline); the fallback is for
   *  a mount that has no server render (a test or a smoke fixture). */
  nowIso?: string;
}

/** p4's grid: five columns, 10px gutters. Written as an auto-column track so the sixth card and
 *  beyond continue the SAME row into the horizontal scroller instead of wrapping onto a second
 *  one. At 1440 the content column is 780px and the card's 16px side padding leaves 744px, so
 *  `(100% - 4 * 10px) / 5` resolves to p4's measured 140.797px per card. */
const HEADLINE_TRACK = "calc((100% - 40px) / 5)";

/** Below 768 a fifth of the viewport is 60px, which cannot hold a €1,217/1000L value, so the track
 *  stops dividing and becomes a fixed 150px card that scrolls sideways, the same one row, the same
 *  card, sized to be legible. p4 is a 1440 artboard and draws no mobile state for this card; this is
 *  the DP-1/RD-60 reflow rule applied to it, not a second design. */
const HEADLINE_TRACK_MOBILE = "150px";


export interface DeltaPoint { date: string; value: number | null }
export interface WindowDelta {
  value?: number;
  pct?: number | null;
  fromDate?: string;
  insufficientHistory?: boolean;
  unitMismatch?: boolean;
}
export interface SeriesDeltas {
  count: number;
  latest: { date: string; value: number | null; unit: string | null; currency: string | null } | null;
  sparkline: DeltaPoint[];
  delta1w: WindowDelta | null;
  delta1m: WindowDelta | null;
  deltaYoY: WindowDelta | null;
  message: string | null;
}
type BoardRow = MarketSeriesDisplayRow & { deltas?: SeriesDeltas };
interface RibbonRow {
  seriesKey: string;
  label: string;
  displayValue: string;
  /** The display row's own reason for an unobserved value (formatSeriesValue), when it has one. */
  emptyReason: string | null;
  /** Undefined when the row carries no comparison at all (the "not covered" state). */
  deltas: SeriesDeltas | undefined;
  /** The other members of this card's family, folded onto it ("+3 rates"). The ONE new field the card
   *  markup gained for the ruling: the fold has nowhere else to live, and its count comes from the
   *  family, never from a literal. count 0 renders nothing. */
  fold: { count: number; noun: string };
  /** The primary member's board row: the series the number belongs to, for freshness and provenance. */
  source: BoardRow;
}

interface HeadlineCard {
  familyKey: string;
  label: string;
  row: BoardRow;
  fold: { count: number; noun: string };
}
interface HeadlineSelection {
  visible: HeadlineCard[];
  overflow: HeadlineCard[];
  familiesShown: number;
  totalSeries: number;
}

function toRibbonRow(card: HeadlineCard): RibbonRow {
  return {
    seriesKey: card.familyKey,
    label: card.label,
    displayValue: card.row.displayValue,
    emptyReason: card.row.emptyReason ?? null,
    deltas: card.row.deltas,
    fold: card.fold,
    source: card.row,
  };
}

// The six coverage states of spec 00 section 4, as they apply to ONE delta window.

/** The states a delta window can fall in, with the SDMX OBS_STATUS code each maps to (vocabularies.mjs). */
export type DeltaAbsentState = "no_data_yet" | "not_covered" | "suppressed" | "not_applicable";
export const DELTA_STATE_OBS_CODE: Readonly<Record<DeltaAbsentState, "H" | "L" | "Q" | "O">> = {
  no_data_yet: "H",
  not_covered: "L",
  suppressed: "Q",
  not_applicable: "O",
};
/** The words the reader sees, spec 00 section 4's own names. */
export const DELTA_STATE_LABEL: Readonly<Record<DeltaAbsentState, string>> = {
  no_data_yet: "no data yet",
  not_covered: "not covered",
  suppressed: "suppressed",
  not_applicable: "not applicable",
};

export type WindowKey = "1w" | "1m" | "YoY";
const WINDOW_DAYS: Record<WindowKey, number> = { "1w": DELTA_WINDOWS.w1, "1m": DELTA_WINDOWS.m1, YoY: DELTA_WINDOWS.yoy };

export type DeltaCellModel =
  | { kind: "value"; window: WindowKey; arrow: string; magnitude: string; fromDate: string | undefined; text: string }
  | { kind: "absent"; window: WindowKey; lead: string; state: DeltaAbsentState; obsStatus: "H" | "L" | "Q" | "O"; label: string; detail: string };

/** An absent slot. `lead` is the visible prefix naming the slot (the window, or "trend", "as of", "value"). */
export function absentCell(window: WindowKey, state: DeltaAbsentState, detail: string, lead: string = window): DeltaCellModel {
  return { kind: "absent", window, lead, state, obsStatus: DELTA_STATE_OBS_CODE[state], label: DELTA_STATE_LABEL[state], detail };
}

/**
 * Decide what ONE delta window renders: a number, or the spec 00 section 4 state it falls in. Pure.
 *
 * `deltas` undefined means the row carries no comparison at all (not covered). Otherwise:
 *   - the window object is null (the series has fewer than two observations): no data yet;
 *   - insufficientHistory: no data yet, naming the days of history the window needs;
 *   - unitMismatch: suppressed, naming the unit change as the reason class;
 *   - a numeric change whose percent is undefined (the prior value was zero): not applicable;
 *   - otherwise a value, as an arrow, an unsigned magnitude and the window name.
 * Never a bare dash and never the word "pending".
 */
export function deltaCellModel(deltas: SeriesDeltas | undefined, window: WindowKey): DeltaCellModel {
  if (!deltas) {
    return absentCell(window, "not_covered", "No comparison is computed for this series yet. It is in scope and not built.", "comparison");
  }
  const days = WINDOW_DAYS[window];
  const delta = window === "1w" ? deltas.delta1w : window === "1m" ? deltas.delta1m : deltas.deltaYoY;
  const first = deltas.sparkline?.[0]?.date;
  const needs = `Needs ${days} days of history for the ${window} change.`;

  if (!delta) {
    if (deltas.count === 0) return absentCell(window, "no_data_yet", "No observations on record yet.");
    if (deltas.count === 1) return absentCell(window, "no_data_yet", `One observation on record${first ? `, ${first}` : ""}. ${needs}`);
    return absentCell(window, "no_data_yet", needs);
  }
  if (delta.unitMismatch) {
    return absentCell(
      window,
      "suppressed",
      `Unit or currency changed since ${delta.fromDate}. The ${window} change is withheld rather than compared across a unit change.`,
    );
  }
  if (delta.insufficientHistory || typeof delta.value !== "number") {
    return absentCell(window, "no_data_yet", `${needs}${first ? ` First observation ${first}.` : ""}`);
  }
  // Division-by-zero guard fired upstream (prior value was 0): a % move is undefined, and showing
  // one would be exactly the fabrication this module refuses elsewhere.
  if (typeof delta.pct !== "number") {
    return absentCell(window, "not_applicable", `A percent change is undefined: the value on ${delta.fromDate} was zero.`);
  }
  // p4 writes DIRECTION as a glyph and MAGNITUDE unsigned, so the sign formatDelta emits is not
  // wanted here; the arrow carries it. `kind` stays "quantity" (a percent move, never pp), it is
  // required and never defaulted, per envelope.mjs's own header.
  const arrow = delta.pct > 0 ? "▲" : delta.pct < 0 ? "▼" : "";
  const magnitude = formatDelta(Math.abs(delta.pct), "quantity")?.replace(/^[+−]/, "") ?? "";
  return { kind: "value", window, arrow, magnitude, fromDate: delta.fromDate, text: `${arrow}${magnitude} ${window}` };
}

// Sparkline.

/** Most points a card's sparkline draws. A series with hundreds of observations is sampled evenly, first
 *  and last point always kept, so the line is honest about its span and the markup stays small. */
export const SPARKLINE_MAX_POINTS = 60;
const SPARK_W = 100;
const SPARK_H = 24;
const SPARK_PAD = 2;

export interface SparklineModel {
  /** SVG `points` attribute value in a 100 by 24 box. */
  points: string;
  /** Observations drawn (after sampling) and observations on record with a numeric value. */
  drawn: number;
  total: number;
  from: string;
  to: string;
}

/** Pure: the sparkline geometry for a series, or null when fewer than two numeric points exist (the card
 *  then renders the no-data-yet state, never an empty box). A flat series draws a level line. */
export function sparklineModel(sparkline: DeltaPoint[] | undefined, maxPoints = SPARKLINE_MAX_POINTS): SparklineModel | null {
  const valid = (sparkline ?? []).filter((p) => typeof p?.value === "number" && Number.isFinite(p.value)) as Array<{ date: string; value: number }>;
  if (valid.length < 2) return null;
  let picked = valid;
  if (valid.length > maxPoints) {
    picked = [];
    for (let i = 0; i < maxPoints; i += 1) {
      picked.push(valid[Math.round((i * (valid.length - 1)) / (maxPoints - 1))]);
    }
  }
  const values = picked.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const points = picked
    .map((p, i) => {
      const x = (i / (picked.length - 1)) * SPARK_W;
      const y = span === 0 ? SPARK_H / 2 : SPARK_PAD + (1 - (p.value - min) / span) * (SPARK_H - 2 * SPARK_PAD);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return { points, drawn: picked.length, total: valid.length, from: picked[0].date, to: picked[picked.length - 1].date };
}

/** The producer group a board row belongs to (the series board's own grouping), else null for an
 *  unregistered row. */
function groupFor(board: MarketSeriesBoardVM, seriesKey: string) {
  return board.groups.find((g) => g.series.some((s) => s.seriesKey === seriesKey)) ?? null;
}

export function MarketComparativeRibbon({ board, embedded = false, nowIso: nowIsoProp }: MarketComparativeRibbonProps) {
  const selection = selectHeadlineSeries(board) as HeadlineSelection;
  const shown = selection.visible.map(toRibbonRow);
  const overflow = selection.overflow.map(toRibbonRow);
  if (shown.length === 0) return null;
  // FOLD 63: one row, in the ruling's order, the first five on the visible track and the rest
  // reachable by scrolling it sideways. The cap is NOT applied again here; `visible` already carries
  // it, and it is what the head counts. Concatenating rather than rendering a second grid is the
  // whole of the overflow mechanism, which is why there is no "N more headline series" disclosure.
  const track = [...shown, ...overflow];

  // clock-ok: fallback only. The market page passes `nowIso` from the server render (src/app/market/page.tsx).
  const nowIso = (nowIsoProp ?? new Date().toISOString()).slice(0, 10);
  const panelFreshness = boardFreshnessSummary(board, nowIso);
  const located = track.map((row) => {
    const group = groupFor(board, row.source.seriesKey);
    const producerEntry = group ? (producerFor(group.keyPrefix) ?? null) : null;
    return { row, group, producerEntry };
  });

  // Operator item A1 (2026-09-08): "Headline series" is one of the eighteen listed cards. Its card
  // shell used to be a local style object plus a conditional `<SectionRule/>`; both are gone, and
  // the embedded form is the shared `SectionCard`, which mounts the rule itself. Ruling 5.1
  // (2026-09-07, CLOSED) is unchanged and now unskippable: rule above the title, no divider below
  // it (a solid border-bottom under this title was the defect 5.1 names).
  const body = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          /* p4 head box: `padding:14px 16px 10px`. Its `border-bottom` is deliberately NOT
             rendered, ruling 5.1, see this file's header. */
          padding: embedded ? "14px 16px 10px" : "0 0 8px",
          margin: 0,
          flexWrap: "wrap",
        }}
      >
        {/* artboard 04/id="p4": "HEADLINE SERIES" — this card's own title, not "Comparative
            ribbon" (this file's pre-existing name, kept as the component/file identity, not the
            rendered copy). */}
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            /* p4, measured: Anton 20px / 0.04em. Was 26px. */
            fontSize: 20,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Headline series
        </h2>
        <span
          style={{
            fontSize: 10.5,
            /* p4's head caption resolves to 600 (its inline style sets 700 then 600); was 800. */
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            /* Lane MKT-1 (2026-10-08): was `whiteSpace: "nowrap"`, which held this caption on one line
               at 375px where it ran 34px past the screen and was clipped by the card (measured in
               chromium before the change: right edge 409px of 375px). Wrapping is allowed so the
               caption breaks inside the card; at 1440 it is one line, as p4 draws it. */
            minWidth: 0,
          }}
        >
          {/* Ruling step 3: N is the number of distinct FAMILIES shown, not the number of cards and
              not the number of series; the denominator is every observed series. */}
          {formatNumber(selection.familiesShown)} of {formatNumber(selection.totalSeries)} · dated,
          sourced observations ·{" "}
          {/* Lane W10-NavCard (2026-09-23, bundle ruling 6): was `#market-series-board`, an in-page
              anchor to a section removed from this page in the same lane; now the standalone route. */}
          {/* Law 2 target floor (lane MKT-1): the bare 13px-tall inline link measured 104 by 13px; the
              padding gives it a 25px target without moving the caption's text. */}
          <Link href="/market/series" style={{ color: "inherit", textDecoration: "underline", display: "inline-block", padding: "6px 0" }}>
            Series board →
          </Link>
        </span>
      </div>

      {/* p4's five-across track, continued sideways rather than wrapped. `overflow-x: auto` is the
          operator's instruction for the remainder; at 1440 with five or fewer series nothing
          scrolls and the row is pixel-identical to the artboard. `data-overflow-allowed` is the shared
          overflow rule's declaration (overflow-rule.mjs): this track may scroll inside its OWN box, and
          that box (the card or page column) must still fit the screen. */}
      {/* Outside the grid: a <style> element placed inside it would be the grid's FIRST auto
          column, a zero-width card ahead of Diesel. Measured, not guessed. */}
      <style>{`
        @media (max-width: 767px) {
          .cl-headline-track { grid-auto-columns: ${HEADLINE_TRACK_MOBILE} !important; }
        }
      `}</style>
      <div
        className="cl-headline-track"
        data-audit="headline-track"
        data-overflow-allowed=""
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: HEADLINE_TRACK,
          gap: 10,
          overflowX: "auto",
          padding: embedded ? "0 16px 16px" : undefined,
        }}
      >
        {located.map(({ row, producerEntry }) => (
          <RibbonCard key={row.seriesKey} row={row} producerEntry={producerEntry} nowIso={nowIso} />
        ))}
      </div>

      {/* Spec 02 section 6 rows 11 and 10, mounted from the series board's own extracted parts: the
          freshness panel summary (worst state governs, over every populated series on the board) and ONE
          methodology and provenance disclosure for the series on this row. One click from any number
          above. Closed by default (CLAUDE.md accordion rule). The cards are too narrow to open a fields
          grid inside, which is why the disclosure is one block under the track rather than one per card;
          each block is headed by the card's series and draws the identical fields. */}
      <div data-audit="headline-footer" style={{ padding: embedded ? "0 16px 16px" : "12px 0 0" }}>
        <SeriesFreshnessPanel summary={panelFreshness} style={{ margin: "0 0 10px" }} />
        <details data-audit="headline-method-drawer">
          <summary
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              padding: "6px 0",
            }}
          >
            Methodology &amp; provenance for these series
          </summary>
          <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
            {located.map(({ row, group }) => (
              <div key={row.seriesKey} data-audit="headline-method-block">
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)", margin: 0, overflowWrap: "anywhere" }}>
                  {row.source.label}
                </p>
                <SeriesProvenanceFields row={row.source} producer={group as SeriesProducerRef | null} />
              </div>
            ))}
          </div>
        </details>
      </div>
    </>
  );

  return embedded ? (
    <SectionCard dataAudit="headline-series">{body}</SectionCard>
  ) : (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>{body}</div>
  );
}

/** ONE card of the headline row. Geometry is p4's, measured: 10px 12px padding, 10px radius, a
 *  9.5px/700/0.1em one-line ellipsised label, then a SINGLE baseline row carrying the Anton 17px value
 *  beside its 11px/700 ink 1w delta. Lane MKT-1 adds beneath that: the 1m and YoY changes, the
 *  sparkline, "as of <date>" at 10px muted, and the series' freshness state. */
function RibbonCard({
  row,
  producerEntry,
  nowIso,
}: {
  row: RibbonRow;
  producerEntry: { cadenceDays?: number | null } | null;
  nowIso: string;
}) {
  const d = row.deltas;
  const w1 = deltaCellModel(d, "1w");
  const m1 = deltaCellModel(d, "1m");
  const yoy = deltaCellModel(d, "YoY");
  const spark = sparklineModel(d?.sparkline);
  const asOf = d?.latest?.date ?? row.source.asAtDate ?? row.source.referencePeriod ?? null;
  const freshness = deriveSeriesFreshness(
    { as_at_date: row.source.asAtDate, reference_period: row.source.referencePeriod },
    producerEntry,
    nowIso,
  ) as SeriesFreshnessState;
  return (
    // fitness-allow: F42 (a TILE inside a card, not a section card. Measured against the artboard
    // source itself, `docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html`, id="p4": the
    // enclosing HEADLINE SERIES card opens with
    // `<div style="height:3px;background:linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))">`
    // and each of the five tiles inside it opens with
    // `background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:10px;box-shadow:0 1px 2px
    // rgba(26,26,26,.04),0 4px 14px rgba(26,26,26,.06);padding:10px 12px;overflow:hidden` and NO
    // rule child. Rendering this through SectionCard would therefore draw five 3px rules the image
    // does not have, which is item A1 applied to the wrong object: A1 governs the CARD, and p4's own
    // markup shows this is the same tile class as the four band tiles above it, which BandTile.tsx
    // draws with identical chrome and no rule. The card this tile sits in IS a SectionCard, one line
    // below in this file.
    //
    // THE SHARED PART THIS WANTS, delivered decision-ready rather than half-built (rule 13): there is
    // no `Tile` primitive yet, so BandTile.tsx retypes the same five declarations and escapes F42
    // only because its border is a template literal the gate's regex cannot see. Extracting a Tile
    // shell and moving BandTile and this card onto it would close that hole properly, and it is a
    // change to a component four surfaces mount with its own audit spec (bandtile.json), so it is
    // named in DEVIATION-LOG.md as follow-up rather than landed inside a fold.
    <div
      data-audit="headline-card"
      // The site-wide layout guard's own marker for "carries card chrome, is not a panel", the same
      // class as the band tiles and the stat tiles (allowlists.mjs NOT_A_CARD). L6 would otherwise
      // require a 3px rule p4 does not draw on this tile, and L10 would require a manifest entry the
      // manifest generator structurally cannot produce for a tile nested inside a card.
      data-guard-tile=""
      // fitness-allow: F42 (a TILE inside a card, not a section card; the full reason, with the
      // artboard bytes it was measured from, is the comment block directly above.)
      style={{
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        background: "var(--card)",
        padding: "10px 12px",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <p
        data-audit="headline-card-label"
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          margin: 0,
          // p4: `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`, the series label is
          // ONE line and is cut, never wrapped onto a second line that would deepen the card.
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={row.label}
      >
        {row.label}
        {row.fold.count > 0 && (
          <span style={{ fontWeight: 700, color: "var(--color-text-muted)" }}>
            {" "}
            +{row.fold.count} {row.fold.noun}
          </span>
        )}
      </p>
      {/* p4: `display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;margin-top:6px`, the
          value and its delta share ONE baseline. A value that was never observed names its state
          (no data yet) instead of printing a dash. */}
      <div
        data-audit="headline-card-value-row"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px", marginTop: 6 }}
      >
        {row.emptyReason ? (
          <Cell cell={absentCell("1w", "no_data_yet", row.emptyReason, "value")} auditKey="headline-card-value" />
        ) : (
          <span style={{ fontFamily: "var(--font-display)", fontSize: 17, lineHeight: 1.05, color: "var(--ink)" }}>
            {row.displayValue}
          </span>
        )}
        <Cell cell={w1} auditKey="headline-card-delta" />
      </div>
      <div
        data-audit="headline-card-windows"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 10px", marginTop: 4 }}
      >
        <Cell cell={m1} auditKey="headline-card-delta-1m" />
        <Cell cell={yoy} auditKey="headline-card-delta-yoy" />
      </div>
      {/* The trend: a plain polyline in the ink tone, sampled to at most SPARKLINE_MAX_POINTS. Its span
          and observation count are stated in its accessible name, so the line is never read as a fixed
          window. Fewer than two numeric points is the no-data-yet state, not an empty box. */}
      <div data-audit="headline-card-spark" style={{ marginTop: 6 }}>
        {spark ? (
          <svg
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            preserveAspectRatio="none"
            width="100%"
            height={SPARK_H}
            role="img"
            aria-label={`Trend over ${spark.total} observations, ${spark.from} to ${spark.to}`}
            style={{ display: "block", overflow: "visible" }}
          >
            <title>{`${spark.total} observations, ${spark.from} to ${spark.to}`}</title>
            <polyline
              points={spark.points}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <Cell
            cell={absentCell("1w", "no_data_yet", "Needs at least two numeric observations to draw a trend.", "trend")}
            auditKey="headline-card-spark-absent"
          />
        )}
      </div>
      <p data-audit="headline-card-asof" style={{ fontSize: 10, color: "var(--ink-3)", margin: "4px 0 0" }}>
        {asOf ? (
          `as of ${asOf}`
        ) : (
          <Cell cell={absentCell("1w", "no_data_yet", "No observation date on record.", "as of")} auditKey="headline-card-asof-absent" />
        )}
      </p>
      <SeriesFreshnessBadge freshness={freshness} showAsOf={false} />
    </div>
  );
}

/** One slot of the card: a number, or the state it falls in. */
function Cell({ cell, auditKey }: { cell: DeltaCellModel; auditKey: string }) {
  if (cell.kind === "absent") {
    // A slot that cannot show a number says which of spec 00 section 4's states it is in, in words
    // (`1m, no data yet`), carries the SDMX code on `data-obs-status`, and puts the reason, including
    // what the state needs, in the accessible name and on hover. Typed with the absence vocabulary's own
    // treatment (Absence.tsx ABSENCE_TEXT_STYLE); never a bare dash, which would be indistinguishable
    // from a real zero-change delta (spec 00 section 2).
    return (
      <span
        data-audit={auditKey}
        data-absence-state={cell.state}
        data-obs-status={cell.obsStatus}
        aria-label={`${cell.lead}: ${cell.label}. ${cell.detail}`}
        title={cell.detail}
        style={{ ...ABSENCE_TEXT_STYLE, fontSize: 9.5, letterSpacing: "0.06em", fontWeight: 700 }}
      >
        {cell.lead} · {cell.label}
      </span>
    );
  }
  return (
    <span
      data-audit={auditKey}
      title={cell.fromDate ? `vs ${cell.fromDate}` : undefined}
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--ink)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {cell.text}
    </span>
  );
}
