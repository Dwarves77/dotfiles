// null-tier-host-worklist.mjs: the ONE null-tier-host worklist mechanism, extracted (defect fix D3,
// docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-12) out of scripts/maintenance/
// resolve-cited-host-gate.mjs (names and signatures unchanged: planHostDecision, line 92 on master;
// buildNullTierHostWrite, line 107; NULL_TIER_CREATED_BY, line 69) so a SECOND caller
// (scripts/maintenance/resolve-provisional-sources.mjs) can route an unclassifiable host into the
// SAME per-host merged flag instead of building a second, non-idempotent worklist mechanism.
//
// Review finding (review-7.5.md, finding 2, CONFIRMED): resolve-provisional-sources.mjs's own
// buildBatchWorklistFlag inserted a fresh integrity_flags row every run (no read-before-write, no
// merge against an existing open flag), diverging from resolve-cited-host-gate.mjs's own stated
// doctrine, "never a second worklist." This module is the fix: the one place that shape lives, so
// resolve-cited-host-gate.mjs re-exports it unchanged (its own callers do not change) and
// resolve-provisional-sources.mjs imports it directly.
//
// mergeNullTierAggregate/summarizeNullTierAggregate (src/lib/agent/null-tier-flag.mjs, imported
// unmodified) are the SAME pure per-host merge helpers canonical-pipeline.ts's own
// surfaceNullTierHosts uses at grounding time; this module does not reimplement them, it composes
// them into the two functions a maintenance script needs to plan a URL's fate and build the flag
// write.

// hostOf: byte-identical logic to scripts/lib/institution-key.mjs's own hostOf (both
// `new URL(u).host.replace(/^www\./, "").toLowerCase()`) -- imported from src/lib/sources/
// institution.ts instead of reaching from src/lib back into scripts/lib (the wrong dependency
// direction; scripts/ builds on src/, never the reverse). "Signature unchanged" per the extraction
// plan refers to planHostDecision/buildNullTierHostWrite's own signatures, which this preserves
// exactly; the internal hostOf call is the same behavior either way.
import { hostOf } from "./institution.ts";
import { mergeNullTierAggregate, summarizeNullTierAggregate } from "../agent/null-tier-flag.mjs";

export const NULL_TIER_CREATED_BY = "null-tier-host";

/**
 * The SC-13 decision for one URL: register at a deterministic tier, or route to the null-tier-host
 * worklist. Pure: `classTierForHostFn` is injected (the real classTierForHost, or a fake for a unit
 * test) so this is unit-testable without importing the live class table's exact ruled-host set.
 * @param {string} url
 * @param {(host:string|null|undefined) => number|null} classTierForHostFn
 * @returns {{ url: string, host: string, tier: number|null, action: "register"|"worklist" }}
 */
export function planHostDecision(url, classTierForHostFn) {
  const host = hostOf(url);
  const tier = host ? classTierForHostFn(host) : null;
  return { url, host, tier, action: tier != null ? "register" : "worklist" };
}

/**
 * The null-tier-host flag write plan for one (host, item, url) contribution: pure merge over the
 * EXISTING open flag (or null, for a fresh host), mirroring canonical-pipeline.ts's
 * surfaceNullTierHosts exactly (same mergeNullTierAggregate/summarizeNullTierAggregate, same row
 * shape). Returns either an `{op:"insert", row}` or `{op:"update", id, patch}`; the caller performs
 * the actual write. Idempotent by construction: re-running with the same (host, item) contribution
 * merges into the SAME open flag rather than inserting a duplicate (mergeNullTierAggregate keys its
 * per-item fact count by item id, so a repeat contribution from the same item does not double-count).
 * @param {{ id: string, recommended_actions?: Array<{aggregate?: object}> }|null} existingFlag
 * @param {string} host @param {string} itemId @param {string} url
 * @param {"aggregator"|"platform"|null} permanentClass
 */
export function buildNullTierHostWrite(existingFlag, host, itemId, url, permanentClass) {
  const prior = existingFlag?.recommended_actions?.[0]?.aggregate ?? null;
  const agg = mergeNullTierAggregate(prior, itemId, { factCount: 1, samples: [url] });
  const { description, action, rationale } = summarizeNullTierAggregate(host, agg, permanentClass);
  const row = {
    category: "source_issue",
    subject_type: "source",
    subject_ref: host,
    description: description.slice(0, 480),
    recommended_actions: [{ action, rationale, aggregate: agg, sample_spans: agg.sampleSpans }],
    status: "open",
    created_by: NULL_TIER_CREATED_BY,
  };
  return existingFlag?.id ? { op: "update", id: existingFlag.id, patch: row } : { op: "insert", row };
}
