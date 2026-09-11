// Run: node --test scripts/maintenance/backfill-format-type.test.mjs -- no DB, no jiti, deps injected.
// PORTABILITY (glob-portability.test.mjs): this file imports ONLY node:test/node:assert and
// "./backfill-format-type.mjs" (relative) -- never jiti, never a .ts path. The real specForItemType
// (src/lib/agent/extract-registry.ts) is proven reachable through jiti by format-structure.mjs's own
// existing use of the identical module + alias shape; this file's FAKE_SPEC_FOR_ITEM_TYPE below mirrors
// that registry's live vocabulary (verified against src/lib/agent/formats/*.ts's itemTypes/formatType
// exports, 2026-09-11 [CONFIRMED]) so the orchestration (grouping, skip-not-guess, dry/apply, cite,
// applyMatch, read-back) is proven against the SAME shape the real resolver returns, without loading it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, planFormatTypeBackfill, parseBatchArgs } from "./backfill-format-type.mjs";

// Mirrors src/lib/agent/formats/{regulation,research,market,technology,operations}.ts exactly (12
// item_types, 5 formats) -- the live vocabulary the migration-004 CHECK constraint also enumerates.
const VOCAB = {
  regulation: "regulatory_fact_document",
  directive: "regulatory_fact_document",
  standard: "regulatory_fact_document",
  guidance: "regulatory_fact_document",
  framework: "regulatory_fact_document",
  technology: "technology_profile",
  innovation: "technology_profile",
  tool: "technology_profile",
  regional_data: "operations_profile",
  market_signal: "market_signal_brief",
  initiative: "market_signal_brief",
  research_finding: "research_summary",
};
function fakeSpecForItemType(itemType) {
  const formatType = VOCAB[itemType];
  return formatType ? { formatType } : null;
}

test("planFormatTypeBackfill: every item_type in the vocabulary maps to exactly the value specForItemType returns", () => {
  const rows = Object.keys(VOCAB).map((item_type, i) => ({ id: `id-${i}`, item_type }));
  const { byFormatType, skipped } = planFormatTypeBackfill(rows, fakeSpecForItemType);
  assert.equal(skipped.length, 0);
  for (const [id0Index, item_type] of Object.keys(VOCAB).entries()) {
    const id = `id-${id0Index}`;
    const expected = VOCAB[item_type];
    const group = byFormatType.get(expected) ?? [];
    assert.ok(group.includes(id), `${item_type} (${id}) should be grouped under ${expected}`);
  }
  // Every group's rows really did come from an item_type this exact formatType owns.
  let total = 0;
  for (const ids of byFormatType.values()) total += ids.length;
  assert.equal(total, rows.length);
});

test("planFormatTypeBackfill: unknown item_type is skipped and reported by id, never guessed", () => {
  const rows = [
    { id: "a1", item_type: "regulation" },
    { id: "z9", item_type: "law" }, // not in any FormatSpec's itemTypes -- must not be guessed into regulatory_fact_document
    { id: "z8", item_type: null },
    { id: "z7", item_type: "totally_bogus" },
  ];
  const { byFormatType, skipped } = planFormatTypeBackfill(rows, fakeSpecForItemType);
  assert.deepEqual(
    skipped.map((s) => s.id).sort(),
    ["z7", "z8", "z9"],
  );
  assert.deepEqual(byFormatType.get("regulatory_fact_document"), ["a1"]);
  // The skip records the item_type it could not resolve, not a guessed value.
  assert.equal(skipped.find((s) => s.id === "z9").item_type, "law");
});

test("parseBatchArgs: --limit and --after-id parsed; absent flags are undefined", () => {
  assert.deepEqual(parseBatchArgs([]), { limit: undefined, afterId: undefined });
  assert.deepEqual(parseBatchArgs(["--limit", "50"]), { limit: 50, afterId: undefined });
  assert.deepEqual(parseBatchArgs(["--after-id", "abc-123"]), { limit: undefined, afterId: "abc-123" });
  assert.deepEqual(parseBatchArgs(["--limit", "10", "--after-id", "xyz"]), { limit: 10, afterId: "xyz" });
  // Non-numeric / zero / negative --limit is treated as absent (never a silent NaN slice(0, NaN)).
  assert.deepEqual(parseBatchArgs(["--limit", "not-a-number"]), { limit: undefined, afterId: undefined });
  assert.deepEqual(parseBatchArgs(["--limit", "0"]), { limit: undefined, afterId: undefined });
});

const ROWS = [
  { id: "i1", item_type: "regulation", format_type: null },
  { id: "i2", item_type: "market_signal", format_type: null },
  { id: "i3", item_type: "initiative", format_type: null },
  { id: "i4", item_type: "bogus_type", format_type: null }, // unknown -- must be skipped, not guessed
];

function deps({ afterFilterIds } = {}) {
  const updateCalls = [];
  const classified = new Map(); // id -> format_type, mutated by guardedUpdateByIds
  return {
    updateCalls,
    readAll: async (table, cols, opts) => {
      assert.equal(table, "intelligence_items");
      const probe = { eqs: [], gt: null, not: null };
      const q = {
        eq: (c, v) => { probe.eqs.push([c, v]); return q; },
        is: (c, v) => { probe.is = [c, v]; return q; },
        gt: (c, v) => { probe.gt = [c, v]; return q; },
        not: (c, op, v) => { probe.not = [c, op, v]; return q; },
      };
      opts?.match?.(q);
      if (probe.not) {
        // post-apply read-back: format_type NOT NULL
        return [...classified.entries()].map(([id, format_type]) => ({ id, format_type }));
      }
      // plan read: format_type IS NULL, scoped to item_grade='brief' AND is_archived=false
      assert.deepEqual(probe.eqs, [["item_grade", "brief"], ["is_archived", false]]);
      assert.deepEqual(probe.is, ["format_type", null]);
      let scoped = ROWS.filter((r) => !classified.has(r.id));
      if (probe.gt) scoped = scoped.filter((r) => r.id > probe.gt[1]);
      if (afterFilterIds) scoped = scoped.filter((r) => afterFilterIds.includes(r.id));
      return scoped;
    },
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      updateCalls.push({ table, ids, patch, cite: opts.cite, hasApplyMatch: typeof opts.applyMatch === "function" });
      for (const id of ids) classified.set(id, patch.format_type);
      return { updated: ids.length, chunks: 1, halvings: 0 };
    },
    specForItemType: fakeSpecForItemType,
  };
}

test("main dry: plans, writes nothing, groups by format_type, reports skipped unknown item_type by id", async () => {
  const d = deps();
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "backfill-format-type");
  assert.equal(s.mode, "dry");
  assert.equal(d.updateCalls.length, 0);
  assert.equal(s.counts.null_candidates_scanned, 4);
  assert.equal(s.counts.would_write, 3);
  assert.deepEqual(s.counts.by_format_type, { regulatory_fact_document: 1, market_signal_brief: 2 });
  assert.equal(s.counts.unknown_item_type_skipped, 1);
  assert.deepEqual(s.skipped, [{ id: "i4", item_type: "bogus_type" }]);
  assert.equal(s.applied, 0);
  assert.equal(s.exitCode, 0);
  assert.equal(s.last_id_processed, "i4");
});

test("main apply: writes each format_type group through the guarded path with a cite and applyMatch, reads back", async () => {
  const d = deps();
  const s = await main({ mode: "apply" }, d);
  assert.ok(d.updateCalls.length >= 1);
  for (const c of d.updateCalls) {
    assert.equal(c.table, "intelligence_items");
    assert.ok(c.cite?.skill, "every write carries a cite");
    assert.ok(c.hasApplyMatch, "every write re-checks format_type IS NULL");
    assert.equal(typeof c.patch.format_type, "string");
  }
  assert.equal(s.applied, 3);
  assert.equal(s.read_back.format_type_not_null_total, 3);
  assert.deepEqual(s.read_back.by_format_type, { regulatory_fact_document: 1, market_signal_brief: 2 });
  // The unknown item_type was never written.
  assert.ok(!d.updateCalls.some((c) => c.ids.includes("i4")));
});

test("main: --limit bounds the page; --after-id resumes past a prior run", async () => {
  const d = deps();
  const s1 = await main({ mode: "dry", limit: 1 }, d);
  assert.equal(s1.counts.page_size, 1);
  assert.equal(s1.last_id_processed, "i1");

  const d2 = deps();
  const s2 = await main({ mode: "dry", afterId: "i1" }, d2);
  assert.equal(s2.counts.null_candidates_scanned, 3);
  assert.ok(!s2.skipped.some((x) => x.id === "i1") && s2.counts.by_format_type.market_signal_brief === 2);
});
