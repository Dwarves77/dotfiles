// corroboration.mjs — corroboration counter by distinct organisations (spec 05 §4 gate 2, required
// component 5). PURE. "Corroboration counts distinct organisations, not post count" (spec 05 §6
// acceptance criterion 7) — five replies from one organisation are ONE corroborating voice, not five.

/**
 * @param {{
 *   posts?: Array<{ organisationKey?: string|null, stance?: "agree"|"disagree"|"neutral"|null }>
 * }} thread
 * @returns {{
 *   organisations: number,
 *   posts: number,
 *   consistent: boolean,
 *   byOrganisation: Record<string, number>,
 *   dominantShare: number,
 * }}
 */
export function corroborationCount(thread) {
  const rows = (thread?.posts ?? []).filter((p) => p && p.organisationKey && p.stance !== "disagree");
  const byOrganisation = {};
  for (const row of rows) {
    byOrganisation[row.organisationKey] = (byOrganisation[row.organisationKey] ?? 0) + 1;
  }
  const organisations = Object.keys(byOrganisation).length;
  const posts = rows.length;

  // "no organisation above 25% of respondents" (spec 05 §4 gate 2) — the largest single organisation's
  // share of the counted (non-disagreeing) posts.
  const dominantShare = posts === 0 ? 0 : Math.max(...Object.values(byOrganisation)) / posts;

  // Gate-2 threshold, computed here as an informational flag (the promotion state machine decides
  // whether to ACT on it — see promotion.mjs): >= 3 distinct organisations, no organisation > 25% of
  // respondents, and no explicit disagreement present in the counted set (disagreeing replies are
  // already excluded above, so "consistent" here also requires there to BE something to be consistent
  // about).
  const hasDisagreement = (thread?.posts ?? []).some((p) => p?.stance === "disagree");
  const consistent = organisations >= 3 && dominantShare <= 0.25 && !hasDisagreement;

  return { organisations, posts, consistent, byOrganisation, dominantShare };
}
