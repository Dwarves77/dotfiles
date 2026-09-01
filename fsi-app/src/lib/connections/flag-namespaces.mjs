// flag-namespaces.mjs — SINGLE SOURCE OF TRUTH for the flywheel's integrity_flags `created_by`
// namespaces and subject_ref construction. PURE, no DB, no LLM.
//
// WHY THIS EXISTS. Three independent flywheel passes write integrity_flags rows through the same
// dedup-before-insert / resolve-if-stale convention analyze-corpus.mjs established for coverage_gap
// (U2, see its own file header): gap detection (gaps.mjs), anticipated-coverage detection
// (anticipate.mjs, U5), and signal-candidate detection (signal-candidates.mjs, L4). Each producer
// must own a DISJOINT `created_by` PREFIX so analyze-corpus.mjs's per-writer
// `created_by LIKE '<namespace>%'` read never touches — and never resolves-as-stale — a row another
// writer opened. This is the same isolation write-edges.mjs's ORIGIN OWNERSHIP note establishes for
// item_cross_references, applied here to integrity_flags.
//
// Before this module, `GAP_NAMESPACE = "flywheel-gap:"` was a private constant declared inline in
// analyze-corpus.mjs. This file is the SoT it now imports from; ANTICIPATE_NAMESPACE and
// SIGNAL_NAMESPACE are the two new namespaces born here (not invented ad hoc in their producer
// modules) so a future fourth producer has one obvious place to register, not three files to grep.
//
// Every namespace is terminated with ':' by construction (enforced by createdBy below) so a
// `LIKE '<ns>%'` scan can never false-positive-match a differently-named namespace that merely
// shares a prefix (e.g. a hypothetical 'flywheel-gapx:' would not match 'flywheel-gap:%').

export const GAP_NAMESPACE = "flywheel-gap:";
export const ANTICIPATE_NAMESPACE = "flywheel-anticipate:";
export const SIGNAL_NAMESPACE = "flywheel-signal:";

export const ALL_NAMESPACES = Object.freeze([GAP_NAMESPACE, ANTICIPATE_NAMESPACE, SIGNAL_NAMESPACE]);

/**
 * Build an integrity_flags.created_by value for one finding `subtype` under `namespace`.
 * Mirrors the exact string analyze-corpus.mjs's pre-refactor gap reflection built inline
 * (`${GAP_NAMESPACE}${g.type}`) — same shape, now the one place it's assembled.
 * @param {string} namespace - one of the exported *_NAMESPACE constants (must end in ':')
 * @param {string} subtype - the finding's own type/kind (e.g. gaps.mjs's g.type)
 * @returns {string}
 */
export function createdBy(namespace, subtype) {
  if (typeof namespace !== "string" || !namespace.endsWith(":")) {
    throw new Error(`flag-namespaces.createdBy: namespace must end in ':' (got ${JSON.stringify(namespace)})`);
  }
  const st = String(subtype ?? "").trim();
  if (!st) throw new Error("flag-namespaces.createdBy: subtype is required.");
  return `${namespace}${st}`;
}

/**
 * Deterministic subject_ref for a finding, built from an ordered list of parts (a theme id, item
 * ids, an event id, a signal kind — whatever makes the finding's subject unique and reproducible
 * across re-runs on an unchanged corpus). Parts are stringified, trimmed, empty parts dropped, and
 * joined with ':'. A single non-empty part degrades to that part unchanged
 * (buildSubjectRef(themeId) === themeId), which is exactly gaps.mjs's existing convention
 * (subject_ref = theme.id, a bare string) — so extracting this SoT does not change any existing
 * gap's subject_ref.
 * @param {...(string|number|null|undefined)} parts
 * @returns {string}
 */
export function buildSubjectRef(...parts) {
  return parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(":");
}

/**
 * True when `createdByValue` belongs to `namespace` — the predicate analyze-corpus.mjs's
 * dedup/resolve scan uses in place of a hand-rolled `.startsWith(...)` at each call site.
 * @param {string} createdByValue
 * @param {string} namespace
 * @returns {boolean}
 */
export function isInNamespace(createdByValue, namespace) {
  return typeof createdByValue === "string" && createdByValue.startsWith(namespace);
}
