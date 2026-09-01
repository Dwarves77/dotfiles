// read-upcoming.test.mjs — proof for the pure parts of read-upcoming.mjs (the customer-facing
// item_forward_events reader, lane SURF 2026-09-01): kind-filter defaulting, jurisdiction-filter
// defaulting and matching, and the post-join view-model shaper (filter dropped items, jurisdiction
// filter, cap at limit, preserve DB order). fetchUpcomingObligations (the one I/O function) is exercised
// indirectly by construction — every pure function it composes is proven here against the exact shapes
// it feeds them.
//
// $0, pure, in-process — no network, no database, no npm dependency.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_KINDS,
  DEFAULT_KINDS,
  defaultJurisdictionFilter,
  jurisdictionMatches,
  buildUpcomingEventsQuerySpec,
  selectUpcoming,
} from "./read-upcoming.mjs";

// ── DEFAULT_KINDS ────────────────────────────────────────────────────────────────────────────────────

test("DEFAULT_KINDS is every EVENT_KINDS value except 'other'", () => {
  assert.ok(!DEFAULT_KINDS.includes("other"));
  assert.equal(DEFAULT_KINDS.length, EVENT_KINDS.length - 1);
  for (const k of DEFAULT_KINDS) assert.ok(EVENT_KINDS.includes(k));
});

// ── defaultJurisdictionFilter ────────────────────────────────────────────────────────────────────────

test("defaultJurisdictionFilter: absent/empty/non-object profile -> null (no filter)", () => {
  assert.equal(defaultJurisdictionFilter(null), null);
  assert.equal(defaultJurisdictionFilter(undefined), null);
  assert.equal(defaultJurisdictionFilter({}), null);
  assert.equal(defaultJurisdictionFilter("not-an-object"), null);
});

test("defaultJurisdictionFilter: a profile carrying only generic keys (global/worldwide/all) -> null", () => {
  assert.equal(defaultJurisdictionFilter({ global: 1 }), null);
  assert.equal(defaultJurisdictionFilter({ worldwide: 1, all: 1 }), null);
});

test("defaultJurisdictionFilter: real weighted jurisdictions -> lower-cased keys, generic keys stripped", () => {
  const out = defaultJurisdictionFilter({ EU: 3, us: 2, global: 1, IMO: 1 });
  assert.deepEqual(out.sort(), ["eu", "imo", "us"]);
});

// ── jurisdictionMatches ──────────────────────────────────────────────────────────────────────────────

test("jurisdictionMatches: null/empty filter always matches (no filter applied)", () => {
  assert.equal(jurisdictionMatches(["US"], null), true);
  assert.equal(jurisdictionMatches(["US"], []), true);
  assert.equal(jurisdictionMatches(null, null), true);
  assert.equal(jurisdictionMatches([], null), true);
});

test("jurisdictionMatches: an item with no jurisdiction_iso never matches a real filter", () => {
  assert.equal(jurisdictionMatches(null, ["eu"]), false);
  assert.equal(jurisdictionMatches([], ["eu"]), false);
  assert.equal(jurisdictionMatches(undefined, ["eu"]), false);
});

test("jurisdictionMatches: exact case-insensitive match", () => {
  assert.equal(jurisdictionMatches(["EU"], ["eu"]), true);
  assert.equal(jurisdictionMatches(["eu"], ["EU"]), true);
  assert.equal(jurisdictionMatches(["GB"], ["eu"]), false);
});

test("jurisdictionMatches: subnational-parent match ('us' matches 'US-CA')", () => {
  assert.equal(jurisdictionMatches(["US-CA"], ["us"]), true);
  assert.equal(jurisdictionMatches(["US-CA"], ["gb"]), false);
});

test("jurisdictionMatches: any-of semantics across a multi-jurisdiction item and a multi-key filter", () => {
  assert.equal(jurisdictionMatches(["US-CA", "EU"], ["gb", "eu"]), true);
  assert.equal(jurisdictionMatches(["US-CA", "SG"], ["gb", "eu"]), false);
});

test("jurisdictionMatches: KNOWN LIMITATION documented, not silently 'fixed' — 'uk' does not alias to 'GB'", () => {
  assert.equal(jurisdictionMatches(["GB"], ["uk"]), false);
});

// ── buildUpcomingEventsQuerySpec ─────────────────────────────────────────────────────────────────────

test("buildUpcomingEventsQuerySpec: no opts -> DEFAULT_KINDS, today's date, limit 8, no itemId", () => {
  const spec = buildUpcomingEventsQuerySpec();
  assert.deepEqual(spec.kinds, [...DEFAULT_KINDS]);
  assert.equal(spec.itemId, null);
  assert.equal(spec.limit, 8);
  assert.match(spec.from, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(spec.from, new Date().toISOString().slice(0, 10));
});

test("buildUpcomingEventsQuerySpec: an explicit kinds array is filtered to the legal vocabulary only", () => {
  const spec = buildUpcomingEventsQuerySpec({ kinds: ["entry_into_force", "other", "not-a-real-kind"] });
  assert.deepEqual(spec.kinds, ["entry_into_force", "other"]);
});

test("buildUpcomingEventsQuerySpec: an empty explicit kinds array falls back to DEFAULT_KINDS, not 'nothing'", () => {
  const spec = buildUpcomingEventsQuerySpec({ kinds: [] });
  assert.deepEqual(spec.kinds, [...DEFAULT_KINDS]);
});

test("buildUpcomingEventsQuerySpec: a malformed 'from' falls back to today, never thrown or passed through", () => {
  const spec = buildUpcomingEventsQuerySpec({ from: "not-a-date" });
  assert.equal(spec.from, new Date().toISOString().slice(0, 10));
});

test("buildUpcomingEventsQuerySpec: a well-formed 'from' is passed through verbatim", () => {
  const spec = buildUpcomingEventsQuerySpec({ from: "1900-01-01" });
  assert.equal(spec.from, "1900-01-01");
});

test("buildUpcomingEventsQuerySpec: limit is clamped to [1, 500] and floored", () => {
  assert.equal(buildUpcomingEventsQuerySpec({ limit: 0 }).limit, 8, "0/negative falls back to the default 8");
  assert.equal(buildUpcomingEventsQuerySpec({ limit: -5 }).limit, 8);
  assert.equal(buildUpcomingEventsQuerySpec({ limit: 5000 }).limit, 500);
  assert.equal(buildUpcomingEventsQuerySpec({ limit: 3.7 }).limit, 3);
});

test("buildUpcomingEventsQuerySpec: itemId is passed through when present", () => {
  const spec = buildUpcomingEventsQuerySpec({ itemId: "abc-123" });
  assert.equal(spec.itemId, "abc-123");
});

// ── selectUpcoming ───────────────────────────────────────────────────────────────────────────────────

const EU_ITEM = { id: "item-eu", title: "EU Aviation ETS", legacy_id: "eu-aviation-ets", jurisdiction_iso: ["EU"] };
const US_ITEM = { id: "item-us", title: "California SB 253", legacy_id: "ca-sb-253", jurisdiction_iso: ["US-CA"] };
const NO_JURIS_ITEM = { id: "item-none", title: "Undated framework", legacy_id: null, jurisdiction_iso: null };

function ev(id, itemId, date, kind = "compliance_deadline") {
  return { id, intelligence_item_id: itemId, event_date: date, date_precision: "day", event_kind: kind, obligation_text: `obligation ${id}`, source_kind: "claim", confidence: "high" };
}

test("selectUpcoming: an event whose item is missing from the join map is dropped, never rendered with a null item", () => {
  const events = [ev("e1", "item-eu", "2026-10-01"), ev("e2", "item-missing", "2026-10-02")];
  const itemsById = new Map([["item-eu", EU_ITEM]]);
  const out = selectUpcoming(events, itemsById);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "e1");
  assert.equal(out[0].item, EU_ITEM);
});

test("selectUpcoming: no jurisdictionFilter -> every joined event survives, in DB order", () => {
  const events = [ev("e1", "item-eu", "2026-10-01"), ev("e2", "item-us", "2026-10-02")];
  const itemsById = new Map([["item-eu", EU_ITEM], ["item-us", US_ITEM]]);
  const out = selectUpcoming(events, itemsById, {});
  assert.deepEqual(out.map((e) => e.id), ["e1", "e2"]);
});

test("selectUpcoming: a jurisdictionFilter drops non-matching items' events", () => {
  const events = [ev("e1", "item-eu", "2026-10-01"), ev("e2", "item-us", "2026-10-02")];
  const itemsById = new Map([["item-eu", EU_ITEM], ["item-us", US_ITEM]]);
  const out = selectUpcoming(events, itemsById, { jurisdictionFilter: ["us"] });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "e2");
});

test("selectUpcoming: an item with no jurisdiction_iso is dropped under a real filter, kept under no filter", () => {
  const events = [ev("e1", "item-none", "2026-10-01")];
  const itemsById = new Map([["item-none", NO_JURIS_ITEM]]);
  assert.equal(selectUpcoming(events, itemsById, { jurisdictionFilter: ["eu"] }).length, 0);
  assert.equal(selectUpcoming(events, itemsById, {}).length, 1);
});

test("selectUpcoming: limit caps the output without re-sorting (DB order preserved)", () => {
  const events = [ev("e1", "item-eu", "2026-10-01"), ev("e2", "item-eu", "2026-10-05"), ev("e3", "item-eu", "2026-10-09")];
  const itemsById = new Map([["item-eu", EU_ITEM]]);
  const out = selectUpcoming(events, itemsById, { limit: 2 });
  assert.deepEqual(out.map((e) => e.id), ["e1", "e2"]);
});

test("selectUpcoming: no limit (Infinity default) returns every joined+filtered event", () => {
  const events = [ev("e1", "item-eu", "2026-10-01"), ev("e2", "item-eu", "2026-10-05")];
  const itemsById = new Map([["item-eu", EU_ITEM]]);
  const out = selectUpcoming(events, itemsById, {});
  assert.equal(out.length, 2);
});

test("selectUpcoming: empty events array -> empty output, never a throw", () => {
  assert.deepEqual(selectUpcoming([], new Map()), []);
  assert.deepEqual(selectUpcoming(undefined, new Map()), []);
});
