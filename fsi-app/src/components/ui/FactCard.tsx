"use client";

/**
 * FactCard v2 (lane w10-factcard, 2026-09-20; artboard 21c, parts-brief-2026-09-18.md section 2.1).
 * Replaces the v1 three-variant card (sourced/inference/counsel) entirely - the v1 variant prop is
 * REMOVED, not kept beside v2, per the parts brief's "every call site moves in this lane" rule. This
 * is now the ONE render for `FactCardModel` (src/lib/detail/fact-card-model.ts).
 *
 * Three zones, per 2.1:
 *   a. KIND BAND across the top: kind word 10.5px/800/.12em uppercase + qualifier 10.5px muted,
 *      padding 6px 14px, on a tint, 1px rgba(0,0,0,.06) rule below.
 *   b. BODY ROW, grid 132px 1fr 150px, gap 14, padding 12px 14px: figure lead (Anton 22, edge
 *      colour, 10px uppercase sub-label) - claim (13px/1.6, max 66ch, figures/dates bold) -
 *      provenance column (1px left rule: tier square, source, org, link with a NE arrow, accessed
 *      date, 10.5px muted).
 *   c. LEFT EDGE 3px.
 *
 * Kind sets the FORM (told apart by shape, not just colour, continuing the v1 ruling this file's
 * prior revision established):
 *   orange family  (ACTION REQUIRED, LEGAL CONFIRMATION REQUIRED)   edge/kind word var(--action), band var(--action-tint)
 *   ink family     (DEADLINE, BASELINE TARGET, NATIONAL TARGET, SCOPE, PENALTY, DEFINITION)
 *                                                                    edge/kind word var(--ink), band var(--tag)
 *   inference      (ANALYTICAL INFERENCE)  1px dashed var(--card-hover-line) all round, band
 *                                          var(--page), italic var(--ink-2) body, no figure lead,
 *                                          right column reads "not citable".
 *
 * Below 768px the card stacks: band, then lead, claim, provenance as a footer line (mobile,
 * artboard 20c) - see the `@media` rule in globals via the `factCardStack` class below.
 */

import type { FactCardModel, ClaimNode } from "@/lib/detail/fact-card-model";
import { hostFromUrl } from "@/lib/entities/host-from-url.mjs";
import {
  factHeadline,
  indexAgainstBase,
  sourceUrlFromNote,
  sourceNameFromNote,
  originClassLabel,
  derivationLabel,
} from "@/lib/operations/region-grid.mjs";

export type { FactCardModel, ClaimNode };

const ORANGE_KINDS = new Set(["ACTION REQUIRED", "LEGAL CONFIRMATION REQUIRED"]);
const INFERENCE_KIND = "ANALYTICAL INFERENCE";

/** Amendment 1 section C (coordinator, 2026-09-20): two audits could not tell which component
 *  rendered a node because no class or attribute survived to the DOM. `data-part` is the
 *  cross-part convention every later part lane repeats (recorded as "Owed" in this lane's
 *  session-log entry); `data-kind` is this part's own kind slug, e.g. "action-required". */
function kindSlug(kind: string): string {
  return kind.toLowerCase().replace(/\s+/g, "-");
}

function formFor(kind: string): "orange" | "ink" | "inference" {
  if (kind === INFERENCE_KIND) return "inference";
  if (ORANGE_KINDS.has(kind)) return "orange";
  return "ink";
}

const KIND_BAND: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "6px 14px",
  borderBottom: "1px solid var(--line-3)",
};

const KIND_WORD: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  margin: 0,
};

const QUALIFIER: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  color: "var(--ink-3)",
  margin: 0,
};

/** Operator review 2026-09-21 (panel 21c), defect 1c: "the grid is 1fr 150px - the 132px
 *  column does not exist" when there is no figure lead. `withLead` selects between the two
 *  grid templates; the card never keeps a blank 132px column for a kind that has no lead. */
function bodyRow(withLead: boolean): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: withLead ? "132px 1fr 150px" : "1fr 150px",
    gap: 14,
    padding: "12px 14px",
  };
}

const FIGURE_SUB_LABEL: React.CSSProperties = {
  fontSize: "var(--fs-10)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: "4px 0 0",
  // Defect 4: "the sub-label is wrapping to two lines in 132px... The sub-label is 10px
  // uppercase, nowrap, ellipsised if it must be." A deliberate slash pair ("RECOVERY /
  // RECYCLING") is short enough to fit and renders whole; nowrap+ellipsis is the one rule that
  // handles both that case and the wrapping "BEFORE NEXT SHIPMENT" case without a special-cased
  // break-at-slash rule.
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const CLAIM_TEXT: React.CSSProperties = {
  fontSize: "var(--fs-13)",
  lineHeight: 1.6,
  maxWidth: "66ch",
  margin: 0,
  overflowWrap: "anywhere",
  color: "var(--ink)",
};

/** Operator review 2026-09-21, defect 1b: "Spec: 10.5px / 1.45, gap 2px, T-square inline with
 *  the source name, four lines max. Column 150px, left rule 1px, no padding-top." Width comes
 *  from the grid template (150px, see `bodyRow` above); this is the column's own box - gap 2
 *  (was 4), no padding-top (only paddingLeft), and a 4-line-max clamp on the whole column so an
 *  unusually long source/org/link run never blows the card past its height budget. */
const PROVENANCE_COL: React.CSSProperties = {
  borderLeft: "1px solid var(--line-1)",
  paddingLeft: 14,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
  maxHeight: "calc(1.45em * 4)",
  overflow: "hidden",
};

const PROVENANCE_TEXT: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  lineHeight: 1.45,
  color: "var(--ink-3)",
  margin: 0,
  overflowWrap: "anywhere",
};

function renderClaim(nodes: ClaimNode[]) {
  return nodes.map((n, i) => {
    // Lane w10-factcard-c (2026-09-21) defect 2: a bare url left embedded in a claim's body (a
    // second, non-provenance url, see fact-card-model.ts's `splitEmbeddedLinks`) renders as a
    // real anchor, host as its visible text (the same F30 treatment the provenance column's own
    // link already uses), never as bare text in a `<span>`.
    if (n.href) {
      return (
        <a
          key={i}
          href={n.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "var(--link-line)" }}
        >
          {n.text}
        </a>
      );
    }
    return n.bold ? <strong key={i}>{n.text}</strong> : <span key={i}>{n.text}</span>;
  });
}

function TierSquare({ tier }: { tier: number }) {
  return (
    <span
      title={`Tier ${tier} - provenance, never urgency`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--fs-10)",
        fontWeight: 800,
        width: 20,
        height: 18,
        border: "1px solid var(--line-1)",
        borderRadius: 3,
        color: "var(--ink-2)",
      }}
    >
      T{Math.max(1, Math.min(7, Math.round(tier)))}
    </span>
  );
}

/** Operator review 2026-09-21, defect 1b: "tier square inline with the source name" - the tier
 *  square was rendering as its own block above `p.source` (stacked, not inline). Takes a raw
 *  `provenance` (not the whole model) so the same block renders both a card's primary
 *  provenance and each stacked `additionalClaims[].provenance` (build item 2). */
function ProvenanceBlock({ provenance: p, inference }: { provenance?: FactCardModel["provenance"]; inference?: boolean }) {
  if (inference) {
    return <p style={{ ...PROVENANCE_TEXT, fontStyle: "italic" }}>not citable</p>;
  }
  if (!p || (!p.source && !p.org && !p.href && !p.accessed && p.tier == null)) return null;
  return (
    <>
      {(typeof p.tier === "number" || p.source) && (
        <p style={{ ...PROVENANCE_TEXT, display: "flex", alignItems: "center", gap: 6 }}>
          {typeof p.tier === "number" && <TierSquare tier={p.tier} />}
          {p.source && <span>{p.source}</span>}
        </p>
      )}
      {p.org && <p style={PROVENANCE_TEXT}>{p.org}</p>}
      {p.href && (
        // Panel 21c acceptance regression (lane w10-factcard-d, 2026-09-21, rendering-guard run
        // 35663598703): this row previously carried a forced 24px min-height, a leftover from before this
        // lane's own defect-1b fix (present unchanged across the v1->v2 rewrite; git-blame shows
        // no revision ever set it deliberately for THIS row's own layout). Every failing card in
        // the operator's acceptance run (panel-21c@1440, three "144px with only 1-2 claim lines"
        // violations) was exactly the set of cards whose provenance carries an href - the cards
        // without one (LEGAL CONFIRMATION REQUIRED's counsel-only provenance, the inference form's
        // "not citable" line) never failed. Forcing this ONE provenance row to 24px against its
        // siblings' natural ~15px (10.5px/1.45) line height was the specific "provenance column
        // forcing a taller row via its own line-height even when the claim is short" defect the
        // operator's review named - a fixed min-height, not a spec number (the operator's own
        // spec for this column states 10.5px/1.45, gap 2px, no padding-top; it never states a
        // min-height for the link line). Removing it lets the link sit at its natural line height
        // like every other provenance row, matching the spec exactly.
        <a
          href={p.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "var(--fs-105)",
            fontWeight: 700,
            color: "var(--ink)",
            textDecoration: "underline",
            textDecorationColor: "var(--link-line)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {hostFromUrl(p.href)} <span aria-hidden="true">&#8599;</span>
        </a>
      )}
      {p.accessed && <p style={PROVENANCE_TEXT}>{p.accessed}</p>}
    </>
  );
}

// ── density="matrix" (operations panel) ─────────────────────────────────────────────────
//
// Amendment 1 section B.1 (coordinator, 2026-09-20): the operations matrix panel's fact card is a
// declared `density="matrix"` variant of this ONE part (lead Anton 18, claim 12.5px, source line),
// not a second component - "Delete MatrixFactCard; correct its header comment to cite the newer
// ruling." This is that migration: the anatomy formerly exported as
// `RegionDimensionMatrix.tsx`'s standalone `MatrixFactCard` function now lives here, reached only
// through `<FactCard density="matrix" fact={...} baseFact={...} />`. The region/dimension fact rows
// this branch renders are raw `region-grid.mjs` envelope facts, not classified fact paragraphs, so
// they carry no kind word from the fixed nine-value vocabulary and this branch draws no kind band -
// exactly what artboard 08 shows: a headline figure inline with its claim, then a source line, no
// band above it. Every other visual token (card shape, edge, radius, sizes) is the same "matrix"
// sizing (18px figure, 12.5px claim/detail, 10.5px source) the artboard specifies for this
// density, unchanged from the pre-migration behaviour.

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

/**
 * THE MATRIX FACT CARD. One anatomy for both data shapes, because `factHeadline` (region-grid.mjs) is
 * the one place that decides which slot a fact's data goes into: an enveloped row (migration 267's
 * value_numeric + unit) yields a formatted figure, a free-text row yields its `value` as the figure
 * when it is short and numeric, and a sentence yields no figure at all and is set as prose. Nothing
 * is derived out of the prose and no sentence is ever promoted into the display face.
 *
 * SHAPE. The artboard draws a headline figure in the display face INLINE with its description on
 * one line, then a source line below carrying an underlined link, a date, and a provenance word.
 * The card's box is the system sheet's sourced fact card: white, 2px solid ink LEFT edge, 1px
 * `--line-1` the other three sides, radius 0 8px 8px 0.
 */
function MatrixFactCardBody({ fact: f, baseFact }: { fact: Record<string, unknown>; baseFact: Record<string, unknown> | null }) {
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
      data-part="fact-card"
      data-kind="matrix"
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
          the component wrote. */}
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
            style={{
              fontSize: "var(--fs-125)",
              color: "var(--ink)",
              lineHeight: 1.45,
              overflowWrap: "anywhere",
              minWidth: 0,
              // 72ch is the PROSE's measure, not the column's (operator, 2026-09-09). The claim is
              // prose, so it carries the same cap as the detail sentence below it. The cell around
              // it keeps its full width; only the line length is bounded.
              maxWidth: "72ch",
            }}
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
          gets no empty box where one would be. Its LINE LENGTH is capped at 72ch; the cell and the
          panel column around it keep their full measured width. */}
      {prose && (
        <p
          data-audit="ops-fact-detail"
          style={{
            fontSize: "var(--fs-125)",
            lineHeight: 1.5,
            color: "var(--ink)",
            margin: "6px 0 0",
            overflowWrap: "anywhere",
            maxWidth: "72ch",
          }}
        >
          {prose}
        </p>
      )}
      {/* SOURCE LINE, 10.5px muted, in the shape the operator states and the artboard draws:
          "Vervo Logistics · 2024-08 · row written 2026-05-28" / "Indeed HK · 2025-09 · row written
          2026-05-28" / "MOM Occupational Wage Survey · 2025 · official". Three elements: the source
          name, the period the figure is FOR, and then the row's provenance word when it carries one
          or the date the row was written when it does not. */}
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

type FactCardProps =
  | { density?: undefined; model: FactCardModel }
  | { density: "matrix"; fact: Record<string, unknown>; baseFact: Record<string, unknown> | null };

export function FactCard(props: FactCardProps) {
  if (props.density === "matrix") {
    return <MatrixFactCardBody fact={props.fact} baseFact={props.baseFact} />;
  }
  const { model } = props;
  const form = formFor(model.kind);

  const cardShape: React.CSSProperties =
    form === "inference"
      ? {
          background: "var(--page)",
          border: "1px dashed var(--card-hover-line)",
          borderRadius: "var(--radius-control)",
          overflow: "hidden",
          margin: "0 0 10px",
        }
      : {
          background: form === "orange" ? "var(--action-tint)" : "var(--card)",
          border: "1px solid var(--line-1)",
          borderLeft: `3px solid ${form === "orange" ? "var(--action)" : "var(--ink)"}`,
          borderRadius: "0 8px 8px 0",
          overflow: "hidden",
          margin: "0 0 10px",
        };

  const kindWordColor = form === "orange" ? "var(--action)" : form === "inference" ? "var(--ink-3)" : "var(--ink)";
  const bandTint = form === "orange" ? "var(--action-tint)" : form === "inference" ? "var(--page)" : "var(--tag)";

  return (
    <div
      className="fact-card-v2"
      data-part="fact-card"
      data-kind={kindSlug(model.kind)}
      data-fact-card-kind={model.kind}
      style={cardShape}
    >
      {/* Mobile 390 (artboard 20c), below --bp-mobile (768, theme.css's documented breakpoint,
          literal here per every other shared part's own media query): the body grid collapses
          to one column and re-orders to band -> lead -> claim -> provenance-as-footer-line,
          per the parts brief's "no new components... every part is the desktop part at a
          smaller measure" rule. */}
      <style>{`
        @media (max-width: 767px) {
          .fact-card-v2-body {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .fact-card-v2-provenance {
            border-left: none !important;
            border-top: 1px solid var(--line-1);
            padding-left: 0 !important;
            padding-top: 8px;
            flex-direction: row !important;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px !important;
          }
        }
      `}</style>
      <div style={{ ...KIND_BAND, background: bandTint }}>
        {/* Amendment 2 (lane w10-factcard, 2026-09-20; rendering-guard CI failure): the kind word IS
            one of the operator's nine fixed FACT_CARD_KINDS values, including the literal "DEADLINE"
            - a real section 8 vocabulary word for this band, not an unfilled slot label. The rendering
            guard's placeholder-literal scanner (source-entry-filter.mjs's HEADER_LITERALS) has
            "deadline" listed for a DIFFERENT reason (a section 8 obligations-table HEADER, an older defect
            class) and cannot structurally distinguish the two. `data-part-slot="kind-word"` is the
            narrow, attacked exemption harness.mjs's measureGuard checks for - only text inside this
            attribute, inside a `data-part="fact-card"` ancestor, AND equal to one of FACT_CARD_KINDS,
            is exempt; the bare word anywhere else still fails (see harness.test.mjs). */}
        <p data-guard-title data-part-slot="kind-word" style={{ ...KIND_WORD, color: kindWordColor }}>{model.kind}</p>
        {model.qualifier && <p style={QUALIFIER}>{model.qualifier}</p>}
      </div>
      {/* Defect 1c: no figure lead -> no lead column at all (bodyRow(false) drops the 132px
          track); a lead-less kind never keeps a blank column. */}
      <div className="fact-card-v2-body" style={bodyRow(!!model.figureLead)}>
        {model.figureLead && (
          <div className="fact-card-v2-lead">
            <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-22)", color: form === "orange" ? "var(--action)" : "var(--ink)", margin: 0, lineHeight: 1.1 }}>
              {model.figureLead}
            </p>
            {model.figureSubLabel && <p style={FIGURE_SUB_LABEL}>{model.figureSubLabel}</p>}
          </div>
        )}
        <div className="fact-card-v2-claim-col" style={{ minWidth: 0 }}>
          <p className="fact-card-v2-claim" style={{ ...CLAIM_TEXT, fontStyle: form === "inference" ? "italic" : "normal", color: form === "inference" ? "var(--ink-2)" : "var(--ink)" }}>
            {renderClaim(model.claim)}
          </p>
          {/* Merge rule (build item 2, fact-card-model.ts's mergeAdjacentSameKind): each
              additional claim from the merged run is its own paragraph, stacked below the
              primary claim within the same card. */}
          {model.additionalClaims?.map((c, i) => (
            <p
              key={i}
              className="fact-card-v2-claim"
              style={{
                ...CLAIM_TEXT,
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid var(--line-3)",
                fontStyle: form === "inference" ? "italic" : "normal",
                color: form === "inference" ? "var(--ink-2)" : "var(--ink)",
              }}
            >
              {renderClaim(c.claim)}
            </p>
          ))}
        </div>
        <div className="fact-card-v2-provenance" style={PROVENANCE_COL}>
          <ProvenanceBlock provenance={model.provenance} inference={form === "inference"} />
          {/* Each stacked claim keeps its own provenance line (build item 2's test contract),
              separated so the reader can tell which provenance belongs to which claim. */}
          {model.additionalClaims?.map((c, i) => (
            <div key={i} style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--line-3)" }}>
              <ProvenanceBlock provenance={c.provenance} inference={form === "inference"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
