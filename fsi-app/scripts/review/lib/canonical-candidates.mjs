// canonical-candidates.mjs — queue 2: `canonical_source_candidates` rows with decision='pending' (331
// live, docs/ops/session-log.md:8006), ruled accept/reject (Lane R1, 2026-09-02).
//
// GROUPING per the task brief: host (of candidate_url) x candidate reason (issue_classification — the
// column's own vocabulary: stale_url/missing_link/missing_source/thin_match, migration 021).
//
// RECOMMENDATION is a GROUP-level rule, not a per-row one voted up: `verified` and `confidence` can
// differ row to row inside one (host, reason) group, and "accept" here only ever means "safe to
// auto-apply as a group" (see apply-canonical-candidates.mjs) — a group is recommended accept only when
// EVERY row in it already cleared the verifier at high confidence, reject only when EVERY row is
// unverified. A mixed group is "uncertain": the operator's own per-row review is the honest path,
// exactly as this table's existing /decide route already offers.
//
// WHAT "ACCEPT" DOES NOT DO. The product's approve flow (decide/route.ts, bulk-approve/route.ts)
// creates a NEW `sources` row (with an operator- or classifier-chosen tier) when the candidate URL isn't
// already registered, then repoints the parent `intelligence_items` row. That is multi-table, tier-
// bearing work this digest's guarded-path-only apply script does not replicate. apply-canonical-
// candidates.mjs instead resolves "accept" only for candidates whose URL ALREADY matches a registered
// source (no new source, no tier to invent) and routes anything else to "needs_individual_review" —
// the same safety valve bulk-approve/route.ts already uses for an unresolvable candidate.

import { hostOf } from "../../lib/institution-key.mjs";
import { partitionBy, buildGroup, sortGroups, latestIso } from "./digest-core.mjs";

export const QUEUE_ID = "canonical-candidates";
export const QUEUE_LABEL = "Canonical source candidates (canonical_source_candidates.decision = 'pending')";
export const TABLE = "canonical_source_candidates";
export const SELECT_COLUMNS =
  "id,intelligence_item_id,current_source_id,current_source_url,issue_classification,candidate_url," +
  "candidate_title,candidate_publisher,confidence,verified,verified_status_code,decision,updated_at,reviewed_at,created_at";
export const ALLOWED_DECISIONS = ["accept", "reject", "skip"];

export function matchQueue(qb) {
  return qb.eq("decision", "pending");
}

export function groupKeyOf(row) {
  return `${hostOf(row.candidate_url) || "(unparseable-host)"}::${row.issue_classification}`;
}

/** Deterministic GROUP rule: unanimous verified+high -> accept; unanimous unverified -> reject; else uncertain. */
export function recommendGroupDecision(rows) {
  if (rows.every((r) => r.verified && r.confidence === "high")) return "accept";
  if (rows.every((r) => !r.verified)) return "reject";
  return "uncertain";
}

export function groupRows(rows) {
  const groups = [];
  const byKey = partitionBy(rows, groupKeyOf);
  for (const [key, groupRowsList] of byKey) {
    groups.push(
      buildGroup({
        key,
        rows: groupRowsList,
        idOf: (r) => r.id,
        recommendedDecision: recommendGroupDecision(groupRowsList),
        exampleOf: (r) => ({
          id: r.id,
          title: r.candidate_title || r.candidate_publisher || "(untitled)",
          url: r.candidate_url,
          confidence: r.confidence,
          verified: r.verified,
        }),
        evidence: {
          verified_count: groupRowsList.filter((r) => r.verified).length,
          unverified_count: groupRowsList.filter((r) => !r.verified).length,
          confidence_high: groupRowsList.filter((r) => r.confidence === "high").length,
        },
      })
    );
  }
  return sortGroups(groups);
}

/** "accept"/"reject" -> the simple, always-safe `canonical_source_candidates` patch. Callers that can
 *  additionally resolve an existing source add `promoted_to_source_id` themselves (see the apply script);
 *  this base patch alone is what "reject" and "skip" ever need. */
export function patchForDecision(decision, { reviewerNotes } = {}) {
  if (decision === "reject") return { decision: "rejected", reviewed: true, reviewer_notes: reviewerNotes ?? null };
  if (decision === "accept") return { decision: "approved", reviewed: true, reviewer_notes: reviewerNotes ?? null };
  return null; // "skip"
}

export function freshestTimestamp(rows) {
  return latestIso(rows.flatMap((r) => [r.updated_at, r.reviewed_at]));
}
