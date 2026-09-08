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
 *   `calc((100% - 40px) / 5)`, no sparkline, no 1m or YoY row, Anton 17px value with the delta
 *   inline beside it, 86.844px card height against the artboard.
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
 *   - NO sparkline, NO 1m row, NO YoY row, NO "N more headline series below" disclosure. p4's card
 *     contains none of them (measured: zero `<svg>` in the whole card).
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
 * NEVER FABRICATE. A 1w delta that could not be computed (insufficient history, a unit or currency
 * change across the compared pair, a zero prior) renders p4's own dash-plus-small-caps absence
 * shape, never a dash indistinguishable from a real zero-change delta (spec 00 §2). p4 writes that
 * word as "BACKFILL"; the product's absence vocabulary is closed (Absence.tsx) and does not contain
 * it, so the token is the vocabulary's own "pending" in p4's type treatment.
 */

import type { MarketSeriesBoardVM } from "@/lib/supabase-server";
import { formatDelta } from "@/lib/contracts/envelope.mjs";
import { selectHeadlineSeries } from "@/lib/market/headline-series-select.mjs";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatNumber } from "@/lib/format";
import { ABSENCE_TEXT_STYLE } from "@/components/ui/Absence";

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

interface DeltaPoint { date: string; value: number | null }
interface WindowDelta {
  value?: number;
  pct?: number | null;
  fromDate?: string;
  insufficientHistory?: boolean;
  unitMismatch?: boolean;
}
interface SeriesDeltas {
  count: number;
  latest: { date: string; value: number | null; unit: string | null; currency: string | null } | null;
  sparkline: DeltaPoint[];
  delta1w: WindowDelta | null;
  delta1m: WindowDelta | null;
  deltaYoY: WindowDelta | null;
  message: string | null;
}
interface RibbonRow {
  seriesKey: string;
  label: string;
  displayValue: string;
  deltas: SeriesDeltas;
  /** The other members of this card's family, folded onto it ("+3 rates"). The ONE new field the card
   *  markup gained for the ruling: the fold has nowhere else to live, and its count comes from the
   *  family, never from a literal. count 0 renders nothing. */
  fold: { count: number; noun: string };
}

interface HeadlineCard {
  familyKey: string;
  label: string;
  row: { seriesKey: string; label: string; displayValue: string; deltas?: SeriesDeltas };
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
    deltas: card.row.deltas as SeriesDeltas,
    fold: card.fold,
  };
}

export function MarketComparativeRibbon({ board, embedded = false }: MarketComparativeRibbonProps) {
  const selection = selectHeadlineSeries(board) as HeadlineSelection;
  const shown = selection.visible.map(toRibbonRow);
  const overflow = selection.overflow.map(toRibbonRow);
  if (shown.length === 0) return null;
  // FOLD 63: one row, in the ruling's order, the first five on the visible track and the rest
  // reachable by scrolling it sideways. The cap is NOT applied again here; `visible` already carries
  // it, and it is what the head counts. Concatenating rather than rendering a second grid is the
  // whole of the overflow mechanism, which is why there is no "N more headline series" disclosure.
  const track = [...shown, ...overflow];

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
            whiteSpace: "nowrap",
          }}
        >
          {/* Ruling step 3: N is the number of distinct FAMILIES shown, not the number of cards and
              not the number of series; the denominator is every observed series. */}
          {formatNumber(selection.familiesShown)} of {formatNumber(selection.totalSeries)} · dated,
          sourced observations ·{" "}
          <a href="#market-series-board" style={{ color: "inherit", textDecoration: "underline" }}>
            Series board →
          </a>
        </span>
      </div>

      {/* p4's five-across track, continued sideways rather than wrapped. `overflow-x: auto` is the
          operator's instruction for the remainder; at 1440 with five or fewer series nothing
          scrolls and the row is pixel-identical to the artboard. */}
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
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: HEADLINE_TRACK,
          gap: 10,
          overflowX: "auto",
          padding: embedded ? "0 16px 16px" : undefined,
        }}
      >
        {track.map((row) => (
          <RibbonCard key={row.seriesKey} row={row} />
        ))}
      </div>
    </>
  );

  return embedded ? (
    <SectionCard dataAudit="headline-series">{body}</SectionCard>
  ) : (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>{body}</div>
  );
}

/** ONE card of p4's headline row. Every value below is p4's, measured: 10px 12px padding, 10px
 *  radius, a 9.5px/700/0.1em one-line ellipsised label, then a SINGLE baseline row carrying the
 *  Anton 17px value beside its 11px/700 ink 1w delta, then "as of <date>" at 10px muted, 4px down.
 *  p4 draws no sparkline, no 1m row and no YoY row, so this renders none. */
function RibbonCard({ row }: { row: RibbonRow }) {
  const d = row.deltas;
  return (
    <div
      data-audit="headline-card"
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
          value and its delta share ONE baseline. */}
      <div
        data-audit="headline-card-value-row"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px", marginTop: 6 }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 17, lineHeight: 1.05, color: "var(--ink)" }}>
          {row.displayValue}
        </span>
        <WeekDelta delta={d.delta1w} message={d.message} />
      </div>
      <p data-audit="headline-card-asof" style={{ fontSize: 10, color: "var(--ink-3)", margin: "4px 0 0" }}>
        as of {d.latest?.date ?? "—"}
      </p>
    </div>
  );
}

/**
 * p4's inline delta: `▼1.7% 1w` / `▲0.7% 1w` at 11px/700 in ink, tabular, one line.
 *
 * When the move cannot be computed, p4's own shape is an em dash followed by a small-caps reason
 * word (it draws "BACKFILL"). The product's absence vocabulary is closed and does not carry that
 * word, so the reason rendered is the vocabulary's "pending" in the same type treatment, never a
 * bare dash, which would be indistinguishable from a real zero-change move (spec 00 §2).
 */
function WeekDelta({ delta, message }: { delta: WindowDelta | null; message: string | null }) {
  const pending = (reason: string) => (
    <span
      data-audit="headline-card-delta"
      className="cl-absence"
      data-absence="narrow"
      aria-label={reason}
      title={reason}
      style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", whiteSpace: "nowrap" }}
    >
      {/* The dash is p4's own glyph in this slot, not prose: `\u2014` (U+2014), the same character
          ImpactMeter's narrow absence draws. The rendering guard's placeholder-literal scan skips
          it because this span declares `data-absence`, exactly as Absence.tsx's own narrow variant
          does, so a bare dash elsewhere in the product still fails the guard. */}
      {"\u2014 "}
      <span style={{ ...ABSENCE_TEXT_STYLE, fontSize: 9.5, letterSpacing: "0.06em" }}>pending</span>
    </span>
  );

  if (message) return pending(message);
  if (!delta) return pending("pending");
  if (delta.unitMismatch) return pending(`Unit changed since ${delta.fromDate}, comparison refused`);
  if (delta.insufficientHistory || typeof delta.value !== "number") return pending("pending");
  // Division-by-zero guard fired upstream (prior value was 0): a % move is undefined, and showing
  // one would be exactly the fabrication this module refuses elsewhere.
  if (typeof delta.pct !== "number") return pending(`vs ${delta.fromDate}: prior value was zero`);

  // p4 writes DIRECTION as a glyph and MAGNITUDE unsigned, so the sign formatDelta emits is not
  // wanted here; the arrow carries it. `kind` stays "quantity" (a percent move, never pp), it is
  // required and never defaulted, per envelope.mjs's own header.
  const arrow = delta.pct > 0 ? "▲" : delta.pct < 0 ? "▼" : "";
  const magnitude = formatDelta(Math.abs(delta.pct), "quantity")?.replace(/^[+−]/, "") ?? "";
  return (
    <span
      data-audit="headline-card-delta"
      title={`vs ${delta.fromDate}`}
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--ink)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {arrow}
      {magnitude} 1w
    </span>
  );
}
