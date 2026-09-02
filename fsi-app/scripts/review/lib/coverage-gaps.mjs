// coverage-gaps.mjs — queue 4: `coverage_gap_candidates` rows with disposition IS NULL (91 live,
// docs/ops/session-log.md:8042-8043 "91 gap dispositions"), ruled kept/declined/parked (Lane R1,
// 2026-09-02).
//
// TABLE, NOT `coverage_gaps`. `coverage_gaps` (migration 061) is a two-row, hand-authored Dashboard
// marketing widget with no status/decision column and no growth path in the repo (grep confirms zero
// non-migration inserts). `coverage_gap_candidates` (migration 214, extended by 273) carries the exact
// word "disposition" as a column name with the CHECK-constrained vocabulary this queue's decisions use
// verbatim: `disposition IS NULL OR disposition IN ('kept','declined','parked')` — and its own grouping
// dimensions (`coverage_class`, `jurisdiction`, `transport_mode`) are exactly "gap class x jurisdiction/
// mode" from the task brief; `coverage_gaps` has neither. See the lane report's Corrections section.
//
// GROUPING: coverage_class (MISSING / AMBIGUOUS_ARCHIVED / HAVE_QUARANTINED — the table's own evidence-
// hierarchy label, migration 214 header) x jurisdiction x transport_mode.
//
// RECOMMENDATION is a direct reading of the table's own documented evidence hierarchy (migration 214
// header comment): HAVE_QUARANTINED is already in the corpus via the drain, so it is not a fresh
// acquisition target ("declined" — not a gap requiring separate acquisition); AMBIGUOUS_ARCHIVED depends
// on a different, pending review lane resolving first ("parked" — revisit once that lane clears);
// MISSING is a genuine absence, split by the row's own `estimated_priority` into act-now ("kept", the
// acquisition backlog) versus a later wave ("parked").
//
// migration 273's `coverage_gap_candidates_surface_test_required_check` requires a fully-populated
// `surface_test` JSON (verdict+reason per surface: regulations/operations/market_intel/research/
// community) on every row whose disposition is NOT NULL and NOT 'kept' — so 'declined' and 'parked'
// both need one attached, or the guarded UPDATE would violate the constraint at apply time. This queue
// is not surface-specific data (an instrument's absence is not scoped to one surface), so the same
// verdict/reason pair is written across all five keys, sourced from the group's own rule rationale.

import { partitionBy, buildGroup, sortGroups, latestIso } from "./digest-core.mjs";

export const QUEUE_ID = "coverage-gaps";
export const QUEUE_LABEL = "Coverage gap candidates (coverage_gap_candidates.disposition IS NULL)";
export const TABLE = "coverage_gap_candidates";
export const SELECT_COLUMNS =
  "id,rank,instrument,jurisdiction,transport_mode,estimated_priority,coverage_class,authoritative_url,disposition,created_at";
export const ALLOWED_DECISIONS = ["kept", "declined", "parked", "skip"];

export function matchQueue(qb) {
  return qb.is("disposition", null);
}

export function groupKeyOf(row) {
  return `${row.coverage_class}::${row.jurisdiction || "(none)"}::${row.transport_mode || "multi"}`;
}

const HIGH_PRIORITY = new Set(["CRITICAL", "HIGH"]);

/** Deterministic rule straight off the table's own documented evidence hierarchy (migration 214). */
export function recommendGapDisposition(coverageClass, estimatedPriority) {
  if (coverageClass === "HAVE_QUARANTINED") return "declined"; // already in-corpus via the drain, not a new gap
  if (coverageClass === "AMBIGUOUS_ARCHIVED") return "parked"; // resolves at the archived-item review lane first
  if (coverageClass === "MISSING") return HIGH_PRIORITY.has(estimatedPriority) ? "kept" : "parked";
  return "uncertain"; // an unrecognized coverage_class — never silently guessed
}

export function groupRows(rows) {
  const groups = [];
  const byKey = partitionBy(rows, groupKeyOf);
  for (const [key, groupRowsList] of byKey) {
    const [coverageClass] = key.split("::");
    // A group can mix priorities only when coverage_class isn't MISSING (whose recommendation doesn't
    // depend on priority); for MISSING groups the recommendation rule is applied per the group's own
    // dominant priority signal — see the note below the rule.
    const priorities = new Set(groupRowsList.map((r) => r.estimated_priority));
    const recommended =
      coverageClass === "MISSING" && priorities.size > 1
        ? "uncertain" // mixed-priority MISSING group: the rule cannot call a single group verdict, never guessed
        : recommendGapDisposition(coverageClass, groupRowsList[0].estimated_priority);
    groups.push(
      buildGroup({
        key,
        rows: groupRowsList,
        idOf: (r) => r.id,
        recommendedDecision: recommended,
        exampleOf: (r) => ({ id: r.id, title: r.instrument, url: r.authoritative_url, priority: r.estimated_priority }),
        evidence: { coverage_class: coverageClass, priorities: [...priorities] },
      })
    );
  }
  return sortGroups(groups);
}

/** A single verdict/reason pair, applied uniformly across all five surface keys — see the module header. */
function uniformSurfaceTest(verdict, reason) {
  const entry = { verdict, reason: reason || `ratification digest: group disposition = ${verdict}` };
  return {
    regulations: entry,
    operations: entry,
    market_intel: entry,
    research: entry,
    community: entry,
  };
}

export function patchForDecision(decision, { rationale } = {}) {
  if (decision === "kept") return { disposition: "kept" };
  if (decision === "declined") return { disposition: "declined", surface_test: uniformSurfaceTest("not_applicable", rationale) };
  if (decision === "parked") return { disposition: "parked", surface_test: uniformSurfaceTest("deferred", rationale) };
  return null; // "skip"
}

export function freshestTimestamp(rows) {
  return latestIso(rows.map((r) => r.created_at));
}
