// @ts-check
// TIER-OPINION DOUBLE-INVOCATION FIX (S2, tier-opinion chain root-cause pass).
//
// The canonical workflow (src/workflows/generate-brief.ts) calls registerCitedSources TWICE per
// generation for the SAME "New Sources Identified" list parsed from the SAME full_brief:
//   1. registerBriefSources (the "register" step, ALWAYS runs, right after generate) calls
//      registerCitedSources(sb, cited) directly.
//   2. growSources (the "grow" step, runs on every path that reaches grounding success) calls
//      growSourcesFromBrief, which re-parses the SAME full_brief and calls registerCitedSources
//      again internally — to re-resolve each citation's source_id for building citation edges.
//
// Before this fix, every citation matching a PRE-EXISTING source recorded TWO rows in
// source_tier_opinions per single brief generation (double-counting toward
// get_tier_opinion_disagreements' >=5-opinion disagreement threshold), and a citation whose
// source was FRESHLY MINTED by step 1 recorded a spurious opinion in step 2 too, because by then
// that source already "exists" (the existing-vs-new_source branch can no longer tell
// newly-minted-this-pass apart from genuinely pre-existing).
//
// The fix: registerCitedSources takes an opts.skipTierOpinions flag; growSourcesFromBrief's
// internal re-registration call passes it, since the FIRST call (registerBriefSources) is the
// only one that can correctly distinguish "existed before this pass" from "minted this pass",
// and already recorded the opinion there.
//
// jiti imports the TS module (@/ alias resolution) — same portability class as
// source-growth.selftest.mjs / mint-idempotency.npmtest.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { registerCitedSources } = await jiti.import("./source-growth.ts");

const EXISTING_SOURCE_ID = "11111111-1111-1111-1111-111111111111";

// Minimal fake client covering exactly the two tables registerCitedSources' EXISTING branch
// touches: `sources` (the ilike-lookup, always a hit here) and `source_tier_opinions` (the
// opinion insert). Any other table reached would be a test-authoring bug, not a code path this
// fix touches — fail loud rather than silently returning empty data.
function fakeClient() {
  const tierOpinionInserts = [];
  return {
    tierOpinionInserts,
    from(table) {
      if (table === "sources") {
        return {
          select() { return this; },
          ilike() { return this; },
          limit: () => Promise.resolve({ data: [{ id: EXISTING_SOURCE_ID }], error: null }),
        };
      }
      if (table === "source_tier_opinions") {
        return {
          insert(row) {
            tierOpinionInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`fakeClient: unexpected table "${table}" — this test only models the EXISTING-source branch`);
    },
  };
}

const CITED = [{ name: "Example Regulator", url: "https://example-regulator.gov/notice", tier_estimate: 3 }];

test("registerCitedSources: existing-source citation with a tier_estimate records exactly ONE opinion (baseline, opts omitted)", async () => {
  const sb = fakeClient();
  const out = await registerCitedSources(sb, CITED);
  assert.equal(out.length, 1);
  assert.equal(out[0].registered, "existing");
  assert.equal(out[0].source_id, EXISTING_SOURCE_ID);
  assert.equal(sb.tierOpinionInserts.length, 1, "one citation, one opinion row");
  assert.equal(sb.tierOpinionInserts[0].target_source_id, EXISTING_SOURCE_ID);
  assert.equal(sb.tierOpinionInserts[0].opined_tier, 3);
});

test("registerCitedSources: opts.skipTierOpinions=true still resolves the existing source_id but records NO opinion", async () => {
  const sb = fakeClient();
  const out = await registerCitedSources(sb, CITED, { skipTierOpinions: true });
  assert.equal(out[0].registered, "existing");
  assert.equal(out[0].source_id, EXISTING_SOURCE_ID, "resolution for citation-edge building still works");
  assert.equal(sb.tierOpinionInserts.length, 0, "skipTierOpinions suppresses the insert entirely");
});

test("THE DEFECT, reproduced and closed: the canonical workflow's register-then-grow double-call now records ONE opinion, not two", async () => {
  // Simulates the real two-call sequence generate-brief.ts performs on one generation cycle: the
  // register step calls registerCitedSources with default opts (records); growSourcesFromBrief's
  // internal re-registration now passes skipTierOpinions: true (does not record again). Same
  // client instance across both calls, same `cited` list parsed from the same full_brief, exactly
  // as the live workflow does (both steps re-parse the same intelligence_items.full_brief).
  const sb = fakeClient();

  const registerStepResult = await registerCitedSources(sb, CITED); // registerBriefSources
  const growStepResult = await registerCitedSources(sb, CITED, { skipTierOpinions: true }); // growSourcesFromBrief's internal call

  assert.equal(registerStepResult[0].source_id, EXISTING_SOURCE_ID);
  assert.equal(growStepResult[0].source_id, EXISTING_SOURCE_ID, "grow step still resolves the id it needs for citation edges");
  assert.equal(
    sb.tierOpinionInserts.length,
    1,
    "PRE-FIX this was 2 (one per call) — the exact double-count that would inflate get_tier_opinion_disagreements' >=5 threshold from a single brief"
  );
});

test("PROOF BY ATTACK: omitting skipTierOpinions on the second call reproduces the pre-fix double-count", async () => {
  // Demonstrates the defect class is real, not hypothetical: a caller that forgets the flag (or a
  // future third call site) silently double-records. This is why the fix lives at the call site
  // that KNOWS it is redundant (growSourcesFromBrief), not as a DB-level dedup — the flag must be
  // threaded deliberately.
  const sb = fakeClient();
  await registerCitedSources(sb, CITED);
  await registerCitedSources(sb, CITED); // opts omitted — the bug, reproduced on purpose
  assert.equal(sb.tierOpinionInserts.length, 2, "confirms the double-count is a real, reachable outcome without the flag");
});

test("registerCitedSources: no tier_estimate on the citation records no opinion regardless of opts", async () => {
  const sb = fakeClient();
  await registerCitedSources(sb, [{ name: "No Estimate", url: "https://example-regulator.gov/other" }]);
  assert.equal(sb.tierOpinionInserts.length, 0);
});
