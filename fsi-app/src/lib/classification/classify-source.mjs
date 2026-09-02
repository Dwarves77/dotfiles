// classify-source.mjs — Phase 2/3 aggregator: computes every still-missing Axis 3/4/5 proposal for one
// `sources` row, from the individual axis classifiers (jurisdiction.mjs, scope.mjs,
// expected-output.mjs), and states for EACH proposal whether a database column exists that is safe to
// write it into. Pure, deterministic, no I/O — the caller (scripts/classification/propose-classifications.mjs)
// owns reading sources and writing integrity_flags proposals.
//
// WHY "applicable" IS PART OF EVERY PROPOSAL, NOT ASSUMED TRUE (root-cause finding, 2026-09-02):
//
// Axis 4a/4b/4c/5 have a clean, UNUSED home: migration 063 added `sources.scope_topics`,
// `scope_modes`, `scope_verticals`, `expected_output` specifically for this framework. Grepped
// 2026-09-02 (script/src, excluding _snapshots/ and this module's own vocab.mjs): zero other readers or
// writers exist anywhere in the live app or scripts. Safe to write. `applicable: true`.
//
// Axis 3 (jurisdiction) has NO safe home. `sources.jurisdictions` was NOT added by migration 063 — it
// already existed from migration 004, and migration 063's own `ADD COLUMN IF NOT EXISTS jurisdictions`
// was therefore a documented no-op against that pre-existing column, not a new axis-3 field. That
// pre-existing column is LIVE: src/app/api/admin/canonical-sources/decide/route.ts and
// src/app/api/admin/sources/promote/route.ts populate it from an operator-reviewed Haiku classification
// (bulk-classify/route.ts's own system prompt) whose vocabulary is region buckets —
// `eu | us | uk | latam | asia | hk | meaf | global` — NOT this framework's ISO 3166 shape
// (`GB`, `US-CA`, `EU`, `GLOBAL`...; jurisdiction.mjs / vocab.mjs). Three live surfaces read it
// (src/components/regulations/AffectedLanesCard.tsx, src/components/map/MapPageView.tsx, and the
// workspace RPCs migrations 073/077/117 select it through). Writing an ISO-shaped value into that
// column would silently corrupt every one of those reads. Until an ADR rules a real Axis-3 home (a new,
// distinctly-named column — out of this lane's write set), jurisdiction proposals are surfaced for
// OPERATOR REVIEW ONLY. `applicable: false` — and apply-classifications.mjs refuses to write field
// "jurisdictions" even if one somehow reached it, by construction (APPLICABLE_FIELDS allow-list).
//
// `sources.topic_tags` / `transport_modes` / `vertical_tags` are the analogous LIVE, differently-scoped
// legacy columns for 4a/4b/4c (same review flow, same Haiku vocabulary —
// topic_tags: emissions|fuels|transport|reporting|packaging|corridors|research;
// transport_modes: air|road|ocean|rail). This module never touches them; scope_topics/scope_modes/
// scope_verticals are the framework's own, vocab.mjs-bound columns, confirmed unused by that same grep.

import { classifySourceJurisdiction } from "./jurisdiction.mjs";
import { classifyScopeTopics, classifyScopeModes, classifyScopeVerticals } from "./scope.mjs";
import { expectedOutputForRole } from "./expected-output.mjs";

/** The only sources columns apply-classifications.mjs will ever write. Single source of truth, imported
 *  by both the proposer and the applier so the allow-list cannot drift between the two scripts. */
export const APPLICABLE_FIELDS = Object.freeze(["scope_topics", "scope_modes", "scope_verticals", "expected_output"]);

function isEmptyArray(v) {
  return !Array.isArray(v) || v.length === 0;
}

/**
 * Which of the five axis fields are currently unset on `source`. PURE. `jurisdictions` is included so
 * the caller can decide whether to surface an (advisory-only) Axis-3 finding, even though this module
 * never proposes writing it.
 * @param {{jurisdictions?:unknown, scope_topics?:unknown, scope_modes?:unknown, scope_verticals?:unknown, expected_output?:unknown}} source
 * @returns {{jurisdictions:boolean, scope_topics:boolean, scope_modes:boolean, scope_verticals:boolean, expected_output:boolean}}
 */
export function sourceClassificationGaps(source) {
  return {
    jurisdictions: isEmptyArray(source?.jurisdictions),
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
 *   jurisdictions?:unknown, scope_topics?:unknown, scope_modes?:unknown, scope_verticals?:unknown,
 *   expected_output?:unknown}} source
 * @returns {{sourceId:string|null, hasGap:boolean, gaps:object,
 *   proposals:Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>}}
 */
export function proposeSourceAxisClassification(source) {
  const gaps = sourceClassificationGaps(source);
  const hasGap = Object.values(gaps).some(Boolean);
  const proposals = [];
  const sourceRole = source?.source_role ?? null;

  if (gaps.jurisdictions) {
    const j = classifySourceJurisdiction({ url: source?.url, sourceRole });
    if (j) {
      proposals.push({
        field: "jurisdictions", value: [j.value], confidence: j.confidence, basis: j.basis,
        applicable: false, // see file header — no safe write target (sources.jurisdictions is live, differently-scoped)
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
