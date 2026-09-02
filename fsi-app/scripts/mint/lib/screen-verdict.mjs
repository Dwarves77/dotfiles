// screen-verdict.mjs — ONE census row's relevance verdict, the way the operator's 2026-08-31 ruling defined it.
//
// WHY THIS EXISTS (2026-09-02, population runs #9–#11). The build of 2026-08-31 ran the $0 relevance
// screen (screen-rules.mjs + screen-worklist.mjs) over all 3,661 `would_mint` census rows and the operator
// ruled the split: 1,729 mint / 1,676 off-vertical / 256 need-fetch (Addendum 71). The verdicts were
// recorded in `scripts/mint/reviewed-verdicts.json` and in the rules, but NEVER stamped onto
// census_worklist — and the population exporter (export-census-rows.mjs) selected on
// `dryrun_disposition = 'would_mint'` alone. Three apply runs minted ~130 record-grade items from the
// unscreened pool; screened afterwards, about half were off-vertical by the operator's own ruling
// (Coast Guard safety zones, FAA airworthiness directives, federal pay rules, VAT derogation
// decisions, EC vehicle type-approval SIs). That is ADR-020's August incident, repeated.
//
// The screen must sit IN the runtime, at the export, and its verdict must be computed one way in every
// consumer. This helper is that one way: the rule engine first; a reviewed verdict overrides ONLY a rule
// verdict of `ambiguous` — exactly mergeReviewed()'s semantics in screen-worklist.mjs, so a reviewer's
// judgment never silently outranks a rule that fired. Pure; no I/O.
import { classifyRelevance } from "../screen-rules.mjs";

export const MINTABLE_VERDICT = "on_vertical";

/**
 * @param {{ id?: string, title?: string|null, document_url: string, surface_tags?: string[] }} row
 * @param {Record<string, {verdict: string, reason?: string, reviewer?: string}>} [reviewed]
 * @returns {{ verdict: "on_vertical"|"off_vertical"|"ambiguous", rule: string|null, basis: string, provenance: "rule"|"reviewed" }}
 */
export function screenVerdictFor(row, reviewed = {}) {
  const r = classifyRelevance({ title: row?.title ?? "", document_url: row?.document_url ?? "", surface_tags: row?.surface_tags ?? [] });
  const entry = row?.id ? reviewed?.[row.id] : null;
  if (r.verdict === "ambiguous" && entry && typeof entry === "object" && ["on_vertical", "off_vertical", "ambiguous"].includes(entry.verdict) && typeof entry.reason === "string" && entry.reason.length) {
    return { verdict: entry.verdict, rule: null, basis: entry.reason, provenance: "reviewed" };
  }
  return { verdict: r.verdict, rule: r.rule ?? null, basis: r.basis ?? "", provenance: "rule" };
}

/** True when the screen allows this row to mint. Only `on_vertical` mints; `ambiguous` waits for a ruling. */
export function isMintable(verdict) {
  return verdict === MINTABLE_VERDICT;
}
