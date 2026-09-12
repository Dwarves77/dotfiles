// population-report.test.mjs — pins the distinction that actually fooled us.
//
// The failure this report exists to catch was NOT "table is empty". It was "table has 75 rows and
// zero usable values, so the reader over it shows nothing while every count-based check reads as
// healthy". ROWS_NO_VALUES is therefore the case that carries the weight here, and it is asserted
// against the real historical numbers (regional_data_facts: 75 rows, 0 value_numeric) rather than
// invented ones, so the test documents the incident as well as the rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  renderReport,
  countStore,
  collect,
  STORES,
  computeBriefsPendingStale,
  countBriefsPendingStale,
} from "./population-report.mjs";

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

// ── W9 PART1 lane, 2026-09-11 -- attack proofs for the three birth-wiring entries (task 1.4, plan
// docs/plans/brief-chain-build-plan-2026-09-11.md Part 1). Each starts from the "zero coverage" fixture
// the brief's Step 1 names and asserts classify() actually goes red for it, the same posture as the
// DATECHAIN block above, applied to the wiring tasks 1.1-1.3 add rather than the four earlier stores.

// readAll's contract (scripts/lib/db.mjs): sb.from(table).select(cols).order(col)[.order(col)...]
// .range(from,to), then `match(q)` appends the caller's own filter (here, .eq("ref_table", ...))
// before the page is awaited. The fake records every order column so the test can bind the entry
// to columns entity_refs REALLY has: Maintenance run 34670770742 (2026-09-12) failed at "Population
// BEFORE" because the entry inherited readAll's default order column `id`, which entity_refs does
// not have (primary key ref_table, ref_id, entity_id, role; migration 283). A fake that accepted any
// column let that through; this one exposes the columns for the assertion below.
const ENTITY_REFS_COLUMNS = ["ref_table", "ref_id", "entity_id", "role", "asserted_by", "asserted_at"];

function fakeEntityRefsClient({ totalCount, refRows }) {
  const orderColumns = [];
  const page = {
    order(col) { orderColumns.push(col); return page; },
    range: () => ({ eq: () => Promise.resolve({ data: refRows, error: null }) }),
  };
  return {
    orderColumns,
    from(table) {
      if (table === "intelligence_items") {
        return { select: () => ({ eq: () => Promise.resolve({ count: totalCount, error: null }) }) };
      }
      if (table === "entity_refs") {
        return { select: () => page };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test("entity_refs coverage orders its paginated read on columns entity_refs actually has (never the default `id`)", async () => {
  const entry = STORES.find((s) => s.table === "entity_refs");
  const sb = fakeEntityRefsClient({ totalCount: 1, refRows: [] });
  await countStore(sb, entry);
  assert.ok(sb.orderColumns.length > 0, "the read must order on at least one column");
  for (const col of sb.orderColumns) {
    assert.ok(ENTITY_REFS_COLUMNS.includes(col), `order column ${col} is not a column of entity_refs (migration 283)`);
  }
  assert.ok(!sb.orderColumns.includes("id"), "entity_refs has no id column; the default must be overridden");
});

test("entity_refs coverage goes red (ROWS_NO_VALUES) when no live item has an entity_refs row", async () => {
  const entry = STORES.find((s) => s.table === "entity_refs");
  assert.ok(entry, "entity_refs coverage entry must be declared");
  const sb = fakeEntityRefsClient({ totalCount: 40, refRows: [] });
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 40, filled: 0 });
  assert.equal(classify(got), "ROWS_NO_VALUES");
});

test("entity_refs coverage counts a live item with a real ref as filled", async () => {
  const entry = STORES.find((s) => s.table === "entity_refs");
  // Two rows, same item (two jurisdiction roles) -- distinctness must collapse this to 1, not 2.
  const sb = fakeEntityRefsClient({
    totalCount: 40,
    refRows: [{ ref_id: "item-1" }, { ref_id: "item-1" }],
  });
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 40, filled: 1 });
  assert.equal(classify(got), "FILLED");
});

test("format_type coverage goes red (ROWS_NO_VALUES) when every live item is null", async () => {
  const entry = STORES.find((s) => s.table === "intelligence_items" && s.fill === "format_type");
  assert.ok(entry, "format_type coverage entry must be declared");
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          then: (res) => res({ count: 40, error: null }),
          not: () => Promise.resolve({ count: 0, error: null }),
        }),
      }),
    }),
  };
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 40, filled: 0 });
  assert.equal(classify(got), "ROWS_NO_VALUES");
});

test("format_type coverage counts a stamped live item as filled", async () => {
  const entry = STORES.find((s) => s.table === "intelligence_items" && s.fill === "format_type");
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          then: (res) => res({ count: 40, error: null }),
          not: () => Promise.resolve({ count: 40, error: null }),
        }),
      }),
    }),
  };
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 40, filled: 40 });
  assert.equal(classify(got), "FILLED");
});

test("CELEX-Decision-as-regulation coverage goes red (ROWS_NO_VALUES) when none are retyped", async () => {
  const entry = STORES.find((s) => String(s.fill).startsWith("canonical_instrument_key"));
  assert.ok(entry, "CELEX Decision retype coverage entry must be declared");
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          regexMatch: () => ({
            // totalQuery resolves here (only .regexMatch chained); filledQuery chains a further .eq(...).
            then: (res) => res({ count: 351, error: null }),
            eq: () => Promise.resolve({ count: 0, error: null }), // none retyped to regulation yet
          }),
        }),
      }),
    }),
  };
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 351, filled: 0 });
  assert.equal(classify(got), "ROWS_NO_VALUES");
});

test("CELEX-Decision-as-regulation coverage goes FILLED once task 5.5 retypes the backlog", async () => {
  const entry = STORES.find((s) => String(s.fill).startsWith("canonical_instrument_key"));
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          regexMatch: () => ({
            then: (res) => res({ count: 351, error: null }),
            eq: () => Promise.resolve({ count: 351, error: null }), // all 351 retyped
          }),
        }),
      }),
    }),
  };
  const got = await countStore(sb, entry);
  assert.deepEqual(got, { rows: 351, filled: 351 });
  assert.equal(classify(got), "FILLED");
});

// -- W9 PART3 lane, 2026-09-11 -- task 3.5, "every new item is queued for a brief automatically." The
// "briefs pending" entry's predicate (computeBriefsPendingStale, pure) plus its wiring into the STORES
// entry (countBriefsPendingStale, DI-testable without touching the real filesystem).

test("computeBriefsPendingStale: a record item minted before the latest turn, with no brief-apply outcome, is stale", () => {
  const liveRecordItems = [{ id: "item-1", created_at: "2026-09-01T00:00:00Z" }];
  const mintRuns = [
    { run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z", per_item: [{ item_id: "item-1", outcome: "minted_verified" }] },
    { run_id: "mint-run-002", started_at: "2026-09-10T00:00:00Z", per_item: [] }, // the LATEST turn -- item-1 predates it
  ];
  const got = computeBriefsPendingStale(liveRecordItems, mintRuns, []);
  assert.deepEqual(got.staleIds, ["item-1"]);
  assert.equal(got.staleCount, 1);
  assert.equal(got.latestTurnStartedAt, "2026-09-10T00:00:00Z");
});

test("computeBriefsPendingStale: the SAME item is no longer stale once a brief-apply run records its outcome", () => {
  const liveRecordItems = [{ id: "item-1", created_at: "2026-09-01T00:00:00Z" }];
  const mintRuns = [
    { run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z", per_item: [{ item_id: "item-1", outcome: "minted_verified" }] },
    { run_id: "mint-run-002", started_at: "2026-09-10T00:00:00Z", per_item: [] },
  ];
  const briefApplyRuns = [
    { run_id: "brief-apply-run-001", started_at: "2026-09-05T00:00:00Z", per_item: [{ id: "item-1#generate", outcome: "generated" }] },
  ];
  const got = computeBriefsPendingStale(liveRecordItems, mintRuns, briefApplyRuns);
  assert.equal(got.staleCount, 0);
  assert.deepEqual(got.staleIds, []);
});

test("computeBriefsPendingStale: an item minted in the SAME (latest) turn is not stale yet", () => {
  const liveRecordItems = [{ id: "item-1" }];
  const mintRuns = [
    { run_id: "mint-run-001", started_at: "2026-09-10T00:00:00Z", per_item: [{ item_id: "item-1", outcome: "minted_verified" }] },
  ];
  const got = computeBriefsPendingStale(liveRecordItems, mintRuns, []);
  assert.equal(got.staleCount, 0);
});

test("computeBriefsPendingStale: no population turn has ever run, so nothing can be stale (never guessed)", () => {
  const liveRecordItems = [{ id: "item-1", created_at: "2020-01-01T00:00:00Z" }];
  const got = computeBriefsPendingStale(liveRecordItems, [], []);
  assert.equal(got.staleCount, 0);
  assert.equal(got.latestTurnStartedAt, null);
});

test("computeBriefsPendingStale: an item unresolvable via any mint-run artifact falls back to intelligence_items.created_at", () => {
  const liveRecordItems = [{ id: "legacy-item", created_at: "2020-01-01T00:00:00Z" }]; // never minted through the harness family
  const mintRuns = [{ run_id: "mint-run-002", started_at: "2026-09-10T00:00:00Z", per_item: [] }];
  const got = computeBriefsPendingStale(liveRecordItems, mintRuns, []);
  assert.deepEqual(got.staleIds, ["legacy-item"]);
});

// readAll's contract (scripts/lib/db.mjs): sb.from(table).select(cols).order(col).range(from,to), then
// match(q) appends the caller's own .eq() chain(s) before the page is awaited -- any number of chained
// .eq() calls resolve to the same final page (the "briefs pending" query chains THREE: item_grade,
// provenance_status, is_archived).
function fakeBriefsPendingClient(rows) {
  const chainable = {
    eq: () => chainable,
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return {
    from(table) {
      if (table !== "intelligence_items") throw new Error(`unexpected table ${table}`);
      return { select: () => ({ order: () => ({ range: () => chainable }) }) };
    },
  };
}

test("briefs pending goes red (ROWS_NO_VALUES) when a record item is older than the latest turn and has no brief-apply outcome", async () => {
  const entry = STORES.find((s) => String(s.fill).startsWith("brief-apply outcome present"));
  assert.ok(entry, "briefs pending entry must be declared");
  const sb = fakeBriefsPendingClient([{ id: "item-1", created_at: "2026-09-01T00:00:00Z" }]);
  const readHistoryFn = (dir) =>
    String(dir).endsWith("brief-apply")
      ? { runs: [] }
      : {
          runs: [
            { run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z", per_item: [{ item_id: "item-1", outcome: "minted_verified" }] },
            { run_id: "mint-run-002", started_at: "2026-09-10T00:00:00Z", per_item: [] },
          ],
        };
  const total = await countBriefsPendingStale(sb, { readHistoryFn });
  const filled = await entry.filledQuery(sb);
  assert.deepEqual({ rows: total.count, filled: filled.count }, { rows: 1, filled: 0 });
  assert.equal(classify({ rows: total.count, filled: filled.count }), "ROWS_NO_VALUES");
});

test("briefs pending goes green (EMPTY) once the same item gets a brief-apply outcome", async () => {
  const entry = STORES.find((s) => String(s.fill).startsWith("brief-apply outcome present"));
  const sb = fakeBriefsPendingClient([{ id: "item-1", created_at: "2026-09-01T00:00:00Z" }]);
  const readHistoryFn = (dir) => {
    if (String(dir).endsWith("brief-apply")) {
      return { runs: [{ run_id: "brief-apply-run-001", started_at: "2026-09-05T00:00:00Z", per_item: [{ id: "item-1#generate", outcome: "generated" }] }] };
    }
    return {
      runs: [
        { run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z", per_item: [{ item_id: "item-1", outcome: "minted_verified" }] },
        { run_id: "mint-run-002", started_at: "2026-09-10T00:00:00Z", per_item: [] },
      ],
    };
  };
  const total = await countBriefsPendingStale(sb, { readHistoryFn });
  const filled = await entry.filledQuery(sb);
  assert.deepEqual({ rows: total.count, filled: filled.count }, { rows: 0, filled: 0 });
  assert.equal(classify({ rows: total.count, filled: filled.count }), "EMPTY");
});
