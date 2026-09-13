// backfill-format-type.npmtest.mjs -- real-wiring test for buildDeps() (D22 class fix,
// docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-13: "every maintenance step that builds a deps
// object from real imports gets the same real-wiring test"). Mirrors
// resolve-provisional-sources.npmtest.mjs's own pattern.
//
// WHY *.npmtest.mjs (not *.test.mjs): buildDeps() calls `await import("jiti")` to load the real
// extract-registry.ts through the `@/lib/...` alias -- a real npm package, so this file joins
// .github/workflows/discipline.yml's "App unit tests requiring npm deps" NAMED list (the same reason
// resolve-provisional-sources.npmtest.mjs is named there), never the no-npm-ci glob
// backfill-format-type.test.mjs deliberately stays in.
//
// UNLIKE resolve-provisional-sources.mjs's D22 bug, `specForItemType` here is a raw, unwrapped
// passthrough of the jiti-imported function -- its own one-argument contract already matches the
// one-argument call site (planFormatTypeBackfill calls `specForItemTypeFn(r.item_type)`), so there is
// no argument-order gap to close. This test proves that INSTEAD of assuming it: the real function
// resolves real item_types to their real format_type values, and `main()`'s real orchestration reaches
// it (and the real guardedUpdateByIds write) without throwing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __setWriteClientForTest } from "../lib/db.mjs";
import { buildDeps, main } from "./backfill-format-type.mjs";

function makeClient(handler) {
  const calls = [];
  function from(table) {
    const state = { table, verb: "select", ops: [] };
    function settle() {
      calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() });
      return Promise.resolve(handler(state));
    }
    const b = {
      select(c) { if (state.verb !== "update") state.verb = "select"; state.ops.push(["select", c]); return b; },
      update(p) { state.verb = "update"; state.ops.push(["update", p]); return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      in(c, v) { state.ops.push(["in", c, v]); return b; },
      is(c, v) { state.ops.push(["is", c, v]); return b; },
      not(c, op, v) { state.ops.push(["not", c, op, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      range(a, z) { state.ops.push(["range", a, z]); return b; },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from, __calls: calls };
}

test.afterEach(() => { __setWriteClientForTest(null); });

test("buildDeps().specForItemType: the REAL extract-registry.ts resolver, called through the real import graph, maps a real item_type to its real format_type (no throw, no fake table)", async () => {
  __setWriteClientForTest(() => makeClient(() => { throw new Error("no DB call expected in this narrow test"); }));
  const deps = await buildDeps();
  assert.equal(typeof deps.specForItemType, "function");
  const spec = deps.specForItemType("regulation");
  assert.ok(spec && typeof spec.formatType === "string", "expected a real FormatSpec back, not a stub");
  assert.equal(spec.formatType, "regulatory_fact_document");
  assert.equal(deps.specForItemType("not-a-real-item-type"), null, "an unrecognised item_type resolves null, never guessed");
});

test("main({mode:'apply'}) with the REAL buildDeps(): reaches the real specForItemType resolver and the real guardedUpdateByIds write, never throwing", async () => {
  const rows = [
    { id: "item-1", item_type: "regulation", format_type: null },
    { id: "item-2", item_type: "market_signal", format_type: null },
  ];
  const client = makeClient((s) => {
    if (s.table === "intelligence_items" && s.verb === "select") {
      const hasNullCheck = s.ops.some((o) => o[0] === "is" && o[1] === "format_type");
      return { data: hasNullCheck ? rows : [], error: null };
    }
    if (s.table === "intelligence_items" && s.verb === "update") {
      return { data: rows.map((r) => ({ id: r.id })), error: null };
    }
    throw new Error(`unexpected call: ${s.table}/${s.verb} ops=${JSON.stringify(s.ops)}`);
  });
  __setWriteClientForTest(() => client);

  const deps = await buildDeps();
  const summary = await main({ mode: "apply" }, deps);

  assert.equal(summary.counts.null_candidates_scanned, 2);
  assert.equal(summary.counts.unknown_item_type_skipped, 0, "both real item_types must resolve through the real registry");
  assert.ok(summary.counts.by_format_type.regulatory_fact_document >= 1);
  const updateCalls = client.__calls.filter((c) => c.table === "intelligence_items" && c.verb === "update");
  assert.ok(updateCalls.length >= 1, "expected at least one real guardedUpdateByIds write to be reached");
});
