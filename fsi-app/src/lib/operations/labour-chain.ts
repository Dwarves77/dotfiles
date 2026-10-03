// labour-chain.ts, pure chain-math for the fully-loaded labour rate (spec 04 S5, S6 component 5).
//
// WHY THIS EXISTS. Decisions 1 and 5 of spec 04 both depend on the FULLY-LOADED rate, not the
// headline wage, and both are named in the spec as routinely wrong when someone uses the headline:
//
//   base wage (BLS OEWS / Eurostat SES) -> + employer social contributions (lc_ncost_r2 / OECD)
//     -> + leave and absence -> + turnover and recruitment -> + shift premium / productive hours
//     = EUR (or USD) per productive hour.
//
// This module computes the chain from five NAMED terms, never a single blended number. Every term
// carries its own provenance envelope (value_numeric, unit, source_key, source_ref, origin_class,
// derivation, reference_period, as_at_date) matching the envelope pattern spec 04 acceptance
// criterion 2 requires everywhere else in Operations (src/lib/regional/regional-facts-envelope.mjs,
// src/lib/operations/region-grid.mjs's isEnvelopedFact), read, not reinvented, by this module.
//
// NO LOCAL ASSUMPTION CONSTANT (CLAUDE.md rule 2, this lane's brief, spec 04 acceptance criterion 9).
// Searched for an existing Operations assumption register before writing this (lane common contract's
// prior-art rule): src/lib/assumptions/{contract.mjs,read.ts,row.mjs} backs
// `planning_assumption_register` (migration 345), a PER-TENANT, prose-bound register for a reader's
// own planning assumptions ("we assume Frankfurt-Milan stays diesel-costed..."), not a system default
// for a fixed engineering constant. `assumption_register` (migration 271) is a drafted, UNAPPLIED
// catalogue of ten existing modelling constants (scripts/gen/assumption-register-common.mjs's own
// fixture), "productive hours" is not among them, and the table carries no live rows and no runtime
// reader in src/lib today. Neither is the convention spec 04 S6 #12 means. Rather than invent a THIRD
// local constant to fill that gap, this module treats `productiveHours` as a REQUIRED CHAIN TERM,
// supplied by the caller with the same provenance envelope as every other term: when the caller has no
// sourced productive-hours figure for a region, that is an honest GAP (rendered as one), never a
// hand-typed divisor. The day a productive-hours convention is catalogued in a real register, the
// caller that assembles `LabourChainInput` reads it from there and passes it in here unchanged, this
// module's contract does not need to change.
//
// SUPPRESSION (spec 04 acceptance criterion 5: "derived cells suppress above the imputation threshold
// and show components instead", here, the threshold is ANY missing term, per this lane's brief). A
// term with no value is a named gap, never a zero and never silently dropped from the sum. The final
// per-hour figure computes ONLY when all five terms are present AND productiveHours is a positive,
// finite number; otherwise `finalValue` is null and `missingTerms` names every absent term so the
// caller can render each term's own row (present or gap) without fabricating a partial total.

/** One term's resolved value, carrying the same envelope shape region-grid.mjs's cells already carry
 *  (camelCase, matching buildRegionGrid's own fact shape), never a bare number with no provenance. */
export interface ChainTermValue {
  valueNumeric: number;
  unit: string | null;
  sourceKey: string | null;
  sourceRef: string | null;
  originClass: string | null;
  derivation: string | null;
  referencePeriod: string | null;
  asAtDate: string | null;
  /** The fact_label this value was read from, when it came off a matrix cell (extractLabourChainTerms
   *  below), for an audit trail from the chain row back to the fact it was matched from. */
  factLabel?: string | null;
}

export type ChainTermKey =
  | "baseWage"
  | "employerContributions"
  | "leaveAbsence"
  | "turnoverRecruitment"
  | "shiftPremium"
  | "productiveHours";

/** The five numerator terms, summed in this order before the productive-hours divide. */
export const NUMERATOR_TERM_ORDER: readonly ChainTermKey[] = Object.freeze([
  "baseWage",
  "employerContributions",
  "leaveAbsence",
  "turnoverRecruitment",
  "shiftPremium",
]);

/** Every chain term in render order, divisor last. */
export const CHAIN_TERM_ORDER: readonly ChainTermKey[] = Object.freeze([
  ...NUMERATOR_TERM_ORDER,
  "productiveHours",
]);

export const CHAIN_TERM_LABELS: Readonly<Record<ChainTermKey, string>> = Object.freeze({
  baseWage: "Base wage",
  employerContributions: "Employer social contributions",
  leaveAbsence: "Leave and absence",
  turnoverRecruitment: "Turnover and recruitment",
  shiftPremium: "Shift premium",
  productiveHours: "Productive hours",
});

export interface LabourChainInput {
  baseWage?: ChainTermValue | null;
  employerContributions?: ChainTermValue | null;
  leaveAbsence?: ChainTermValue | null;
  turnoverRecruitment?: ChainTermValue | null;
  shiftPremium?: ChainTermValue | null;
  productiveHours?: ChainTermValue | null;
}

export interface ChainTermResult {
  key: ChainTermKey;
  label: string;
  present: boolean;
  value: ChainTermValue | null;
  /** Cumulative sum of the numerator terms through and including this term, in NUMERATOR_TERM_ORDER.
   *  Null the moment this term or any earlier numerator term is missing (never a partial total papered
   *  over a gap). Null for `productiveHours` itself, it is a divisor, never summed. */
  runningSubtotal: number | null;
}

export interface LabourChainResult {
  terms: ChainTermResult[];
  missingTerms: ChainTermKey[];
  /** Sum of the five numerator terms, or null if any is missing. */
  numeratorTotal: number | null;
  /** Currency/unit the numerator is denominated in (derived from baseWage's own unit, e.g. "EUR/hour"
   *  -> "EUR"), or null when baseWage itself is missing. */
  currencyUnit: string | null;
  /** True when the chain cannot compute a final figure: any term missing, or productiveHours is not a
   *  positive finite number (a zero or negative divisor is a gap, never a divide-by-zero). */
  suppressed: boolean;
  /** numeratorTotal / productiveHours.valueNumeric, or null when suppressed. */
  finalValue: number | null;
  /** e.g. "EUR per productive hour", or null when suppressed. */
  finalUnit: string | null;
  /** Human-readable reason the chain is suppressed, naming every missing term by its label; null when
   *  not suppressed. */
  gapReason: string | null;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Strip a trailing "/hour", "/hr" (case-insensitive) off a unit to recover the bare currency, e.g.
 *  "EUR/hour" -> "EUR". Returns the unit unchanged if it carries no such suffix. */
function currencyFromHourlyUnit(unit: string | null): string | null {
  if (typeof unit !== "string" || !unit) return null;
  return unit.replace(/\/\s*(hour|hr)$/i, "").trim() || unit;
}

/**
 * Compute the fully-loaded labour chain from its five named terms. Pure, no I/O, no defaults for a
 * missing term (see this file's header on why there is no local productive-hours constant).
 */
export function computeLabourChain(input: LabourChainInput): LabourChainResult {
  const values: Record<ChainTermKey, ChainTermValue | null> = {
    baseWage: input.baseWage ?? null,
    employerContributions: input.employerContributions ?? null,
    leaveAbsence: input.leaveAbsence ?? null,
    turnoverRecruitment: input.turnoverRecruitment ?? null,
    shiftPremium: input.shiftPremium ?? null,
    productiveHours: input.productiveHours ?? null,
  };

  const missingTerms: ChainTermKey[] = [];
  const terms: ChainTermResult[] = [];
  let runningTotal = 0;
  let numeratorBroken = false;

  for (const key of NUMERATOR_TERM_ORDER) {
    const value = values[key];
    const present = value !== null && isFiniteNumber(value.valueNumeric);
    if (!present) {
      missingTerms.push(key);
      numeratorBroken = true;
    } else {
      runningTotal += value!.valueNumeric;
    }
    terms.push({
      key,
      label: CHAIN_TERM_LABELS[key],
      present,
      value: present ? value : null,
      runningSubtotal: numeratorBroken ? null : runningTotal,
    });
  }

  const productiveHours = values.productiveHours;
  // An explicit gap for the divisor: missing, non-numeric, zero or negative are all the same honest
  // state here, "no usable productive-hours figure", never a divide-by-zero and never an invented
  // default (this file's header; spec 04 acceptance criterion 3, zero imputed values in cost cells).
  const hoursUsable =
    productiveHours !== null &&
    isFiniteNumber(productiveHours.valueNumeric) &&
    productiveHours.valueNumeric > 0;
  if (!hoursUsable) missingTerms.push("productiveHours");
  terms.push({
    key: "productiveHours",
    label: CHAIN_TERM_LABELS.productiveHours,
    present: hoursUsable,
    value: hoursUsable ? productiveHours : null,
    runningSubtotal: null,
  });

  const numeratorTotal = numeratorBroken ? null : runningTotal;
  const currencyUnit = values.baseWage ? currencyFromHourlyUnit(values.baseWage.unit) : null;
  const suppressed = numeratorBroken || !hoursUsable;
  const finalValue = suppressed ? null : (numeratorTotal as number) / productiveHours!.valueNumeric;
  const finalUnit = suppressed || !currencyUnit ? null : `${currencyUnit} per productive hour`;
  const gapReason = suppressed
    ? `missing: ${missingTerms.map((k) => CHAIN_TERM_LABELS[k]).join(", ")}`
    : null;

  return {
    terms,
    missingTerms,
    numeratorTotal,
    currencyUnit,
    suppressed,
    finalValue,
    finalUnit,
    gapReason,
  };
}

/** A fact-like record shaped like region-grid.mjs's cell.facts entries (RegionDimensionMatrix.tsx's
 *  own OperationsFact mapping), the live shape this module's caller already has on hand from the
 *  matrix's selected cell. Matching is by `factLabel` substring, case-insensitive, deliberately
 *  generic (CLAUDE.md rule 19: no one producer's literal label is hard-coded as THE label). */
export interface LabourFactLike {
  factLabel?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  sourceKey?: string | null;
  sourceRef?: string | null;
  originClass?: string | null;
  derivation?: string | null;
  referencePeriod?: string | null;
  asAtDate?: string | null;
}

/** One matcher per chain term: the first fact in the list whose factLabel matches wins (facts list is
 *  caller-ordered; a caller that wants a specific match first should pass its own filtered/sorted
 *  list). Deliberately broad regexes, extended as new producers land real labels for these terms , 
 *  today only base-wage facts exist live (bls-oews, eurostat-lc-lci-lev producers), so every other
 *  matcher is exercised by fixtures only until a producer for it lands (named in this lane's report). */
const TERM_MATCHERS: Readonly<Record<ChainTermKey, RegExp>> = Object.freeze({
  baseWage: /\b(wage|salary|earnings)\b/i,
  employerContributions: /\b(employer|non-?wage|social contribution|social security)\b/i,
  leaveAbsence: /\b(leave|absence|sick|holiday)\b/i,
  turnoverRecruitment: /\b(turnover|recruitment|hiring)\b/i,
  shiftPremium: /\bshift premium\b/i,
  productiveHours: /\bproductive hours?\b/i,
});

function toChainTermValue(f: LabourFactLike): ChainTermValue | null {
  if (!isFiniteNumber(f.valueNumeric ?? null)) return null;
  return {
    valueNumeric: f.valueNumeric as number,
    unit: f.unit ?? null,
    sourceKey: f.sourceKey ?? null,
    sourceRef: f.sourceRef ?? null,
    originClass: f.originClass ?? null,
    derivation: f.derivation ?? null,
    referencePeriod: f.referencePeriod ?? null,
    asAtDate: f.asAtDate ?? null,
    factLabel: f.factLabel ?? null,
  };
}

/**
 * Extract the five chain terms from a flat list of labour-dimension facts (a matrix cell's own
 * `facts` array, or any other source carrying the same shape). Pure, no I/O. A term with no matching
 * fact, or whose matching fact carries no `valueNumeric` (an un-enveloped legacy row), is simply
 * absent from the returned input, `computeLabourChain` renders that as the term's own named gap,
 * never a guess.
 */
export function extractLabourChainTerms(facts: readonly LabourFactLike[]): LabourChainInput {
  const input: LabourChainInput = {};
  for (const key of CHAIN_TERM_ORDER) {
    const matcher = TERM_MATCHERS[key];
    const match = (facts ?? []).find((f) => typeof f.factLabel === "string" && matcher.test(f.factLabel));
    if (match) {
      const value = toChainTermValue(match);
      if (value) input[key] = value;
    }
  }
  return input;
}
