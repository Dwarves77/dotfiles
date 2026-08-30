// Research-surface DB candidate prefilter (WO-15, 2026-08-30).
//
// WHY THIS FILE EXISTS. fetchResearchPipelineRows (src/lib/supabase-server.ts) used to admit rows to
// /research with a single hardcoded `.eq("item_type", "research_finding")` — narrower than surfaceOf()
// (src/lib/surface-of.mjs), the platform's one SoT for "which surface does this row belong to." Live
// count, 2026-08-30 (project kwrsbpiseruzbfwjpvsp): surfaceOf() admits 38 verified+non-archived rows to
// 'research' (matches get_surface_counts('research').total_items exactly); the old hardcoded filter
// admitted only 31 — a 7-item, customer-visible undercount (masthead read the RPC's 38, the rendered
// list read the hardcoded 31).
//
// THE FIX'S SHAPE. surfaceOf(item_type, domain) is the only admission authority — this module does NOT
// re-derive or restate its rule set (that duplication is exactly how the 31-vs-38 drift was created:
// see the comment this replaces at supabase-server.ts, "routing contract... was wrong-surface-leaking").
// surfaceOf() cannot run inside a PostgREST filter, so the query still needs a DB-side prefilter to keep
// the fetch narrow; `isResearchCandidate` is that prefilter, expressed as a plain predicate AND as the
// equivalent `.or()` expression string PostgREST accepts. It is deliberately looser than surfaceOf's
// 'research' answer (a candidate SUPERSET) — the actual admission decision is made by calling the real
// surfaceOf() against every fetched candidate row afterward (supabase-server.ts), never by this module.
//
// THE INVARIANT THIS FILE'S TEST GUARDS (src/__tests__/research-surface-candidate.test.mjs): for every
// (item_type, domain) pair SURFACE_RULES can produce, `surfaceOf(t, d) === 'research'` implies
// `isResearchCandidate(t, d)`. If a future SURFACE_RULES edit ever makes some other (item_type, domain)
// combination resolve to 'research' without domain=7 or item_type='research_finding', that test goes red
// BEFORE the DB-side prefilter silently drops the new case — the same defect class this WO fixes,
// caught before it reaches production instead of after.
//
// PLAIN ESM, ZERO DEPENDENCIES — same constraint as surface-of.mjs, so the drift/discipline test suite
// (no tsc, no bundler) can import this directly.

/**
 * The PostgREST `.or()` expression for the /research pipeline's DB-side candidate prefilter. Matches
 * every row surfaceOf() could ever admit to 'research' under the CURRENT SURFACE_RULES research rules
 * (`{ domainIn: [7] }` and the `{ itemTypeIn: ["research_finding"] }` fallback) — plus a small number of
 * rows surfaceOf() will reject (e.g. domain=7 rows whose item_type is in the regulation set, which wins
 * on precedence). Callers MUST still filter the fetched rows through the real `surfaceOf()` — this
 * expression only bounds the query, it does not decide admission.
 */
export const RESEARCH_CANDIDATE_OR = "domain.eq.7,item_type.eq.research_finding";

/**
 * JS-side mirror of RESEARCH_CANDIDATE_OR, for the drift test and for any caller that already has rows
 * in hand (no round trip). Kept byte-for-byte in sync with RESEARCH_CANDIDATE_OR by the test.
 * @param {string | null | undefined} itemType
 * @param {number | null | undefined} domain
 * @returns {boolean}
 */
export function isResearchCandidate(itemType, domain) {
  const d = typeof domain === "number" ? domain : null;
  return d === 7 || itemType === "research_finding";
}
