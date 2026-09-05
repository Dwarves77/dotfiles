// Run: node --test scripts/maintenance/tier-opinions.test.mjs — no live DB, no network. Injected
// deps (readSources, supabase — a fake MinimalSupabaseClient) per the DI/DRY-by-default pattern.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, planTierOpinions, CITE } from "./tier-opinions.mjs";

// A real, class-recognized host at a real class tier (SC-13: legal hosts -> tier 1) — see
// src/lib/sources/host-authority.ts's own LEGAL_HOSTS / classTierForHost for the live rule this
// mirrors; picking a host that rule actually recognizes keeps this test honest to real behavior.
const LEGAL_HOST_URL = "https://eur-lex.europa.eu/legal-content/some-notice";
const UNRECOGNIZED_HOST_URL = "https://some-random-blog.example/post";

test("planTierOpinions: a recognized host whose class tier DISAGREES with base_tier -> one plan row", () => {
  const plan = planTierOpinions([{ id: "s1", url: LEGAL_HOST_URL, base_tier: 5 }]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].source_id, "s1");
  assert.equal(plan[0].current_tier, 5);
  assert.equal(plan[0].class_tier, 1);
});

test("planTierOpinions: a recognized host whose class tier AGREES with base_tier -> no plan row", () => {
  const plan = planTierOpinions([{ id: "s1", url: LEGAL_HOST_URL, base_tier: 1 }]);
  assert.deepEqual(plan, []);
});

test("planTierOpinions: an unrecognized host -> never guessed, no plan row", () => {
  const plan = planTierOpinions([{ id: "s1", url: UNRECOGNIZED_HOST_URL, base_tier: 5 }]);
  assert.deepEqual(plan, []);
});

test("planTierOpinions: a source with no url, or an unparseable url, is skipped without throwing", () => {
  assert.deepEqual(planTierOpinions([{ id: "s1", url: null, base_tier: 5 }]), []);
  assert.deepEqual(planTierOpinions([{ id: "s1", url: "not a url", base_tier: 5 }]), []);
  assert.deepEqual(planTierOpinions([]), []);
  assert.deepEqual(planTierOpinions(undefined), []);
});

test("planTierOpinions: multiple sources — only the disagreeing ones appear, order preserved", () => {
  const plan = planTierOpinions([
    { id: "agree", url: LEGAL_HOST_URL, base_tier: 1 },
    { id: "disagree-1", url: LEGAL_HOST_URL, base_tier: 3 },
    { id: "unrecognized", url: UNRECOGNIZED_HOST_URL, base_tier: 9 },
    { id: "disagree-2", url: LEGAL_HOST_URL, base_tier: 7 },
  ]);
  assert.deepEqual(plan.map((p) => p.source_id), ["disagree-1", "disagree-2"]);
});

function fakeSupabase(resultForRow = () => ({ error: null })) {
  const inserted = [];
  return {
    inserted,
    client: {
      from(table) {
        return {
          insert(row) {
            inserted.push({ table, row });
            return Promise.resolve(resultForRow(row));
          },
        };
      },
    },
  };
}

test("dry: computes the plan, writes nothing, exits 0", async () => {
  const { client, inserted } = fakeSupabase();
  const r = await main(
    { mode: "dry" },
    { readSources: async () => [{ id: "s1", url: LEGAL_HOST_URL, base_tier: 5 }], supabase: client },
  );
  assert.equal(r.step, "tier-opinions");
  assert.equal(r.counts.sources_scanned, 1);
  assert.equal(r.counts.disagreements, 1);
  assert.equal(r.applied, 0);
  assert.deepEqual(r.read_back, {});
  assert.equal(r.exitCode, 0);
  assert.equal(inserted.length, 0, "dry mode must never call insert");
});

test("dry: no disagreements -> empty plan, zero writes", async () => {
  const { client, inserted } = fakeSupabase();
  const r = await main(
    { mode: "dry" },
    { readSources: async () => [{ id: "s1", url: LEGAL_HOST_URL, base_tier: 1 }], supabase: client },
  );
  assert.equal(r.counts.disagreements, 0);
  assert.equal(inserted.length, 0);
});

test("apply: writes one opinion per disagreement via recordTierOpinion, stamped opinion_source='host_class_table'", async () => {
  const { client, inserted } = fakeSupabase();
  const r = await main(
    { mode: "apply" },
    {
      readSources: async () => [
        { id: "s1", url: LEGAL_HOST_URL, base_tier: 5 },
        { id: "s2", url: LEGAL_HOST_URL, base_tier: 1 }, // agrees — no write
      ],
      supabase: client,
    },
  );
  assert.equal(r.applied, 1);
  assert.equal(r.exitCode, 0);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, "source_tier_opinions");
  assert.deepEqual(inserted[0].row, {
    target_source_id: "s1",
    opined_tier: 1,
    opinion_source: "host_class_table",
    opining_source_id: null,
    intelligence_item_id: null,
  });
  assert.equal(r.read_back.opinions_written, 1);
  assert.equal(r.read_back.opinions_attempted, 1);
});

test("apply: a re-dispatch over the SAME still-disagreeing source writes AGAIN — repeat evidence, not suppressed", async () => {
  const { client, inserted } = fakeSupabase();
  const deps = { readSources: async () => [{ id: "s1", url: LEGAL_HOST_URL, base_tier: 5 }], supabase: client };
  const r1 = await main({ mode: "apply" }, deps);
  const r2 = await main({ mode: "apply" }, deps);
  assert.equal(r1.applied, 1);
  assert.equal(r2.applied, 1);
  assert.equal(inserted.length, 2, "source_tier_opinions is append-only by design — two independent observations");
});

test("apply: an insert failure is surfaced (exitCode 1, ok:false in read_back.results), never silently dropped", async () => {
  const { client } = fakeSupabase(() => ({ error: { message: "boom", details: null, hint: null, code: "500" } }));
  const r = await main(
    { mode: "apply" },
    { readSources: async () => [{ id: "s1", url: LEGAL_HOST_URL, base_tier: 5 }], supabase: client },
  );
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 1);
  assert.equal(r.read_back.results[0].ok, false);
  assert.match(r.read_back.results[0].error, /boom/);
});

test("CITE names the governing skill and reason, never invented at call time", () => {
  assert.equal(typeof CITE.skill, "string");
  assert.match(CITE.reason, /host_class_table/);
});
