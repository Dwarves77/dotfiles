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
// Axis 3 (jurisdiction) NOW HAS a safe home (D9, lane L14, 2026-09-13, correcting the 2026-09-02
// finding below): migration 033 (`fsi-app/supabase/migrations/033_jurisdiction_iso.sql`) added
// `sources.jurisdiction_iso TEXT[]` specifically for this framework's ISO-3166 shape (`GB`, `US-CA`,
// `EU`, `GLOBAL`...; jurisdiction.mjs / vocab.mjs's `isValidJurisdictionValue`), distinct from the
// legacy `sources.jurisdictions` column this framework must never touch. `applicable: true`.
//
// `sources.jurisdictions` remains untouched BY CONSTRUCTION and stays exactly as risky as the original
// finding described: it was NOT added by migration 063 -- it already existed from migration 004, and
// migration 063's own `ADD COLUMN IF NOT EXISTS jurisdictions` was therefore a documented no-op against
// that pre-existing column, not a new axis-3 field. That pre-existing column is LIVE:
// src/app/api/admin/canonical-sources/decide/route.ts and src/app/api/admin/sources/promote/route.ts
// populate it from an operator-reviewed Haiku classification (bulk-classify/route.ts's own system
// prompt) whose vocabulary is region buckets -- `eu | us | uk | latam | asia | hk | meaf | global` --
// NOT this framework's ISO shape. Three live surfaces read it (src/components/regulations/
// AffectedLanesCard.tsx, src/components/map/MapPageView.tsx, and the workspace RPCs migrations
// 073/077/117 select it through). Writing an ISO-shaped value into `jurisdictions` would silently
// corrupt every one of those reads -- this module never proposes writing that column, never reads it as
// a gap signal, and never emits `field: "jurisdictions"`; it proposes `field: "jurisdiction_iso"` only,
// which apply-classifications.mjs's own APPLICABLE_FIELDS allow-list (imported from this module, so the
// two scripts cannot drift) is the sole gate on.
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
