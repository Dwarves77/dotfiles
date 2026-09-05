import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegisterQuerySpec,
  matchesDueWindow,
  selectRegisterRows,
  filterJoinedRows,
  filterJoinedRowsPage,
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

// ── PERF-11 (2026-09-04): offset paging, honest totals, and the decoupled overfetch cap ──

test("buildRegisterQuerySpec: offset defaults to 0 and never throws on a bad value", () => {
  assert.equal(buildRegisterQuerySpec().offset, 0);
  assert.equal(buildRegisterQuerySpec({ offset: 60 }).offset, 60);
  assert.equal(buildRegisterQuerySpec({ offset: -5 }).offset, 0);
  assert.equal(buildRegisterQuerySpec({ offset: "not a number" }).offset, 0);
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

test("fetchObligationRegisterPage: end-to-end against a fake client, returns { rows, total }", async () => {
  const supabase = fakeSupabase({
    obligationsRows: [
      { id: "o1", intelligence_item_id: "item-b", forward_event_id: "e1", due_date: "2026-06-01", date_precision: "day", event_kind: "compliance_deadline", binding_position: null, jurisdiction: ["EU"], modes: ["ocean"], status: "active", item_forward_events: { obligation_text: "Report annual FuelEU compliance balance to the verifier." } },
      { id: "o2", intelligence_item_id: "item-a", forward_event_id: "e2", due_date: "2026-03-01", date_precision: "day", event_kind: "entry_into_force", binding_position: "direct_duty", jurisdiction: ["EU"], modes: [], status: "active", item_forward_events: { obligation_text: "This Regulation shall apply from 2 June 2026." } },
    ],
    itemsRows: [ITEM_A, ITEM_B],
  });
  const page = await fetchObligationRegisterPage(supabase, { limit: 60, offset: 0 });
  assert.equal(page.total, 2);
  assert.equal(page.rows.length, 2);
  assert.equal(page.rows[0].id, "o2"); // soonest first
  assert.equal(page.rows[0].obligation_text, "This Regulation shall apply from 2 June 2026.");
  assert.equal(page.rows[0].item_forward_events, undefined); // flattened, never leaked
});

test("fetchObligationRegisterPage: the DB fetch cap is a fixed constant, not tied to the requested page size — a small page still sees the whole (capped) corpus for filter/window correctness", async () => {
  let capturedLimit = null;
  const supabase = {
    from(table) {
      if (table === "obligations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          limit: async (n) => {
            capturedLimit = n;
            return { data: [], error: null };
          },
        };
        return chain;
      }
      return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }) };
    },
  };
  await fetchObligationRegisterPage(supabase, { limit: 60, offset: 0 }); // a small page
  const smallPageLimit = capturedLimit;
  await fetchObligationRegisterPage(supabase, { limit: 500, offset: 0 }); // the largest allowed page
  assert.equal(capturedLimit, smallPageLimit, "the DB overfetch cap must not shrink for a smaller requested page");
  assert.ok(smallPageLimit >= 1141, "the cap must stay comfortably above the live obligations count (1,141, measured 2026-09-04)");
});

test("fetchObligationRegisterPage: an error or empty read returns { rows: [], total: 0 } rather than throwing", async () => {
  const withError = {
    from(table) {
      if (table === "obligations") {
        return { select: () => withError.from("obligations"), eq: () => withError.from("obligations"), limit: async () => ({ data: null, error: { message: "boom" } }) };
      }
      return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }) };
    },
  };
  assert.deepEqual(await fetchObligationRegisterPage(withError, {}), { rows: [], total: 0 });
});

test("fetchRegisterFacetOptions: dedupes and sorts jurisdiction/mode values across rows", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "obligations");
      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: [
                { jurisdiction: ["EU", "US-CA"], modes: ["ocean"] },
                { jurisdiction: ["EU"], modes: ["air", "ocean"] },
                { jurisdiction: null, modes: null },
              ],
              error: null,
            }),
          }),
        }),
      };
    },
  };
  const facets = await fetchRegisterFacetOptions(supabase);
  assert.deepEqual(facets.jurisdictions, ["EU", "US-CA"]);
  assert.deepEqual(facets.modes, ["air", "ocean"]);
});

test("fetchRegisterFacetOptions: an error or throw degrades to empty arrays, never breaks the page", async () => {
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: "boom" } }) }) }) }) };
  assert.deepEqual(await fetchRegisterFacetOptions(supabase), { jurisdictions: [], modes: [] });

  const throwing = { from: () => { throw new Error("boom"); } };
  assert.deepEqual(await fetchRegisterFacetOptions(throwing), { jurisdictions: [], modes: [] });
});
