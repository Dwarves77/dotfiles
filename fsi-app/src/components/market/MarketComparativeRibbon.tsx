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
import { ProvenanceFields, envelopeFromSeriesRow, type SeriesProducerRef } from "@/components/market/SeriesProvenance";

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

/** The trend window: one year, the ribbon's longest comparison (YoY), so the line and the YoY change cover
 *  the same span (operator ruling 2026-10-08). */
export const SPARKLINE_WINDOW_DAYS = DELTA_WINDOWS.yoy;

function isoMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Pure: the sparkline geometry for a series over its last year of observations (counted back from the
 *  series' own latest date, never the clock), sampled to at most 60 points, or null when fewer than two
 *  numeric points fall in the window (the card then renders the no-data-yet state, never an empty box). A
 *  flat series draws a level line. */
export function sparklineModel(sparkline: DeltaPoint[] | undefined, maxPoints = SPARKLINE_MAX_POINTS): SparklineModel | null {
  const numeric = (sparkline ?? []).filter((p) => typeof p?.value === "number" && Number.isFinite(p.value)) as Array<{ date: string; value: number }>;
  const last = numeric.length ? numeric[numeric.length - 1].date : null;
  const cutoff = last && /^\d{4}-\d{2}-\d{2}/.test(last) ? isoMinusDays(last, SPARKLINE_WINDOW_DAYS) : null;
  const valid = cutoff ? numeric.filter((p) => p.date >= cutoff) : numeric;
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
          <Link href="/market/series" style={{ color: "inherit", textDecoration: "underline", display: "inline-block", padding: "7px 0" }}>
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
        // The UX detector's own declaration of a scrolling strip (ux-assert.mjs, measureUx): the cards past
        // the viewport are carried by this track, not clipped.
        data-guard-strip=""
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
                <ProvenanceFields envelope={envelopeFromSeriesRow(row.source, group as SeriesProducerRef | null)} />
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
        data-guard-title
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
      {/* The trend: a plain polyline in the ink tone over the series' last year (SPARKLINE_WINDOW_DAYS), sampled
          to at most SPARKLINE_MAX_POINTS. Its window, span and observation count are stated in its
          accessible name. Fewer than two numeric points is the no-data-yet state, not an empty box. */}
      <div data-audit="headline-card-spark" style={{ marginTop: 6 }}>
        {spark ? (
          <svg
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            preserveAspectRatio="none"
            width="100%"
            height={SPARK_H}
            role="img"
            aria-label={`Trend over the last year, ${spark.total} observations, ${spark.from} to ${spark.to}`}
            style={{ display: "block", overflow: "visible" }}
          >
            <title>{`Last year: ${spark.total} observations, ${spark.from} to ${spark.to}`}</title>
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
