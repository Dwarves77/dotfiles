// src/lib/sources/cited-host-gate.mjs
//
// CITED-HOST GATE (P3c / S1-07, chrome-audit 2026-07). The ground step auto-stubbed EVERY URL the
// model wrote — the New-Sources table (`canonical:cited-source`) and every URL cited in section
// prose (`canonical:cited-url`) — into agent_run_searches, which criterion-2 (citation-URL
// grounding) then accepts by exact-URL match. That made criterion-2 CIRCULAR: the model's own
// output licensed itself, and a hallucinated URL would self-ground. Probe 2026-07-07: 38 of 309
// stub rows across 23 items sat on hosts absent from BOTH the item's fetched pool AND the source
// registry (all turned out to be real institutional URLs — the design intent was right, but
// nothing VERIFIED that before they became load-bearing).
//
// The rule (dispatch anchor, 2026-07-07): auto-stubbing widens which citations the gate ACCEPTS,
// so it may only draw on what the system already KNOWS — the item's REAL fetched pool (content
// >200ch; stubs excluded) and the source registry. A citation on a novel host is NOT stubbed; it
// is FLAGGED (integrity_flags, never silent) and criterion-2 then fails it honestly — quarantine +
// research-or-erase (register the host, re-ground) instead of silent self-grounding. Same shape as
// roadblock alternative-search: widen what you TRY, never what QUALIFIES.
//
// Matching is at BOTH exact-host and institution level (hostInstitution eTLD+1 keying — the same
// key the tier resolver uses): clearinghouse.fmcsa.dot.gov is known when the fmcsa.dot.gov
// institution is registered, so vetted-institution subdomains don't false-flag, while a wholly
// unknown institution always does. Unparseable URLs (empty host) are NOVEL — fail closed.
//
// PURE — no I/O. The caller resolves host/institution via the canonical helpers in
// institution.ts (single home) and supplies the known sets.

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
