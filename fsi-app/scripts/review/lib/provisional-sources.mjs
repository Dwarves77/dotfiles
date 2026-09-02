// provisional-sources.mjs — queue 1: `sources` rows stuck at status='provisional' (927 live,
// docs/audits/system-review-2026-09-01.md:29,140), ruled keep/suspend (Lane R1, 2026-09-02).
//
// TABLE, NOT `provisional_sources`. The finish plan's verbs ("keep / suspend") are the `sources.status`
// vocabulary (migration 004: active|stale|inaccessible|provisional|suspended) — `provisional_sources`
// has no 'suspended' state in its own CHECK constraint (status IN pending_review|confirmed|rejected|
// needs_more_data; migration 004), so a ruling of "suspend" could never be written there. The 927 count
// itself matches the audit's "1,612 active, 927 provisional, 22 suspended" sources breakdown exactly,
// and F2's sibling lane (`inaccessible-triage.mjs`) hands its surviving suspensions to THIS digest —
// another `sources`-table lane, not `provisional_sources`. See the lane report's Corrections section.
//
// GROUPING: officialness tier (host-authority.ts's classTierForHost — the SAME deterministic host->tier
// classifier the registration path uses, not the row's own `base_tier`, which defaults to 7 for almost
// every provisional row and says nothing about the host) x reachability bucket (derived from the row's
// own accessibility counters — no network call here). Institution key (institution-key.mjs — the SAME
// identity rule `registerSource` dedups the live registry by) is used WITHIN each group to surface
// same-institution duplicates: the app's own promote/decide/bulk-approve routes insert into `sources`
// with a raw `.insert()`, bypassing `registerSource`'s institution-key dedup, so two rows for the same
// shared-portal institution (different discovered pages) CAN both sit in the provisional pool — that is
// itself worth an operator's attention (probably: keep one, suspend the other as a duplicate), not just
// two separate keep/suspend calls made in ignorance of each other.

import { hostOf, institutionKey } from "../../lib/institution-key.mjs";
import { classTierForHost } from "../../../src/lib/sources/host-authority.ts";
import { partitionBy, buildGroup, sortGroups, latestIso } from "./digest-core.mjs";

export const QUEUE_ID = "provisional-sources";
export const QUEUE_LABEL = "Provisional sources (sources.status = 'provisional')";
export const TABLE = "sources";
export const SELECT_COLUMNS =
  "id,name,url,status,base_tier,effective_tier,accessibility_rate,consecutive_accessible,total_checks," +
  "successful_checks,last_accessible,last_inaccessible,trust_score_overall,updated_at,created_at";
export const ALLOWED_DECISIONS = ["keep", "suspend", "skip"];

export function matchQueue(qb) {
  return qb.eq("status", "provisional");
}

/** Reachability bucket from the row's OWN accessibility counters (migration 004) — no network I/O. */
export function reachabilityBucket(row) {
  if (row.status === "inaccessible") return "confirmed_inaccessible";
  const checks = row.total_checks ?? 0;
  if (checks === 0) return "never_checked";
  const rate = row.accessibility_rate ?? 1;
  if (rate >= 0.8) return "reachable";
  if (rate <= 0.2) return "unreachable";
  return "flaky";
}

/** Officialness tier bucket: host-authority.ts's deterministic host->tier classifier, or "unclassified". */
export function officialnessTier(row) {
  const t = classTierForHost(hostOf(row.url));
  return t == null ? "unclassified" : String(t);
}

/**
 * The recommendation rule. Deterministic function of (tier, reachability) alone — never guesses from a
 * single row's fields, always the pair. Both directions (keep AND suspend) are reachable; anything the
 * rule cannot confidently call returns "uncertain" (never silently defaults to either action).
 */
export function recommendDisposition(tier, reachability) {
  if (reachability === "confirmed_inaccessible" || reachability === "unreachable") return "suspend";
  if (reachability === "never_checked") return "uncertain"; // no accessibility evidence yet, whatever the tier
  // reachability is "reachable" or "flaky" from here on.
  if (tier === "1" || tier === "2" || tier === "4") return "keep"; // legal-primary / gov-intergov / verifier-academic-association
  return "uncertain"; // reachable but unclassifiable host (6/7/unclassified) — a relevance call, not a reachability one
}

/** Pure: rows -> ordered digest groups. */
export function groupRows(rows) {
  const groups = [];
  const byBucket = partitionBy(rows, (r) => `tier:${officialnessTier(r)}|reach:${reachabilityBucket(r)}`);
  for (const [key, bucketRows] of byBucket) {
    const tier = /tier:([^|]+)/.exec(key)[1];
    const reachability = /reach:(.+)$/.exec(key)[1];
    const byInstitution = partitionBy(bucketRows, (r) => institutionKey(r.url));
    const duplicateInstitutions = [...byInstitution.entries()]
      .filter(([, rs]) => rs.length > 1)
      .map(([k, rs]) => ({ institution: k, count: rs.length }));
    groups.push(
      buildGroup({
        key,
        rows: bucketRows,
        idOf: (r) => r.id,
        recommendedDecision: recommendDisposition(tier, reachability),
        exampleOf: (r) => ({ id: r.id, title: r.name, url: r.url, tier: r.base_tier, accessibility_rate: r.accessibility_rate }),
        evidence: {
          officialness_tier: tier,
          reachability,
          distinct_institutions: byInstitution.size,
          duplicate_institutions: duplicateInstitutions,
        },
      })
    );
  }
  return sortGroups(groups);
}

/** Group decision -> the `sources` UPDATE patch. null = no mutation ("skip"). */
export function patchForDecision(decision) {
  if (decision === "keep") return { status: "active" };
  if (decision === "suspend") return { status: "suspended" };
  return null; // "skip"
}

/** The newest `updated_at` among currently-live queue rows — the stale-ruling guard's comparison point. */
export function freshestTimestamp(rows) {
  return latestIso(rows.map((r) => r.updated_at));
}
