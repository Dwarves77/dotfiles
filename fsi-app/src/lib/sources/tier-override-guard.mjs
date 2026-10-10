// tier-override-guard.mjs: the ONE statement-level guard every automatic writer of a sources tier carries
// (lane G7-TIER, 2026-10-05). Operator ruling: the admin can edit tiers when needed, never by default;
// automatic writers respect an admin override. Customer tier rule: tier_override, else effective_tier,
// else base_tier.
//
// Why the guard lives IN the UPDATE and not only in the decision: every writer decides from a row it read
// earlier. An admin override set between that read and the write would be written over by a decision made
// on stale data (a check-then-write race). `tier_override IS NULL` on the UPDATE statement itself makes the
// database refuse the write for any row that is overridden at write time. Zero matched rows is the signal
// that the row was overridden, so the writer counts a skip and records no audit event for a move that did
// not happen.
//
// Pure module: query builders and clients are passed in; nothing here reaches a database by itself.

/** The column an admin sets to pin a source's tier. */
const TIER_OVERRIDE_COLUMN = "tier_override";

/**
 * Adds the override guard to a PostgREST query builder (supabase-js, or db.mjs's applyMatch builder).
 * @param {any} qb
 * @returns {any}
 */
export function notUnderTierOverride(qb) {
  return qb.is(TIER_OVERRIDE_COLUMN, null);
}

/**
 * Wraps a db.mjs `applyMatch` function so the override guard is applied after the caller's own filter.
 * @param {((qb: any) => any) | null | undefined} applyMatch
 * @returns {(qb: any) => any}
 */
export function withTierOverrideGuard(applyMatch) {
  return (qb) => notUnderTierOverride(applyMatch ? applyMatch(qb) : qb);
}

/**
 * Writes `sources.effective_tier` for one source through a supabase-js client, with the override guard in
 * the statement. `written` is false when the row matched nothing, which for this statement means the row
 * is under an admin override at write time (or was removed).
 * @param {{ from: (table: string) => any }} client
 * @param {string} sourceId
 * @param {number} tier
 * @returns {Promise<{ written: boolean, error: { message: string } | null }>}
 */
export async function writeEffectiveTierUnlessOverridden(client, sourceId, tier) {
  const { data, error } = await notUnderTierOverride(
    client.from("sources").update({ effective_tier: tier }).eq("id", sourceId)
  ).select("id");
  if (error) return { written: false, error };
  return { written: Array.isArray(data) && data.length > 0, error: null };
}
