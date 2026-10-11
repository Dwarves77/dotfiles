import { createHash } from "node:crypto";
import { OVERLAP_THRESHOLD, overlapCoefficient } from "./theme-delta.mjs";

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

/**
 * Brief continuity (lane S3-C). A theme id is its smallest member id, so a membership change can move the
 * id and orphan the brief stored under the old one. This is the ONE lookup (used by the Research reader and
 * the theme-briefs export) for "which brief serves this theme":
 *   1. exact    - a brief stored under the theme's own id; stale when the member hash drifted.
 *   2. overlap  - no exact brief: the best prior brief whose stored member_ids overlap the live membership at
 *                 or above theme-delta's OVERLAP_THRESHOLD (same overlap coefficient). Ties go to the
 *                 smallest prior theme id.
 *   3. lineage  - a brief with no stored members (written before migration 351) that a theme-delta lineage
 *                 pair names as the prior of this theme.
 * An overlap or lineage match is ALWAYS stale: it describes a prior membership, never the current one, and
 * `supersedes_theme_id` names the prior theme so a re-brief can replace it. A brief that belongs to another
 * LIVE theme (its theme_id is in liveThemeIds) is never borrowed. PURE.
 * @param {{id:string, member_ids:string[]}} theme
 * @param {Array<{theme_id:string, member_hash:string, member_ids?:string[]|null}>} briefs
 * @param {{liveThemeIds?:Set<string>, lineage?:Array<{prior_id:string,new_id:string}>, overlapThreshold?:number}} [opts]
 * @returns {{brief:object|null, match:"exact"|"overlap"|"lineage"|null, stale:boolean, supersedes_theme_id:string|null}}
 */
export function resolveBriefForTheme(theme, briefs, opts = {}) {
  const none = { brief: null, match: null, stale: false, supersedes_theme_id: null };
  if (!theme || typeof theme.id !== "string") return none;
  const live = Array.isArray(theme.member_ids) ? theme.member_ids : [];
  const list = Array.isArray(briefs) ? briefs.filter((b) => b && typeof b.theme_id === "string") : [];
  const exact = list.find((b) => b.theme_id === theme.id);
  if (exact) return { brief: exact, match: "exact", stale: isBriefStale(exact.member_hash, live), supersedes_theme_id: null };

  const liveIds = opts.liveThemeIds instanceof Set ? opts.liveThemeIds : new Set();
  const threshold = typeof opts.overlapThreshold === "number" ? opts.overlapThreshold : OVERLAP_THRESHOLD;
  const lineageFor = new Set((Array.isArray(opts.lineage) ? opts.lineage : []).filter((p) => p && p.new_id === theme.id).map((p) => p.prior_id));
  let best = null;
  for (const b of list) {
    if (liveIds.has(b.theme_id)) continue;
    const hasMembers = Array.isArray(b.member_ids) && b.member_ids.length > 0;
    let cand = null;
    if (hasMembers) {
      const coef = overlapCoefficient(b.member_ids, live);
      if (coef >= threshold) cand = { b, coef, match: "overlap" };
    } else if (lineageFor.has(b.theme_id)) {
      cand = { b, coef: 0, match: "lineage" };
    }
    if (!cand) continue;
    if (!best || cand.coef > best.coef || (cand.coef === best.coef && cand.b.theme_id < best.b.theme_id)) best = cand;
  }
  if (!best) return none;
  return { brief: best.b, match: best.match, stale: true, supersedes_theme_id: best.b.theme_id };
}
