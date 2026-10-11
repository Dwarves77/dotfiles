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
