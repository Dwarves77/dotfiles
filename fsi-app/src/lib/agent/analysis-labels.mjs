// @ts-check

export const ANALYSIS_LABEL_TOKENS = Object.freeze([
  "*Analytical inference:*",
  "*Industry interpretation:*",
  "*Operational implication:*",
]);

/** The same vocabulary in lowercase match form (no asterisks/colon) — the kept-claims filter's
 *  substring form (canonical-pipeline.ts ANALYSIS-grounding check). Derived, never hand-listed. */
export const ANALYSIS_LABELS = Object.freeze(
  ANALYSIS_LABEL_TOKENS.map((t) => t.replace(/[*:]/g, "").toLowerCase()),
);

/** Bare label form (colon, no asterisks) keyed for the 4c relabel module. */
export const ANALYSIS_LABELS_BY_KEY = Object.freeze({
  inference: "Analytical inference:",
  industry: "Industry interpretation:",
  operational: "Operational implication:",
});

/** The retired 4th label (stop-emitting ruling above). MUST NOT appear in any emit-side home
 *  (system prompt, ledger prompt, kept-filter, 4c). The LIVE DB validator tolerates it for the
 *  legacy corpus only. Exported solely so the drift test can assert its absence. */
export const LEGACY_ANALYSIS_LABEL = "Per the workspace's reading:";
