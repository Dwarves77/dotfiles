"use client";

/**
 * FactCard — the one fact card (UI system handoff 2026-09-06, README §0.4
 * + §0.5). Replaces every "FACT: … *Source: …*" paragraph the pipeline
 * writes into `intelligence_item_sections.content_md` (system-prompt.ts
 * §"Claim-level provenance": FACT / ANALYSIS / LEGAL). Three variants told
 * apart by FORM, not just colour, so a reader can tell them apart even in
 * grayscale:
 *
 *   sourced   — 2px solid #1A1A1A LEFT edge, 1px rgba(0,0,0,.12) the other
 *               three sides, radius 0 8px 8px 0, white. A verbatim quote,
 *               an operative date when known, a tier chip, and a link to
 *               the source. This is a FACT claim (system-prompt.ts §1):
 *               checkable, span-grounded, citable.
 *   inference — 1px DASHED rgba(0,0,0,.25) all round, #FAFAF8, italic
 *               body, NO link ("not citable" — README §0.4). This is an
 *               ANALYSIS claim: the pipeline's own reasoning, opened with
 *               one of "Analytical inference:" / "Industry interpretation:"
 *               / "Operational implication:" (system-prompt.ts §1).
 *   counsel   — 2px solid #F97316 LEFT edge, otherwise shaped exactly like
 *               sourced. This is a LEGAL claim: a question the pipeline
 *               explicitly declined to answer ("Legal Confirmation
 *               Required:" — the agent does not make legal determinations,
 *               system-prompt.ts §1).
 *
 * Form is what tells the three apart (operator audit item 2.4, 2026-09-07
 * ruling): the prior build gave all three the same 1px grey perimeter with
 * only colour distinguishing them, which reads identically in grayscale.
 * SOURCED_SHAPE below is the one right-rounded card shape sourced and
 * counsel share; only the left edge differs between them.
 *
 * Built once here (lane uidetails, 2026-09-06) because all four detail
 * surfaces (regulations, market, research, operations) need it and no
 * other lane owns a shared part. Parsing content_md into these three
 * kinds happens at render time in src/lib/detail/fact-paragraphs.ts — this
 * component only renders an already-classified fact; it does not parse.
 */

export type FactCardVariant = "sourced" | "inference" | "counsel";

export interface FactCardSource {
  /** Document/page title, when the citation names one. */
  title?: string | null;
  /** Issuing body / publisher, when the citation names one. */
  issuer?: string | null;
  /** The date printed in the citation (not necessarily an ISO date — the
   *  pipeline emits "[Date]" freeform per system-prompt.ts §"Markdown
   *  storage convention"). */
  date?: string | null;
  url?: string | null;
  /** Source credibility tier (T1 binding law … T6 commentary), when known.
   *  Absent (not `0`) renders no chip — never a fabricated tier. */
  tier?: number | null;
}

export interface FactCardProps {
  variant: FactCardVariant;
  /** sourced: the verbatim FACT claim text. inference: the analysis prose
   *  with its label token already stripped. counsel: the open legal
   *  question/provisional reading. */
  text: string;
  /** sourced variant only — citable provenance. */
  source?: FactCardSource | null;
  /** inference variant only — which of the three label tokens introduced
   *  this claim (shown as the card's eyebrow, humanized). */
  label?: string | null;
}

const EYEBROW: React.CSSProperties = {
  fontSize: "var(--fs-10)",
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  margin: "0 0 6px",
};

const BODY: React.CSSProperties = {
  fontSize: "var(--fs-13)",
  lineHeight: 1.6,
  margin: 0,
  maxWidth: "72ch",
  overflowWrap: "anywhere",
};

// Operator audit item 2.4 (2026-09-07, CLOSED ruling): fact cards are told apart by FORM, not a
// uniform grey perimeter. sourced = 2px solid #1A1A1A LEFT edge + 1px rgba(0,0,0,.12) the other
// three sides + radius 0 8px 8px 0 + white; counsel = 2px solid #F97316 LEFT edge, otherwise as
// sourced (a "Legal Confirmation Required" card). SOURCED_SHAPE carries everything the two share;
// only the left edge colour differs, via `borderLeft` applied after the `border` shorthand below.
const SOURCED_SHAPE: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line-1)",
  borderRadius: "0 8px 8px 0",
  padding: "12px 14px",
  margin: "0 0 10px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export function FactCard({ variant, text, source, label }: FactCardProps) {
  if (variant === "inference") {
    return (
      <div
        style={{
          background: "var(--page)",
          border: "1px dashed rgba(0,0,0,.25)",
          borderRadius: "var(--radius-control)",
          padding: "12px 14px",
          margin: "0 0 10px",
        }}
      >
        <p style={{ ...EYEBROW, color: "var(--ink-3)" }}>{label || "Analytical inference"}</p>
        <p style={{ ...BODY, color: "var(--ink-2)", fontStyle: "italic" }}>{text}</p>
      </div>
    );
  }

  if (variant === "counsel") {
    return (
      <div style={{ ...SOURCED_SHAPE, borderLeft: "2px solid var(--action)" }}>
        <p style={{ ...EYEBROW, color: "var(--action)" }}>Legal confirmation required</p>
        <p style={{ ...BODY, color: "var(--ink)" }}>{text}</p>
      </div>
    );
  }

  // sourced (FACT)
  return (
    <div style={{ ...SOURCED_SHAPE, borderLeft: "2px solid var(--ink)" }}>
      <p style={{ ...EYEBROW, color: "var(--ink-3)" }}>Fact</p>
      <p style={{ ...BODY, color: "var(--ink)" }}>&ldquo;{text}&rdquo;</p>
      {(source?.date || source?.issuer || source?.title || source?.tier != null || source?.url) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            borderTop: "1px solid var(--line-3)",
            paddingTop: 8,
          }}
        >
          <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", minWidth: 0, overflowWrap: "anywhere" }}>
            {[source?.title, source?.issuer, source?.date].filter(Boolean).join(" · ")}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {typeof source?.tier === "number" && (
              <span
                title={`Tier ${source.tier} — provenance, never urgency`}
                style={{
                  fontSize: "var(--fs-10)",
                  fontWeight: 800,
                  padding: "3px 7px",
                  borderRadius: 4,
                  border: "1px solid var(--line-1)",
                  color: "var(--ink-2)",
                }}
              >
                T{Math.max(1, Math.min(7, Math.round(source.tier)))}
              </span>
            )}
            {source?.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "var(--fs-11)",
                  fontWeight: 700,
                  color: "var(--ink)",
                  textDecoration: "underline",
                  textDecorationColor: "var(--link-line)",
                  minHeight: 24,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Open source
              </a>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
