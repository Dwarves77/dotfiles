// Lane DATA-3a (2026-10-11, backlog B-0064): supabase-server.ts read results are read WITH their error.
//
// THE DEFECT. Thirteen reads in the page-data layer destructured `{ data }` (or read `result.data`) and dropped
// `error`, so a failed read rendered as "nothing there": an empty changelog, no supersessions, an empty admin
// source list, a watchlist whose titles fell back to raw ids, a detail page with no bias chips. The fix per site
// is one of two shapes, and this file proves one representative of each against a real supabase-js client whose
// transport (global fetch) is replaced by an in-process router, so no network is reached:
//
//   THROW      the function's contract is throw-on-failure (its callers already catch and return their empty +
//              `_error` payload, or the watchlist re-raises so unstable_cache never stores a partial answer):
//              fetchChangelog / fetchDisputes / fetchSupersessions (through fetchDashboardData), fetchSources
//              (through fetchSourceData), fetchWatchlist's lookups.
//   LOG+EMPTY  the function's documented contract is "never throws, degrades to nothing to show": the failure is
//              now logged with its site before it degrades: fetchCrossPageForItem, fetchFreshInferencesForItem,
//              fetchCoverageGaps, fetchWorkspaceAggregates.
//
// RED WITHOUT THE FIX: against the unchanged file every test below fails (no throw, no log).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

// The router: table or rpc name (last path segment) -> { status, body }. Anything unrouted answers 200 [].
const routes = new Map();
const BOOM = { status: 500, body: { message: "boom", code: "XX000", details: null, hint: null } };
globalThis.fetch = async (input) => {
  const url = new URL(String(input && input.url ? input.url : input));
  const name = url.pathname.split("/").pop();
  const hit = routes.get(name) ?? { status: 200, body: [] };
  return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { "content-type": "application/json" } });
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const ss = await jiti.import("./supabase-server.ts");

/** Run `fn` with console.warn / console.error captured; returns { result | error, logs }. */
async function capture(fn) {
  const logs = [];
  const w = console.warn;
  const e = console.error;
  console.warn = (...a) => logs.push(a.map(String).join(" "));
  console.error = (...a) => logs.push(a.map(String).join(" "));
  try {
    const result = await fn();
    return { result, logs };
  } catch (error) {
    return { error, logs };
  } finally {
    console.warn = w;
    console.error = e;
  }
}

const ORG = "a0000000-0000-0000-0000-000000000001";

test("THROW: a failed item_changelog / item_disputes / item_supersessions read makes the dashboard payload carry its _error, not an empty section", async () => {
  for (const table of ["item_changelog", "item_disputes", "item_supersessions"]) {
    routes.clear();
    routes.set(table, BOOM);
    const { result } = await capture(() => ss.fetchDashboardData(ORG));
    assert.ok(result._error, `${table} failing must surface _error`);
    assert.equal(result._fallbackTrigger, "exception", `${table} failing must name the exception trigger`);
  }
});

test("THROW: a failed sources read is logged by fetchSourceData with its site, not rendered as an empty registry in silence", async () => {
  routes.clear();
  routes.set("sources", BOOM);
  const { result, logs } = await capture(() => ss.fetchSourceData(true));
  assert.deepEqual(result, { sources: [], provisionalSources: [] });
  assert.ok(logs.some((l) => l.includes("fetchSources: sources read failed")), `no site log in ${JSON.stringify(logs)}`);
});

test("THROW: fetchWatchlist re-raises a failed title lookup so the cache never stores a partial watchlist", async () => {
  routes.clear();
  routes.set("user_watchlist", { status: 200, body: [{ item_type: "reg", item_id: "g2", created_at: "2026-10-01T00:00:00Z" }] });
  routes.set("intelligence_items", BOOM);
  const { error } = await capture(() => ss.fetchWatchlist("user-1", null));
  assert.ok(error, "must reject");
  assert.match(String(error.message), /fetchWatchlist: intelligence_items title lookup failed/);
});

test("THROW: fetchWatchlist re-raises a failed source-tier lookup too", async () => {
  routes.clear();
  routes.set("user_watchlist", { status: 200, body: [{ item_type: "reg", item_id: "g2", created_at: "2026-10-01T00:00:00Z" }] });
  routes.set("intelligence_items", {
    status: 200,
    body: [{ id: "i1", legacy_id: "g2", title: "T", jurisdictions: ["EU"], priority: "HIGH", item_type: "regulation", tags: [], transport_modes: [], source_id: "s1", compliance_deadline: null }],
  });
  routes.set("sources", BOOM);
  const { error } = await capture(() => ss.fetchWatchlist("user-1", null));
  assert.ok(error, "must reject");
  assert.match(String(error.message), /fetchWatchlist: sources tier lookup failed/);
});

/** A chain whose every method returns itself and which resolves to `result` when awaited or when maybeSingle() ends it. */
function chainOf(result) {
  const chain = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolveFn) => resolveFn(result);
        if (prop === "maybeSingle") return async () => result;
        return () => chain;
      },
    }
  );
  return chain;
}

test("LOG+EMPTY: fetchCrossPageForItem logs a failed item read and shows nothing", async () => {
  const sb = { from: () => chainOf({ data: null, error: { message: "boom" } }) };
  const { result, logs } = await capture(() => ss.fetchCrossPageForItem(sb, "g2", "regulations"));
  assert.deepEqual(result, { intersectionSummary: null, theme: null, inferences: null });
  assert.ok(logs.some((l) => l.includes("fetchCrossPageForItem failed") && l.includes("intelligence_items read failed")), JSON.stringify(logs));
});

test("LOG+EMPTY: fetchCrossPageForItem logs a failed themes read and keeps the summary", async () => {
  const sb = {
    from: (table) =>
      table === "intelligence_items"
        ? chainOf({ data: { id: "i1", intersection_summary: "Overlaps with X." }, error: null })
        : chainOf({ data: null, error: { message: "boom" } }),
  };
  const { result, logs } = await capture(() => ss.fetchCrossPageForItem(sb, "g2", "regulations"));
  assert.equal(result.intersectionSummary, "Overlaps with X.");
  assert.equal(result.theme, null);
  assert.ok(logs.some((l) => l.includes("theme read failed") && l.includes("connection_themes read failed")), JSON.stringify(logs));
});

test("LOG+EMPTY: fetchFreshInferencesForItem logs a failed item read and shows no inferences", async () => {
  const sb = { from: () => chainOf({ data: null, error: { message: "boom" } }) };
  const { result, logs } = await capture(() => ss.fetchFreshInferencesForItem(sb, "g2"));
  assert.equal(result, null);
  assert.ok(logs.some((l) => l.includes("fetchFreshInferencesForItem failed") && l.includes("intelligence_items read failed")), JSON.stringify(logs));
});

test("LOG+EMPTY: fetchCoverageGaps and fetchWorkspaceAggregates say why they degrade", async () => {
  routes.clear();
  routes.set("coverage_gaps", BOOM);
  routes.set("get_workspace_intelligence_aggregates", BOOM);
  const gaps = await capture(() => ss.fetchCoverageGaps([]));
  assert.deepEqual(gaps.result, []);
  assert.ok(gaps.logs.some((l) => l.includes("fetchCoverageGaps read failed")), JSON.stringify(gaps.logs));
  const agg = await capture(() => ss.fetchWorkspaceAggregates(ORG));
  assert.equal(agg.result.totalItems, 0);
  assert.ok(agg.logs.some((l) => l.includes("get_workspace_intelligence_aggregates failed")), JSON.stringify(agg.logs));
});

// SOURCE PINS. The three sites below live inside unstable_cache-wrapped readers (fetchIntelligenceItemSections,
// fetchIntelligenceItem), and unstable_cache throws "Invariant: incrementalCache missing" outside a Next request,
// so they cannot be driven in a node test. They are pinned by source text instead: each failed read is bound,
// checked, and named in a log or a throw. (Confirmed by calling both readers under node: both throw that invariant.)
import { readFileSync } from "node:fs";
const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "supabase-server.ts"), "utf8");

test("SOURCE PIN: the legacy_id resolve in the sections reader checks its error and logs before returning []", () => {
  assert.match(SOURCE, /const \{ data: byLegacy, error: byLegacyError \} = await supabase/);
  assert.match(SOURCE, /if \(byLegacyError\) \{\s*console\.warn\("fetchIntelligenceItemSections legacy_id resolve error:"/);
});

test("SOURCE PIN: the cited-sources bias read throws into the reader's own catch, so the grid reads as unavailable", () => {
  assert.match(SOURCE, /const \{ data: biasRows, error: biasError \} = await supabase/);
  assert.match(SOURCE, /if \(biasError\) throw new Error\(`source_bias_tags read failed:/);
});

test("SOURCE PIN: the item detail's six parallel reads are each checked and logged with their table", () => {
  for (const table of ["item_timelines", "item_changelog", "item_disputes", "item_cross_references", "item_supersessions", "source_bias_tags"]) {
    assert.ok(SOURCE.includes(`["${table}", `), `${table} missing from detailReadResults`);
  }
  assert.match(SOURCE, /fetchIntelligenceItem \$\{table\} read failed \(that block renders empty\)/);
});
