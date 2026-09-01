// flag-namespaces.mjs — SINGLE SOURCE OF TRUTH for the flywheel's integrity_flags `created_by`
// namespaces and subject_ref construction. PURE, no DB, no LLM.
//
// WHY THIS EXISTS. Independent flywheel passes write integrity_flags rows through the same
// dedup-before-insert / resolve-if-stale convention analyze-corpus.mjs established for coverage_gap
// (U2, see its own file header): gap detection (gaps.mjs), anticipated-coverage detection
// (anticipate.mjs, U5), signal-candidate detection (signal-candidates.mjs, L4), and — born with rule
// 16 (contract v2026-09-01, "participate in the corpus flywheel on every mint or substantive
// update") — the mint chokepoint's own rule-16(d) defect recording (mint-item.ts: a failure of
// connection discovery or forward-event extraction is a recorded integrity_flags defect, never a
// silent skip). Each producer must own a DISJOINT `created_by` PREFIX so analyze-corpus.mjs's
// per-writer `created_by LIKE '<namespace>%'` read never touches — and never resolves-as-stale — a
// row another writer opened. This is the same isolation write-edges.mjs's ORIGIN OWNERSHIP note
// establishes for item_cross_references, applied here to integrity_flags.
//
// Before this module, `GAP_NAMESPACE = "flywheel-gap:"` was a private constant declared inline in
// analyze-corpus.mjs. This file is the SoT it now imports from; ANTICIPATE_NAMESPACE and
// SIGNAL_NAMESPACE are the two new namespaces born here (not invented ad hoc in their producer
// modules) so a future producer has one obvious place to register, not three files to grep.
// FLYWHEEL_DEFECT_NAMESPACE is the fourth, born the same way for mint-item.ts's rule-16(d) writes —
// distinguished from GAP_NAMESPACE (a corpus-structure finding from the U2 clustering pass) because a
// defect is "the flywheel itself failed to run for this item," a different kind of fact with a
// different producer (the mint chokepoint, not analyze-corpus.mjs) and a different subject_type
// ("item", the minted row — never "system" or a theme id).
//
// Every namespace is terminated with ':' by construction (enforced by createdBy below) so a
// `LIKE '<ns>%'` scan can never false-positive-match a differently-named namespace that merely
// shares a prefix (e.g. a hypothetical 'flywheel-gapx:' would not match 'flywheel-gap:%').

export const GAP_NAMESPACE = "flywheel-gap:";
export const ANTICIPATE_NAMESPACE = "flywheel-anticipate:";
export const SIGNAL_NAMESPACE = "flywheel-signal:";
export const FLYWHEEL_DEFECT_NAMESPACE = "flywheel-defect:";
// TAG_NAMESPACE — the fifth namespace, born with propose-tags.mjs (lane TAG, 2026-09-01): items minted
// with EMPTY operational_scenario_tags/compliance_object_tags/topic_tags score ZERO discover.mjs edges
// (that scorer reads exactly those fields — see discover.mjs's own header). propose-tags.mjs reflects
// one integrity_flags row per such item, carrying derive-tags.mjs's PROPOSED tags (never auto-applied —
// operator ratification required, same posture as ratify-flag-to-census.mjs's `ratify:census` marker)
// for apply-tags.mjs to apply once ratified. subject_type is "item" (like FLYWHEEL_DEFECT_NAMESPACE —
// the finding is about the item row itself, not a theme/pair/event); subject_ref is the bare item id
// (buildSubjectRef(itemId) degrades to itemId unchanged, per that helper's own contract below).
export const TAG_NAMESPACE = "flywheel-tag:";

export const ALL_NAMESPACES = Object.freeze([
  GAP_NAMESPACE, ANTICIPATE_NAMESPACE, SIGNAL_NAMESPACE, FLYWHEEL_DEFECT_NAMESPACE, TAG_NAMESPACE,
]);

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
