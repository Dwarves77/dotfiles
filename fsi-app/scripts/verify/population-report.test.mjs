// population-report.test.mjs — pins the distinction that actually fooled us.
//
// The failure this report exists to catch was NOT "table is empty". It was "table has 75 rows and
// zero usable values, so the reader over it shows nothing while every count-based check reads as
// healthy". ROWS_NO_VALUES is therefore the case that carries the weight here, and it is asserted
// against the real historical numbers (regional_data_facts: 75 rows, 0 value_numeric) rather than
// invented ones, so the test documents the incident as well as the rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, renderReport, countStore, collect, STORES } from "./population-report.mjs";

test("classify: an empty store is EMPTY", () => {
  assert.equal(classify({ rows: 0, filled: 0 }), "EMPTY");
});

test("classify: rows present but no usable values is ROWS_NO_VALUES — the case that fooled us", () => {
  // regional_data_facts as it actually stood after Wave 4 shipped its producers unrun.
  assert.equal(classify({ rows: 75, filled: 0 }), "ROWS_NO_VALUES");
});

test("classify: a store is only FILLED when the fill column is non-empty", () => {
  assert.equal(classify({ rows: 75, filled: 1 }), "FILLED");
  assert.equal(classify({ rows: 2, filled: 2 }), "FILLED");
});

test("a store with rows but no values is NOT counted as filled in the summary", () => {
  const lines = renderReport([
    { table: "regional_data_facts", fill: "value_numeric", rows: 75, filled: 0, reader: "matrix", producer: "p" },
    { table: "emission_factors", fill: "ttw_co2e", rows: 2, filled: 2, reader: "/admin/factors", producer: "q" },
  ]).join("\n");
  assert.match(lines, /1\/2 stores filled/);
  assert.match(lines, /UNFILLED: regional_data_facts/);
  assert.match(lines, /has nothing to show/);
  // The filled store must NOT get a remediation hint.
  assert.doesNotMatch(lines, /emission_factors[\s\S]*?fill it with: q/);
});

test("renderReport says so plainly when everything is filled", () => {
  const lines = renderReport([
    { table: "theme_briefs", fill: "brief_md", rows: 9, filled: 9, reader: "r", producer: "p" },
  ]).join("\n");
  assert.match(lines, /All readers have data/);
  assert.doesNotMatch(lines, /nothing to show/);
});

test("every declared store names a reader and a producer — an unnamed one cannot be acted on", () => {
  for (const s of STORES) {
    assert.ok(s.table && s.fill, `${JSON.stringify(s)} missing table/fill`);
    assert.ok(s.reader && s.reader.length > 3, `${s.table} has no named reader`);
    assert.ok(s.producer && s.producer.length > 3, `${s.table} has no named producer`);
  }
});

// ── injected-client tests: exercise the count path with no database ───────────────────────────────

function fakeClient(counts) {
  // Mimics the two calls countStore makes: a bare head-count, then a `.not(fill,'is',null)` head-count.
  return {
    from(table) {
      const c = counts[table];
      const withNot = { count: c.filled, error: null };
      const base = {
        count: c.rows,
        error: null,
        not: () => Promise.resolve(withNot),
        then: (res) => res({ count: c.rows, error: null }),
      };
      return { select: () => base };
    },
  };
}

test("countStore reads both the total and the non-null fill count", async () => {
  const sb = fakeClient({ regional_data_facts: { rows: 75, filled: 0 } });
  const got = await countStore(sb, { table: "regional_data_facts", fill: "value_numeric" });
  assert.deepEqual(got, { rows: 75, filled: 0 });
});

test("collect walks every store and classifies the mixed reality we actually shipped", async () => {
  const sb = fakeClient({
    market_series: { rows: 0, filled: 0 },
    regional_data_facts: { rows: 75, filled: 0 },
    emission_factors: { rows: 2, filled: 2 },
  });
  const results = await collect(sb, [
    { table: "market_series", fill: "value_numeric", reader: "r", producer: "p" },
    { table: "regional_data_facts", fill: "value_numeric", reader: "r", producer: "p" },
    { table: "emission_factors", fill: "ttw_co2e", reader: "r", producer: "p" },
  ]);
  assert.deepEqual(results.map(classify), ["EMPTY", "ROWS_NO_VALUES", "FILLED"]);
});

test("countStore surfaces a read error instead of reporting a false zero", async () => {
  const sb = { from: () => ({ select: () => ({ count: null, error: { message: "boom" }, not: () => {} }) }) };
  await assert.rejects(() => countStore(sb, { table: "t", fill: "f" }), /t: boom/);
});

// ── DATECHAIN lane, 2026-09-11 — attack proofs for the four new entries (Part C, GATES: "prove by
// attack that each new entry goes red on an empty store"). Each test starts from an EMPTY store (the
// exact defect class this file exists to catch — a built-but-unpopulated store no gate questions) and
// asserts the report actually goes red for it, not merely that the entry is declared.

test("item_timelines goes red (EMPTY) when the store has zero rows", async () => {
  const sb = fakeClient({ item_timelines: { rows: 0, filled: 0 } });
  const entry = STORES.find((s) => s.table === "item_timelines");
  const got = await countStore(sb, entry);
  assert.equal(classify(got), "EMPTY");
});

test("item_forward_events goes red (EMPTY) when the store has zero rows", async () => {
  const sb = fakeClient({ item_forward_events: { rows: 0, filled: 0 } });
  const entry = STORES.find((s) => s.table === "item_forward_events");
  const got = await countStore(sb, entry);
  assert.equal(classify(got), "EMPTY");
});

test("compliance_deadline goes red (ROWS_NO_VALUES) when every item's column is null", async () => {
  // intelligence_items itself is never EMPTY (the corpus has rows) — the attack that matters here is
  // the ROWS_NO_VALUES case: 1,195 items, 0 with compliance_deadline set, exactly measured pre-lane.
  const sb = fakeClient({ intelligence_items: { rows: 1195, filled: 0 } });
  const entry = STORES.find((s) => s.table === "intelligence_items" && s.fill === "compliance_deadline");
  const got = await countStore(sb, entry);
  assert.equal(classify(got), "ROWS_NO_VALUES");
});

test("brief coverage goes red (ROWS_NO_VALUES) when every live item is a stub", async () => {
  const entry = STORES.find((s) => String(s.fill).startsWith("full_brief"));
  assert.ok(entry, "brief coverage entry must be declared");
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          // totalQuery resolves here (only .eq chained); filledQuery chains a further .not(...).
          then: (res) => res({ count: 40, error: null }),
          not: () => Promise.resolve({ count: 0, error: null }), // every live item is a stub
        }),
      }),
    }),
  };
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 40, filled: 0 });
  assert.equal(classify(got), "ROWS_NO_VALUES");
});

test("brief coverage counts a real (non-stub) brief as filled", async () => {
  const entry = STORES.find((s) => String(s.fill).startsWith("full_brief"));
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          then: (res) => res({ count: 40, error: null }),
          not: () => Promise.resolve({ count: 12, error: null }),
        }),
      }),
    }),
  };
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 40, filled: 12 });
  assert.equal(classify(got), "FILLED");
});
