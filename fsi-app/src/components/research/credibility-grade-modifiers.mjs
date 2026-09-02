// credibility-grade-modifiers.mjs — the GRADE modifier ledger's pure logic (docs/specs/03-research.md
// §4 "Credibility: two scores, never merged"). Lane DASH, 2026-09-02. PLAIN ESM, ZERO DEPENDENCIES.
//
// Lives in a separate .mjs sibling, not inside CredibilityChipShared.tsx itself, because that file
// also defines a JSX component (GradeModifierLedger) — a .tsx file containing JSX cannot be imported
// by a portable `node --test` run (Node's built-in TS type-stripping covers plain .ts, not JSX in
// .tsx; confirmed empirically against this repo's jiti helper too, which chokes on this file's mixed
// TS-type + JSX content). Splitting the pure logic out mirrors the established pattern in this exact
// directory's sibling (research reuses the pattern src/components/dashboard/pulse-shared.mjs already
// established for the same reason) and in src/lib/surface-of.mjs. CredibilityChipShared.tsx imports
// buildGradeModifiers from here and adds only the JSX rendering + style-object helpers around it.
//
// DELIBERATELY NOT named CredibilityChipShared.mjs (which this file was originally called): webpack's
// extension-less resolver for `import { x } from "./CredibilityChipShared"` (used by
// CredibilityChipEvidence.tsx / CredibilityChipAuthority.tsx) picked THIS .mjs file over the sibling
// .tsx of the same basename, silently shadowing every export the .tsx file defines
// (chipButtonStyle/chipPanelStyle/GradeModifierLedger all "not exported", caught by `next build
// --webpack`). A same-directory same-basename .tsx/.mjs pair is unsafe under Next's webpack
// resolution; this module now carries a name distinct from every .tsx basename in this directory.
//
// See CredibilityChipShared.tsx's header for the full "what data exists today" audit (short version:
// nothing does, except source_bias_tags -> the "risk of bias" row).

/**
 * @typedef {"flagged"|"not_assessed"} GradeModifierStatus
 * @typedef {{key: string, label: string, status: GradeModifierStatus, detail: string|null}} GradeModifier
 * @typedef {{dimension: "funding"|"methodology"|"stakeholder", tag: string, confidence: number|null}} ResearchBiasTag
 */

/**
 * The full GRADE-style modifier ledger spec-03 §4 names: indirectness, risk of bias, imprecision,
 * inconsistency, publication bias, and the two upgrades (large effect size, convergent independent
 * evidence). Only "risk of bias" has a live data path today (source_bias_tags); the rest render
 * `not_assessed` — this function is the ONE place that fact is stated, so a future data path lights
 * up its row here rather than requiring a second component to learn the same six-item list.
 *
 * @param {ResearchBiasTag[]} biasTags
 * @returns {GradeModifier[]}
 */
export function buildGradeModifiers(biasTags) {
  const tags = biasTags ?? [];
  const biasDetail =
    tags.length > 0
      ? tags
          .map((b) => `${b.dimension}: ${b.tag}${b.confidence != null ? ` (confidence ${Math.round(b.confidence * 100)}%)` : ""}`)
          .join("; ")
      : null;
  return [
    {
      key: "risk_of_bias",
      label: "Risk of bias",
      status: tags.length > 0 ? "flagged" : "not_assessed",
      detail: biasDetail,
    },
    { key: "indirectness", label: "Indirectness", status: "not_assessed", detail: null },
    { key: "imprecision", label: "Imprecision", status: "not_assessed", detail: null },
    { key: "inconsistency", label: "Inconsistency", status: "not_assessed", detail: null },
    { key: "publication_bias", label: "Publication bias", status: "not_assessed", detail: null },
    {
      key: "upgrades",
      label: "Upgrades (large effect size, convergent evidence)",
      status: "not_assessed",
      detail: null,
    },
  ];
}
