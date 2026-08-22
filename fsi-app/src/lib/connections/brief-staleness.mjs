// brief-staleness.mjs — pure staleness comparison for theme_briefs (flywheel U6).
//
// WHY THIS EXISTS AS ITS OWN MODULE, NOT INLINE IN THE ROUTE. theme_briefs (migration 266) stores
// member_hash: the md5 of a theme's sorted member_ids at brief-generation time. The read path
// (api/admin/themes/route.ts) must recompute that same hash against the LIVE connection_themes row and
// compare — a mismatch means membership drifted since the brief was written, and the brief renders as
// STALE rather than silently-wrong current content (migration 266's own comment: "STALENESS IS DETECTED,
// NEVER SILENT"). The hash recipe itself has no DB, no I/O, and no framework dependency, so it is pulled
// into a plain .mjs module — same posture as cluster.mjs/gaps.mjs/theme-stats.mjs — so it (a) has a REAL
// execution-wired test via the src/lib/connections/*.test.mjs glob (this repo has no vitest/jest/tsx
// runner, only `node --test` over *.mjs — see theme-stats.mjs's docstring for the precedent) and (b) is
// the ONE place the recipe lives, imported by the route rather than re-implemented there. ONE writer of
// the recipe, matched by whatever wrote member_hash at generation time (the U6 session-executed brief
// generator uses the identical recipe — sort, join empty, md5 hex — by construction; drift between the
// two would silently mark every fresh brief stale or every stale brief fresh).
//
// THE RECIPE, EXACTLY: sort member_ids lexicographically (default Array.prototype.sort — string
// comparison, no locale/numeric collation), join with the empty string separator, md5 hex digest. Do not
// "improve" this (a different separator, a different sort, a different digest) without updating whatever
// wrote the stored member_hash — a recipe change here silently invalidates every existing brief.

import { createHash } from "node:crypto";

/**
 * Compute the member_hash for a theme's current membership.
 * @param {string[]} memberIds
 * @returns {string} md5 hex digest of the sorted, empty-joined member ids
 */
export function computeMemberHash(memberIds) {
  const ids = Array.isArray(memberIds) ? memberIds : [];
  const sorted = [...ids].sort();
  return createHash("md5").update(sorted.join("")).digest("hex");
}

/**
 * Is a stored brief stale against a theme's live membership?
 * @param {string} storedHash - theme_briefs.member_hash, as persisted at generation time
 * @param {string[]} memberIds - the theme's CURRENT member_ids (connection_themes, live read)
 * @returns {boolean} true when membership has drifted since the brief was generated
 */
export function isBriefStale(storedHash, memberIds) {
  return computeMemberHash(memberIds) !== storedHash;
}
