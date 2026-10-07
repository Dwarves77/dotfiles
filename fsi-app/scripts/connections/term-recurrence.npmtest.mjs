// term-recurrence.npmtest.mjs (lane G5-TERMS): proves the REAL wiring of the collector resolves, which the
// plain test cannot (it injects every dep). npm-deps lane: trust.ts is only importable through jiti.
// No database: buildDeps() builds closures; nothing is read or written here except the one fake-client pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeps } from "./term-recurrence.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

test("the adoption threshold the collector uses IS trust.ts CITATION_FREQUENCY_PROMOTION_THRESHOLD", async () => {
  const trust = await jiti.import("../../src/lib/trust.ts");
  const deps = await buildDeps();
  assert.equal(deps.minItems, trust.Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD);
  assert.equal(deps.minItems, 3);
});

test("the held scenario glossary is derive-tags.mjs's own extraction of the system prompt, and the writers are wired", async () => {
  const { SCENARIO_TAG_VALUES } = await import("../../src/lib/connections/derive-tags.mjs");
  const deps = await buildDeps();
  assert.equal(deps.heldScenarioTags.size, new Set(SCENARIO_TAG_VALUES).size);
  assert.ok(deps.heldScenarioTags.size > 0);
  for (const fn of [deps.readItems, deps.readEntityLinkFlags, deps.readTerms, deps.readMentions, deps.countTermsByStatus, deps.writers.insertTerms, deps.writers.updateTerm, deps.writers.insertMentions]) {
    assert.equal(typeof fn, "function");
  }
});

test("apply through the REAL writers (guarded db helpers) on a fake write client: terms inserted, an existing term updated, mentions inserted", async () => {
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { __setWriteClientForTest } = await import("../lib/db.mjs");
  const { main } = await import("./term-recurrence.mjs");
  process.env.DISCIPLINE_SNAP_DIR = join(tmpdir(), "term-recurrence-npmtest-snapshots");
  const calls = [];
  const client = {
    from(table) {
      const st = { table, verb: "select", ops: [] };
      const settle = () => {
        calls.push({ table, verb: st.verb, ops: st.ops.slice() });
        if (st.verb === "insert") {
          const rows = st.ops.find((o) => o[0] === "insert")[1];
          return Promise.resolve({ data: rows.map((r, i) => ({ id: `new-${i}`, ...r })), error: null });
        }
        if (st.verb === "update") return Promise.resolve({ data: [{ id: "t-old" }], error: null });
        return Promise.resolve({ data: [{ id: "t-old" }], error: null });
      };
      const b = {
        select() { return b; },
        insert(r) { st.verb = "insert"; st.ops.push(["insert", r]); return b; },
        update(p) { st.verb = "update"; st.ops.push(["update", p]); return b; },
        eq(c, v) { st.ops.push([ "eq", c, v ]); return b; },
        in(c, v) { st.ops.push(["in", c, v]); return b; },
        then(res, rej) { return settle().then(res, rej); },
      };
      return b;
    },
  };
  __setWriteClientForTest(() => client);
  try {
    const real = await buildDeps();
    const NOW = "2026-10-06T00:00:00.000Z";
    const fixtureDeps = {
      ...real,
      now: () => NOW,
      readItems: async () => [
        { id: "i1", source_id: "s1", theme_candidate: "transport", operational_scenario_tags: [], compliance_object_candidates: [] },
        { id: "i2", source_id: "s2", theme_candidate: "transport", operational_scenario_tags: [], compliance_object_candidates: [] },
        { id: "i3", source_id: "s2", theme_candidate: "transport", operational_scenario_tags: [], compliance_object_candidates: [] },
        { id: "i4", source_id: "s1", theme_candidate: null, operational_scenario_tags: ["reefer-berth"], compliance_object_candidates: [] },
      ],
      readEntityLinkFlags: async () => [],
      readTerms: async () => [
        { id: "t-old", kind: "scenario", term_key: "reefer-berth", label: "reefer-berth", status: "proposed", distinct_items: 0, distinct_sources: 0, first_seen_at: NOW, last_seen_at: NOW, adopted_at: null, adoption_rule: null, evidence: {} },
      ],
      readMentions: async () => [],
      countTermsByStatus: async () => ({ proposed: 1, adopted: 1, retired: 0 }),
    };
    const s = await main({ mode: "apply" }, fixtureDeps);
    assert.equal(s.exitCode, 0);
    assert.deepEqual(s.wrote, { terms_inserted: 1, terms_updated: 1, mentions_inserted: 4 });
    const termInsert = calls.find((c) => c.table === "vocabulary_terms" && c.verb === "insert");
    assert.equal(termInsert.ops.find((o) => o[0] === "insert")[1][0].term_key, "transport");
    assert.equal(termInsert.ops.find((o) => o[0] === "insert")[1][0].status, "adopted");
    const upd = calls.find((c) => c.table === "vocabulary_terms" && c.verb === "update");
    assert.ok(upd, "the existing term was updated through guardedUpdateByIds");
    assert.ok(!("label" in upd.ops.find((o) => o[0] === "update")[1]));
    assert.ok(calls.some((c) => c.table === "vocabulary_mentions" && c.verb === "insert"));
  } finally {
    __setWriteClientForTest(null);
  }
});
