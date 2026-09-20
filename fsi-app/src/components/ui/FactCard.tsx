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

const BODY_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "132px 1fr 150px",
  gap: 14,
  padding: "12px 14px",
};

const FIGURE_SUB_LABEL: React.CSSProperties = {
  fontSize: "var(--fs-10)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: "4px 0 0",
};

const CLAIM_TEXT: React.CSSProperties = {
  fontSize: "var(--fs-13)",
  lineHeight: 1.6,
  maxWidth: "66ch",
  margin: 0,
  overflowWrap: "anywhere",
  color: "var(--ink)",
};

const PROVENANCE_COL: React.CSSProperties = {
  borderLeft: "1px solid var(--line-1)",
  paddingLeft: 14,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const PROVENANCE_TEXT: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  color: "var(--ink-3)",
  margin: 0,
  overflowWrap: "anywhere",
};

function renderClaim(nodes: ClaimNode[]) {
  return nodes.map((n, i) =>
    n.bold ? <b key={i}>{n.text}</b> : <span key={i}>{n.text}</span>
  );
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

function ProvenanceBlock({ model }: { model: FactCardModel }) {
  if (formFor(model.kind) === "inference") {
    return <p style={{ ...PROVENANCE_TEXT, fontStyle: "italic" }}>not citable</p>;
  }
  const p = model.provenance;
  if (!p || (!p.source && !p.org && !p.href && !p.accessed && p.tier == null)) return null;
  return (
    <>
      {typeof p.tier === "number" && <TierSquare tier={p.tier} />}
      {p.source && <p style={PROVENANCE_TEXT}>{p.source}</p>}
      {p.org && <p style={PROVENANCE_TEXT}>{p.org}</p>}
      {p.href && (
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
            minHeight: 24,
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

export function FactCard({ model }: { model: FactCardModel }) {
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
      <div className="fact-card-v2-body" style={BODY_ROW}>
        <div className="fact-card-v2-lead">
          {model.figureLead && (
            <>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-22)", color: form === "orange" ? "var(--action)" : "var(--ink)", margin: 0, lineHeight: 1.1 }}>
                {model.figureLead}
              </p>
              {model.figureSubLabel && <p style={FIGURE_SUB_LABEL}>{model.figureSubLabel}</p>}
            </>
          )}
        </div>
        <p className="fact-card-v2-claim" style={{ ...CLAIM_TEXT, fontStyle: form === "inference" ? "italic" : "normal", color: form === "inference" ? "var(--ink-2)" : "var(--ink)" }}>
          {renderClaim(model.claim)}
        </p>
        <div className="fact-card-v2-provenance" style={PROVENANCE_COL}>
          <ProvenanceBlock model={model} />
        </div>
      </div>
    </div>
  );
}
