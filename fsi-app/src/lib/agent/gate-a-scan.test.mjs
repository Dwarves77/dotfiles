// Gate-A scanner: citation-apparatus dates are EXCLUDED, obligation dates GATE.
//
// REGRESSION ORIGIN (2026-07-30): the operator's 2026-07-26 scope ruling excludes citation apparatus from
// Gate A — "provenance metadata about WHERE a fact lives, not a fact anyone acts on… already governed by
// criterion 2 (URL/citation grounding)". `deadlineTokens` implemented that for BARE YEARS (a line-level
// CITATION_LINE test) but the FULL-DATE and MONTH-YEAR branches scanned the whole text unconditionally —
// context-aware for years, context-blind for dates. Live consequence on CELEX 32026R1030 (CountEmissions EU):
// 5 of its 11 orphans were the publication dates of its own inline citations —
//   *Source: CLECAT Newsletter, 30 April 2026, https://…
//   *Source: European Parliament Recommendation A10-0062/2026, 18 March 2026, https://…
//   *Source: Commission Proposal COM(2023)0441, 11 July 2023, https://…
// The brief was held by a scanner gating its own footnotes. Minting them would have been worse: a FACT
// asserting a newsletter's publication date is a bibliography entry dressed as freight intelligence, and
// CLECAT is T4 — sub-floor for a regulation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFactualTokens } from "./gate-a-scan.mjs";

const deadlines = (s) => extractFactualTokens(s).deadlines;

test("RED: a full date on a *Source: / URL citation line does NOT gate", () => {
  const brief = `*Source: CLECAT Newsletter, 30 April 2026, https://www.clecat.org/news/newsletters/legislators-formally-agree-on-count-emissions-eu`;
  assert.deepEqual(deadlines(brief), [], "a cited source's publication date is citation apparatus, not a deadline");
});

test("RED: month-year on a citation line does NOT gate", () => {
  const brief = `*Source: Commission Proposal COM(2023)0441, July 2023, https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A52023PC0441`;
  assert.deepEqual(deadlines(brief), [], "a citation's month-year is provenance metadata");
});

test("GREEN: the SAME date in body prose still gates (obligation context)", () => {
  const brief = `Operators must submit their first report by 30 April 2026.`;
  assert.ok(deadlines(brief).includes("30 April 2026"), "an obligation deadline in prose must still gate");
});

test("GREEN: a full date in plain body prose with no citation markers gates", () => {
  const brief = `The regulation enters into force on 18 March 2026 across all Member States.`;
  assert.ok(deadlines(brief).includes("18 March 2026"));
});

test("obligation context on a citation-marked line still gates (never blanket-drop the class)", () => {
  // The year branch already honours this: OBLIGATION_NEAR overrides the citation exclusion. Dates must match,
  // so a real deadline that happens to share a line with a URL is not silently dropped.
  const brief = `Compliance applies from 1 January 2028, see https://example.europa.eu/guidance`;
  assert.ok(deadlines(brief).includes("1 January 2028"), "an obligation date must gate even beside a URL");
});

test("bare-year behaviour is UNCHANGED: citation year excluded, obligation year gates", () => {
  assert.deepEqual(deadlines(`*Source: OJ L 234, 22.9.2023, p. 1`), [], "citation year stays excluded");
  assert.ok(deadlines(`The obligation applies from 2027 onwards.`).includes("2027"), "obligation year still gates");
});

test("ISO dates follow the same rule", () => {
  assert.deepEqual(deadlines(`*Source: EEA dataset, 2026-04-30, https://eea.europa.eu/data`), []);
  assert.ok(deadlines(`Reporting closes on 2026-04-30 for all operators.`).includes("2026-04-30"));
});

test("figures are untouched by this change", () => {
  const { figures } = extractFactualTokens(`*Source: ICCT briefing, 30 April 2026, https://theicct.org — the cap is 45 %`);
  assert.ok(figures.some((f) => f.replace(/\s+/g, "") === "45%"), "figure extraction is unaffected by the date fix");
});
