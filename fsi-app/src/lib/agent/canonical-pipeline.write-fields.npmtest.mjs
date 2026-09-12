// canonical-pipeline.write-fields.npmtest.mjs -- DATECHAIN/brieffields lane, 2026-09-11.
//
// Proves the write side of task 2.2 (brief-chain-build-plan-2026-09-11 Part 2): writeSynthesizedBrief
// (extracted from synthesiseAndWriteBrief's inline write block, same testability motive as
// harvestItemTimeline's own split -- see that module's own npmtest header) is still the ONE
// intelligence_items.update call, now carrying the six brief-contract exposure fields migration 316 /
// task 2.2 add to the regeneration contract: cost_mechanism, penalty_range, enforcement_body,
// requirement_trajectory (direct overwrite, same posture as trajectory_points / what_it_changes), and
// why_matters / key_data (COALESCE semantics like what_is_it -- only a non-null/non-empty emission
// patches the column, so a later regeneration that honestly found nothing new never blanks a value
// /api/admin/scan already wrote).
//
// This is an *.npmtest.mjs (not *.test.mjs) because canonical-pipeline.ts is only importable via jiti
// (its `@/` aliases are not portable to plain `node --test`) -- see timeline-harvest-unlock.npmtest.mjs's
// own header for the same constraint on this exact module.
//
// The proof is an injected fake Supabase client that RECORDS every .update() payload and every table
// touched, the same attack shape timeline-harvest-unlock.npmtest.mjs uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

// canonical-pipeline.ts calls createClient(...) at module scope only inside svc(), lazily (never at
// import time), so importing it here with no env vars set is safe as long as we always pass our own
// injected client and never let svc() run.
const { writeSynthesizedBrief } = await jiti.import("./canonical-pipeline.ts");

const ITEM = { id: "item-1", item_type: "regulation" };

/** A full, valid AgentMetadata fixture -- every field the interface declares, so writeSynthesizedBrief's
 *  unconditional reads (md.severity, md.topic_tags, ...) never hit undefined. `overrides` layers the six
 *  task 2.2 fields (and anything else a test wants to vary) on top. */
function baseMetadata(overrides = {}) {
  return {
    severity: "MONITORING",
    priority: "LOW",
    urgency_tier: "stable",
    format_type: "regulatory_fact_document",
    topic_tags: ["emissions"],
    signal_band: null,
    theme: null,
    trajectory_points: null,
    what_is_it: null,
    what_it_changes: null,
    does_not_resolve: null,
    conversion_trigger: null,
    cross_references: null,
    operational_scenario_tags: [],
    compliance_object_tags: [],
    related_items: [],
    intersection_summary: null,
    sources_used: [],
    last_regenerated_at: "2026-09-11T00:00:00Z",
    regeneration_skill_version: "2026-09-11",
    cost_mechanism: null,
    penalty_range: null,
    enforcement_body: null,
    requirement_trajectory: null,
    why_matters: null,
    key_data: [],
    ...overrides,
  };
}

/** Fake Supabase client: records every .from(table) call and every .update() payload. Answers only the
 *  exact queries writeSynthesizedBrief is documented to make (intelligence_items update, an optional
 *  intelligence_items select+in and item_cross_references upsert for the related_items edge write). Any
 *  other table touched is still recorded (so a test can assert on it) but throws -- proves which tables
 *  get called, not a full postgrest emulation (same shape as timeline-harvest-unlock.npmtest.mjs). */
function fakeClient() {
  const calls = { tables: [], updates: [], updateEqs: [] };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      if (table === "intelligence_items") {
        return {
          update: (payload) => {
            calls.updates.push(payload);
            return {
              eq: (col, val) => {
                calls.updateEqs.push({ col, val });
                return Promise.resolve({ error: null });
              },
            };
          },
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === "item_cross_references") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      return {
        select: () => { throw new Error(`unexpected read from ${table}`); },
        update: () => { throw new Error(`unexpected update on ${table}`); },
        insert: () => { throw new Error(`unexpected insert into ${table}`); },
        upsert: () => { throw new Error(`unexpected upsert on ${table}`); },
      };
    },
  };
}

test("writeSynthesizedBrief: all six task 2.2 fields land in the ONE intelligence_items.update payload", async () => {
  const sb = fakeClient();
  const md = baseMetadata({
    cost_mechanism: "Surcharge passed through on the carrier invoice.",
    penalty_range: "EUR 50 to EUR 100 per tonne CO2e",
    enforcement_body: "European Commission",
    requirement_trajectory: { steps: [{ date: "2025", value: "40%", label: "of verified emissions" }], note: "phase-in" },
    why_matters: "Raises procurement costs for ocean carriers ahead of the Q1 filing window.",
    key_data: ["Effective 2026-01-01", "Penalty EUR 100 per tonne"],
  });

  const result = await writeSynthesizedBrief(sb, ITEM, "x".repeat(650), md, null, 3);

  assert.equal(result.ok, true);
  // Exactly ONE update call -- the single write site, not a second write.
  assert.equal(sb.calls.updates.length, 1);
  const payload = sb.calls.updates[0];
  assert.equal(payload.cost_mechanism, "Surcharge passed through on the carrier invoice.");
  assert.equal(payload.penalty_range, "EUR 50 to EUR 100 per tonne CO2e");
  assert.equal(payload.enforcement_body, "European Commission");
  assert.deepEqual(payload.requirement_trajectory, {
    steps: [{ date: "2025", value: "40%", label: "of verified emissions" }],
    note: "phase-in",
  });
  assert.equal(payload.why_matters, "Raises procurement costs for ocean carriers ahead of the Q1 filing window.");
  assert.deepEqual(payload.key_data, ["Effective 2026-01-01", "Penalty EUR 100 per tonne"]);

  assert.equal(sb.calls.updateEqs.length, 1);
  assert.deepEqual(sb.calls.updateEqs[0], { col: "id", val: "item-1" });
});

test("writeSynthesizedBrief: cost_mechanism / penalty_range / enforcement_body / requirement_trajectory are DIRECT writes -- a null emission still lands as null (never omitted)", async () => {
  const sb = fakeClient();
  const md = baseMetadata(); // all four null in baseMetadata()

  await writeSynthesizedBrief(sb, ITEM, "x".repeat(650), md, null, 1);

  const payload = sb.calls.updates[0];
  assert.equal(payload.cost_mechanism, null);
  assert.equal(payload.penalty_range, null);
  assert.equal(payload.enforcement_body, null);
  assert.equal(payload.requirement_trajectory, null);
  // The keys are PRESENT (a direct overwrite), not merely absent-and-defaulted.
  assert.ok("cost_mechanism" in payload);
  assert.ok("penalty_range" in payload);
  assert.ok("enforcement_body" in payload);
  assert.ok("requirement_trajectory" in payload);
});

test("writeSynthesizedBrief: why_matters / key_data use COALESCE semantics like what_is_it -- a null/empty emission is OMITTED from the payload, never blanks a prior value", async () => {
  const sb = fakeClient();
  const md = baseMetadata({ why_matters: null, key_data: [] });

  await writeSynthesizedBrief(sb, ITEM, "x".repeat(650), md, null, 1);

  const payload = sb.calls.updates[0];
  assert.equal("why_matters" in payload, false, "a null why_matters emission must not appear in the update payload");
  assert.equal("key_data" in payload, false, "an empty key_data emission must not appear in the update payload");
});

test("writeSynthesizedBrief: a non-null why_matters and non-empty key_data DO patch the payload", async () => {
  const sb = fakeClient();
  const md = baseMetadata({
    why_matters: "Tightens the Q1 filing window for importers.",
    key_data: ["Phase-in begins 2026-01-01"],
  });

  await writeSynthesizedBrief(sb, ITEM, "x".repeat(650), md, null, 1);

  const payload = sb.calls.updates[0];
  assert.equal(payload.why_matters, "Tightens the Q1 filing window for importers.");
  assert.deepEqual(payload.key_data, ["Phase-in begins 2026-01-01"]);
});
