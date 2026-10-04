"use client";

/**
 * LabourChain, the fully-loaded labour chain (spec 04 S5, S6 component 5), wired into
 * RegionDimensionMatrix.tsx as a drill-down panel addition for the labour-dimension cell, not a new
 * page and not a new top-level route (this lane's brief).
 *
 * WHY A CHAIN, NOT A NUMBER. Decisions 1 and 5 of spec 04 both hinge on the fully-loaded rate, and
 * both are named in the spec as routinely wrong when someone uses the headline wage instead. This
 * component renders every term the chain is built from, in order, with a running subtotal, so a
 * reader sees WHERE the final figure comes from rather than trusting an opaque total:
 *
 *   base wage -> + employer social contributions -> + leave and absence -> + turnover and
 *   recruitment -> + shift premium / productive hours = EUR (or USD) per productive hour.
 *
 * ALL CHAIN MATH LIVES IN labour-chain.ts (computeLabourChain, extractLabourChainTerms). This file
 * is render-only: it reads the matrix cell's own `facts` array (the same OperationsFact shape
 * RegionDimensionMatrix.tsx already assembles server-side, region-grid.mjs's camelCase cell facts),
 * extracts the five chain terms by label, and renders what the pure module returns. No chain-math
 * decision is made in JSX.
 *
 * NO FABRICATED TERM (CLAUDE.md rule 2, spec 04 acceptance criterion 3: zero imputed values in cost
 * cells). A term with no matching fact renders its own named gap via `Absence`; the final figure
 * renders only when every term is present and productive hours is a usable positive number
 * (labour-chain.ts's `suppressed`), per acceptance criterion 5 ("derived cells suppress above the
 * imputation threshold and show components instead"), this component shows every term's row
 * regardless of whether the total can compute, which IS "show components instead".
 *
 * REUSED, NOT REINVENTED: `Absence` (the one absence vocabulary/treatment, ui/Absence.tsx) for every
 * gap; `SectionHeading` (ui/SectionHeading.tsx) for the Anton title, which is what carries
 * `data-guard-title` for this row component without a second declaration. Read AND NOT reused:
 * `EstimatedFigure`, which carries synthetic `Value`/range-admissibility machinery for a modelled figure;
 * this component is a read-only render of SERVER-SUPPLIED facts with no reader input and no
 * uncertainty band of its own (the facts it reads already carry whatever uncertainty their own
 * producer/envelope states), so building a synthetic `Value` for it would be modelling uncertainty
 * this component has no basis to assert. The provenance LINE convention (source + reference period
 * next to a figure) is the one thing carried over, drawn directly rather than through FactCard (whose
 * anatomy is a three-zone card with a kind band this drill-down panel, already inside the matrix's
 * own panel card, does not need a second card shell for).
 */

import { Absence } from "@/components/ui/Absence";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  computeLabourChain,
  extractLabourChainTerms,
  type ChainTermResult,
  type LabourFactLike,
} from "@/lib/operations/labour-chain.ts";

export interface LabourChainProps {
  /** The selected matrix cell's own facts (region-grid.mjs camelCase shape). Deliberately the SAME
   *  array RegionDimensionMatrix.tsx's MatrixPanel already has on hand for the labour dimension's
   *  selected cell, no second fetch, no second shape. */
  facts: readonly LabourFactLike[];
  /** The region label, for the panel's own small-caps context line. */
  regionLabel: string;
}

function roundDisplay(n: number): string {
  // Display precision only (never re-used for the math, which stays full-precision in
  // labour-chain.ts). Four significant figures is enough to distinguish per-hour rates without
  // presenting false precision on a sum of five independently-sourced terms.
  return n.toFixed(Math.abs(n) < 10 ? 3 : 2);
}

function TermRow({ term, isLast }: { term: ChainTermResult; isLast: boolean }) {
  const isDivisor = term.key === "productiveHours";
  const operator = term.key === "baseWage" ? "" : isDivisor ? "÷" : "+";
  return (
    <div
      data-audit="labour-chain-term"
      data-chain-term={term.key}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: isLast ? "none" : "1px solid var(--line-3)",
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        {operator && (
          <span aria-hidden="true" style={{ color: "var(--ink-3)", fontWeight: 700, fontSize: "var(--fs-115)" }}>
            {operator}
          </span>
        )}
        <span style={{ fontSize: "var(--fs-125)", color: "var(--ink)", fontWeight: 600 }}>{term.label}</span>
      </span>
      {term.present && term.value ? (
        <span style={{ textAlign: "right", flexShrink: 0 }}>
          <span
            data-guard-display="labour-chain-term-value"
            style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink)" }}
          >
            {roundDisplay(term.value.valueNumeric)}
          </span>{" "}
          <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>{term.value.unit ?? ""}</span>
          {/* Provenance line (spec 04 S6 #4): source and reference period on every cell's own term,
              same two facts the matrix's own fact cards stamp, drawn directly rather than through a
              second card shell. */}
          <div style={{ fontSize: "var(--fs-10)", color: "var(--ink-3)", marginTop: 2 }}>
            {term.value.sourceKey ?? "unnamed source"}
            {term.value.referencePeriod ? ` · ${term.value.referencePeriod}` : ""}
          </div>
        </span>
      ) : (
        <span style={{ flexShrink: 0 }}>
          <Absence reason="not in primary source" />
        </span>
      )}
    </div>
  );
}

export function LabourChain({ facts, regionLabel }: LabourChainProps) {
  const input = extractLabourChainTerms(facts);
  const result = computeLabourChain(input);

  return (
    <div data-audit="labour-chain" style={{ marginTop: 4 }}>
      <SectionHeading
        title="Fully-loaded labour rate"
        aside={`${regionLabel} · ${result.suppressed ? "chain incomplete" : "chain complete"}`}
      />
      <div style={{ padding: "0 2px" }}>
        {result.terms.map((term, i) => (
          <TermRow key={term.key} term={term} isLast={i === result.terms.length - 1} />
        ))}

        {/* The final figure, or the honest suppression state in its place (acceptance criterion 5:
            show the components, never a partial or fabricated total). */}
        <div
          data-audit="labour-chain-final"
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 0 2px",
            marginTop: 4,
            borderTop: "1px solid var(--line-1)",
          }}
        >
          <span style={{ fontSize: "var(--fs-125)", color: "var(--ink)", fontWeight: 700 }}>
            = Fully-loaded rate
          </span>
          {result.suppressed ? (
            // No maxWidth here (measured regression, lane L13, 2026-10-03): a 60% cap on this span
            // inside the matrix panel's own fixture measured at 517.19px, under the operator's 560px
            // floor ("no text column in the card is narrower than 560px",
            // ops-matrix-acceptance-smoke.mjs leg B). The gap reason can list up to five term names;
            // it gets the row's full available width rather than a fraction of it.
            <span style={{ textAlign: "right" }}>
              <Absence reason="not in primary source" />
              <div style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", marginTop: 2 }}>
                {/* Named gap (never silent): which of the five terms this cell is missing. */}
                {result.gapReason}
              </div>
            </span>
          ) : (
            <span
              data-guard-display="labour-chain-final-value"
              style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}
            >
              {roundDisplay(result.finalValue as number)}{" "}
              <span style={{ fontSize: "var(--fs-115)", color: "var(--ink-3)" }}>{result.finalUnit}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
