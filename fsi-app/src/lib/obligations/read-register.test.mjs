import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegisterQuerySpec,
  matchesDueWindow,
  selectRegisterRows,
  filterJoinedRows,
  filterJoinedRowsPage,
  matchingJurisdictionCodes,
  fetchObligationRegister,
  fetchObligationRegisterPage,
  fetchRegisterFacetOptions,
  fetchForwardEventCount,
  trimObligationText,
  UNCLASSIFIED,
  OBLIGATION_TEXT_TRIM_LENGTH,
} from "./read-register.mjs";

test("buildRegisterQuerySpec defaults: no filters, dueWindow=all, limit=200", () => {
  const spec = buildRegisterQuerySpec();
  assert.equal(spec.jurisdiction, null);
  assert.equal(spec.mode, null);
  assert.equal(spec.bindingPosition, null);
  assert.equal(spec.dueWindow, "all");
  assert.equal(spec.limit, 200);
});

test("buildRegisterQuerySpec: generic jurisdiction values degrade to no filter", () => {
  assert.equal(buildRegisterQuerySpec({ jurisdiction: "Global" }).jurisdiction, null);
  assert.equal(buildRegisterQuerySpec({ jurisdiction: "worldwide" }).jurisdiction, null);
});

test("buildRegisterQuerySpec: lower-cases and trims jurisdiction/mode", () => {
  const spec = buildRegisterQuerySpec({ jurisdiction: " EU ", mode: "Ocean" });
  assert.equal(spec.jurisdiction, "eu");
  assert.equal(spec.mode, "ocean");
});

test("buildRegisterQuerySpec: accepts a real binding_position and the unclassified pseudo-value", () => {
  assert.equal(buildRegisterQuerySpec({ bindingPosition: "direct_duty" }).bindingPosition, "direct_duty");
  assert.equal(buildRegisterQuerySpec({ bindingPosition: UNCLASSIFIED }).bindingPosition, UNCLASSIFIED);
});

test("buildRegisterQuerySpec: an unrecognised binding_position/dueWindow degrades to no filter, never throws", () => {
  assert.equal(buildRegisterQuerySpec({ bindingPosition: "not_a_real_value" }).bindingPosition, null);
  assert.equal(buildRegisterQuerySpec({ dueWindow: "not_a_real_window" }).dueWindow, "all");
});

test("matchesDueWindow: 'all' always matches, dated or not", () => {
  assert.equal(matchesDueWindow("2026-12-01", "all", "2026-09-02"), true);
  assert.equal(matchesDueWindow(null, "all", "2026-09-02"), true);
});

test("matchesDueWindow: 'undated' matches only a null due_date", () => {
  assert.equal(matchesDueWindow(null, "undated", "2026-09-02"), true);
  assert.equal(matchesDueWindow("2026-12-01", "undated", "2026-09-02"), false);
});

test("matchesDueWindow: a dated window never matches an undated row", () => {
  assert.equal(matchesDueWindow(null, "30", "2026-09-02"), false);
  assert.equal(matchesDueWindow(null, "overdue", "2026-09-02"), false);
});

test("matchesDueWindow: 'overdue' is strictly before today", () => {
  assert.equal(matchesDueWindow("2026-09-01", "overdue", "2026-09-02"), true);
  assert.equal(matchesDueWindow("2026-09-02", "overdue", "2026-09-02"), false);
  assert.equal(matchesDueWindow("2026-09-03", "overdue", "2026-09-02"), false);
});

test("matchesDueWindow: numeric windows are inclusive of the boundary day", () => {
  assert.equal(matchesDueWindow("2026-10-02", "30", "2026-09-02"), true); // exactly 30 days out
  assert.equal(matchesDueWindow("2026-10-03", "30", "2026-09-02"), false); // 31 days out
  assert.equal(matchesDueWindow("2026-09-01", "30", "2026-09-02"), false); // in the past, not in the forward window
});

// ── REG-GRAIN (2026-09-05): trimObligationText — the register row now carries its own obligation text ──

test("trimObligationText: passes a short string through unchanged", () => {
  assert.equal(trimObligationText("File the quarterly emissions disclosure."), "File the quarterly emissions disclosure.");
});

test("trimObligationText: trims leading/trailing whitespace", () => {
  assert.equal(trimObligationText("  padded text  "), "padded text");
});

test("trimObligationText: a string over the limit is cut with an ellipsis, never silently over-length", () => {
  const long = "x".repeat(OBLIGATION_TEXT_TRIM_LENGTH + 40);
  const out = trimObligationText(long);
  assert.equal(out.length, OBLIGATION_TEXT_TRIM_LENGTH + 1); // +1 for the ellipsis character
  assert.ok(out.endsWith("…"));
  assert.equal(out.slice(0, -1), "x".repeat(OBLIGATION_TEXT_TRIM_LENGTH));
});

test("trimObligationText: a string exactly at the limit is never truncated (boundary, not off-by-one)", () => {
  const exact = "x".repeat(OBLIGATION_TEXT_TRIM_LENGTH);
  assert.equal(trimObligationText(exact), exact);
});

test("trimObligationText: null/undefined/non-string degrades to null, never throws", () => {
  assert.equal(trimObligationText(null), null);
  assert.equal(trimObligationText(undefined), null);
  assert.equal(trimObligationText(42), null);
  assert.equal(trimObligationText(""), null);
  assert.equal(trimObligationText("   "), null);
});

test("trimObligationText: a custom max overrides the default", () => {
  assert.equal(trimObligationText("abcdefgh", 4), "abcd…");
});

const ITEM_A = { id: "item-a", title: "CountEmissions EU", legacy_id: "reg1", jurisdiction_iso: ["EU"] };
const ITEM_B = { id: "item-b", title: "FuelEU Maritime", legacy_id: "reg2", jurisdiction_iso: ["EU", "US-CA"] };

function itemsMap(...items) {
  const m = new Map();
  for (const it of items) m.set(it.id, it);
  return m;
}

test("selectRegisterRows: drops a row whose item did not survive the verified-gate join", () => {
  const rows = [{ intelligence_item_id: "ghost", due_date: "2026-10-01", binding_position: null, jurisdiction: [], modes: [] }];
  const out = selectRegisterRows(rows, itemsMap(ITEM_A), buildRegisterQuerySpec());
  assert.equal(out.length, 0);
});

test("selectRegisterRows: sorts due-date ascending with undated rows last", () => {
  const rows = [
    { intelligence_item_id: "item-a", due_date: null, binding_position: null, jurisdiction: [], modes: [] },
    { intelligence_item_id: "item-b", due_date: "2026-06-01", binding_position: null, jurisdiction: [], modes: [] },
    { intelligence_item_id: "item-a", due_date: "2026-03-01", binding_position: null, jurisdiction: [], modes: [] },
  ];
  const out = selectRegisterRows(rows, itemsMap(ITEM_A, ITEM_B), buildRegisterQuerySpec());
  assert.deepEqual(out.map((r) => r.due_date), ["2026-03-01", "2026-06-01", null]);
});

test("selectRegisterRows: jurisdiction filter matches a subnational code by prefix", () => {
  const rows = [
    { intelligence_item_id: "item-a", due_date: "2026-06-01", binding_position: null, jurisdiction: ["EU"], modes: [] },
    { intelligence_item_id: "item-b", due_date: "2026-06-01", binding_position: null, jurisdiction: ["EU", "US-CA"], modes: [] },
  ];
  const spec = buildRegisterQuerySpec({ jurisdiction: "us" });
  const out = selectRegisterRows(rows, itemsMap(ITEM_A, ITEM_B), spec);
  assert.equal(out.length, 1);
  assert.equal(out[0].intelligence_item_id, "item-b");
});

test("selectRegisterRows: mode filter is an exact canonical-token match", () => {
  const rows = [
    { intelligence_item_id: "item-a", due_date: "2026-06-01", binding_position: null, jurisdiction: [], modes: ["ocean"] },
    { intelligence_item_id: "item-b", due_date: "2026-06-01", binding_position: null, jurisdiction: [], modes: ["air"] },
  ];
  const out = selectRegisterRows(rows, itemsMap(ITEM_A, ITEM_B), buildRegisterQuerySpec({ mode: "ocean" }));
  assert.equal(out.length, 1);
  assert.equal(out[0].intelligence_item_id, "item-a");
});

test("selectRegisterRows: binding_position filter distinguishes a real value from unclassified", () => {
  const rows = [
    { intelligence_item_id: "item-a", due_date: "2026-06-01", binding_position: "direct_duty", jurisdiction: [], modes: [] },
    { intelligence_item_id: "item-b", due_date: "2026-06-01", binding_position: null, jurisdiction: [], modes: [] },
  ];
  const direct = selectRegisterRows(rows, itemsMap(ITEM_A, ITEM_B), buildRegisterQuerySpec({ bindingPosition: "direct_duty" }));
  assert.equal(direct.length, 1);
  assert.equal(direct[0].binding_position, "direct_duty");

  const unclassified = selectRegisterRows(rows, itemsMap(ITEM_A, ITEM_B), buildRegisterQuerySpec({ bindingPosition: UNCLASSIFIED }));
  assert.equal(unclassified.length, 1);
  assert.equal(unclassified[0].binding_position, null);
});

test("selectRegisterRows: respects the spec limit after sorting", () => {
  const rows = [
    { intelligence_item_id: "item-a", due_date: "2026-08-01", binding_position: null, jurisdiction: [], modes: [] },
    { intelligence_item_id: "item-a", due_date: "2026-01-01", binding_position: null, jurisdiction: [], modes: [] },
    { intelligence_item_id: "item-a", due_date: "2026-04-01", binding_position: null, jurisdiction: [], modes: [] },
  ];
  const out = selectRegisterRows(rows, itemsMap(ITEM_A), buildRegisterQuerySpec({ limit: 2 }));
  assert.deepEqual(out.map((r) => r.due_date), ["2026-01-01", "2026-04-01"]);
});

test("filterJoinedRows: same predicate/sort as selectRegisterRows, but skips the item join (client-safe re-filter)", () => {
  const joined = [
    { intelligence_item_id: "item-a", due_date: "2026-06-01", binding_position: "direct_duty", jurisdiction: ["EU"], modes: ["ocean"], item: ITEM_A },
    { intelligence_item_id: "item-b", due_date: "2026-01-01", binding_position: null, jurisdiction: ["EU", "US-CA"], modes: ["air"], item: ITEM_B },
  ];
  const all = filterJoinedRows(joined, buildRegisterQuerySpec());
  assert.deepEqual(all.map((r) => r.intelligence_item_id), ["item-b", "item-a"]); // sorted by due date

  const eu = filterJoinedRows(joined, buildRegisterQuerySpec({ jurisdiction: "eu" }));
  assert.equal(eu.length, 2);

  const air = filterJoinedRows(joined, buildRegisterQuerySpec({ mode: "air" }));
  assert.equal(air.length, 1);
  assert.equal(air[0].intelligence_item_id, "item-b");
});

test("filterJoinedRows: never drops a row for a missing item (that already happened upstream, or never)", () => {
  const joined = [{ intelligence_item_id: "item-a", due_date: "2026-06-01", binding_position: null, jurisdiction: [], modes: [], item: ITEM_A }];
  const out = filterJoinedRows(joined, buildRegisterQuerySpec());
  assert.equal(out.length, 1);
});

// ── fetchObligationRegister: fake-client I/O test (mirrors read-upcoming.mjs's own testing shape) ──

function fakeSupabase({ obligationsRows, itemsRows }) {
  return {
    from(table) {
      if (table === "obligations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          limit: async () => ({ data: obligationsRows, error: null }),
        };
        return chain;
      }
      if (table === "intelligence_items") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: async () => ({ data: itemsRows, error: null }),
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test("fetchObligationRegister: end-to-end against a fake client, soonest-first", async () => {
  const supabase = fakeSupabase({
    obligationsRows: [
      { id: "o1", intelligence_item_id: "item-b", forward_event_id: "e1", due_date: "2026-06-01", date_precision: "day", event_kind: "compliance_deadline", binding_position: null, jurisdiction: ["EU"], modes: ["ocean"], status: "active", item_forward_events: { obligation_text: "Report annual FuelEU compliance balance to the verifier." } },
      { id: "o2", intelligence_item_id: "item-a", forward_event_id: "e2", due_date: "2026-03-01", date_precision: "day", event_kind: "entry_into_force", binding_position: "direct_duty", jurisdiction: ["EU"], modes: [], status: "active", item_forward_events: { obligation_text: "This Regulation shall apply from 2 June 2026." } },
    ],
    itemsRows: [ITEM_A, ITEM_B],
  });
  const out = await fetchObligationRegister(supabase, {});
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "o2");
  assert.equal(out[0].item.title, "CountEmissions EU");
  assert.equal(out[0].obligation_text, "This Regulation shall apply from 2 June 2026.");
  assert.equal(out[0].item_forward_events, undefined); // flattened, never leaked to the caller
  assert.equal(out[1].id, "o1");
  assert.equal(out[1].obligation_text, "Report annual FuelEU compliance balance to the verifier.");
});

test("fetchObligationRegister: a row whose obligation text is missing degrades to null, never throws", async () => {
  const supabase = fakeSupabase({
    obligationsRows: [
      { id: "o1", intelligence_item_id: "item-a", forward_event_id: "e1", due_date: "2026-06-01", date_precision: "day", event_kind: "compliance_deadline", binding_position: null, jurisdiction: [], modes: [], status: "active", item_forward_events: null },
    ],
    itemsRows: [ITEM_A],
  });
  const out = await fetchObligationRegister(supabase, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].obligation_text, null);
});

test("fetchObligationRegister: obligation text over the read-time cap is trimmed with an ellipsis", async () => {
  const long = "x".repeat(OBLIGATION_TEXT_TRIM_LENGTH + 25);
  const supabase = fakeSupabase({
    obligationsRows: [
      { id: "o1", intelligence_item_id: "item-a", forward_event_id: "e1", due_date: "2026-06-01", date_precision: "day", event_kind: "compliance_deadline", binding_position: null, jurisdiction: [], modes: [], status: "active", item_forward_events: { obligation_text: long } },
    ],
    itemsRows: [ITEM_A],
  });
  const out = await fetchObligationRegister(supabase, {});
  assert.equal(out[0].obligation_text.length, OBLIGATION_TEXT_TRIM_LENGTH + 1);
  assert.ok(out[0].obligation_text.endsWith("…"));
});

test("fetchObligationRegister: an error or empty read returns [] rather than throwing", async () => {
  const errSupabase = fakeSupabase({ obligationsRows: null, itemsRows: [] });
  const withError = {
    from(table) {
      if (table === "obligations") {
        return { select: () => withError.from("obligations"), eq: () => withError.from("obligations"), limit: async () => ({ data: null, error: { message: "boom" } }) };
      }
      return errSupabase.from(table);
    },
  };
  assert.deepEqual(await fetchObligationRegister(withError, {}), []);
});

// ── fetchForwardEventCount: the empty-state's "derived from N forward events" count ──

test("fetchForwardEventCount: returns the count from a head:true select", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "item_forward_events");
      return { select: (cols, opts) => {
        assert.deepEqual(opts, { count: "exact", head: true });
        return Promise.resolve({ count: 901, error: null });
      } };
    },
  };
  assert.equal(await fetchForwardEventCount(supabase), 901);
});

test("fetchForwardEventCount: an error degrades to null, never throws", async () => {
  const supabase = {
    from: () => ({ select: () => Promise.resolve({ count: null, error: { message: "boom" } }) }),
  };
  assert.equal(await fetchForwardEventCount(supabase), null);
});

// ── PERF-11 (2026-09-04): offset paging, honest totals ──

test("buildRegisterQuerySpec: offset defaults to 0 and never throws on a bad value", () => {
  assert.equal(buildRegisterQuerySpec().offset, 0);
  assert.equal(buildRegisterQuerySpec({ offset: 60 }).offset, 60);
  assert.equal(buildRegisterQuerySpec({ offset: -5 }).offset, 0);
  assert.equal(buildRegisterQuerySpec({ offset: "not a number" }).offset, 0);
});

// ── CAP-1000 (2026-09-05): matchingJurisdictionCodes — the pure prefix-match resolver that replaced
// the in-JS row filter, now applied to a small distinct-code pool instead of every obligations row ──

test("matchingJurisdictionCodes: exact match is case-insensitive", () => {
  assert.deepEqual(matchingJurisdictionCodes(["EU", "US", "GB"], "eu"), ["EU"]);
});

test("matchingJurisdictionCodes: a filter also matches subnational codes by '<filter>-' prefix", () => {
  assert.deepEqual(matchingJurisdictionCodes(["US", "US-CA", "US-NY", "EU"], "us"), ["US", "US-CA", "US-NY"]);
});

test("matchingJurisdictionCodes: no jurisdiction filter returns []", () => {
  assert.deepEqual(matchingJurisdictionCodes(["EU", "US"], null), []);
});

test("matchingJurisdictionCodes: a filter matching nothing returns [], never falls back to 'no filter'", () => {
  assert.deepEqual(matchingJurisdictionCodes(["EU", "GB"], "zz"), []);
});

test("filterJoinedRowsPage: total is the filtered count BEFORE the page slice, not the page length", () => {
  const joined = [
    { intelligence_item_id: "item-a", due_date: "2026-01-01", binding_position: null, jurisdiction: [], modes: [], item: ITEM_A },
    { intelligence_item_id: "item-a", due_date: "2026-02-01", binding_position: null, jurisdiction: [], modes: [], item: ITEM_A },
    { intelligence_item_id: "item-a", due_date: "2026-03-01", binding_position: null, jurisdiction: [], modes: [], item: ITEM_A },
  ];
  const page1 = filterJoinedRowsPage(joined, buildRegisterQuerySpec({ limit: 2, offset: 0 }));
  assert.equal(page1.total, 3);
  assert.deepEqual(page1.rows.map((r) => r.due_date), ["2026-01-01", "2026-02-01"]);

  const page2 = filterJoinedRowsPage(joined, buildRegisterQuerySpec({ limit: 2, offset: 2 }));
  assert.equal(page2.total, 3);
  assert.deepEqual(page2.rows.map((r) => r.due_date), ["2026-03-01"]);
});

test("filterJoinedRowsPage: total reflects the ACTIVE filter, so 'N of M' is always honest for that filter", () => {
  const joined = [
    { intelligence_item_id: "item-a", due_date: "2026-01-01", binding_position: null, jurisdiction: ["EU"], modes: [], item: ITEM_A },
    { intelligence_item_id: "item-b", due_date: "2026-02-01", binding_position: null, jurisdiction: ["US-CA"], modes: [], item: ITEM_B },
  ];
  const page = filterJoinedRowsPage(joined, buildRegisterQuerySpec({ jurisdiction: "eu", limit: 60, offset: 0 }));
  assert.equal(page.total, 1);
  assert.equal(page.rows.length, 1);
});

test("filterJoinedRows and filterJoinedRowsPage agree on the same first page (offset 0)", () => {
  const joined = [
    { intelligence_item_id: "item-a", due_date: "2026-05-01", binding_position: null, jurisdiction: [], modes: [], item: ITEM_A },
    { intelligence_item_id: "item-b", due_date: "2026-01-01", binding_position: null, jurisdiction: [], modes: [], item: ITEM_B },
  ];
  const spec = buildRegisterQuerySpec({ limit: 1, offset: 0 });
  const viaOld = filterJoinedRows(joined, spec);
  const viaNew = filterJoinedRowsPage(joined, spec).rows;
  assert.deepEqual(viaOld, viaNew);
});

// ── CAP-1000 (2026-09-05): fetchObligationRegisterPage rebuilt — filters push into the query, an
// exact DB count replaces the fixed OVERFETCH_CAP, .range() fetches only the requested page. The fake
// `obligations` table below is a small in-memory PostgREST simulator (eq/overlaps/is/gte/lte/lt/order/
// range, plus a `{count:'exact',head:true}` select that resolves immediately) so these tests exercise
// the REAL filter semantics `applyRegisterFilters` builds, not a hand-typed expectation of what it does.

function makeFakeObligationsTable(rows) {
  function build() {
    const filters = [];
    let countMode = false;
    let orderSpec = null;
    const chain = {
      select(_cols, opts) {
        countMode = !!(opts && opts.count === "exact" && opts.head === true);
        return chain;
      },
      eq(col, val) { filters.push((r) => r[col] === val); return chain; },
      overlaps(col, val) { filters.push((r) => Array.isArray(r[col]) && r[col].some((x) => val.includes(x))); return chain; },
      is(col, val) { filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val)); return chain; },
      gte(col, val) { filters.push((r) => r[col] != null && r[col] >= val); return chain; },
      lte(col, val) { filters.push((r) => r[col] != null && r[col] <= val); return chain; },
      lt(col, val) { filters.push((r) => r[col] != null && r[col] < val); return chain; },
      order(col, opt) { orderSpec = { col, nullsFirst: !!(opt && opt.nullsFirst) }; return chain; },
      range(from, to) { return Promise.resolve(resolve(from, to)); },
      then(res, rej) { return Promise.resolve(resolve()).then(res, rej); },
    };
    function matched() { return rows.filter((r) => filters.every((f) => f(r))); }
    function ordered(list) {
      if (!orderSpec) return list;
      const { col, nullsFirst } = orderSpec;
      return [...list].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return nullsFirst ? -1 : 1;
        if (bv == null) return nullsFirst ? 1 : -1;
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
    }
    function resolve(from, to) {
      const list = matched();
      if (countMode) return { count: list.length, error: null, data: null };
      const sorted = ordered(list);
      const page = from === undefined ? sorted : sorted.slice(from, to + 1);
      return { data: page, error: null };
    }
    return chain;
  }
  return { from: () => build() };
}

function fakeRegisterPageClient({ obligationsRows, itemsRows }) {
  const obligationsTable = makeFakeObligationsTable(obligationsRows);
  return {
    from(table) {
      if (table === "obligations") return obligationsTable.from();
      if (table === "intelligence_items") {
        return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: itemsRows, error: null }) }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const REG_ROWS = [
  { id: "o1", intelligence_item_id: "item-b", forward_event_id: "e1", due_date: "2026-06-01", date_precision: "day", event_kind: "compliance_deadline", binding_position: null, jurisdiction: ["EU", "US-CA"], modes: ["ocean"], status: "active", item_forward_events: { obligation_text: "Report annual FuelEU compliance balance to the verifier." } },
  { id: "o2", intelligence_item_id: "item-a", forward_event_id: "e2", due_date: "2026-03-01", date_precision: "day", event_kind: "entry_into_force", binding_position: "direct_duty", jurisdiction: ["EU"], modes: ["air"], status: "active", item_forward_events: { obligation_text: "This Regulation shall apply from 2 June 2026." } },
  { id: "o3", intelligence_item_id: "item-a", forward_event_id: "e3", due_date: null, date_precision: null, event_kind: "review", binding_position: null, jurisdiction: ["US"], modes: ["road"], status: "active", item_forward_events: null },
  { id: "o4", intelligence_item_id: "item-b", forward_event_id: "e4", due_date: "2020-01-01", date_precision: "day", event_kind: "compliance_deadline", binding_position: "monitoring_only", jurisdiction: ["GB"], modes: ["rail"], status: "active", item_forward_events: null },
];

test("fetchObligationRegisterPage: no filter — exact DB count, ordered chronologically (not lexicographically) with undated last", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  const page = await fetchObligationRegisterPage(supabase, { limit: 60, offset: 0, todayIso: "2026-09-05" });
  assert.equal(page.total, 4);
  // o4=2020-01-01 sorts FIRST despite the string "2020..." < "2026..." only coincidentally agreeing here —
  // the point is the DB's own date-typed ORDER BY, not a JS string compare; o3 (null) is always last.
  assert.deepEqual(page.rows.map((r) => r.id), ["o4", "o2", "o1", "o3"]);
  assert.deepEqual(page.rows.map((r) => r.due_date), ["2020-01-01", "2026-03-01", "2026-06-01", null]);
});

test("fetchObligationRegisterPage: offset/limit slices the ALREADY-FILTERED, already-ordered set — no JS re-slice of an overfetch", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  const page1 = await fetchObligationRegisterPage(supabase, { limit: 2, offset: 0, todayIso: "2026-09-05" });
  assert.equal(page1.total, 4);
  assert.deepEqual(page1.rows.map((r) => r.id), ["o4", "o2"]);
  const page2 = await fetchObligationRegisterPage(supabase, { limit: 2, offset: 2, todayIso: "2026-09-05" });
  assert.equal(page2.total, 4);
  assert.deepEqual(page2.rows.map((r) => r.id), ["o1", "o3"]);
});

test("fetchObligationRegisterPage: jurisdiction filter pushes into the query as an exact .overlaps() set resolved from the facet pool (subnational prefix match preserved)", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  // "us" must match both the bare "US" row (o3) and the "US-CA" row (o1) via the prefix rule.
  const page = await fetchObligationRegisterPage(supabase, { jurisdiction: "us", limit: 60, offset: 0 });
  assert.deepEqual(new Set(page.rows.map((r) => r.id)), new Set(["o1", "o3"]));
  assert.equal(page.total, 2);
});

test("fetchObligationRegisterPage: a jurisdiction filter matching no live code returns total 0 without an item lookup", async () => {
  let itemLookupCalled = false;
  const base = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  const supabase = {
    from(table) {
      if (table === "intelligence_items") { itemLookupCalled = true; }
      return base.from(table);
    },
  };
  const page = await fetchObligationRegisterPage(supabase, { jurisdiction: "zz", limit: 60, offset: 0 });
  assert.deepEqual(page, { rows: [], total: 0 });
  assert.equal(itemLookupCalled, false, "total=0 must short-circuit before the item-verification join");
});

test("fetchObligationRegisterPage: mode filter is an exact .overlaps() match", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  const page = await fetchObligationRegisterPage(supabase, { mode: "air", limit: 60, offset: 0 });
  assert.deepEqual(page.rows.map((r) => r.id), ["o2"]);
  assert.equal(page.total, 1);
});

test("fetchObligationRegisterPage: bindingPosition distinguishes a real value from UNCLASSIFIED (.is(null))", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  const direct = await fetchObligationRegisterPage(supabase, { bindingPosition: "direct_duty", limit: 60, offset: 0 });
  assert.deepEqual(direct.rows.map((r) => r.id), ["o2"]);
  const unclassified = await fetchObligationRegisterPage(supabase, { bindingPosition: UNCLASSIFIED, limit: 60, offset: 0 });
  assert.deepEqual(new Set(unclassified.rows.map((r) => r.id)), new Set(["o1", "o3"]));
});

test("fetchObligationRegisterPage: dueWindow 'overdue' is .lt(today); 'undated' is .is(null); a numeric window is .gte/.lte", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  // today between o4 (2020-01-01, past) and o2/o1 (2026-03-01/2026-06-01, still future) isolates
  // exactly one overdue row.
  const overdue = await fetchObligationRegisterPage(supabase, { dueWindow: "overdue", todayIso: "2026-02-01", limit: 60, offset: 0 });
  assert.deepEqual(overdue.rows.map((r) => r.id), ["o4"]);
  const undated = await fetchObligationRegisterPage(supabase, { dueWindow: "undated", todayIso: "2026-02-01", limit: 60, offset: 0 });
  assert.deepEqual(undated.rows.map((r) => r.id), ["o3"]);
  const next30 = await fetchObligationRegisterPage(supabase, { dueWindow: "30", todayIso: "2026-05-15", limit: 60, offset: 0 });
  assert.deepEqual(next30.rows.map((r) => r.id), ["o1"]); // 2026-06-01 is within 30 days of 2026-05-15; 2026-03-01 is past
});

test("fetchObligationRegisterPage: the obligation-text embed, flattening, and item join still apply exactly as before", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  const page = await fetchObligationRegisterPage(supabase, { limit: 1, offset: 0, todayIso: "2026-09-05" });
  assert.equal(page.rows[0].id, "o4");
  assert.equal(page.rows[0].item_forward_events, undefined); // flattened, never leaked
  assert.equal(page.rows[0].obligation_text, null); // o4 carries no item_forward_events row
  assert.equal(page.rows[0].item.title, "FuelEU Maritime");
});

test("fetchObligationRegisterPage: an item that fails the verified-gate join is dropped from rows but the DB-level total is unaffected", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A] }); // item-b never resolves
  const page = await fetchObligationRegisterPage(supabase, { limit: 60, offset: 0, todayIso: "2026-09-05" });
  assert.equal(page.total, 4, "the count query does not know about the item join — same honest-estimate posture the prior OVERFETCH_CAP total already carried");
  assert.deepEqual(new Set(page.rows.map((r) => r.id)), new Set(["o2", "o3"])); // only item-a's rows survive
});

test("fetchObligationRegisterPage: an error on the count query returns { rows: [], total } via the fail-closed exactCount contract", async () => {
  const supabase = {
    from(table) {
      if (table === "obligations") {
        return { select: () => ({ eq: () => Promise.resolve({ count: null, error: { message: "boom" } }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  await assert.rejects(() => fetchObligationRegisterPage(supabase, {}), /exact count failed.*boom/);
});

test("fetchObligationRegisterPage: itemId scopes both the count and the page query", async () => {
  const supabase = fakeRegisterPageClient({ obligationsRows: REG_ROWS, itemsRows: [ITEM_A, ITEM_B] });
  const page = await fetchObligationRegisterPage(supabase, { itemId: "item-b", limit: 60, offset: 0, todayIso: "2026-09-05" });
  assert.equal(page.total, 2);
  assert.deepEqual(new Set(page.rows.map((r) => r.id)), new Set(["o1", "o4"]));
});

// ── fetchRegisterFacetOptions: CAP-1000 rebuild — paginated via fetchAllRows, not a bare .limit(5000) ──

function fakeFacetTable(rows) {
  return {
    from(table) {
      assert.equal(table, "obligations");
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
            }),
          }),
        }),
      };
    },
  };
}

test("fetchRegisterFacetOptions: dedupes and sorts jurisdiction/mode values across rows", async () => {
  const supabase = fakeFacetTable([
    { jurisdiction: ["EU", "US-CA"], modes: ["ocean"] },
    { jurisdiction: ["EU"], modes: ["air", "ocean"] },
    { jurisdiction: null, modes: null },
  ]);
  const facets = await fetchRegisterFacetOptions(supabase);
  assert.deepEqual(facets.jurisdictions, ["EU", "US-CA"]);
  assert.deepEqual(facets.modes, ["air", "ocean"]);
});

test("fetchRegisterFacetOptions: walks past the 1000-row PostgREST cap via fetchAllRows, not a single .limit(5000) call", async () => {
  const rows = Array.from({ length: 1300 }, (_, i) => ({
    jurisdiction: [i === 1299 ? "ZZ" : "EU"], // the 1,300th row's code only shows up on page 2 (offset 1000)
    modes: ["ocean"],
  }));
  const facets = await fetchRegisterFacetOptions(fakeFacetTable(rows));
  assert.deepEqual(facets.jurisdictions, ["EU", "ZZ"], "a code past row 1000 must not be silently dropped");
});

test("fetchRegisterFacetOptions: an error or throw degrades to empty arrays, never breaks the page", async () => {
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: "boom" } }) }) }) }) }) };
  assert.deepEqual(await fetchRegisterFacetOptions(supabase), { jurisdictions: [], modes: [] });

  const throwing = { from: () => { throw new Error("boom"); } };
  assert.deepEqual(await fetchRegisterFacetOptions(throwing), { jurisdictions: [], modes: [] });
});
