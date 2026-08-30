// research-surface-candidate.test.mjs — WO-15's drift guard for the /research pipeline's DB prefilter.
//
// fetchResearchPipelineRows (src/lib/supabase-server.ts) fetches a DB-side candidate superset via
// RESEARCH_CANDIDATE_OR (src/lib/research/surface-candidate.mjs), then admits only rows for which the
// real surfaceOf() (src/lib/surface-of.mjs) says 'research' — surfaceOf is the sole admission authority,
// never re-derived. This test locks the one invariant that makes that two-step split SAFE: the candidate
// prefilter must be a SUPERSET of everything surfaceOf() would ever call 'research', exhaustively, over
// every (item_type, domain) pair SURFACE_RULES can produce. If a future SURFACE_RULES edit adds a way to
// reach 'research' that isn't domain=7 or item_type='research_finding', this test goes red BEFORE the DB
// query silently drops the new case in production — the same undercount class WO-15 fixed (31 vs 38,
// live-verified 2026-08-30 against project kwrsbpiseruzbfwjpvsp), caught here instead of on the masthead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SURFACE_RULES, surfaceOf } from "../lib/surface-of.mjs";
import { RESEARCH_CANDIDATE_OR, isResearchCandidate } from "../lib/research/surface-candidate.mjs";

// Every item_type and domain value SURFACE_RULES itself names, plus a few values it does not (null,
// an out-of-range domain, an unrelated item_type) so the exhaustive check below also covers rows the
// rule set was never written for.
const ALL_ITEM_TYPES = [
  ...new Set(SURFACE_RULES.flatMap((r) => r.itemTypeIn ?? [])),
  null,
  "mystery_type",
];
const ALL_DOMAINS = [
  ...new Set(SURFACE_RULES.flatMap((r) => r.domainIn ?? [])),
  null,
  5, // a domain value no rule names (legacy/unclassified per surface-of.mjs's own precedence comment)
];

test("RESEARCH_CANDIDATE_OR is the literal isResearchCandidate predicate, not a second hand-typed copy", () => {
  assert.equal(RESEARCH_CANDIDATE_OR, "domain.eq.7,item_type.eq.research_finding");
  // Cross-check the two representations agree at their own boundary values.
  assert.equal(isResearchCandidate("research_finding", null), true);
  assert.equal(isResearchCandidate(null, 7), true);
  assert.equal(isResearchCandidate("framework", 7), true, "candidate net is a SUPERSET — framework/domain=7 is filtered out later by surfaceOf, not here");
  assert.equal(isResearchCandidate("market_signal", 2), false);
});

test("every (item_type, domain) surfaceOf admits to 'research' is caught by isResearchCandidate — exhaustive over SURFACE_RULES' own vocabulary", () => {
  const missed = [];
  for (const t of ALL_ITEM_TYPES) {
    for (const d of ALL_DOMAINS) {
      if (surfaceOf(t, d) === "research" && !isResearchCandidate(t, d)) {
        missed.push({ itemType: t, domain: d });
      }
    }
  }
  assert.deepEqual(
    missed,
    [],
    `isResearchCandidate would silently drop rows surfaceOf() classifies 'research': ${JSON.stringify(missed)} — update RESEARCH_CANDIDATE_OR + isResearchCandidate together, never widen only one`
  );
});

test("live-verified shape (2026-08-30): the 4 non-research_finding domain=7 item_types split exactly as WO-15 found", () => {
  // initiative + market_signal: admitted (WO-15's 7-item undercount). framework: correctly excluded —
  // the regulation-itemType rule outranks the domain=7 rule in SURFACE_RULES' precedence order.
  assert.equal(surfaceOf("initiative", 7), "research");
  assert.equal(surfaceOf("market_signal", 7), "research");
  assert.equal(surfaceOf("framework", 7), "regulations");
  assert.equal(surfaceOf("research_finding", 7), "research");
});
