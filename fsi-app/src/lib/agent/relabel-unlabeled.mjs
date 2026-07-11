// @ts-check
// 4c — LABELED-ANALYSIS RESOLUTION for unlabeled_assertion (design: docs/design/4c-label-step-design.md).
// A section can fail validate_item_provenance criterion-4 "unlabeled_assertion" when its content_md states a
// binding requirement (requires/must/mandates/obligates/prohibits/applies to) with NEITHER a FACT grounded on
// the section NOR an analysis label on the prose. Two honest exits: GROUND it (a FACT span lands — grounding's
// job), or LABEL it (the assertion is the workspace's own analysis, so it reads as labeled analysis, not an
// ungrounded binding claim). 4c owns the LABEL exit.
//
// THE MOAT (mirror of slot-forcing's never-FABRICATE, applied to labeling): 4c must NEVER DOWNGRADE a genuine
// binding requirement (one that should be a FACT) into mere analysis — that understates a real regulatory fact
// and violates the legal-line guard. So the asymmetry is INVERTED from slot-forcing: relabel ONLY when the
// judge is CONFIDENT the assertion is the workspace's own analytical reasoning; under ANY uncertainty, or when
// the assertion states a primary-source requirement, do NOT relabel — route to grounding/hold. Pure decision
// logic here (the judge is INJECTED — a live spend-client call in prod, a mock in the selftest).

/** @typedef {{ kind: "WORKSPACE_ANALYSIS"|"PRIMARY_REQUIREMENT"|"UNCERTAIN", label?: "inference"|"industry"|"operational", why?: string }} RelabelVerdict */

// Analysis labels — MUST match the validator's c_label_re (case-tolerant per migration 143). The label is
// prepended at the START of the binding sentence (label home), where criterion-4 scans the section content_md.
// C2 (2026-07-11): the vocabulary is imported from analysis-labels.mjs (the ONE home) and re-exported under
// this module's historical name so its consumers/tests are unchanged — never hand-list the labels here.
import { ANALYSIS_LABELS_BY_KEY } from "./analysis-labels.mjs";
export const ANALYSIS_LABELS = ANALYSIS_LABELS_BY_KEY;
const ALL_LABELS_RE = new RegExp(`(${Object.values(ANALYSIS_LABELS).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i");

// The criterion-4 binding-verb trigger (kept in sync with migration 145's regex).
export const BINDING_VERB_RE = /\b(requires|must|mandates|obligates|prohibits|applies to)\b/i;

// A relabelable assertion is genuine PROSE, not markdown structure. A binding verb inside a table row, a
// heading, or an unpunctuated block is NOT a prose assertion — prepending a label there would corrupt the
// markdown AND mis-characterize structured content. Such a section is HELD (its requirement needs grounding,
// not labeling), never relabeled.
const MAX_ASSERTION_LEN = 600; // an unpunctuated block longer than this is structural, not one prose assertion

/** Sentences in content_md that TRIGGER criterion-4 AND are relabelable prose: a binding verb, not already
 *  labeled, not a markdown table row / heading / oversized structural block. Pure. @param {string} contentMd @returns {string[]} */
export function bindingSentences(contentMd) {
  return String(contentMd || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) =>
      s.length > 0 && s.length <= MAX_ASSERTION_LEN &&
      BINDING_VERB_RE.test(s) && !ALL_LABELS_RE.test(s) &&
      !/(?:^|\n)\s*\|/.test(s) &&   // not a markdown table row/blob
      !/(?:^|\n)\s*#{1,6}\s/.test(s) && // not a markdown heading
      !/\|\s*-{3,}/.test(s));       // not a table separator row
}

/**
 * DECIDE whether to relabel an unlabeled binding assertion. RELABEL only on a CONFIDENT WORKSPACE_ANALYSIS
 * verdict; PRIMARY_REQUIREMENT and UNCERTAIN both route to grounding/hold (never downgrade a real fact). Pure.
 * @param {RelabelVerdict|null|undefined} verdict
 * @returns {{ action: "RELABEL"|"GROUND_OR_HOLD", label?: string, reason: string }}
 */
export function decideRelabel(verdict) {
  if (verdict && verdict.kind === "WORKSPACE_ANALYSIS") {
    const label = ANALYSIS_LABELS[verdict.label || "inference"] || ANALYSIS_LABELS.inference;
    return { action: "RELABEL", label, reason: "judge classified the assertion as the workspace's own analytical reasoning — label it, do not present as grounded fact" };
  }
  return { action: "GROUND_OR_HOLD", reason: `not a confident workspace-analysis (${verdict?.kind ?? "no verdict"}) — never downgrade a possible binding fact; route to grounding or honest hold` };
}

/**
 * Apply a label to the START of a binding sentence within content_md (label home). Verbatim-safe: no-op if the
 * sentence is not found or is already labeled (idempotent). Pure.
 * @param {string} contentMd @param {string} sentence @param {string} label
 * @returns {{ ok: boolean, content: string, changed: boolean }}
 */
export function applyLabelToContent(contentMd, sentence, label) {
  const md = String(contentMd || "");
  const sent = String(sentence || "").trim();
  if (!sent || !md.includes(sent)) return { ok: false, content: md, changed: false };
  if (ALL_LABELS_RE.test(sent)) return { ok: true, content: md, changed: false }; // already labeled — idempotent
  return { ok: true, content: md.replace(sent, `${label} ${sent}`), changed: true };
}
