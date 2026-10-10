"use client";

/**
 * StatementsBlock: the Operations list's industry-level statements (lane S8-F2, 2026-10-08).
 *
 * WHAT IT IS. Under the region x dimension matrix, one sentence per (dimension, fact label) that two or
 * more regions hold a sourced figure for, with the components the sentence is made of listed beneath it.
 * It replaces the removed capacity-investment calculator (ADR-043): the surface states what wages and
 * costs are, sourced, and says nothing about what to do with them. The sentences, the eligibility rule,
 * the units rule and the verdict-word screen all live in `@/lib/operations/statements.mjs`; this file is
 * render-only and decides nothing about the data.
 *
 * REUSED, NOT REBUILT: `SectionCard` and `SectionHeading` (the card shell with its rule, and the one
 * section head, which carries the `data-guard-title` this component's F35 entry needs), `TierChip` (the
 * one bordered tier square), `Absence` (the dash for an unrated source) and `ABSENCE_TEXT_STYLE` (the
 * small-caps treatment for a sentence-shaped absence line the closed Absence vocabulary cannot say; the
 * same route RecalculationNotice and LeadTimeChart take).
 *
 * SHAPE. Desktop: rule-separated rows inside one card, no nested boxes (UX law 4, spacing before
 * borders). Phone (under 768 px): one statement per card, the component rows stacked. Components are
 * always shown, never behind a disclosure: they are what makes the sentence checkable (spec 04 section 3,
 * CLAUDE.md rule 18), and the platform rule is that nothing opens itself by default.
 *
 * WHAT IT NEVER DOES: estimate, convert units, state a verdict, or draw a figure it was not handed. A
 * provenance field a row lacks is said to be not stated; it is never filled in. With no statements the
 * block renders nothing at all.
 */

import { Absence, ABSENCE_TEXT_STYLE } from "@/components/ui/Absence";
import { TierChip } from "@/components/ui/Chips";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SourceLink } from "@/components/ui/SourceLink";
import type { buildStatements } from "@/lib/operations/statements.mjs";

type Statement = ReturnType<typeof buildStatements>[number];
type Component = Statement["components"][number];

interface StatementsBlockProps {
  statements: Statement[];
  /** Display caption per dimension db code (the Ledger's own "D3 Labor markets"). A dimension with no
   *  caption shows its code, never a guessed name. */
  dimensionNames?: Record<string, string>;
}

const NOT_STATED = "not stated";

const KICKER: React.CSSProperties = {
  fontSize: "var(--fs-10)",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: 0,
};

const SENTENCE: React.CSSProperties = {
  fontSize: "var(--fs-13)",
  lineHeight: 1.6,
  color: "var(--ink)",
  margin: "4px 0 0",
  maxWidth: "72ch",
  overflowWrap: "anywhere",
};

const META_LABEL: React.CSSProperties = {
  fontSize: "var(--fs-10)",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  marginRight: 4,
};

/** One provenance field: a small-caps label, then its value or the plain words "not stated". */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>
      <span style={META_LABEL}>{label}</span>
      {children ?? <span style={{ color: "var(--ink-3)" }}>{NOT_STATED}</span>}
    </span>
  );
}

function ComponentRow({ c }: { c: Component }) {
  const status = [c.statusFlag, c.originClass].filter(Boolean).join(" · ");
  return (
    <li
      data-audit="ops-statement-component"
      data-region={c.regionCode}
      style={{ listStyle: "none", padding: "8px 0", borderTop: "1px solid var(--line-3)", minWidth: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", minWidth: 0 }}>
        <span data-part-slot="tier" style={{ display: "inline-flex", minWidth: 20 }}>
          {c.sourceTier !== null ? <TierChip tier={c.sourceTier} /> : <Absence reason="not in primary source" variant="dash" />}
        </span>
        <span style={{ fontSize: "var(--fs-125)", fontWeight: 700, color: "var(--ink)", overflowWrap: "anywhere" }}>{c.regionLabel}</span>
        <span style={{ fontSize: "var(--fs-125)", color: "var(--ink)", overflowWrap: "anywhere" }}>{c.valueText}</span>
        {c.index !== null && (
          <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>index {c.index}</span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "2px 14px",
          marginTop: 4,
          fontSize: "var(--fs-105)",
          color: "var(--ink-3)",
          minWidth: 0,
        }}
      >
        <Field label="Published by">
          {c.sourceName
            ? c.sourceUrl
              ? (
                <SourceLink href={c.sourceUrl}>{c.sourceName}</SourceLink>
              )
              : c.sourceName
            : null}
        </Field>
        <Field label="Dataset">{c.datasetRef}</Field>
        <Field label="Period">{c.referencePeriod}</Field>
        <Field label="Status flag">{status || null}</Field>
        <Field label="As at">{c.asAtDate}</Field>
      </div>
    </li>
  );
}

export function StatementsBlock({ statements, dimensionNames = {} }: StatementsBlockProps) {
  if (statements.length === 0) return null;
  return (
    <SectionCard as="section" dataAudit="ops-statements" aria-label="Statements">
      <style>{`
        @media (max-width: 767px) {
          .cl-ops-statement {
            border: 1px solid var(--line-1) !important;
            border-radius: var(--radius-control);
            margin: 0 12px 10px !important;
            padding: 12px !important;
          }
        }
      `}</style>
      <SectionHeading title="Statements" />
      <p
        style={{
          fontSize: "var(--fs-125)",
          color: "var(--ink-2)",
          margin: 0,
          padding: "0 16px 10px",
          maxWidth: "72ch",
        }}
      >
        What the held figures say across regions. Components shown; nothing estimated.
      </p>
      <ol style={{ margin: 0, padding: 0 }}>
        {statements.map((s) => (
          <li
            key={`${s.dimension}|${s.factLabel}`}
            className="cl-ops-statement"
            data-audit="ops-statement"
            data-dimension={s.dimension}
            style={{ listStyle: "none", padding: "12px 16px", borderTop: "1px solid var(--line-2)", minWidth: 0 }}
          >
            <p style={KICKER}>{dimensionNames[s.dimension] ?? s.dimension}</p>
            {s.sentence !== null ? (
              <p data-audit="ops-statement-sentence" style={SENTENCE}>
                {s.sentence}
              </p>
            ) : (
              <>
                <p data-audit="ops-statement-label" style={{ ...SENTENCE, fontWeight: 600 }}>
                  {s.factLabel}
                </p>
                <p data-audit="ops-statement-absence" style={{ margin: "4px 0 0" }}>
                  <span data-absence="needs" data-part="absence" style={ABSENCE_TEXT_STYLE}>
                    {s.absence}
                  </span>
                </p>
              </>
            )}
            <ul style={{ margin: "8px 0 0", padding: 0 }}>
              {s.components.map((c) => (
                <ComponentRow key={c.regionCode} c={c} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
