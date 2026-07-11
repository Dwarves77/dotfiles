// @ts-check
// ANALYSIS-LABEL VOCABULARY — THE ONE constant module (Wave-α C2, correction-plan Track C row C2;
// CODE-1 F-01 criterion-4 half). Every home that EMITS, DETECTS, or FILTERS analysis labels imports
// from here: the synthesis system prompt (system-prompt.ts), the grounding LEDGER prompt + the
// kept-claims filter (canonical-pipeline.ts), and the 4c relabel module (relabel-unlabeled.mjs).
// Pure .mjs so it imports into BOTH the TS pipeline and the node --test drift guard.
//
// THE 4TH-LABEL RULING (2026-07-11, decided from live-corpus data — recorded per the C2 dispatch):
//   "Per the workspace's reading:" was authorized by the system prompt + ledger prompt but never by
//   the kept-filter/4c module. Live corpus count (read-only SELECT, project kwrsbpiseruzbfwjpvsp):
//     section_claim_provenance claims carrying it ......... 0
//     intelligence_item_sections rows carrying it ......... 4 (3 items)
//     intelligence_items.full_brief carrying it ........... 4 (2 verified, 2 quarantined)
//   The corpus is ~clean of it → RULING: STOP-EMITTING. The token is REMOVED from the emit-side
//   vocabulary (system prompt + ledger prompt); the canonical emit set is the THREE labels below.
//   NOTE (recorded deviation from the register's premise): the LIVE validate_item_provenance
//   (migration 143 c_label_re, confirmed via pg_get_functiondef) ALREADY tolerates the legacy 4th
//   token — CODE-1 F-01's "the validator recognizes 3" was stale. That tolerance is left in place
//   deliberately (no migration): it protects the 2 verified legacy briefs from a retroactive
//   quarantine, and nothing emits the token anymore. LEGACY_ANALYSIS_LABEL below names it so the
//   drift test can assert it stays OUT of every emit-side home.

/** The canonical ANALYSIS label tokens as EMITTED in brief prose (display form, with the
 *  asterisk-emphasis + colon the validator's c_label_re matches). Closed set — 3 labels. */
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
