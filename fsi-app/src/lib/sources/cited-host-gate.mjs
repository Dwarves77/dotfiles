/**
 * Partition cited URLs by whether the system already knows their host.
 * @param {Array<{url: string, host: string, institution: string}>} cited
 *   host = hostOf(url), institution = hostInstitution(host) — resolved by the caller.
 * @param {Set<string>} knownHosts        exact hosts from the item's real pool + registry + item source_url
 * @param {Set<string>} knownInstitutions institution keys of the same URLs
 * @returns {{allowed: Array, novel: Array}} novel = neither host nor institution known (or host unparseable)
 */

export function partitionCitedByHost(cited, knownHosts, knownInstitutions) {
  const allowed = [];
  const novel = [];
  for (const c of cited || []) {
    const hostKnown = !!c.host && knownHosts.has(c.host);
    const instKnown = !!c.institution && knownInstitutions.has(c.institution);
    (hostKnown || instKnown ? allowed : novel).push(c);
  }
  return { allowed, novel };
}
