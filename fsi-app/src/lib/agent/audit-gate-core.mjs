// Pure cores for the Layer B cross-item audit gate — DEPENDENCY-FREE .mjs so the no-npm-ci discipline
// test job can unit-test them WITHOUT jiti / .ts loading (the same reason scripts/lib/db.mjs is importable
// without node_modules). The typed wrappers + DB readers live in audit-gate.ts, which binds the real
// institution.ts host helpers + resolver to these via dependency injection. NO logic lives only here that
// isn't exercised through audit-gate.ts.

/** A data-audit block is dispositioned (allowed to proceed) only by an explicit, non-expired dated waiver.
 *  Time alone never clears red. Pure. */
export function hasValidWaiver(block, now) {
  if (!block) return false;
  const acts = Array.isArray(block.recommended_actions) ? block.recommended_actions : [];
  for (const a of acts) {
    if (a && a.action === "waiver" && a.until) {
      const d = new Date(a.until);
      if (!Number.isNaN(d.getTime()) && d.getTime() >= now.getTime()) return true;
    }
  }
  return false;
}

/** Global one-tier-per-host violation count (mirror of one-tier-per-host-audit). deps: { hostOf,
 *  hostInstitution }. tier_override rows are exempt (deliberate per-row flag). */
export function hostTierViolationCount(sources, { hostOf, hostInstitution }) {
  const byInst = new Map();
  for (const s of sources) {
    if (s.tier_override != null) continue;
    const k = hostInstitution(hostOf(s.url));
    if (!k) continue;
    if (!byInst.has(k)) byInst.set(k, new Set());
    byInst.get(k).add(s.base_tier ?? null);
  }
  let v = 0;
  for (const tiers of byInst.values()) if (tiers.size > 1) v++;
  return v;
}

/** Item-scoped unregistered-span + claims-tier scoring (mirror of unregistered-span-host-audit +
 *  claims-tier-audit). deps: { hostOf }. resolver.resolveSpan(url) -> { tier }. searchUrlById maps a
 *  claim's search_result_id -> agent_run_searches.result_url. Pure. */
export function scoreItemClaims(claims, searchUrlById, resolver, { hostOf }) {
  let unregisteredSpanFacts = 0;
  let claimsTierMismatches = 0;
  const sample = [];
  for (const c of claims) {
    const stored = c.source_tier_at_grounding ?? null;
    if (c.claim_kind === "FACT") {
      const url = c.search_result_id ? searchUrlById.get(c.search_result_id) ?? null : null;
      const expected = url ? resolver.resolveSpan(url).tier : null;
      if (c.search_result_id && expected == null) {
        unregisteredSpanFacts++;
        if (sample.length < 8) sample.push(`unregistered-span FACT ${String(c.id).slice(0, 8)} host=${hostOf(url || "")}`);
      }
      if (stored !== expected) {
        claimsTierMismatches++;
        if (sample.length < 8) sample.push(`claims-tier FACT ${String(c.id).slice(0, 8)} stored=${stored} expected=${expected ?? "NULL"}`);
      }
    } else if (stored !== null) {
      claimsTierMismatches++;
      if (sample.length < 8) sample.push(`claims-tier ${c.claim_kind} ${String(c.id).slice(0, 8)} stored=${stored} expected=NULL`);
    }
  }
  return { unregisteredSpanFacts, claimsTierMismatches, sample };
}
