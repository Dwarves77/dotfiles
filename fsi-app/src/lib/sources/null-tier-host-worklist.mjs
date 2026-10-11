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

export const NULL_TIER_RESOLVED_BY = "resolve-provisional-sources";

/**
 * The resolve patch for an open null-tier-host flag whose host a committed host-verdict batch now places
 * (lane S1-B, 2026-10-04): the flag asked "which class is this host?" and the verdict answered it, so the
 * machine closes it with a note naming the batch, class and tier. Pure; the caller performs the write.
 * @param {string} host
 * @param {{ rule?: "a"|"b"|"b2", batch?: string|null, class?: string, tier: number }} placement
 *   rule b2 (default, a verdict) names batch and class; rules a and b name the rule that now resolves the host.
 * @param {string} nowIso
 */
export function buildNullTierHostResolution(host, placement, nowIso) {
  return {
    status: "resolved",
    resolved_at: nowIso,
    resolved_by: NULL_TIER_RESOLVED_BY,
    resolution_note: placement.rule === "a" || placement.rule === "b"
      ? `rule ${placement.rule} (${placement.rule === "a" ? "existing active institution" : "SC-13 class table"}) now places ${host} at tier ${placement.tier}; no operator action needed.`
      : `host verdict batch ${placement.batch ?? "unknown"} places ${host} in class ${placement.class} (tier ${placement.tier}); registered by the class table, no operator action needed.`,
  };
}
