import { classifySourceJurisdiction } from "./jurisdiction.mjs";
import { classifyScopeTopics, classifyScopeModes, classifyScopeVerticals } from "./scope.mjs";
import { expectedOutputForRole } from "./expected-output.mjs";

/** The only sources columns apply-classifications.mjs will ever write. Single source of truth, imported
 *  by both the proposer and the applier so the allow-list cannot drift between the two scripts.
 *  `jurisdiction_iso` added (D9, lane L14, 2026-09-13): migration 033 gives Axis 3 a safe, ISO-shaped
 *  home distinct from the legacy `jurisdictions` column, which stays outside this list forever. */
export const APPLICABLE_FIELDS = Object.freeze(["jurisdiction_iso", "scope_topics", "scope_modes", "scope_verticals", "expected_output"]);

function isEmptyArray(v) {
  return !Array.isArray(v) || v.length === 0;
}

/**
 * Which of the five axis fields are currently unset on `source`. PURE. `jurisdiction_iso` (D9, lane
 * L14, 2026-09-13) tests the framework's OWN column, not the legacy `jurisdictions` region-bucket
 * column -- this module never reads `source.jurisdictions` as a gap signal, by construction.
 * @param {{jurisdiction_iso?:unknown, scope_topics?:unknown, scope_modes?:unknown, scope_verticals?:unknown, expected_output?:unknown}} source
 * @returns {{jurisdiction_iso:boolean, scope_topics:boolean, scope_modes:boolean, scope_verticals:boolean, expected_output:boolean}}
 */
export function sourceClassificationGaps(source) {
  return {
    jurisdiction_iso: isEmptyArray(source?.jurisdiction_iso),
    scope_topics: isEmptyArray(source?.scope_topics),
    scope_modes: isEmptyArray(source?.scope_modes),
    scope_verticals: isEmptyArray(source?.scope_verticals),
    expected_output: source?.expected_output === null || source?.expected_output === undefined,
  };
}

/**
 * Compute every derivable Axis 3/4/5 proposal for one source's currently-empty fields. PURE — no I/O,
 * calls only the deterministic per-axis classifiers. A field with a gap but no derivable value (the
 * classifier returned null — genuinely undeterminable from name/url/role) contributes NOTHING to
 * `proposals`; `hasGap` still reports the gap so the caller can flag "needs manual classification".
 * @param {{id?:string, name?:string|null, url?:string|null, source_role?:string|null,
 *   jurisdiction_iso?:unknown, scope_topics?:unknown, scope_modes?:unknown, scope_verticals?:unknown,
 *   expected_output?:unknown}} source
 * @returns {{sourceId:string|null, hasGap:boolean, gaps:object,
 *   proposals:Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>}}
 */
export function proposeSourceAxisClassification(source) {
  const gaps = sourceClassificationGaps(source);
  const hasGap = Object.values(gaps).some(Boolean);
  const proposals = [];
  const sourceRole = source?.source_role ?? null;

  if (gaps.jurisdiction_iso) {
    const j = classifySourceJurisdiction({ url: source?.url, sourceRole });
    if (j) {
      proposals.push({
        field: "jurisdiction_iso", value: [j.value], confidence: j.confidence, basis: j.basis,
        applicable: true, // D9, lane L14, 2026-09-13 -- migration 033 gives Axis 3 a safe, ISO-shaped home
      });
    }
  }
  if (gaps.scope_topics) {
    const t = classifyScopeTopics({ name: source?.name, sourceRole });
    if (t) proposals.push({ field: "scope_topics", value: t.value, confidence: t.confidence, basis: t.basis, applicable: true });
  }
  if (gaps.scope_modes) {
    const m = classifyScopeModes({ name: source?.name, sourceRole });
    if (m) proposals.push({ field: "scope_modes", value: m.value, confidence: m.confidence, basis: m.basis, applicable: true });
  }
  if (gaps.scope_verticals) {
    const v = classifyScopeVerticals({ name: source?.name, sourceRole });
    if (v) proposals.push({ field: "scope_verticals", value: v.value, confidence: v.confidence, basis: v.basis, applicable: true });
  }
  if (gaps.expected_output && sourceRole) {
    const eo = expectedOutputForRole(sourceRole);
    if (eo) {
      proposals.push({
        field: "expected_output", value: eo, confidence: "medium",
        basis: `framework default Axis-5 distribution for source_role=${sourceRole} (source-classification-framework-2026-05-10.md, "Default distributions per Role")`,
        applicable: true,
      });
    }
  }

  return { sourceId: source?.id ?? null, hasGap, gaps, proposals };
}
