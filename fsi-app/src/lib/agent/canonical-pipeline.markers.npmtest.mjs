// canonical-pipeline.markers.npmtest.mjs (lane GATES-2, 2026-10-05). The write-path attack: a body carrying an
// internal marker (an unclosed Claim Provenance Ledger, the production shape) must be REFUSED by
// writeSynthesizedBrief before any database call; a clean body still persists through the one update.
//
// *.npmtest.mjs because canonical-pipeline.ts is only importable via jiti (same constraint and same fake
// client shape as canonical-pipeline.write-fields.npmtest.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { writeSynthesizedBrief } = await jiti.import("./canonical-pipeline.ts");

const ITEM = { id: "item-1", item_type: "market_signal" };

function md() {
  return {
    severity: "MONITORING", priority: "LOW", urgency_tier: "stable", format_type: "market_signal_brief",
    topic_tags: ["emissions"], signal_band: "price", theme: null, trajectory_points: null, what_is_it: null,
    what_it_changes: null, does_not_resolve: null, conversion_trigger: null, cross_references: null,
    operational_scenario_tags: [], compliance_object_tags: [], related_items: [], intersection_summary: null,
    sources_used: [], last_regenerated_at: "2026-10-05T00:00:00Z", regeneration_skill_version: "2026-09-11",
    cost_mechanism: null, penalty_range: null, enforcement_body: null, requirement_trajectory: null,
    why_matters: null, key_data: [],
  };
}

function fakeClient() {
  const calls = { tables: [], updates: [] };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      if (table === "intelligence_items") {
        return {
          update: (payload) => {
            calls.updates.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
          select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        };
      }
      if (table === "item_cross_references") return { upsert: () => Promise.resolve({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const CLEAN = "# 1 What is moving\n\nA price signal. Source: Example Regulator, 2026.\n".repeat(20);
const LEDGER_BODY =
  CLEAN +
  '\n<<<CLAIM_PROVENANCE_LEDGER\n[{"section":"1","claim_text":"A price signal","claim_kind":"FACT","source_span":"a price signal"}]';

test("ATTACK: a body carrying an unclosed claim ledger is refused and nothing is written", async () => {
  const sb = fakeClient();
  const result = await writeSynthesizedBrief(sb, ITEM, LEDGER_BODY, md(), null, 2);
  assert.equal(result.ok, false);
  assert.match(result.detail, /^internal_marker_in_body:/);
  assert.match(result.detail, /claim-ledger/);
  assert.equal(sb.calls.updates.length, 0, "no intelligence_items update may happen");
  assert.deepEqual(sb.calls.tables, [], "no table may be touched at all");
});

test("ATTACK: a forged body with only a JSON object literal is refused", async () => {
  const sb = fakeClient();
  const body = CLEAN + '\n{"claim_kind":"FACT","source_span":"verbatim span of the source text"}\n';
  const result = await writeSynthesizedBrief(sb, ITEM, body, md(), null, 2);
  assert.equal(result.ok, false);
  assert.match(result.detail, /json-object-literal/);
  assert.equal(sb.calls.updates.length, 0);
});

test("CLEAN: a body with no marker persists through the one update", async () => {
  const sb = fakeClient();
  const result = await writeSynthesizedBrief(sb, ITEM, CLEAN, md(), null, 2);
  assert.equal(result.ok, true);
  assert.equal(sb.calls.updates.length, 1);
  assert.equal(sb.calls.updates[0].full_brief, CLEAN);
});
